import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { readJpegDimensions } from '../src/viewer/tuning.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = 'docs/design/archetypes';
const register = JSON.parse(readFileSync(join(ROOT, 'docs/provenance/assets/archetype-dark-boards.json'), 'utf8'));
const framePins = JSON.parse(readFileSync(join(ROOT, '.fleet/frame-scan-pins.json'), 'utf8'));
const copiedAnchors = new Set([
  'docs/design/archetypes/fan-community-site/dark/step1-collection.jpg',
  'docs/design/archetypes/realtime-telemetry-dashboard/dark/step1-live-overview.jpg',
  'docs/design/archetypes/scroll-storytelling-launch/dark/step1-hero-overview.jpg',
]);
const paths = readdirSync(join(ROOT, BASE), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap(({ name }) => {
    const dark = join(ROOT, BASE, name, 'dark');
    try {
      // A new filename, non-JPEG, symlink or subdirectory is not an implicit exception:
      // fail the closed inventory before attempting to read any unregistered path.
      return readdirSync(dark, { withFileTypes: true })
        .map(({ name: file }) => `${BASE}/${name}/dark/${file}`);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }).sort();

if (!process.env.DARK_INVENTORY_MUTANT) test('a non-step Dark entry is rejected rather than skipped by the inventory', () => {
  // Patch just one directory listing in an isolated process: no copied JPEG corpus,
  // no mutation of the worktree, and no reliance on test order or machine files.
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const dark = process.argv[2];
    const original = fs.readdirSync;
    fs.readdirSync = (path, options) => path === dark
      ? [...original(path, options), { name: 'preview.jpg', isFile: () => true }]
      : original(path, options);
    syncBuiltinESMExports();
    await import(process.argv[1]);
  `;
  const env = { ...process.env, DARK_INVENTORY_MUTANT: '1' };
  delete env.NODE_TEST_CONTEXT; // Node's child-v8 runner protocol is not a text reporter.
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script,
    import.meta.url, join(ROOT, BASE, 'account-recovery', 'dark')], {
    encoding: 'utf8', timeout: 8_000, env,
  });
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.match(child.stdout + child.stderr, /this fixed initial register covers the 106 current dark-mode boards/,
    'the child inventory must fail because an extra Dark entry was enumerated');
});

test('dark-board prose distinguishes image pins from generator attestations and rights', () => {
  const text = readFileSync(join(ROOT, 'docs/provenance/assets/archetype-dark-boards.md'), 'utf8');
  assert.match(text, /106.*committed JPEGs/);
  assert.match(text, /8c9949eff[\s\S]*21 of 61 boards[\s\S]*12 of 21 archetypes/,
    'the historical xzs6 theme-coverage correction must name both denominators');
  assert.match(text, /15409c2b8[\s\S]*61 Dark twins[\s\S]*all 21 archetypes/,
    'the later current Dark twins must not be confused with xzs6 dark-themed Light boards');
  assert.equal(new Set(register.boards.map((row) => row.path.split('/')[3])).size, 27,
    'the current 106 Dark twins span all 27 archetypes, not the historical 12');
  assert.match(text, /99 generator-reported boards/);
  assert.match(text, /Three copied Dark anchors/);
  assert.match(text, /Four browser-puzzle-game Dark imports/);
  assert.match(text, /not.*durable per-board model\/prompt attestation/);
  assert.match(text, /not proof that reuse is legally forbidden or permitted/);
  assert.match(text, /exact tariff and fail-closed reservation/);
});

test('dark-board register enumerates every committed family path and binds each row to actual bytes', () => {
  assert.equal(register.schema_version, 1);
  assert.equal(paths.length, 106, 'this fixed initial register covers the 106 current dark-mode boards');
  assert.deepEqual(register.boards.map(({ path }) => path), paths,
    'no added, omitted, duplicate, or out-of-tree dark JPEG is silently registered');
  for (const row of register.boards) {
    const bytes = readFileSync(join(ROOT, row.path));
    assert.equal(row.sha256, createHash('sha256').update(bytes).digest('hex'), row.path);
    assert.equal(framePins.images[row.path], row.sha256, `${row.path}: existing frame-scan pin`);
    assert.equal(row.bytes, bytes.length, `${row.path}: byte count`);
    assert.deepEqual(row.dimensions, readJpegDimensions(bytes), `${row.path}: header dimensions`);
    assert.equal(row.dimensions?.width, 1376, `${row.path}: width`);
    assert.equal(row.dimensions?.height, 768, `${row.path}: height`);
    const rightsSource = `${BASE}/${row.path.split('/')[3]}/README.md`;
    assert.equal(row.rights_source, rightsSource, `${row.path}: named family rights source`);
    const rightsText = readFileSync(join(ROOT, rightsSource), 'utf8');
    assert.match(rightsText, /excluded_from_training: true/, `${row.path}: actual README exclusion`);
    assert.match(rightsText, /approved_for_training: false/, `${row.path}: actual README approval status`);
    assert.equal(row.excluded_from_training, true, `${row.path}: never training data`);
    assert.equal(row.approved_for_training, false, `${row.path}: no training grant`);
    assert.equal(row.reuse_clearance, null, `${row.path}: policy exclusion does not confer rights`);
    assert.equal(row.response_model, null, `${row.path}: no preserved per-board response receipt`);
    assert.equal(row.generation_prompt_sha256, null, `${row.path}: authored prompts are not generation inputs`);
    assert.equal(row.vision_verdict, null, `${row.path}: a frame scan is not a visual verdict`);
    assert.equal(row.source_status, row.path.includes('/browser-puzzle-game/')
      ? 'unverified_scratch_import' : copiedAnchors.has(row.path)
        ? 'copied_prior_light_anchor_no_durable_receipt' : 'generator_reported_no_durable_receipt', row.path);
    if (copiedAnchors.has(row.path)) {
      assert.equal(row.source_board_sha256, row.sha256, `${row.path}: old Light anchor byte identity`);
      assert.equal(row.source_commit, '52881d58', `${row.path}: pin the pre-import tree`);
    } else {
      assert.equal(row.source_board_sha256, null, `${row.path}: no invented old anchor`);
      assert.equal(row.source_commit, null, `${row.path}: no invented prior source commit`);
    }
  }
});
