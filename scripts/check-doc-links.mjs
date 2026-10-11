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

// Masking replaces characters with spaces rather than deleting them, so every offset still maps to the line it came
// from and a reported line number stays honest.
function blank(chars, from, to) {
  for (let i = from; i < to; i += 1) if (chars[i] !== '\n') chars[i] = ' ';
}

// The byte ranges of fenced code blocks. A fence closes on a run of the same character at least as long as the run
// that opened it, so a longer fence can contain shorter ones - which is how a document shows markdown samples.
function fenceRanges(text) {
  const ranges = [];
  let offset = 0;
  let open = null;
  let openChar = '';
  let openLength = 0;
  for (const line of text.split('\n')) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (match) {
      const char = match[1][0];
      const length = match[1].length;
      if (open === null) {
        open = offset;
        openChar = char;
        openLength = length;
      } else if (char === openChar && length >= openLength) {
        ranges.push([open, offset + line.length]);
        open = null;
      }
    }
    offset += line.length + 1;
  }
  if (open !== null) ranges.push([open, text.length]); // an unclosed fence runs to the end of the document
  return ranges;
}

// Mask fenced code blocks and code spans, preserving every other byte's position. Fences are masked first because a
// code span is delimited by a run of backticks of equal length and may cross lines: a span can legitimately contain
// a shorter fence, so pairing spans before fences would close them in the wrong places.
export function maskContent(text) {
  const chars = text.split('');
  for (const [from, to] of fenceRanges(text)) blank(chars, from, to);
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== '`') {
      i += 1;
      continue;
    }
    let length = 0;
    while (chars[i + length] === '`') length += 1;
    let close = -1;
    let j = i + length;
    while (j < chars.length) {
      if (chars[j] !== '`') {
        j += 1;
        continue;
      }
      let run = 0;
      while (chars[j + run] === '`') run += 1;
      if (run === length) {
        close = j;
        break;
      }
      j += run;
    }
    if (close === -1) {
      // An unmatched opener is literal text, but it does not excuse the rest of the document: keep scanning, or a
      // single stray backtick would leave every later code span unmasked and every link inside one reported.
      i += length;
      continue;
    }
    blank(chars, i, close + length);
    i = close + length;
  }
  return chars.join('');
}

// Inline code for callers that have a single line; kept as the helper it always was, now with the same rules.
export function stripInlineCode(line) {
  return maskContent(line);
}

// The 1-based line number for a character offset.
function lineOfIndex(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

// The index of the `]` that closes the `[` at `open`, respecting backslash escapes and nested brackets, or -1.
function matchBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// The destination that follows the `(` at `from`, with the index of its closing `)`, or null if this is not a link.
// A destination may be wrapped in `<...>` - which is how a path containing spaces is written, and which is CommonMark
// URL syntax rather than a placeholder - or it may be bare, in which case balanced parentheses belong to it, so
// `path/(foo)/bar.md` is one destination instead of being truncated at the first `)`. A destination may also sit on
// the line after the link text, which is why this runs over the whole masked document and not line by line.
function parseDestination(text, from) {
  let i = from;
  // A link may be separated from its destination by a line break, but a BLANK line ends the paragraph, and no inline
  // construct straddles the end of a paragraph. So every run of whitespace here tolerates one newline and no more.
  const skipSpace = () => {
    let breaks = 0;
    while (i < text.length && /\s/.test(text[i])) {
      if (text[i] === '\n') breaks += 1;
      i += 1;
    }
    return breaks;
  };
  if (skipSpace() > 1) return null;
  let target = '';
  if (text[i] === '<') {
    i += 1;
    while (i < text.length && text[i] !== '>') {
      if (text[i] === '\n') return null;
      if (text[i] === '\\') {
        i += 1;
        if (i >= text.length) return null;
      }
      target += text[i];
      i += 1;
    }
    if (text[i] !== '>') return null;
    i += 1;
  } else {
    let depth = 0;
    while (i < text.length) {
      const char = text[i];
      if (char === '\\' && i + 1 < text.length) {
        target += text[i + 1];
        i += 2;
        continue;
      }
      if (/\s/.test(char)) break;
      if (char === '(') {
        depth += 1;
        target += char;
        i += 1;
        continue;
      }
      if (char === ')') {
        if (depth === 0) break;
        depth -= 1;
        target += char;
        i += 1;
        continue;
      }
      target += char;
      i += 1;
    }
  }
  const afterTarget = i;
  if (skipSpace() > 1) return null;
  if (text[i] === '"' || text[i] === "'") {
    const quote = text[i];
    i += 1;
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') i += 1;
      i += 1;
    }
    if (text[i] !== quote) return null;
    i += 1;
    if (skipSpace() > 1) return null;
  } else if (text[i] === '(' && i !== afterTarget) {
    let depth = 0;
    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
      i += 1;
    }
    if (skipSpace() > 1) return null;
  } else if (text[i] !== ')') {
    // Whitespace may sit between the destination and the closing parenthesis, and a reader's link still works, so it
    // is accepted; anything else there is not a link.
    return null;
  }
  if (text[i] !== ')') return null;
  return { target, end: i };
}

// Every link target in a markdown document, with the line it came from and its offset, in document order. Supports
// inline links and images (`[text](target)`, `![alt](target)`, with an optional title, and link text containing an
// escaped or nested bracket), reference definitions (`[id]: target`), and the raw HTML `href`/`src` attributes the
// tree uses in two places.
export function extractLinks(text) {
  const masked = maskContent(text);
  const lineStarts = [0];
  for (let i = 0; i < masked.length; i += 1) if (masked[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (offset) => lineOfIndex(lineStarts, offset);
  const lines = text.split('\n');
  const quotedAt = (line) => /^\s*>/.test(lines[line - 1] ?? '');
  const links = [];

  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] !== '[') continue;
    const closeText = matchBracket(masked, i);
    if (closeText === -1) continue;
    // An inline link's opening parenthesis must follow its text immediately (CommonMark); a space here means this is
    // not an inline link. Notice what this does NOT do: it leaves `i` where it is rather than skipping to the end of
    // the construct. A linked image is `[![alt](image.png)](page.md)` and both targets are real, so the scanner has to
    // keep looking inside the text it just consumed. Nothing is reported twice, because each `[` is examined once.
    if (masked[closeText + 1] !== '(') continue;
    const parsed = parseDestination(masked, closeText + 2);
    if (parsed === null) continue;
    const line = lineOf(i);
    links.push({ target: parsed.target, line, index: i, quoted: quotedAt(line) });
  }

  for (const match of masked.matchAll(/^(?:\s{0,3}>)?\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/gm)) {
    const raw = match[1];
    const line = lineOf(match.index);
    links.push({
      target: raw.startsWith('<') ? raw.slice(1, -1) : raw,
      line,
      index: match.index,
      definition: true,
      quoted: quotedAt(line),
    });
  }

  for (const match of masked.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/g)) {
    const line = lineOf(match.index);
    links.push({ target: match[1], line, index: match.index, attribute: true, quoted: quotedAt(line) });
  }

  return links.sort((a, b) => a.index - b.index);
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
    // git prints a fatal line to stderr when the directory being checked is not a repository, which is exactly
    // what the unit tests use, so its stderr is discarded rather than sprayed through a passing test run.
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
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
