#!/usr/bin/env node
// Every relative link in the tracked markdown resolves against the directory of the file that makes it.
//
// Why this exists: bead mwg-train-efg added three archetype documents four levels below the repository root and
// copied links from shallower documents - `../../train/briefs/...` and `../../../src/design/contract.mjs` - which
// resolve to `docs/design/train/...` and `docs/src/design/...`. Thirty-three links across three archetypes were
// broken, and they were already broken in editorial-blog, which the branch inherited. Nothing noticed: no check in
// check:all resolved a markdown link, so the only thing between a wrong link and main was a reviewer reading them.
//
// Why it will recur: the documentation tree mixes depths. The registers sit three levels down under
// docs/provenance/assets/ and the archetype documents four levels down under docs/design/archetypes/<name>/, so
// moving a relative link between the two is an off-by-one waiting to happen.
//
// This check resolves each target and reports the ones that do not exist. It never rewrites anything, and it never
// guesses a correction - the same discipline the efg fixer used, so that a correct link cannot be pushed into being
// wrong by a tool that thinks it knows better.
//
// Link targets that are external URLs, anchors-only, or placeholders are counted and skipped: this check is about
// whether relative references point at files that exist, not about whether the web is up. Targets inside a
// blockquote are skipped too, and for a different reason: a blockquote here reproduces someone else's document, so
// its relative links are relative to that document and not to this repository. Exactly one of the 963 relative
// targets in this tree is inside a blockquote - `[Apache License 2.0](LICENSE)` quoted from
// `modern-web-guidance-src/README.md` - and "fixing" it would corrupt a verbatim quotation that check:quotes exists
// to protect.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A target we cannot check and should not judge: an absolute URL with a scheme, a protocol-relative URL, an
// anchor-only reference, or a placeholder a human is meant to fill in.
const IGNORED = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#|$)/;

export function isPlaceholder(target) {
  return /[<>{}]/.test(target) || target === '...' || target.startsWith('...');
}

// Strip inline code spans so that a link *written about* in a sentence is not read as a link. Line structure is
// kept, so reported line numbers stay honest.
export function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
}

// A line that opens or closes a fenced code block. Fences are how this repository documents commands and example
// markup, so a link inside one is content, not a reference.
export function fenceMarker(line) {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
  return match ? match[1][0] : null;
}

// Every link target in a markdown document, with the line it came from. Supports inline links and images
// (`[text](target)`, `![alt](target)`, with an optional title), reference definitions (`[id]: target`), and the raw
// HTML `href`/`src` attributes the tree uses in two places.
export function extractLinks(text) {
  const links = [];
  const lines = text.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const marker = fenceMarker(lines[i]);
    if (marker) {
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const line = stripInlineCode(lines[i]);
    const quoted = /^\s*>/.test(lines[i]);

    const inline = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
    for (const match of line.matchAll(inline)) {
      const raw = match[1];
      links.push({ target: raw.startsWith('<') ? raw.slice(1, -1) : raw, line: lineNumber, quoted });
    }

    const definition = line.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/);
    if (definition) {
      const raw = definition[1];
      links.push({ target: raw.startsWith('<') ? raw.slice(1, -1) : raw, line: lineNumber, definition: true, quoted });
    }

    const attribute = /(?:href|src)\s*=\s*"([^"]*)"/g;
    for (const match of line.matchAll(attribute)) {
      links.push({ target: match[1], line: lineNumber, attribute: true, quoted });
    }
  }
  return links;
}

// Where a target points, relative to the file that made it. Returns null when the target is not ours to check.
// `root` is the repository root the caller is checking, not the module's own root: an absolute `/path` target means
// `root/path` for whoever asked, and a test or a tool that checks another tree must get that tree's answer.
export function resolveTarget(fromFile, target, root = ROOT) {
  if (IGNORED.test(target) || isPlaceholder(target)) return null;
  const withoutFragment = target.split('#')[0].split('?')[0];
  if (withoutFragment === '') return null;
  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // A target that is not valid percent-encoding is still a path we can look for as written.
  }
  const base = decoded.startsWith('/') ? root : path.dirname(fromFile);
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  return path.resolve(base, relative);
}

