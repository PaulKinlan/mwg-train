import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');

test('the root README links to the generated token record instead of copying its figures', () => {
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
  const record = JSON.parse(readFileSync(resolve(ROOT, 'docs/train/corpus/tokens.json'), 'utf8'));
  const generator = readFileSync(resolve(ROOT, 'scripts/train-corpus-tokens.mjs'), 'utf8');
  assert.match(generator, /out:\s*'docs\/train\/corpus\/tokens\.json'/);
  assert.match(readme, /\[`docs\/train\/corpus\/tokens\.json`\]\(docs\/train\/corpus\/tokens\.json\)/);
  assert.match(readme, /npm run train:tokens\s+# regenerate docs\/train\/corpus\/tokens\.json/);
  for (const value of [
    record.training.total_training_tokens,
    ...record.training.tokens.band,
    record.pilot.tokens.derived,
    ...record.pilot.tokens.band,
  ]) {
    assert.doesNotMatch(readme, new RegExp(`\\b${value.toLocaleString('en-US')}\\b`),
      `README.md must link to the live record, not duplicate derived token figure ${value}`);
  }
});
