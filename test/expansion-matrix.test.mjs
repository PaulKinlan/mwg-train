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
  for (const axis of ['actor', 'guidance', 'split_cluster', 'state', 'surface', 'scenario', 'request_mode', 'wording_roles']) {
    assert.ok(matrix.axes[axis], `missing matrix axis: ${axis}`);
  }
  assert.ok(matrix.axes.state.includes('stateless-interaction'));
  assert.ok(matrix.axes.split_cluster.fingerprint.includes('scaffold'));
  assert.ok(matrix.axes.guidance.rule_catalog);
  for (const field of ['primary_role_goal', 'secondary_role_goal', 'primary_role_journey', 'secondary_role_journey', 'failure_recovery', 'browser_assertions', 'applicable_rules', 'required_rules', 'split_cluster_id', 'split']) {
    assert.ok(matrix.family_contract.required_fields.includes(field), `future family contract misses ${field}`);
  }
  for (const archetype of archetypes) {
    assert.ok(archetype.primary_role && archetype.secondary_role && archetype.primary_role !== archetype.secondary_role, `${archetype.id}: distinct example roles required`);
    assert.ok(archetype.journey && archetype.observable && matrix.axes.state.includes(archetype.state), `${archetype.id}: observable journey and supported state required`);
  }
});
