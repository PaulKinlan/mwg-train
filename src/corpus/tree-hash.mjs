import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Tree hashing for snapshot verification.
 *
 * The algorithm: sorted recursive walk, skipping `node_modules` and anything starting with `.git`;
 * for each file, update with `<relative-path>\n` then the file bytes; hex sha256, `sha256:` prefix.
 *
 * A directory reached through a symlink is walked, not skipped (mwg-train-yvop): `isDirectory()`
 * answers false for a symlink, so testing the dirent alone left a linked subtree's files out of the
 * hash while they still sat inside the project tree. Each directory's real path is recorded once, so
 * following a link cannot loop - a cycle lands on an already-visited real path and stops - and a
 * directory reachable under two names is hashed under the first name the sorted walk reaches.
 *
 * The ignored-directory skip applies to where a link LANDS, not only to its name (review round 1):
 * a symlink called `linked` that points at `node_modules` or `.git` passes a name check, so the
 * resolved path is checked against the same rule and the walk never enters it.
 */
export function hashTree(root) {
  const hash = createHash('sha256');
  const visited = new Set();
  const isIgnoredDirName = (name) => name === 'node_modules' || name.startsWith('.git');
  const walk = (dir, prefix = '') => {
    const real = realpathSync(dir);
    if (visited.has(real)) return;
    visited.add(real);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (isIgnoredDirName(entry.name)) continue;
      const path = join(dir, entry.name);
      // `statSync` follows the link: a symlinked directory is walked like a real one.
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (landsInIgnoredDir(rootReal, path, isIgnoredDirName)) continue;
        walk(path, `${prefix}${entry.name}/`);
      } else if (stat.isFile()) hash.update(`${prefix}${entry.name}\n`).update(readFileSync(path));
    }
  };
  if (!existsSync(root)) return null;
  const rootReal = realpathSync(root);
  walk(root);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * True when `path` resolves into an ignored directory. The resolved path is compared relative to the
 * resolved root, so the rule covers an alias (`linked` -> `node_modules`, or deeper inside it) without
 * mistaking an ancestor of the tree - a checkout that happens to sit under a directory called
 * `node_modules` - for the tree's own content.
 */
function landsInIgnoredDir(rootReal, path, isIgnoredDirName) {
  return relative(rootReal, realpathSync(path)).split(sep).some(isIgnoredDirName);
}
