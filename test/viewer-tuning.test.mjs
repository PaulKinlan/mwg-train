import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createViewer } from '../src/viewer/server.mjs';
import { computeWordDiff, loadTuningData, renderTuning } from '../src/viewer/tuning.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('workbench reads authored training variants and recorded templates without touching eval', () => {
  const data = loadTuningData(ROOT);
  assert.equal(data.families.size, 30);
  assert.equal(data.families.get('tr-01').length, 2);
  assert.equal(data.projects.length, 210);
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
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT });
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
  assert.equal((await fetch(`${base}/tuning/reference/tr-03.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/tuning/reference/fam-r01.jpg`)).status, 404);

  assert.equal((await fetch(`${base}/tuning/target/fam-r01.png`)).status, 404);
  assert.equal((await fetch(`${base}/tuning/target/tr-27.json`)).status, 404);
  assert.equal((await fetch(`${base}/tuning`, { method: 'POST', body: 'prompt=secret' })).status, 404);
  const client = await fetch(`${base}/tuning/client.js`);
  assert.equal(client.status, 200);
  assert.match(await client.text(), /source_prompt/);
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
  const { server, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir: join(root, 'state'), repoRoot: root });
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

test('workbench renders high-fidelity reference board when present, and degrades honestly when missing', () => {
  const data = loadTuningData(ROOT);
  // tr-01 has a reference board
  const htmlWithRef = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  assert.match(htmlWithRef, /High-fidelity reference board/);
  assert.match(htmlWithRef, /src="\/tuning\/reference\/tr-01\.jpg"/);
  assert.match(htmlWithRef, /href="\/tuning\/reference\/tr-01\.jpg"/);
  assert.match(htmlWithRef, /width="1024" height="1024"/);
  assert.match(htmlWithRef, /1024 × 1024 px/);
  assert.match(htmlWithRef, /docs\/design\/training\/tr-01\/reference\.jpg/);

  // tr-03 does not have a reference board
  const htmlWithoutRef = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-03', variant: 'v1', framework: 'raw' });
  assert.doesNotMatch(htmlWithoutRef, /src="\/tuning\/reference\/tr-03\.jpg"/);
  assert.match(htmlWithoutRef, /No reference board yet for this family\./);
  assert.match(htmlWithoutRef, /reference boards currently exist for <code>tr-01<\/code>, <code>tr-02<\/code>, and <code>tr-04<\/code>\./i);
  assert.match(htmlWithoutRef, /Reference board<\/dt><dd><span class="muted">no reference board yet for this family<\/span><\/dd>/);
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
