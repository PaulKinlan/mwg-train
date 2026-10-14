import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const suite = 'test/viewer-concepts-delivery.test.mjs';

// An index-size budget is useful only if the fast gate selects it when authored prompt, state, or
// family declarations grow, including paths not yet present in this checkout. Listing mode runs
// the real selector without running its potentially expensive unrelated suites and checks.
test('authored prompt, state, and family declarations select the /concepts delivery budget', () => {
  const corpusGrowthInputs = [
    'docs/design/archetypes/new-archetype/README.md',
    'docs/design/archetypes/new-archetype/design.md',
    'docs/design/archetypes/new-archetype/plan.md',
    'docs/design/training/tr-99/prompt.txt',
    'docs/train/design/tr-99/design.md',
    'docs/train/design/tr-99/plan.md',
    'docs/train/briefs/manifest.jsonl',
    'docs/provenance/assets/board-states.json',
    'data/A1_self_generated/targets/manifest.jsonl',
    'pilot/training-archetypes.mjs',
  ];
  for (const changed of corpusGrowthInputs) {
    const result = spawnSync('node', ['scripts/fast-gate.mjs'], {
      cwd: ROOT, encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, GIT_CHANGED: changed, FAST_GATE_LIST: '1' },
    });
    assert.equal(result.status, 0, `${changed}: gate selection failed: ${result.stderr}`);
    assert.ok(result.stdout.includes(suite), `${changed} must run the size budget (${result.stdout})`);
  }
});
