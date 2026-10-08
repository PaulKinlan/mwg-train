/**
 * The before/after diff oracle for the already-modern briefs.
 *
 * An already-modern brief hands the model an existing site and asks for one small change, with an
 * explicit non-goal: leave everything else exactly as it is. The preregistration's secondary endpoint
 * is "how many pages did the run change", and until this module existed there was no way to compute
 * it: the brief had no baseline project to be the "before".
 *
 * The oracle compares a project tree to its baseline as content hashes, not as rendered markup. A
 * model may legitimately reimplement the same page, so an HTML diff would flag every route; what the
 * endpoint asks is which *pages* changed, and a page is a set of files. `treeSnapshot` records a
 * sha256 per file and a tree hash over the sorted set, so a run's output can be compared to the
 * baseline without trusting either implementation to look alike.
 *
 * `assessDiff` then applies a per-brief allowlist. A change outside it is not automatically wrong -
 * it is unaccounted for, which is the thing the endpoint is supposed to surface.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Runtime state and the baseline's own metadata are not "pages"; they must not move the diff. */
export const IGNORED = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)\.pilot-/,
  /\.(sqlite|sqlite3|db|log)$/i,
  /(^|\/)(tree|snapshot)\.json$/,
  /(^|\/)data\.json$/,
];

export function isIgnored(relativePath) {
  const normalised = relativePath.split(sep).join('/');
  return IGNORED.some((pattern) => pattern.test(normalised));
}

function walk(root, dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const absolute = join(dir, name);
    const relativePath = relative(root, absolute).split(sep).join('/');
    if (isIgnored(relativePath)) continue;
    const stats = statSync(absolute);
    if (stats.isDirectory()) walk(root, absolute, out);
    else if (stats.isFile()) out.push(relativePath);
  }
}

/** `{ files: { path: sha256 }, tree: sha256 }` over every tracked file, in sorted order. */
export function treeSnapshot(root) {
  if (!existsSync(root)) throw new Error(`treeSnapshot: no such directory ${root}`);
  const paths = [];
  walk(root, root, paths);
  const files = {};
  for (const path of paths) {
    files[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  }
  const tree = createHash('sha256').update(paths.map((path) => `${path}\0${files[path]}`).join('\n')).digest('hex');
  return { files, tree, count: paths.length };
}

/** The page-level before/after: which files were added, removed or modified, and how many pages moved. */
export function diffTrees(before, after) {
  const beforePaths = Object.keys(before.files);
  const afterPaths = Object.keys(after.files);
  const added = afterPaths.filter((path) => !(path in before.files));
  const removed = beforePaths.filter((path) => !(path in after.files));
  const modified = beforePaths.filter((path) => path in after.files && before.files[path] !== after.files[path]);
  const unchanged = beforePaths.filter((path) => path in after.files && before.files[path] === after.files[path]);
  return {
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort(),
    unchanged: unchanged.sort(),
    changed_pages: added.length + removed.length + modified.length,
    before_tree: before.tree,
    after_tree: after.tree,
    identical: before.tree === after.tree,
  };
}

/** A tiny glob: `**` crosses directories, `*` matches within one, `?` matches one character. */
export function matchPath(pattern, path) {
  const directory = pattern.endsWith('/') ? pattern.replace(/\/+$/, '') : null;
  // A plain directory (no glob metacharacters) is a prefix match; `app/**/` must still be expanded.
  if (directory !== null && !/[*?]/.test(directory)) return path === directory || path.startsWith(`${directory}/`);
  const body = directory ?? pattern;
  const expression = body
    .split('**')
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
    .join('.*');
  return new RegExp(directory === null ? `^${expression}$` : `^${expression}(/.*)?$`).test(path);
}

/**
 * Apply a brief's allowlist to a diff. Returns findings rather than a boolean so the reason a change
 * is unaccounted for names the path and the kind of change.
 */
export function assessDiff(diff, policy) {
  const findings = [];
  const allows = (kind, path) => (policy?.[kind] ?? []).some((pattern) => matchPath(pattern, path));
  for (const path of diff.added) {
    if (!allows('allowed_new', path)) findings.push({ code: 'UNEXPECTED_ADDITION', path, message: `${path} was added, but the brief only asks for ${policy?.describe ?? 'the stated change'}` });
  }
  for (const path of diff.modified) {
    if (!allows('allowed_modified', path)) findings.push({ code: 'UNEXPECTED_MODIFICATION', path, message: `${path} was modified, and the brief says to leave everything else exactly as it is` });
  }
  for (const path of diff.removed) {
    if (!allows('allowed_removed', path)) findings.push({ code: 'UNEXPECTED_REMOVAL', path, message: `${path} was removed, and the brief says to leave everything else exactly as it is` });
  }
  return { findings, changed_pages: diff.changed_pages, accounted_for: findings.length === 0 };
}

export function loadPolicy(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Visible text with markup and scripts removed, entities decoded, lowercased and whitespace-collapsed. */
export function normaliseText(html) {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'" };
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:[a-z]+|#x?[0-9a-f]+);/gi, (entity) => named[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Split a page into the content inside `<main>` and the navigation, and hash each.
 *
 * They are kept apart because adding a page legitimately changes the navigation on every route:
 * a single page-level hash would report that as "every page changed", which is the opposite of what
 * the endpoint is looking for. `main` is what the brief means by leaving a page as it is.
 */
export function pageModel(html) {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  const nav = /<nav[^>]*>([\s\S]*?)<\/nav>/i.exec(html)?.[1] ?? '';
  const mainText = normaliseText(main);
  return { main: createHash('sha256').update(mainText).digest('hex'), nav: createHash('sha256').update(normaliseText(nav)).digest('hex'), main_text: mainText.slice(0, 240) };
}

/** Render each route in-process and hash its `<main>` and navigation. */
export async function snapshotPages(routes, paths) {
  const { handle } = await import('./site-kit.mjs');
  const pages = {};
  for (const path of paths) {
    const response = await handle(routes, { method: 'GET', path });
    pages[path] = { status: response.status, ...pageModel(response.body) };
  }
  return pages;
}

/** Which routes' content changed, and which only had their navigation updated. */
export function diffPages(before, after) {
  const beforeRoutes = Object.keys(before);
  const afterRoutes = Object.keys(after);
  const added = afterRoutes.filter((route) => !(route in before));
  const removed = beforeRoutes.filter((route) => !(route in after));
  const changed = [];
  const nav_only = [];
  for (const route of beforeRoutes) {
    if (!(route in after)) continue;
    const sameMain = before[route].main === after[route].main;
    const sameNav = before[route].nav === after[route].nav;
    if (!sameMain) changed.push(route);
    else if (!sameNav) nav_only.push(route);
  }
  return { added, removed, changed, nav_only, changed_pages: added.length + removed.length + changed.length };
}
