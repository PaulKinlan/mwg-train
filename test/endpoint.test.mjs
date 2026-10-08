import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMS,
  EndpointError,
  briefPasses,
  checkDesign,
  decide,
  failureTaxonomy,
  pairedDifference,
  passRate,
  perFamily,
  perRule,
  rng,
} from '../src/eval/endpoint.mjs';

const RULE = 'accessibility/accessibility';

function brief(family, variant, overrides = {}) {
  return {
    brief_id: `${family}-v${variant}`,
    family_id: family,
    stratum: 'A_familiar',
    archetype: 'booking',
    required_rules: [RULE],
    ...overrides,
  };
}

function result(briefId, arm, overrides = {}) {
  return {
    brief_id: briefId,
    arm,
    runnable: true,
    functional: true,
    rule_results: { [RULE]: true },
    blocker_accessibility: 0,
    blocker_security: 0,
    failures: [],
    ...overrides,
  };
}

test('the primary endpoint needs all five criteria', () => {
  assert.equal(briefPasses(result('b', 'T'), [RULE]), true);

  assert.equal(briefPasses(result('b', 'T', { runnable: false }), [RULE]), false, 'not runnable');
  assert.equal(briefPasses(result('b', 'T', { functional: false }), [RULE]), false, 'functional task fails');
  assert.equal(briefPasses(result('b', 'T', { rule_results: {} }), [RULE]), false, 'required rule not applied');
  assert.equal(briefPasses(result('b', 'T', { blocker_accessibility: 1 }), [RULE]), false, 'blocker a11y finding');
  assert.equal(briefPasses(result('b', 'T', { blocker_security: 2 }), [RULE]), false, 'blocker security finding');

  // the rule bundle comes from the brief, so an extra rule the model did apply cannot rescue a miss
  assert.equal(briefPasses(result('b', 'T', { rule_results: { [RULE]: true, 'forms/x': true } }), [RULE, 'forms/x']), true);
  assert.throws(() => briefPasses(null, [RULE]), { code: 'NOT_AN_OBJECT' });
  assert.throws(() => briefPasses(result('b', 'T'), undefined), { code: 'NO_REQUIRED_RULES' });
});

test('an incomplete design is an error, not a smaller denominator', () => {
  const briefs = [brief('f1', 1), brief('f2', 1)];
  const complete = [];
  for (const b of briefs) for (const arm of ARMS) complete.push(result(b.brief_id, arm));
  assert.deepEqual(checkDesign(complete, briefs), []);

  const missing = complete.filter((r) => !(r.brief_id === 'f2-v1' && r.arm === 'T_trained_adapter'));
  const problems = checkDesign(missing, briefs);
  assert.equal(problems.length, 1);
  assert.deepEqual(
    { code: problems[0].code, brief_id: problems[0].brief_id, arm: problems[0].arm },
    { code: 'MISSING_CELL', brief_id: 'f2-v1', arm: 'T_trained_adapter' },
  );

  const duplicated = [...complete, result('f2-v1', 'T_trained_adapter')];
  assert.ok(checkDesign(duplicated, briefs).some((p) => p.code === 'DUPLICATE_RESULT'));
  assert.ok(checkDesign([result('ghost', 'T_trained_adapter')], briefs).some((p) => p.code === 'UNKNOWN_BRIEF'));
});

