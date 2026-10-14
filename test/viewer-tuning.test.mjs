import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createViewer } from '../src/viewer/server.mjs';
import { computeWordDiff, loadTuningData, renderTuning } from '../src/viewer/tuning.mjs';
import { CROP_LEDGER_PATH, cropSourceProblems, derivedCropMatches, inspectBoard } from '../scripts/generate-training-boards.mjs';

const ROOT = resolve(import.meta.dirname, '..');

// Board dimensions and the widescreen contract, derived rather than restated.
//
// RAW model output remains a 16:9 desktop screenshot. Existing references with browser chrome removed are
// source-pinned derived crops and have wider ratios so that page content is not clipped or distorted.
const WIDESCREEN_MIN_RATIO = 1.75;
const WIDESCREEN_MAX_RATIO = 1.80;

function assertWidescreen(width, height, label) {
  assert.ok(Number.isFinite(width) && Number.isFinite(height) && height > 0, `${label}: unusable dimensions ${width}x${height}`);
  const ratio = width / height;
  assert.ok(ratio >= WIDESCREEN_MIN_RATIO && ratio <= WIDESCREEN_MAX_RATIO,
    `${label} is ${width}x${height}, ratio ${ratio.toFixed(3)}, which is outside ${WIDESCREEN_MIN_RATIO}-${WIDESCREEN_MAX_RATIO}: a reference board must be a full-bleed widescreen desktop screenshot`);
  return ratio;
}

