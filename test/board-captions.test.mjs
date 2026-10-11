/**
 * The board-caption check's own tests.
 *
 * The check exists because `demo/compare.html` was a board-digest consumer that no check read: on
 * 2026-10-11 all ten captions across booking, catalogue and contact-lead were found to be showing
 * digests from earlier generations while every file the existing checks know about was in step
 * (bead mwg-train-7x8n). A check like this only earns its place if its failure paths work, so every
 * rule is driven here with a page that breaks exactly that rule - including the two that exist to
 * stop the check from passing vacuously: an unreadable caption, and a caption truncated so short it
 * pins nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPTION, checkBoardCaptions, captionFindings } from '../scripts/check-board-captions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A board whose bytes are arbitrary: the check hashes bytes, it does not decode the image. */
const BOARD = Buffer.from('not-a-real-jpeg, but the check only hashes bytes');

/** Writes a throwaway repo holding one archetype whose board is BOARD, and returns useful paths. */
function fixture({ family = 'demo-family', board = 'step1-grid.jpg', caption } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'board-captions-'));
  const archetypeDir = join(root, 'docs', 'design', 'archetypes', family);
  mkdirSync(join(archetypeDir, 'demo'), { recursive: true });
  writeFileSync(join(archetypeDir, board), BOARD);
  const file = join(archetypeDir, 'demo', 'compare.html');
  writeFileSync(file, caption);
  return { root, family, archetypeDir, file };
}

/** The catalogue/contact-lead form. `shown` is substituted into the caption as-is. */
const wave2Caption = (shown, board = 'step1-grid.jpg') =>
  `<p class="comparison-source">\n  Board <code>../${board}</code> (1376 \u00d7 768, SHA-256 <code>${shown}</code>)\n  &middot; live page <code>index.html</code>\n</p>\n`;

/** The booking form, which uses three full stops and a different sentence order. */
const bookingCaption = (shown, board = 'step1-browse.jpg') =>
  `<p class="card-subtitle">Source: <code>${board}</code> &bull; SHA-256: <code>${shown}</code></p>\n`;

test('a caption showing the board\u2019s real prefix passes, in both forms the repo uses', () => {
  const prefix = sha256(BOARD).slice(0, 10);
  const wave2 = fixture({ caption: wave2Caption(`${prefix}...`) });
  const booking = fixture({ board: 'step1-browse.jpg', caption: bookingCaption(`${prefix}...`) });
  try {
    assert.deepEqual(captionFindings({ file: wave2.file, html: wave2Caption(`${prefix}...`), archetypeDir: wave2.archetypeDir }), []);
    assert.deepEqual(captionFindings({ file: booking.file, html: bookingCaption(`${prefix}...`), archetypeDir: booking.archetypeDir }), []);
  } finally {
    rmSync(wave2.root, { recursive: true, force: true });
    rmSync(booking.root, { recursive: true, force: true });
  }
});

test('a single-character ellipsis is accepted as well as three full stops', () => {
  const prefix = sha256(BOARD).slice(0, 12);
  const holder = fixture({ caption: wave2Caption(`${prefix}\u2026`) });
  try {
    const html = wave2Caption(`${prefix}\u2026`);
    assert.deepEqual(captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir }), []);
  } finally {
    rmSync(holder.root, { recursive: true, force: true });
  }
});

test('a caption showing a stale prefix is a finding that names both digests', () => {
  const holder = fixture({ caption: wave2Caption('deadbeef00\u2026') });
  try {
    const html = wave2Caption('deadbeef00\u2026');
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1);
    assert.match(findings[0], /shows SHA-256 deadbeef00\u2026/);
    assert.match(findings[0], new RegExp(sha256(BOARD).slice(0, 10)));
  } finally {
    rmSync(holder.root, { recursive: true, force: true });
  }
});

test('a SHA-256 mention that cannot be parsed is a finding rather than a silent skip', () => {
  // The mention is there, but the digest is not hex, so no caption parses. This is the failure mode
  // that would let a future caption format slip past the check unnoticed.
  const html = `<p>Board <code>../step1-grid.jpg</code> (SHA-256 <code>not-a-hash</code>)</p>`;
  const findings = captionFindings({ file: '/repo/docs/design/archetypes/x/demo/compare.html', html, archetypeDir: '/repo/docs/design/archetypes/x' });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /mentions SHA-256 1 time\(s\) but only 0 caption\(s\) parsed/);
});

test('a caption naming a board that is not committed is a finding', () => {
  const html = wave2Caption(`${sha256(BOARD).slice(0, 10)}\u2026`, 'step9-missing.jpg');
  const findings = captionFindings({ file: '/repo/docs/design/archetypes/x/demo/compare.html', html, archetypeDir: '/repo/docs/design/archetypes/x' });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /no such board is committed/);
});

test('a caption pointing outside its own archetype is a finding', () => {
  // A .jpg name is required for the caption to parse at all, so this escapes with one.
  const html = wave2Caption(`${sha256(BOARD).slice(0, 10)}\u2026`, '../../authoring/secret.jpg');
  const findings = captionFindings({ file: '/repo/docs/design/archetypes/x/demo/compare.html', html, archetypeDir: '/repo/docs/design/archetypes/x' });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /outside its own archetype directory/);
});

test('a prefix too short to pin anything is a finding even when it matches', () => {
  const holder = fixture({ caption: wave2Caption(`${sha256(BOARD).slice(0, 4)}\u2026`) });
  try {
    const html = wave2Caption(`${sha256(BOARD).slice(0, 4)}\u2026`);
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1);
    assert.match(findings[0], /only 4 hex characters/);
  } finally {
    rmSync(holder.root, { recursive: true, force: true });
  }
});

test('the regex matches every caption form actually committed in this repo', () => {
  const real = checkBoardCaptions({ repoRoot: ROOT });
  assert.ok(real.pages >= 3, `expected at least three comparison pages, found ${real.pages}`);
  assert.ok(real.captions >= 10, `expected at least ten captions, found ${real.captions}`);
  assert.deepEqual(real.findings, [], `committed captions must match the committed boards:\n${real.findings.join('\n')}`);
});

test('the check script exits non-zero and prints FAILED when a caption is stale', () => {
  const bad = fixture({ caption: wave2Caption('deadbeef00\u2026') });
  try {
    const result = checkBoardCaptions({ repoRoot: bad.root });
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
  } finally {
    rmSync(bad.root, { recursive: true, force: true });
  }
  // And the real tree, through the command line, exits zero with a PASS line.
  const stdout = execFileSync(process.execPath, [join(ROOT, 'scripts', 'check-board-captions.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.match(stdout, /check:board-captions - PASS - checked \d+ caption\(s\) in \d+ demo comparison page\(s\)/);
});

test('the exported regex only matches a filename followed by SHA-256 in the same element', () => {
  // A filename in one paragraph and an unrelated digest in the next must not be paired up.
  const html = `<p>Board <code>../step1-grid.jpg</code></p>\n<p>SHA-256 <code>0123456789\u2026</code></p>`;
  CAPTION.lastIndex = 0;
  assert.equal(CAPTION.exec(html), null);
});
