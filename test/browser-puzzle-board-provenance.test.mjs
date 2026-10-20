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

/** The prompt digest the `mwg-train-1ddf` record bound to the committed Step 1 bytes. */
const STEP1_GENERATION_INPUT_SHA = '8ce1119f50d965b38802324fd4cfd0dfe2320735ced6e708482aacaaf8ab0a08';

const prompts = (readme) => [...readme.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];

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

test('the Step 1 generation receipt keeps the prompt that was sent, beside the amended brief digest', () => {
  // A brief amendment must not rewrite the receipt: the digest that was actually sent is history, and the
  // current authored block gets its own column. Overwriting the receipt with the new text made the record
  // claim the amended brief had produced the committed bytes (mwg-train-zeci review).
  const readme = readFileSync(join(family, 'README.md'), 'utf8');
  const step1 = prompts(readme).find(([, name]) => name === 'step1-board-initial.jpg');
  assert.ok(step1, 'the README must still author the Step 1 prompt');
  const authored = createHash('sha256').update(step1[2]).digest('hex');
  const row = provenance().split('\n').find((line) => line.startsWith('| `step1-board-initial.jpg`'));
  assert.ok(row, 'missing the Step 1 provenance row');
  assert.match(provenance(), /Original generation-input prompt SHA-256 \| Authored README prompt block SHA-256/,
    'the register must keep the generation input and the authored brief in separate columns');
  assert.ok(row.includes(`\`${STEP1_GENERATION_INPUT_SHA}\``),
    'the generation-input prompt digest that produced the committed bytes must stay recorded');
  assert.ok(row.includes(`\`${authored}\``),
    'the amended authored brief block must be recorded alongside it, not in place of it');
  assert.notEqual(authored, STEP1_GENERATION_INPUT_SHA,
    'the amended brief differs from the block that was sent, so the two digests cannot share a value');
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