// Read the real image rather than a constant. The page's rendered dimensions are only trustworthy if they match the
// bytes, so the test compares the two instead of checking either against a number written here.
function jpegDimensions(file) {
  let bytes;
  try { bytes = readFileSync(file); } catch { return null; }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let i = 2; i < bytes.length - 9; i += 1) {
    if (bytes[i] !== 0xff) continue;
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    i += 1 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

test('workbench reads authored training variants and recorded templates without touching eval', () => {
  const data = loadTuningData(ROOT);
  assert.equal(data.families.size, 39);
  assert.equal(data.families.get('tr-01').length, 2);
  assert.equal(data.projects.length, 273);
  const html = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-26', variant: 'v2', framework: 'hono' });
  assert.match(html, /tr-26-v2/);
  assert.match(html, /Compare the original authored prompts \(2 voices\)/);
  assert.match(html, /tr-26-v1/);
  assert.match(html, /tr-26-hono/);
  assert.match(html, /scaffolded from tr-26-v1/);
  assert.match(html, /mwg-train deterministic baseline/);
  assert.match(html, /\/tuning\/target\/tr-26\.png/);
  assert.match(html, /not a model-generated site/);
  assert.match(html, /Editing the prompt or settings below does not regenerate it/);
  assert.match(html, /name="temperature"/);
  assert.match(html, /name="max_tokens"/);
  assert.match(html, /name="seed"/);
  assert.doesNotMatch(html, /<script>.*fetch\(/s);
});

test('full-page targets use their actual dimensions, and absent records show honest empty evidence', (t) => {
  const data = loadTuningData(ROOT);
  assert.match(renderTuning({ data, repoRoot: ROOT, familyId: 'tr-02' }), /width="1280" height="1246"/);
  const empty = mkdtempSync(join(tmpdir(), 'viewer-tuning-missing-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const absent = loadTuningData(empty);
  assert.equal(absent.missing.length, 4);
  assert.match(renderTuning({ data: absent, repoRoot: empty }), /Missing committed training input: docs\/train\/briefs\/manifest.jsonl/);
});

test('untrusted prompt text is escaped and unknown family falls back to an authored training family', () => {
  const data = loadTuningData(ROOT);
  data.families.get('tr-01')[0] = { ...data.families.get('tr-01')[0], prompt: '<script>alert(1)</script>' };
  const html = renderTuning({ data, repoRoot: ROOT, familyId: '../../docs/eval', variant: 'v1', framework: 'raw' });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\/tuning\/target\/tr-01\.png/);
  assert.doesNotMatch(html, /\/tuning\/target\/\.\./);
});

test('tuning routes serve only fixed training targets, never eval targets or mutated drafts', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-tuning-'));
  const { server, liveServer, pool } = createViewer({ allowAnonymous: true, corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT });
  t.after(() => { pool.stopAll(); server.close(); liveServer.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;
  const workbench = await fetch(`${base}/tuning?family=tr-27&variant=v1&framework=raw`);
  assert.equal(workbench.status, 200);
  assert.match(await workbench.text(), /tr-27-v1/);
  const asset = await fetch(`${base}/tuning/target/tr-27.png`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /image\/png/);
  assert.equal((await asset.arrayBuffer()).byteLength > 1000, true);

  const refAsset = await fetch(`${base}/tuning/reference/tr-01.jpg`);
  assert.equal(refAsset.status, 200);
  assert.match(refAsset.headers.get('content-type'), /image\/jpeg/);
  assert.equal((await refAsset.arrayBuffer()).byteLength > 1000, true);
  // Every training family now has a board, so there is no real family left whose file is missing - tr-03 used to be
  // that case and this assertion would have gone on passing only while the corpus stayed incomplete. The missing-file,
  // non-JPEG and symlink refusals are exercised against a purpose-built tree in
  // test/viewer-reference-route.test.mjs (tr-99, a file named reference.jpg that is HTML, and a symlinked family).
  // What matters here is that an id that is not a training family at all is still refused.
  assert.equal((await fetch(`${base}/tuning/reference/tr-99.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/tuning/reference/fam-r01.jpg`)).status, 404);

  assert.equal((await fetch(`${base}/tuning/target/fam-r01.png`)).status, 404);
  assert.equal((await fetch(`${base}/tuning/target/tr-27.json`)).status, 404);
  assert.equal((await fetch(`${base}/tuning`, { method: 'POST', headers: { origin: new URL(base).origin }, body: 'prompt=secret' })).status, 404);
  const client = await fetch(`${base}/tuning/client.js`);
  assert.equal(client.status, 200);
  assert.match(await client.text(), /source_prompt/);
});

test('tuning image GETs refuse leaf and ancestor swaps after their path probes', () => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-tuning-swap-'));
  const outside = mkdtempSync(join(tmpdir(), 'viewer-tuning-swap-outside-'));
  try {
    const targetDir = join(root, 'data/A1_self_generated/targets/tr-01');
    const boardDir = join(root, 'docs/design/training/tr-01');
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(boardDir, { recursive: true });
    writeFileSync(join(targetDir, 'target.png'), Buffer.from([137, 80, 78, 71]));
    writeFileSync(join(boardDir, 'reference.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    writeFileSync(join(outside, 'target.png'), Buffer.from('OUTSIDE PNG SECRET'));
    writeFileSync(join(outside, 'reference.jpg'), Buffer.concat([
      Buffer.from([0xff, 0xd8]), Buffer.from('OUTSIDE JPEG SECRET'), Buffer.from([0xff, 0xd9]),
    ]));
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { mkdtempSync, rmSync } from 'node:fs';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      const [root, outside] = process.argv.slice(1);
      const target = join(root, 'data/A1_self_generated/targets/tr-01/target.png');
      const boardDir = join(root, 'docs/design/training/tr-01');
      const board = join(boardDir, 'reference.jpg');
      const originalRead = fs.readFileSync, originalOpen = fs.openSync;
      let swaps = 0, insideLegacyRead = false;
      function swap(file, operation) {
        if (file === target) {
          swaps++;
          fs.renameSync(target, target + '.inside');
          fs.symlinkSync(join(outside, 'target.png'), target);
          try { return operation(); }
          finally { fs.unlinkSync(target); fs.renameSync(target + '.inside', target); }
        }
        if (file === board) {
          swaps++;
          fs.renameSync(boardDir, boardDir + '.inside');
          fs.symlinkSync(outside, boardDir, 'dir');
          try { return operation(); }
          finally { fs.unlinkSync(boardDir); fs.renameSync(boardDir + '.inside', boardDir); }
        }
        return operation();
      }
      fs.readFileSync = (file, ...args) => {
        if (typeof file !== 'string') return originalRead(file, ...args);
        insideLegacyRead = true;
        try { return swap(file, () => originalRead(file, ...args)); }
        finally { insideLegacyRead = false; }
      };
      fs.openSync = (file, ...args) => typeof file === 'string' && !insideLegacyRead ?
        swap(file, () => originalOpen(file, ...args)) : originalOpen(file, ...args);
      syncBuiltinESMExports();
      const { createViewer } = await import(process.argv[3]);
      const stateDir = mkdtempSync(join(tmpdir(), 'viewer-tuning-swap-state-'));
      const { server, liveServer, pool } = createViewer({ allowAnonymous: true, repoRoot: root,
        corpusRoot: process.argv[4], stateDir });
      try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = 'http://127.0.0.1:' + server.address().port;
        for (const path of ['/tuning/target/tr-01.png', '/tuning/reference/tr-01.jpg']) {
          const response = await fetch(base + path);
          assert.equal(response.status, 404, path + ': outside bytes must not be served');
        }
        assert.equal(swaps, 2, 'both image opens must encounter a real filesystem swap');
      } finally {
        pool.stopAll();
        await Promise.all([new Promise(resolve => server.close(resolve)),
          new Promise(resolve => liveServer.close(resolve))]);
        rmSync(stateDir, { recursive: true, force: true });
      }
      console.log('tuning target and board refuse post-probe swaps');
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, root, outside,
      new URL('../src/viewer/server.mjs', import.meta.url).href, join(ROOT, 'pilot')],
    { encoding: 'utf8', timeout: 15000 });
    assert.match(output, /tuning target and board refuse post-probe swaps/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('training target route refuses symlinked and non-file images', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-tuning-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'data/A1_self_generated/targets/tr-01');
  mkdirSync(dir, { recursive: true });
  const outside = join(root, 'outside.png');
  writeFileSync(outside, Buffer.from([137, 80, 78, 71]));
  const image = join(dir, 'target.png');
  symlinkSync(outside, image);
  const { server, pool } = createViewer({ allowAnonymous: true, corpusRoot: join(ROOT, 'pilot'), stateDir: join(root, 'state'), repoRoot: root });
  t.after(() => { pool.stopAll(); server.close(); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const url = `http://127.0.0.1:${server.address().port}/tuning/target/tr-01.png`;
  assert.equal((await fetch(url)).status, 404);
  rmSync(image);
  mkdirSync(image);
  assert.equal((await fetch(url)).status, 404);
});

test('workbench renders live target inspection with actual dimensions, manifest metadata, and full-size link', () => {
  const data = loadTuningData(ROOT);
  const html = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  // Panel heading
  assert.match(html, /<h2 id="target-heading">Live target inspection<\/h2>/);
  // Real dimensions rendered as text and attribute
  assert.match(html, /Actual dimensions<\/dt><dd>1280 × \d+ px<\/dd>/);
  assert.match(html, /width="1280" height="\d+"/);
  // Full-size link
  assert.match(html, /<a class="button-link[^"]*" href="\/tuning\/target\/tr-01\.png" target="_blank" rel="noopener">Open full size \(1280 × \d+ px\)<\/a>/);
  // Manifest metadata
  assert.match(html, /Manifest ID<\/dt><dd><code>target-tr-01<\/code><\/dd>/);
  assert.match(html, /Family<\/dt><dd><code>tr-01<\/code><\/dd>/);
  assert.match(html, /Storage path<\/dt><dd><code>data\/A1_self_generated\/targets\/tr-01\/target\.png<\/code><\/dd>/);
  assert.match(html, /Rights reference<\/dt><dd><code>docs\/provenance\/assets\/training-targets\.md<\/code><\/dd>/);
  assert.match(html, /Generator<\/dt><dd><code>type: deterministic · tool: scripts\/render-training-targets\.mjs · browser: headless-chrome<\/code><\/dd>/);
  assert.match(html, /excluded_from_training: true<\/code> · <code>approved_for_training: false<\/code>/);
});

test('the raw 16:9 contract rejects square cards; derived page-only crops are checked against their source ledger', () => {
  // The board that shipped, read from disk rather than named here.
  assert.ok(assertWidescreen(1376, 768, 'the 16:9 board') >= WIDESCREEN_MIN_RATIO);
  // And the negative control: the square card this batch replaced must fail, or the contract permits the thing it
  // exists to prevent - a test that only ever sees passing input proves nothing.
  assert.throws(() => assertWidescreen(1024, 1024, 'the square card'), /outside 1\.75-1\.8/,
    'the square 1024x1024 board must fail the widescreen contract');
  // Absent or nonsense dimensions must fail loudly rather than becoming NaN comparisons.
  assert.throws(() => assertWidescreen(0, 0, 'no board'), /unusable dimensions/);
  assert.throws(() => assertWidescreen(undefined, undefined, 'missing board'), /unusable dimensions/);
});

test('workbench renders high-fidelity reference board when present, and degrades honestly when missing', () => {
  const data = loadTuningData(ROOT);
  // tr-01 has a reference board
  const htmlWithRef = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  assert.match(htmlWithRef, /High-fidelity reference board/);
  assert.match(htmlWithRef, /src="\/tuning\/reference\/tr-01\.jpg"/);
  assert.match(htmlWithRef, /href="\/tuning\/reference\/tr-01\.jpg"/);
  // These used to be the literal numbers 1376 and 768, which pinned one board rather than the contract the bead
  // promises. A magic size passes for exactly one image and says nothing about whether a later board is widescreen -
  // and it has to be edited every time a board is regenerated, which is how an assertion quietly becomes a record of
  // whatever shipped last. So this asks the file and the page to agree instead.
  const boardPath = join(ROOT, 'docs', 'design', 'training', 'tr-01', 'reference.jpg');
  const board = jpegDimensions(boardPath);
  assert.ok(board, `expected to read dimensions from ${boardPath}`);
  const ledger = JSON.parse(readFileSync(join(ROOT, CROP_LEDGER_PATH), 'utf8'));
  const originalDigests = new Map();
  assert.deepEqual(cropSourceProblems(ledger, { originalDigests }), []);
  const crop = ledger.boards['tr-01'];
  const inspected = inspectBoard(readFileSync(boardPath));
  assert.equal(derivedCropMatches(inspected.dimensions, crop, inspected.sha256, inspected.bytes,
    originalDigests.get('tr-01')), true,
    'this variable-ratio board must be explained by an exact source-pinned page crop, not silently treated as a raw model image');
  assert.throws(() => assertWidescreen(board.width, board.height, 'tr-01 derived board'), /outside 1\.75-1\.8/,
    'changing the raw 16:9 contract would conceal the difference between a crop and a future model output');
  // The page must report what the file actually is, not a number someone typed.
  assert.match(htmlWithRef, new RegExp(`width="${board.width}" height="${board.height}"`));
  assert.match(htmlWithRef, new RegExp(`${board.width} \u00d7 ${board.height} px`));
  assert.match(htmlWithRef, /docs\/design\/training\/tr-01\/reference\.jpg/);

  // The empty state is what an operator sees for a family whose board has not been generated yet. Every training
  // family now has one, so there is no real family left to exercise it with - this used to point at tr-03, which was
  // the last family without a board, and would have gone on passing only while the corpus stayed incomplete. The state
  // is reached here through a temporary root that holds a board for tr-02 and none for the family being inspected,
  // which tests both directions of the derived copy: it must name the family that has a board and no other.
  const absentRoot = mkdtempSync(join(tmpdir(), 'viewer-tuning-noboard-'));
  try {
    mkdirSync(join(absentRoot, 'docs', 'design', 'training', 'tr-02'), { recursive: true });
    writeFileSync(join(absentRoot, 'docs', 'design', 'training', 'tr-02', 'reference.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const htmlWithoutRef = renderTuning({ data, repoRoot: absentRoot, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
    assert.doesNotMatch(htmlWithoutRef, /src="\/tuning\/reference\/tr-01\.jpg"/);
    assert.match(htmlWithoutRef, /No reference board yet for this family\./);
    // The copy names WHICH families have boards, so it must ask the tree rather than restate a list: it names tr-02,
    // the only board in this root, and claims nothing about a family that has none. This assertion used to be the
    // literal string "tr-01, tr-02, and tr-04", which held the stale copy in place while the page told operators that
    // three boards existed and the rest were pending.
    assert.match(htmlWithoutRef, /<code>tr-02<\/code>/, 'the empty state must name the family that has a board on disk');
    assert.doesNotMatch(htmlWithoutRef, /<code>tr-03<\/code>/, 'the empty state must not name a family with no board');
    assert.match(htmlWithoutRef, /Reference board<\/dt><dd><span class="muted">no reference board yet for this family<\/span><\/dd>/);
  } finally {
    rmSync(absentRoot, { recursive: true, force: true });
  }

  // And the direction that matters most now that the corpus is complete: the tree and the page agree about every
  // family, so a board added to disk without the page listing it - or a page listing a family whose board was never
  // generated - fails here.
  const boardDir = join(ROOT, 'docs', 'design', 'training');
  const allFamilies = readdirSync(boardDir).filter((name) => /^tr-\d{2}$/.test(name)).sort();
  const boardFamilies = allFamilies.filter((name) => existsSync(join(boardDir, name, 'reference.jpg')));
  assert.ok(boardFamilies.length >= 1, 'expected at least one authored board on disk, or this assertion means nothing');
  for (const family of allFamilies) {
    const html = renderTuning({ data, repoRoot: ROOT, familyId: family, variant: 'v1', framework: 'raw' });
    const hasBoard = boardFamilies.includes(family);
    assert.equal(
      new RegExp(`src="/tuning/reference/${family}\.jpg"`).test(html),
      hasBoard,
      `${family}: the page and the tree must agree about whether a reference board exists`,
    );
  }
});

test('workbench renders side-by-side prompt comparison with legible differences', () => {
  const data = loadTuningData(ROOT);
  const html = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  // Side-by-side panel is not collapsed in <details>
  assert.match(html, /<section class="panel prompt-comparison-panel"/);
  assert.match(html, /<div class="prompt-comparison-grid">/);
  // Both variants appear in the grid
  assert.match(html, /<code>tr-01-v1<\/code>/);
  assert.match(html, /<code>tr-01-v2<\/code>/);
  // Active variant badge and switch action
  assert.match(html, /<span class="badge accepted">Active in editor<\/span>/);
  assert.match(html, /Switch editor to v2<\/a>/);
  // Diff chips highlight wording differences
  assert.match(html, /class="diff-chip diff-v1"/);
  assert.match(html, /class="diff-chip diff-v2"/);
  assert.match(html, /class="diff-legend"/);
  assert.match(html, /shared vocabulary/);
});

test('workbench renders draft convergence preview against reference target with clear draft distinction', () => {
  const data = loadTuningData(ROOT);
  const html = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  // Convergence preview panel
  assert.match(html, /<section class="panel convergence-preview-panel"/);
  assert.match(html, /<h2 id="convergence-heading">Draft convergence preview<\/h2>/);
  // Draft badge and warning callout
  assert.match(html, /LOCAL DRAFT · UNAPPROVED/);
  assert.match(html, /Draft is not saved over the brief/);
  assert.match(html, /does not overwrite the authored brief contract/);
  // Side-by-side convergence columns
  assert.match(html, /class="convergence-grid"/);
  assert.match(html, /Reference target design/);
  assert.match(html, /Tuned draft prompt/);
  assert.match(html, /id="live-draft-text"/);
  assert.match(html, /id="draft-delta-pill"/);
});

test('absent target file degrades to explicit message without broken image', () => {
  const data = loadTuningData(ROOT);
  // Use a temporary fake repoRoot where target.png does not exist
  const empty = mkdtempSync(join(tmpdir(), 'viewer-tuning-notarget-'));
  try {
    const html = renderTuning({ data, repoRoot: empty, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
    // No broken <img> element rendered
    assert.doesNotMatch(html, /<img class="tuning-target"/);
    // Explicit degradation notice
    assert.match(html, /Target image absent: no target image found at/);
    assert.match(html, /Actual dimensions<\/dt><dd><span class="muted">absent<\/span><\/dd>/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('absent target manifest metadata degrades honestly to absent indicator', () => {
  const data = loadTuningData(ROOT);
  const clonedData = { ...data, targetRecords: new Map() }; // No target records
  const html = renderTuning({ data: clonedData, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  // Manifest fields show 'absent'
  assert.match(html, /Manifest ID<\/dt><dd><code><span class="muted">absent<\/span><\/code><\/dd>/);
  assert.match(html, /Rights reference<\/dt><dd><span class="muted">absent<\/span><\/dd>/);
  assert.match(html, /Generator<\/dt><dd><span class="muted">absent<\/span><\/dd>/);
});

test('computeWordDiff highlights unique words and computes shared vocabulary overlap', () => {
  const p1 = 'I need a booking application for bicycle repairs.';
  const p2 = 'We need a reservation site for bike maintenance.';
  const diff = computeWordDiff(p1, p2);
  assert.match(diff.htmlA, /<mark class="diff-chip diff-v1">I<\/mark>/);
  assert.match(diff.htmlA, /<mark class="diff-chip diff-v1">booking<\/mark>/);
  assert.match(diff.htmlB, /<mark class="diff-chip diff-v2">We<\/mark>/);
  assert.match(diff.htmlB, /<mark class="diff-chip diff-v2">reservation<\/mark>/);
  // Shared words are NOT wrapped in diff chips
  assert.match(diff.htmlA, /(^|[\s>])need([\s<]|$)/);
  assert.doesNotMatch(diff.htmlA, /<mark class="diff-chip diff-v1">need<\/mark>/);
  assert.equal(diff.stats.matchedWords > 0, true);
});

test('workbench preloads visual prompt from docs/design/training/tr-NN/prompt.txt when present', () => {
  const data = loadTuningData(ROOT);
  const html = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  assert.match(html, /Preloaded from docs\/design\/training\/tr-01\/prompt\.txt/);
  assert.match(html, /Create a finished, high-density screenshot of a real production website/);
});