test('the bootstrap resamples families, so a split family cannot buy confidence', () => {
  // Two families. Under the model, T passes all of f1 and none of f2; C1 passes none. The cluster
  // bootstrap can only produce 1.0, 0.5 or 0.0 - the interval must reach 0, because with two
  // clusters there is no way to rule out "this family was the whole effect".
  const briefs = [brief('f1', 1), brief('f1', 2), brief('f2', 1), brief('f2', 2)];
  const results = [
    result('f1-v1', 'T_trained_adapter'),
    result('f1-v2', 'T_trained_adapter'),
    result('f2-v1', 'T_trained_adapter', { functional: false }),
    result('f2-v2', 'T_trained_adapter', { functional: false }),
    result('f1-v1', 'C1_bare_base', { functional: false }),
    result('f1-v2', 'C1_bare_base', { functional: false }),
    result('f2-v1', 'C1_bare_base', { functional: false }),
    result('f2-v2', 'C1_bare_base', { functional: false }),
  ];
  assert.equal(passRate(results, briefs, 'T_trained_adapter'), 0.5);
  assert.equal(passRate(results, briefs, 'C1_bare_base'), 0);

  const delta = pairedDifference(results, briefs, 'T_trained_adapter', 'C1_bare_base', { iterations: 2000, seed: 7 });
  assert.equal(delta.point, 0.5);
  assert.equal(delta.families, 2);
  assert.equal(delta.ci95[0], 0, 'the interval must include zero with only two clusters');
  assert.equal(delta.ci95[1], 1);

  const decision = decide(delta, []);
  assert.equal(decision.h1_supported, false);
  assert.equal(decision.null_result, true);
  assert.match(decision.reading, /null/);
});

test('a consistent effect across many families is decided as a positive', () => {
  const briefs = [];
  const results = [];
  for (let f = 1; f <= 12; f += 1) {
    const family = `fam-${String(f).padStart(2, '0')}`;
    for (const v of [1, 2]) {
      const b = brief(family, v);
      briefs.push(b);
      const trainedPasses = f <= 8; // 8 of 12 families improve, 4 stay at zero => 16/24 = 66.7% vs 4/24
      const controlPasses = f <= 2;
      results.push(result(b.brief_id, 'T_trained_adapter', { functional: trainedPasses }));
      results.push(result(b.brief_id, 'C1_bare_base', { functional: controlPasses }));
      results.push(result(b.brief_id, 'C2_base_mwg_prompt', { functional: controlPasses }));
      results.push(result(b.brief_id, 'C3_base_uplift_tool', { functional: false }));
    }
  }
  const primary = pairedDifference(results, briefs, 'T_trained_adapter', 'C1_bare_base', { iterations: 3000, seed: 20261008 });
  const control2 = pairedDifference(results, briefs, 'T_trained_adapter', 'C2_base_mwg_prompt', { iterations: 3000, seed: 20261008 });

  assert.equal(primary.point, 0.5, '(16 - 4) / 24: eight improved families against two control families');
  assert.ok(primary.ci95[0] > 0, `interval should exclude zero: ${JSON.stringify(primary.ci95)}`);

  const decision = decide(primary, [{ ...control2, arm_b: 'C2_base_mwg_prompt' }]);
  assert.equal(decision.h1_supported, true);
  assert.equal(decision.null_result, false);
  assert.equal(decision.negative, false);
  assert.match(decision.reading, /usable positive/);

  // reproducibility: the same seed gives the same interval
  const again = pairedDifference(results, briefs, 'T_trained_adapter', 'C1_bare_base', { iterations: 3000, seed: 20261008 });
  assert.deepEqual(again.ci95, primary.ci95);
  assert.deepEqual(pairedDifference(results, briefs, 'T_trained_adapter', 'C1_bare_base', { iterations: 3000, seed: 99 }).ci95.length, 2);
});

test('beating the base but losing to the guidance control is called out as such', () => {
  const briefs = [];
  const results = [];
  for (let f = 1; f <= 12; f += 1) {
    const family = `fam-${String(f).padStart(2, '0')}`;
    for (const v of [1, 2]) {
      const b = brief(family, v);
      briefs.push(b);
      const trained = f <= 8;
      const guided = f <= 11; // C2 is better than T
      results.push(result(b.brief_id, 'T_trained_adapter', { functional: trained }));
      results.push(result(b.brief_id, 'C1_bare_base', { functional: f <= 2 }));
      results.push(result(b.brief_id, 'C2_base_mwg_prompt', { functional: guided }));
    }
  }
  const primary = pairedDifference(results, briefs, 'T_trained_adapter', 'C1_bare_base', { iterations: 3000, seed: 5 });
  const vsC2 = pairedDifference(results, briefs, 'T_trained_adapter', 'C2_base_mwg_prompt', { iterations: 3000, seed: 5 });
  const decision = decide(primary, [{ ...vsC2, arm_b: 'C2_base_mwg_prompt' }]);
  assert.equal(decision.h1_supported, true);
  assert.equal(decision.h2_non_inferior_to_strong_controls, false);
  assert.match(decision.reading, /retrieval, not training/);
});