// The tracked files, used to tell a link into a gitignored or generated directory from a link into the repository
// proper. A link that resolves on this machine but is not tracked is broken for anyone who clones.
export function trackedFiles(root = ROOT) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return new Set(out.split('\0').filter(Boolean).map((entry) => path.resolve(root, entry)));
  } catch {
    return null;
  }
}

export function markdownFiles(root = ROOT) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '*.md'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean).map((entry) => path.resolve(root, entry));
  } catch {
    return null;
  }
}

export function checkDocLinks({ root = ROOT, files = null, tracked = null } = {}) {
  const findings = [];
  const counts = { files: 0, links: 0, checked: 0, ignored: 0, quoted: 0, broken: 0, untracked: 0, directories: 0 };
  const list = files ?? markdownFiles(root);
  if (list === null) {
    findings.push({ code: 'GIT-UNAVAILABLE', message: 'could not list tracked markdown; run this from a git checkout' });
    return { ok: false, findings, counts };
  }
  const trackedSet = tracked ?? trackedFiles(root);

  for (const file of list) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      findings.push({ code: 'UNREADABLE', message: `${path.relative(root, file)}: ${err.message}` });
      continue;
    }
    counts.files += 1;
    for (const link of extractLinks(text)) {
      counts.links += 1;
      // Classify before judging: an external or placeholder target is ignored wherever it sits, and only a target
      // this check would otherwise have resolved counts as one skipped inside a quotation.
      const resolved = resolveTarget(file, link.target, root);
      if (resolved === null) {
        counts.ignored += 1;
        continue;
      }
      if (link.quoted) {
        counts.quoted += 1;
        continue;
      }
      counts.checked += 1;
      const where = `${path.relative(root, file)}:${link.line}`;
      if (!fs.existsSync(resolved)) {
        counts.broken += 1;
        findings.push({
          code: 'LINK-BROKEN',
          message: `${where} -> ${link.target} (resolves to ${path.relative(root, resolved) || '.'}, which does not exist)`,
        });
        continue;
      }
      if (fs.statSync(resolved).isDirectory()) counts.directories += 1;
      if (trackedSet && !trackedSet.has(resolved)) {
        const isDir = fs.statSync(resolved).isDirectory();
        const underDir = isDir
          ? [...trackedSet].some((entry) => entry.startsWith(`${resolved}${path.sep}`))
          : false;
        if (!underDir) {
          counts.untracked += 1;
          findings.push({
            code: 'LINK-UNTRACKED',
            message: `${where} -> ${link.target} (resolves to ${path.relative(root, resolved)}, which exists but is not tracked by git, so a fresh clone breaks it)`,
          });
        }
      }
    }
  }
  return { ok: findings.length === 0, findings, counts };
}

function main() {
  const json = process.argv.includes('--json');
  const { ok, findings, counts } = checkDocLinks();
  if (json) {
    console.log(JSON.stringify({ ok, counts, findings }, null, 2));
  } else {
    for (const finding of findings) console.error(`FINDING ${finding.code} ${finding.message}`);
  }
  const summary = `${counts.checked} relative link(s) across ${counts.files} markdown file(s), ${counts.ignored} external/anchor/placeholder link(s) ignored, ${counts.quoted} inside quotation(s), ${counts.directories} pointing at directories, ${counts.untracked} untracked`;
  if (!ok) {
    console.error(`check-doc-links: FAIL - ${counts.broken} broken link(s), ${counts.untracked} untracked target(s); ${summary}`);
    process.exit(1);
  }
  if (!json) console.log(`check-doc-links: PASS - ${summary}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
