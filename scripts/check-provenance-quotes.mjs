#!/usr/bin/env node
/**
 * Check that every quoted clause in docs/provenance/*.md actually appears in the captured text.
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
 * quietly been edited is worse than no quote at all.
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
  .map((name) => [name, normalise(readFileSync(join(TEXT_DIR, name), 'utf8'))]);

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'evidence' ? [] : markdownFiles(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

let checked = 0;
const unreproducible = [];

for (const file of markdownFiles(PROVENANCE)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let block = [];
  const flush = () => {
    if (block.length === 0) return;
    const quote = normalise(block.map((line) => line.replace(/^>\s?/, '')).join(' '));
    block = [];
    if (quote.length < MIN_PROBE) return;
    const probe = quote.slice(0, 60);
    checked += 1;
    const hit = corpus.find(([, text]) => text.includes(probe));
    if (!hit) unreproducible.push({ file: file.slice(PROVENANCE.length + 1), probe });
  };
  for (const line of lines) {
    if (line.startsWith('>')) block.push(line);
    else flush();
  }
  flush();
}

console.log(`check-provenance-quotes: ${checked - unreproducible.length}/${checked} quoted passages reproduced from the local captures`);
for (const { file, probe } of unreproducible) {
  console.log(`UNREPRODUCIBLE  ${file}  ::  ${probe}...`);
}
process.exit(unreproducible.length === 0 ? 0 : 1);
