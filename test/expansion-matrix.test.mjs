import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const matrix = JSON.parse(readFileSync(new URL('../docs/train/briefs/expansion-matrix.json', import.meta.url), 'utf8'));
const plan = readFileSync(new URL('../docs/train/briefs/EXPANSION-PLAN.md', import.meta.url), 'utf8');

test('expansion taxonomy and planned prompt counts agree', () => {
  const { archetypes, family_targets: targets } = matrix;
  assert.equal(matrix.status, 'proposed-not-generated');
  assert.equal(archetypes.length, 21);
  assert.equal(new Set(archetypes.map(({ id }) => id)).size, archetypes.length);
  assert.equal(new Set(archetypes.map(({ group }) => group)).size, 5);
  assert.equal(targets.initial_families, archetypes.length * targets.initial_per_archetype);
  assert.equal(targets.expanded_families, archetypes.length * targets.expanded_per_archetype);
  assert.match(plan, new RegExp(`${archetypes.length} behavioural archetypes`));
  assert.match(plan, new RegExp(`${targets.expanded_families} families`));
  for (const archetype of archetypes) {
    assert.ok(archetype.primary_role && archetype.secondary_role && archetype.primary_role !== archetype.secondary_role, `${archetype.id}: distinct roles required`);
    assert.ok(archetype.journey && archetype.observable && archetype.state, `${archetype.id}: observable journey and state required`);
  }
});
