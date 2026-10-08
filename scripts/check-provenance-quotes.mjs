#!/usr/bin/env node
/**
 * Check that every quoted clause in docs/provenance/*.md actually appears in the captured text,
 * and (where the record cites one) at the line number it claims.
 *
 *   node scripts/check-provenance-quotes.mjs
 *
 * The captures live in docs/provenance/evidence/text/, which is gitignored (this repository does
 * not redistribute other people's terms pages), so this script only does anything in a checkout
 * where `scripts/capture-rights-evidence.sh` has been run. It exits 0 in either case: a missing
 * capture set is not a failure of the documentation, but an unreproducible quote is.
 *
 * Why it exists: the whole value of this directory is that a reviewer can grep a claim back to a
 * source. Typography drifts (curly quotes, escaped asterisks, wrapped lines) and a quote that has
 * quietly been edited is worse than no quote at all. The line-citation check was added after an
 * independent review found two 'extracted lines N-M' citations that were off by one and two.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVENANCE = join(ROOT, 'docs/provenance');
const TEXT_DIR = join(PROVENANCE, 'evidence/text');
const MIN_PROBE = 40;

if (!existsSync(TEXT_DIR)) {
  console.log('check-provenance-quotes: no local captures (run scripts/capture-rights-evidence.sh); skipped');
  process.exit(0);
}

/** Collapse whitespace, unescape markdown escapes, and unify quote glyphs. */
function normalise(value) {
  return value
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const corpus = readdirSync(TEXT_DIR)
  .filter((name) => name.endsWith('.txt'))
  .map((name) => [name, normalise(readFileSync(join(TEXT_DIR, name), 'utf8')), readFileSync(join(TEXT_DIR, name), 'utf8').split('\n').map(normalise)]);

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'evidence' ? [] : markdownFiles(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

const CITATION = /(?:extracted\s+)?lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/gi;
// A blockquote whose source is not a captured third-party page (typically the owner or a bead) is
// marked with the comment `<!-- quote-source: <where it came from> -->` on the line above it, and is
// exempt from capture verification. The reason is printed, so an exemption is visible, not silent.
const EXEMPT_MARKER = /<!--\s*quote-source:\s*([^>]*?)\s*-->/;

let checked = 0;
let citations = 0;
const exempt = [];
const unreproducible = [];
const badCitation = [];

for (const file of markdownFiles(PROVENANCE)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let block = [];
  let citedFrom = null;
  let exemptReason = null;
  const flush = () => {
    const reason = exemptReason;
    const citedLine = citedFrom;
    const quote = normalise(block.map((line) => line.replace(/^>\s?/, '')).join(' '));
    block = [];
    citedFrom = null;
    exemptReason = null;
    if (quote.length < MIN_PROBE) return;
    if (reason !== null) {
      exempt.push({ file: file.slice(PROVENANCE.length + 1), reason, probe: quote.slice(0, 60) });
      return;
    }
    const probe = quote.slice(0, 60);
    checked += 1;
    const hit = corpus.find(([, text]) => text.includes(probe));
    if (!hit) {
      unreproducible.push({ file: file.slice(PROVENANCE.length + 1), probe });
      return;
    }
    if (citedLine === null) return;
    citations += 1;
    // A cited quote may wrap over several captured lines, may be a blockquote whose first source
    // line is a heading, and may appear verbatim in more than one capture (two Apache-2.0 files,
    // the same DeepSeek sentence in two documents). Accept the citation when the joined text
    // starting at the claimed line of ANY capture reproduces the probe.
    const matched = corpus.some(([, , linesOf]) => {
      const window = normalise(linesOf.slice(Math.max(0, citedLine - 1), citedLine - 1 + 40).join(' '));
      return window.includes(probe);
    });
    if (matched) return;
    const suggestion = corpus
      .map(([name, , linesOf]) => {
        const at = linesOf.findIndex((line) => line.includes(probe.slice(0, 40)));
        return at >= 0 ? `${name}:${at + 1}` : null;
      })
      .filter(Boolean);
    badCitation.push({
      file: file.slice(PROVENANCE.length + 1),
      claimed: citedLine,
      actual: suggestion.length > 0 ? suggestion.join(' or ') : 'not found',
      probe,
    });
  };
  for (const line of lines) {
    if (line.startsWith('>')) {
      block.push(line);
      continue;
    }
    if (block.length > 0) flush();
    const marker = line.match(EXEMPT_MARKER);
    if (marker) {
      exemptReason = marker[1];
      continue;
    }
    const citation = [...line.matchAll(CITATION)].pop();
    if (citation) citedFrom = Number(citation[1]);
  }
  flush();
}

console.log(`check-provenance-quotes: ${checked - unreproducible.length}/${checked} quoted passages reproduced from the local captures`);
for (const { file, probe } of unreproducible) {
  console.log(`UNREPRODUCIBLE  ${file}  ::  ${probe}...`);
}
for (const { file, reason } of exempt) {
  console.log(`EXEMPT  ${file}  ::  quote-source: ${reason}`);
}
console.log(`check-provenance-quotes: ${citations - badCitation.length}/${citations} line citations point at the line they claim`);
for (const { file, claimed, actual, probe } of badCitation) {
  console.log(`WRONG-LINE  ${file}  claims line ${claimed}, found at ${actual}  ::  ${probe}...`);
}
process.exit(unreproducible.length + badCitation.length === 0 ? 0 : 1);
