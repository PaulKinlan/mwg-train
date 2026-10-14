import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const script = join(ROOT, 'scripts/generate-archetype-light-dark.mjs');
const family = join(ROOT, 'docs/design/archetypes/browser-puzzle-game');
const provenance = () => readFileSync(join(family, 'PROVENANCE.md'), 'utf8');
const UNATTESTED = [
  'step2-midgame-interaction.jpg', 'step3-invalid-collision-state.jpg', 'step4-victory-stats-dialog.jpg',
  'dark/step1-board-initial.jpg', 'dark/step2-midgame-interaction.jpg',
  'dark/step3-invalid-collision-state.jpg', 'dark/step4-victory-stats-dialog.jpg',
];

test('the Light/Dark generator cannot import anonymous machine-local JPEGs', () => {
  const source = readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /\/tmp\/test-bpg-|installBrowserPuzzleGameFromTmp/,
    'a private scratch file cannot stand in for a model response and its prompt');
  for (const args of [['--only', 'browser-puzzle-game'], []]) {
    const selected = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 8000,
      env: { ...process.env, MWG_TRAIN_IMAGE_ENDPOINT: 'http://127.0.0.1:1/unreachable' },
    });
    assert.equal(selected.status, 1, `${args.join(' ') || 'default'}: ${selected.stderr}`);
    assert.match(selected.stderr, /browser-puzzle-game.*(unattested|unverified|provenance)/i,
      'requesting this family without an attested source must fail visibly before model calls');
    assert.doesNotMatch(selected.stdout, /All requested.*generated/);
  }
});

test('each scratch-imported board has its exact bytes pinned without fabricated model or generator prompt', () => {
  const record = provenance();
  assert.match(record, /seven.*unverified|seven.*unattested/i);
  for (const name of UNATTESTED) {
    const bytes = readFileSync(join(family, name));
    const hash = createHash('sha256').update(bytes).digest('hex');
    const row = record.split('\n').find((line) => line.startsWith(`| \`${name}\``));
    assert.ok(row, `missing provenance row for ${name}`);
    assert.match(row, /unattested|unverified/i, `${name}: no model response was retained`);
    assert.doesNotMatch(row, /gemini-3\.1-flash-image|gemini-nano-banana-2\.1/,
      `${name}: the model of the committed bytes cannot be inferred from a configured model`);
    assert.ok(row.includes(`\`${hash}\` · ${bytes.length} bytes`), `${name}: pin the actual JPEG, not a previous version`);
  }
});
