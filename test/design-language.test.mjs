import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');

test('design language is linked, classified and covers every taxonomy group', () => {
  const guide = text('docs/design.md');
  const matrix = JSON.parse(text('docs/train/briefs/expansion-matrix.json'));
  assert.match(text('README.md'), /docs\/design\.md/);
  assert.match(text('scripts/check-baseline-label.mjs'), /'docs\/design\.md': 'design'/);
  for (const group of new Set(matrix.archetypes.map(({ group }) => group))) {
    assert.ok(guide.includes(`\`${group}\``), `${group}: map taxonomy group to a layout grammar`);
  }
  for (const section of ['Type and headings', 'Layout grid and responsive rules', 'Light and dark modes', 'Component anatomy', 'Layout grammars']) {
    assert.ok(guide.includes(section), `design guide missing ${section}`);
  }
  assert.match(guide, /billing period updates amount, cadence/i);
  assert.match(guide, /no generator wired/i);
  assert.match(guide, /excluded from training/i);
});

test('rough boards are committed JPEGs with pinned hashes and explicit training exclusion', () => {
  const provenance = text('docs/provenance/assets/design-layouts.md');
  assert.match(provenance, /excluded_from_training: true/);
  assert.match(provenance, /approved_for_training: false/);
  assert.match(text('scripts/check-baseline-label.mjs'), /'docs\/provenance\/assets\/design-layouts\.md': 'provenance'/);
  const rows = [...provenance.matchAll(/\[`(layout-[\w-]+\.jpg)`\][^\n]*?`([a-f0-9]{64})`\s*\|\s*(\d+)\s*\|/g)];
  assert.equal(rows.length, 3);
  for (const [, name, hash, bytes] of rows) {
    const path = new URL(`docs/design/${name}`, root);
    const content = readFileSync(path);
    assert.equal(content.subarray(0, 3).toString('hex'), 'ffd8ff', `${name}: JPEG magic`);
    assert.equal(statSync(path).size, Number(bytes), `${name}: byte count`);
    assert.equal(createHash('sha256').update(content).digest('hex'), hash, `${name}: hash`);
    assert.ok(text('docs/design.md').includes(`design/${name}`), `${name}: linked from guide`);
  }
});