test('a regression is a negative even when the pass rate looks fine', () => {
  const primary = {
    arm_a: 'T_trained_adapter',
    point: 0.2,
    ci95: [0.05, 0.35],
    over_application_worse: true,
    cost_per_pass_worse: true,
  };
  const control = {
    arm_a: 'T_trained_adapter',
    arm_b: 'C1_bare_base',
    point: 0.2,
    ci95: [0.05, 0.35],
    blocker_rates: { blocker_accessibility: { T_trained_adapter: 0.3, C1_bare_base: 0.05 } },
    blocker_cis: { blocker_accessibility: [0.1, 0.4] },
  };
  const decision = decide(primary, [control]);
  assert.equal(decision.negative, true);
  assert.equal(decision.negative_reasons.length, 3);
  assert.ok(decision.negative_reasons.some((r) => /already-modern/.test(r)));
  assert.ok(decision.negative_reasons.some((r) => /accessibility/.test(r)));
  assert.ok(decision.negative_reasons.some((r) => /cost per pass/.test(r)));
});

test('per-family, per-rule and taxonomy reporting', () => {
  const briefs = [brief('f1', 1), brief('f1', 2), brief('f2', 1)];
  const results = [
    result('f1-v1', 'T_trained_adapter'),
    result('f1-v2', 'T_trained_adapter'),
    result('f2-v1', 'T_trained_adapter', { functional: false, failures: ['journey_failure'] }),
    result('f1-v1', 'C3_base_uplift_tool', { rule_results: {} }),
    result('f1-v2', 'C3_base_uplift_tool', { rule_results: {} }),
    result('f2-v1', 'C3_base_uplift_tool', { rule_results: {} }),
  ];

  const families = perFamily(results, briefs, ['T_trained_adapter', 'C3_base_uplift_tool']);
  assert.deepEqual(
    families.map((row) => [row.family_id, row.arms.T_trained_adapter.pass_rate, row.arms.C3_base_uplift_tool.pass_rate]),
    [
      ['f1', 100, 0],
      ['f2', 0, 0],
    ],
  );

  const rules = perRule(results, briefs, ['T_trained_adapter', 'C3_base_uplift_tool']);
  assert.equal(rules.length, 1);
  // f2-v1 failed its functional task but did apply the rule, so the rule rate is 3/3 while its
  // endpoint pass is a fail: the two are reported separately on purpose (PREREGISTRATION §7).
  assert.deepEqual(rules[0].arms.T_trained_adapter, { applied: 3, applicable: 3, rate: 100 });
  assert.deepEqual(rules[0].arms.C3_base_uplift_tool, { applied: 0, applicable: 3, rate: 0 });

  const taxonomy = failureTaxonomy(results, briefs, ['T_trained_adapter', 'C3_base_uplift_tool']);
  assert.equal(taxonomy.T_trained_adapter.rule_missing, 0);
  assert.equal(taxonomy.T_trained_adapter.journey_failure, 1, 'the explicit failure list must not be counted twice');
  assert.equal(taxonomy.T_trained_adapter.build_failure, 0);
  assert.equal(taxonomy.C3_base_uplift_tool.rule_missing, 3);
  assert.equal(taxonomy.C3_base_uplift_tool.journey_failure, 0);
});

test('the seeded rng is deterministic and bounded', () => {
  const a = rng(1);
  const b = rng(1);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.ok(first.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(first, [rng(2)(), rng(2)(), rng(2)()]);
  assert.throws(() => briefPasses({ brief_id: 'x' }, 'nope'), EndpointError);
});
