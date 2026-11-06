import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ARMS, EndpointError, analyseSealed, briefPasses, checkDesign, checkUniverse, decide, failureTaxonomy, pairedDifference, passRate, perFamily, perRule, rng } from '../src/eval/endpoint.mjs';
import { ALREADY_MODERN_MARKER, parseBriefs, sealHash } from '../src/eval/prereg.mjs';
import { EVAL_SEAL } from '../src/train/disjoint.mjs';

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
    // Synthetic test-only runtime; never evidence of a measured browser or sealed execution.
    platform: 'linux',
    node_version: 'v24.21.0',
    chrome_version: 'Chrome/155.0.8059.39',
    browser: { product: 'Chrome/155.0.8059.39' },
    ...overrides,
  };
}

// The reportable entry point takes the sealed manifest and refuses anything that does not hash to the
// pinned §13 seal, so a synthetic brief set can only ever exercise that refusal. `MANIFEST` is every
// row the seal covers; `PRIMARY` is the universe the endpoint covers: test split, generation task
// (§6/§7), selected inside `analyseSealed` rather than trusted from the caller.
const MANIFEST = parseBriefs(readFileSync(new URL('../docs/eval/briefs/manifest.jsonl', import.meta.url), 'utf8'));
const PRIMARY = MANIFEST.filter((brief) => brief.split === 'test' && brief.task === 'generate');

/** A result for a sealed brief whose declared rule bundle is fully applied. */
function sealedResult(brief, arm, overrides = {}) {
  return result(brief.brief_id, arm, {
    rule_results: Object.fromEntries((brief.required_rules ?? []).map((rule) => [rule, true])),
    ...overrides,
  });
}

/** A complete design over the sealed primary universe: one cell per brief and arm. */
function sealedResults(perArm = () => ({})) {
  return PRIMARY.flatMap((brief) => ARMS.map((arm) => sealedResult(brief, arm, perArm(arm, brief))));
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

test('evaluation refuses unrecorded or non-Linux runtime instead of trusting platform-only labels', () => {
  const briefs = [brief('f1', 1)];
  const complete = ARMS.map((arm) => result(briefs[0].brief_id, arm));
  assert.deepEqual(checkDesign(complete, briefs), []);
  const sealed = sealedResults();
  for (const [changed, expected] of [
    [{ platform: 'darwin' }, 'PLATFORM_NOT_LINUX'],
    [{ platform: undefined }, 'PLATFORM_NOT_LINUX'],
    [{ node_version: 'v0.0.0' }, 'NODE_VERSION_UNRECORDED'],
    [{ node_version: undefined }, 'NODE_VERSION_UNRECORDED'],
    [{ chrome_version: 'unverified', browser: { product: 'unverified' } }, 'CHROME_VERSION_UNRECORDED'],
    [{ chrome_version: 'Chrome/155.0.8059.39', browser: { product: 'Chrome/154.0.0.0' } }, 'CHROME_VERSION_UNRECORDED'],
    [{ browser: undefined }, 'CHROME_VERSION_UNRECORDED'],
  ]) {
    const altered = [{ ...complete[0], ...changed }, ...complete.slice(1)];
    assert.ok(checkDesign(altered, briefs).some((p) => p.code === expected), JSON.stringify(changed));
    // The same alteration inside the sealed universe: the seal passes, so the runtime record is what
    // refuses the verdict - otherwise this assertion would be satisfied by a seal failure instead.
    const sealedAltered = [{ ...sealed[0], ...changed }, ...sealed.slice(1)];
    const reportable = analyseSealed(sealedAltered, MANIFEST, { seal: EVAL_SEAL, iterations: 10 });
    assert.equal(reportable.ok, false, JSON.stringify(changed));
    assert.equal(reportable.decision, null, JSON.stringify(changed));
    assert.deepEqual(reportable.problems.map((p) => p.code), [expected], JSON.stringify(changed));
  }
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
  const control3 = pairedDifference(results, briefs, 'T_trained_adapter', 'C3_base_uplift_tool', { iterations: 3000, seed: 20261008 });

  assert.equal(primary.point, 0.5, '(16 - 4) / 24: eight improved families against two control families');
  assert.ok(primary.ci95[0] > 0, `interval should exclude zero: ${JSON.stringify(primary.ci95)}`);

  const decision = decide(primary, [
    { ...control2, arm_b: 'C2_base_mwg_prompt' },
    { ...control3, arm_b: 'C3_base_uplift_tool' },
  ]);
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

test('H2 is not evaluable without a comparison against every strong control', () => {
  // H2 says the adapter is no worse than BOTH the guidance prompt and the uplift tool. If only one
  // comparison is supplied, the honest answer is "not evaluable" - the earlier form would return true
  // on the strength of whichever control happened to be passed.
  const complete = decide({ point: 0.2, ci95: [0.1, 0.3] }, [
    { arm_b: 'C2_base_mwg_prompt', point: 0, ci95: [0, 0.1] },
    { arm_b: 'C3_base_uplift_tool', point: 0, ci95: [0, 0.1] },
  ]);
  assert.equal(complete.h2_non_inferior_to_strong_controls, true);

  const missingC3 = decide({ point: 0.2, ci95: [0.1, 0.3] }, [{ arm_b: 'C2_base_mwg_prompt', point: 0, ci95: [0, 0.1] }]);
  assert.equal(missingC3.h2_non_inferior_to_strong_controls, false, 'a missing strong control must not support H2');
  assert.ok(missingC3.h2_detail.some((row) => row.non_inferior === null && /not evaluable/.test(row.note ?? '')));
});

test('a result without explicit blocker counts does not pass the endpoint', () => {
  // Fail closed: a missing accessibility or security count is not evidence of zero findings.
  const noBlockers = { runnable: true, functional: true, rule_results: { 'accessibility/accessibility': true } };
  assert.equal(briefPasses(noBlockers, ['accessibility/accessibility']), false, 'missing blocker counts must fail');
  assert.equal(
    briefPasses({ ...noBlockers, blocker_accessibility: 0, blocker_security: 0 }, ['accessibility/accessibility']),
    true,
    'explicit zero counts pass',
  );
  assert.equal(briefPasses({ ...noBlockers, blocker_accessibility: 1, blocker_security: 0 }, ['accessibility/accessibility']), false);
});

test('the universe the verdict is computed over is checked, not assumed', () => {
  const briefs = [
    { brief_id: 'dev-01', family_id: 'dev-01', split: 'dev', task: 'generate' },
    { brief_id: 'test-01', family_id: 'test-01', split: 'test', task: 'generate' },
    { brief_id: 'test-02', family_id: 'test-02', split: 'test', task: 'repair' },
  ];
  assert.deepEqual(checkUniverse([briefs[1]]), []);
  const problems = checkUniverse(briefs);
  assert.ok(problems.some((p) => p.code === 'OUTSIDE_SEALED_SPLIT' && p.brief_id === 'dev-01'), 'dev briefs must be rejected');
  assert.ok(problems.some((p) => p.code === 'OUTSIDE_PRIMARY_TASK' && p.brief_id === 'test-02'), 'repair briefs must be rejected');
  const sealProblems = checkUniverse([briefs[1]], { requireSeal: 'sha256:deadbeef' });
  assert.ok(sealProblems.some((p) => p.code === 'UNSEALED_BRIEFS'), 'a set that does not match the seal must be rejected');
  // ...and a dev brief must not be able to produce a pass rate at all: the arithmetic is paired, so a
  // caller that skips checkUniverse gets a number, which is why the check exists.
  const devBrief = { ...briefs[0], required_rules: [] };
  const result = { brief_id: 'dev-01', arm: 'T_trained_adapter', runnable: true, functional: true, blocker_accessibility: 0, blocker_security: 0 };
  assert.equal(typeof passRate([result], [devBrief], 'T_trained_adapter'), 'number');
  assert.ok(checkUniverse([devBrief]).some((p) => p.code === 'OUTSIDE_SEALED_SPLIT'), 'the same brief must be refused by checkUniverse');
});

test('a reportable verdict goes through the checked entry point', () => {
  // The primitives are unconstrained by design; analyseSealed is the door that shuts. Without this
  // test, checkUniverse was a helper nobody had to call, and a dev-split run could produce a
  // decision that looked preregistered.
  const devBriefs = [
    { brief_id: 'd1', family_id: 'd1', split: 'dev', task: 'generate', required_rules: [] },
    { brief_id: 'd2', family_id: 'd2', split: 'dev', task: 'generate', required_rules: [] },
  ];
  const devResults = ARMS.flatMap((arm) => devBriefs.map((brief) => result(brief.brief_id, arm)));
  // the arithmetic happily produces a number for the dev split...
  assert.equal(typeof passRate(devResults, devBriefs, 'T_trained_adapter'), 'number');
  // ...and the door refuses it: the set cannot hash to the sealed manifest, whether or not the caller
  // supplies the hash of the set they just built.
  for (const seal of [sealHash(devBriefs), EVAL_SEAL]) {
    const refused = analyseSealed(devResults, devBriefs, { seal, iterations: 20 });
    assert.equal(refused.ok, false, seal);
    assert.equal(refused.decision, null, seal);
    assert.ok(refused.problems.length > 0 && refused.problems.every((p) => p.code === 'SEAL_MISMATCH'), JSON.stringify(refused.problems));
  }

  const decided = analyseSealed(sealedResults(), MANIFEST, { seal: EVAL_SEAL, iterations: 100 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));
  assert.ok(decided.decision);
  assert.deepEqual(decided.controls.map((control) => control.arm_b), ['C2_base_mwg_prompt', 'C3_base_uplift_tool']);
  assert.equal(decided.primary.arm_b, 'C1_bare_base');
  assert.equal(decided.primary.briefs, PRIMARY.length);
});

/**
 * A complete, sealed universe: the committed manifest, evaluated in every arm. `perArm(arm, brief)`
 * supplies the cell-specific fields. The manifest is the real one rather than a fixture because the
 * seal covers it: any other set is refused before a number is produced.
 */
function sealedFixture({ perArm = () => ({}) } = {}) {
  return { briefs: MANIFEST, results: sealedResults(perArm), seal: EVAL_SEAL };
}

test('the reportable entry point refuses anything but the pinned seal', () => {
  // `seal` used to default to null, which meant `checkUniverse` skipped the seal check entirely: an
  // unsealed or resealed brief set produced a decision indistinguishable from a preregistered one.
  // It is now also pinned: a caller supplies the §13 value, and any other value is refused, so a
  // caller cannot nominate the hash their own briefs happen to hash to.
  const { briefs, results } = sealedFixture();
  for (const [options, code] of [
    [{}, 'SEAL_REQUIRED'],
    [{ seal: null }, 'SEAL_REQUIRED'],
    [{ seal: '' }, 'SEAL_REQUIRED'],
    [{ seal: 'sha256:deadbeef' }, 'SEAL_INVALID'],
    [{ seal: 'not-a-hash' }, 'SEAL_INVALID'],
    // well formed, but not the hash the preregistration records
    [{ seal: `sha256:${'0'.repeat(64)}` }, 'SEAL_MISMATCH'],
    // the tempting shortcut: the hash of the briefs being analysed rather than of the whole manifest
    [{ seal: sealHash(PRIMARY) }, 'SEAL_MISMATCH'],
  ]) {
    const refused = analyseSealed(results, briefs, { iterations: 20, ...options });
    assert.equal(refused.ok, false, JSON.stringify(options));
    assert.equal(refused.decision, null, JSON.stringify(options));
    assert.ok(refused.problems.some((p) => p.code === code), `${JSON.stringify(options)}: ${JSON.stringify(refused.problems)}`);
  }
  assert.equal(analyseSealed(results, briefs, { seal: EVAL_SEAL, iterations: 20 }).ok, true, 'the pinned seal still produces a verdict');
});

test('the seal is checked against the manifest, so an edited or resealed set is refused', () => {
  const tampered = MANIFEST.map((brief) => ({ ...brief }));
  tampered[0].prompt = `${tampered[0].prompt} (edited after the seal)`;
  const editedSeal = sealHash(tampered);
  assert.notEqual(editedSeal, EVAL_SEAL, 'the fixture must actually move the seal');

  // The pinned seal does not match the manifest any more.
  const refused = analyseSealed(sealedResults(), tampered, { seal: EVAL_SEAL, iterations: 20 });
  assert.equal(refused.ok, false);
  assert.equal(refused.decision, null);
  assert.ok(refused.problems.some((p) => p.code === 'SEAL_MISMATCH' && p.actual === editedSeal), JSON.stringify(refused.problems));

  // ...and quoting the seal of the edited set instead does not help: it is not the pinned one.
  const resealed = analyseSealed(sealedResults(), tampered, { seal: editedSeal, iterations: 20 });
  assert.equal(resealed.ok, false);
  assert.equal(resealed.decision, null);
  assert.ok(resealed.problems.some((p) => p.code === 'SEAL_MISMATCH' && p.expected === EVAL_SEAL), JSON.stringify(resealed.problems));
});

test('the analysed universe is selected from the sealed manifest, not supplied by the caller', () => {
  const results = sealedResults();
  const decided = analyseSealed(results, MANIFEST, { seal: EVAL_SEAL, iterations: 20 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));
  assert.equal(decided.primary.briefs, PRIMARY.length, 'the 50 generation test briefs, not all 79 rows');
  assert.ok(PRIMARY.every((row) => row.split === 'test' && row.task === 'generate'));

  // A sealed repair brief is outside the primary endpoint (§7), so a result for one is refused rather
  // than folded into the denominator.
  const repair = MANIFEST.find((row) => row.split === 'test' && row.task === 'repair');
  const refused = analyseSealed([...results, sealedResult(repair, 'T_trained_adapter')], MANIFEST, { seal: EVAL_SEAL, iterations: 20 });
  assert.equal(refused.ok, false);
  assert.equal(refused.decision, null);
  assert.ok(refused.problems.some((p) => p.code === 'UNKNOWN_BRIEF' && p.brief_id === repair.brief_id), JSON.stringify(refused.problems));
});

test('a rise in blocker findings reaches the decision as a negative', () => {
  // The trained arm records an accessibility finding in every brief while every other arm records
  // none. decide() only sees this if analyseSealed forwards blocker_rates and blocker_cis.
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => (arm === 'T_trained_adapter' ? { blocker_accessibility: 1 } : {}),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 100 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));
  assert.equal(decided.primary.blocker_rates.blocker_accessibility.T_trained_adapter, 1);
  assert.equal(decided.primary.blocker_rates.blocker_accessibility.C1_bare_base, 0);
  assert.ok(decided.primary.blocker_cis.blocker_accessibility[0] > 0, 'every resample shows the rise against C1');
  for (const control of decided.controls) {
    assert.equal(control.blocker_rates.blocker_accessibility.T_trained_adapter, 1);
    assert.equal(control.blocker_rates.blocker_accessibility[control.arm_b], 0);
    assert.ok(control.blocker_cis.blocker_accessibility[0] > 0, `every resample shows the rise against ${control.arm_b}`);
  }
  assert.equal(decided.decision.negative, true);
  for (const arm of ['C1_bare_base', 'C2_base_mwg_prompt', 'C3_base_uplift_tool']) {
    assert.ok(decided.decision.negative_reasons.includes(`more accessibility findings than ${arm}, interval excluding zero`),
      `${arm}: ${JSON.stringify(decided.decision.negative_reasons)}`);
  }
});

test('a blocker rise against C1 alone is enough for a negative', () => {
  // The trained arm and both strong controls record the same security findings, so those comparisons
  // show no rise at all. Only the unguided base (C1) is clean. Attaching blocker rates to C2 and C3
  // only, as the entry point used to, made this reportable verdict carry no negative.
  const trainedAndStrong = new Set(['T_trained_adapter', 'C2_base_mwg_prompt', 'C3_base_uplift_tool']);
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm, b) => (trainedAndStrong.has(arm) && b.stratum === 'A_familiar' ? { blocker_security: 1 } : {}),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 100 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));

  const rates = decided.primary.blocker_rates.blocker_security;
  assert.ok(rates.T_trained_adapter > 0, 'the trained arm records findings');
  assert.equal(rates.C1_bare_base, 0);
  assert.ok(decided.primary.blocker_cis.blocker_security[0] > 0, 'the interval on the rise against C1 excludes zero');
  for (const control of decided.controls) {
    assert.equal(control.blocker_cis.blocker_security[0], 0, `no rise against ${control.arm_b}`);
  }

  assert.equal(decided.decision.negative, true);
  assert.ok(decided.decision.negative_reasons.includes('more security findings than C1_bare_base, interval excluding zero'),
    JSON.stringify(decided.decision.negative_reasons));
  assert.ok(!decided.decision.negative_reasons.some((reason) => /more security findings than C[23]_/.test(reason)),
    JSON.stringify(decided.decision.negative_reasons));
});

test('a blocker finding in the base arm is not a rise in the trained arm', () => {
  // Sign check: the comparison is T - C1, so findings that only C1 records must not become a negative.
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => (arm === 'C1_bare_base' ? { blocker_security: 1 } : {}),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 50 });
  assert.equal(decided.primary.blocker_rates.blocker_security.C1_bare_base, 1);
  assert.equal(decided.primary.blocker_rates.blocker_security.T_trained_adapter, 0);
  assert.ok(decided.primary.blocker_cis.blocker_security[1] < 0, 'the trained arm is the cleaner one');
  assert.equal(decided.decision.negative, false, JSON.stringify(decided.decision.negative_reasons));
});

test('an unrecorded blocker count counts as a finding in the comparison', () => {
  // Fail closed, as briefPasses does: a missing count is not a measured zero.
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => (arm === 'T_trained_adapter' ? { blocker_accessibility: undefined, blocker_security: undefined } : {}),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 20 });
  assert.equal(decided.primary.blocker_rates.blocker_accessibility.T_trained_adapter, 1);
  assert.equal(decided.primary.blocker_rates.blocker_accessibility.C1_bare_base, 0);
  assert.equal(decided.controls[0].blocker_rates.blocker_accessibility.T_trained_adapter, 1);
  // The count comparison carries the same floor: an unrecorded count is one finding, never a zero that
  // would let the trained arm look cleaner than an arm which recorded nothing at all.
  assert.equal(decided.primary.blocker_counts.blocker_accessibility.T_trained_adapter, 1);
  assert.equal(decided.primary.blocker_counts.blocker_accessibility.C1_bare_base, 0);
  assert.ok(decided.primary.blocker_count_cis.blocker_accessibility[0] > 0);
});

test('more findings on the same affected briefs is a negative, not a tie', () => {
  // The trained arm records two security findings on every brief; C1 records one on those same
  // briefs. The share of briefs with any finding is 1 in both arms, so an incidence-only comparison
  // reports no rise at all - which is the bug: §4's negative is a rise in FINDINGS, and the trained
  // arm has twice as many.
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => ({ blocker_security: arm === 'T_trained_adapter' ? 2 : 1 }),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 100 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));

  assert.equal(decided.primary.blocker_rates.blocker_security.T_trained_adapter, 1);
  assert.equal(decided.primary.blocker_rates.blocker_security.C1_bare_base, 1);
  assert.equal(decided.primary.blocker_cis.blocker_security[0], 0, 'incidence is identical, so that comparison sees no rise');

  assert.equal(decided.primary.blocker_counts.blocker_security.T_trained_adapter, 2);
  assert.equal(decided.primary.blocker_counts.blocker_security.C1_bare_base, 1);
  assert.ok(decided.primary.blocker_count_cis.blocker_security[0] > 0,
    'every resample shows the higher finding count against C1');

  assert.equal(decided.decision.negative, true);
  assert.ok(decided.decision.negative_reasons.includes('more security findings per brief than C1_bare_base, interval excluding zero'),
    JSON.stringify(decided.decision.negative_reasons));
  assert.ok(!decided.decision.negative_reasons.includes('more security findings than C1_bare_base, interval excluding zero'),
    'the incidence comparison saw no rise, and must not claim one');
});

test('a finding count that does not rise leaves the verdict clean', () => {
  // The same counts in every arm: no rise in incidence, no rise in findings, no negative.
  const equal = sealedFixture({ perArm: () => ({ blocker_security: 2, blocker_accessibility: 1 }) });
  const tied = analyseSealed(equal.results, equal.briefs, { seal: equal.seal, iterations: 50 });
  assert.equal(tied.ok, true, JSON.stringify(tied.problems));
  assert.equal(tied.primary.blocker_counts.blocker_security.T_trained_adapter, 2);
  assert.equal(tied.primary.blocker_counts.blocker_security.C1_bare_base, 2);
  assert.deepEqual(tied.primary.blocker_count_cis.blocker_security, [0, 0]);
  assert.equal(tied.decision.negative, false, JSON.stringify(tied.decision.negative_reasons));

  // Sign check on the count comparison: findings only C1 records are not a rise in the trained arm.
  const cleaner = sealedFixture({
    perArm: (arm) => (arm === 'C1_bare_base' ? { blocker_security: 2 } : { blocker_security: 0 }),
  });
  const decided = analyseSealed(cleaner.results, cleaner.briefs, { seal: cleaner.seal, iterations: 50 });
  assert.equal(decided.primary.blocker_counts.blocker_security.C1_bare_base, 2);
  assert.equal(decided.primary.blocker_counts.blocker_security.T_trained_adapter, 0);
  assert.ok(decided.primary.blocker_count_cis.blocker_security[1] < 0, 'the trained arm is the cleaner one');
  assert.equal(decided.decision.negative, false, JSON.stringify(decided.decision.negative_reasons));
});

test('worse cost per pass reaches the decision as a negative', () => {
  // Spend and passes both come from the result rows, because only the run knows its usage.
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => (arm === 'T_trained_adapter' ? { inference_tokens: 100 } : { inference_tokens: 10 }),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 50 });
  assert.equal(decided.primary.cost_detail.metric, 'inference_tokens_per_pass');
  assert.equal(decided.primary.cost_detail.T_trained_adapter.per_pass, 100);
  assert.equal(decided.primary.cost_detail.C1_bare_base.per_pass, 10);
  assert.equal(decided.primary.cost_per_pass_worse, true);
  assert.equal(decided.decision.negative, true);
  assert.ok(decided.decision.negative_reasons.includes('worse cost per pass'), JSON.stringify(decided.decision.negative_reasons));
});

test('over-application on an already-modern brief reaches the decision as a negative', () => {
  const alreadyModern = new Set(PRIMARY
    .filter((b) => (b.non_goals ?? []).includes(ALREADY_MODERN_MARKER))
    .map((b) => b.brief_id));
  assert.equal(alreadyModern.size, 8, 'PREREGISTRATION §13 records 8 already-modern rows inside C');
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm, b) => (arm === 'T_trained_adapter' && alreadyModern.has(b.brief_id)
      ? { changed_pages: 4, regressions: 1 }
      : { changed_pages: 0, regressions: 0 }),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 50 });
  assert.equal(decided.primary.over_application_detail.already_modern_briefs, alreadyModern.size);
  assert.deepEqual(decided.primary.over_application_detail.T_trained_adapter, { changed_pages: 4 * alreadyModern.size, regressions: alreadyModern.size });
  assert.deepEqual(decided.primary.over_application_detail.C1_bare_base, { changed_pages: 0, regressions: 0 });
  assert.equal(decided.primary.over_application_worse, true);
  assert.equal(decided.decision.negative, true);
  assert.ok(decided.decision.negative_reasons.some((reason) => /already-modern/.test(reason)), JSON.stringify(decided.decision.negative_reasons));
});

test('a comparison with no recorded cost or change count is unmeasured, never \'not worse\'', () => {
  // No inference_tokens anywhere and no changed_pages/regressions on the already-modern briefs.
  // Asserting `false` would claim a check passed that was never run; `null` plus the reason is the
  // honest answer.
  const { briefs, results, seal } = sealedFixture();
  const decided = analyseSealed(results, briefs, { seal, iterations: 50 });
  assert.equal(decided.primary.cost_per_pass_worse, null);
  assert.match(decided.primary.cost_detail.unmeasured, /inference_tokens/);
  assert.equal(decided.primary.over_application_worse, null);
  assert.match(decided.primary.over_application_detail.unmeasured, /already-modern/);
  assert.equal(decided.decision.negative, false, 'unmeasured is not a negative, and not a clean bill either');
});

test('zero passes in both arms makes cost per pass unmeasured, not \'not worse\'', () => {
  // Both arms spend tokens and pass nothing. `Infinity > Infinity` is `false`, so the flag used to read
  // `cost_per_pass_worse: false`: a comparison asserted as "not worse" that measured nothing, and whose
  // detail lost its Infinity to `null` on the way into JSON. Unmeasured is the honest answer.
  const { briefs, results, seal } = sealedFixture({
    perArm: () => ({ inference_tokens: 100, functional: false }),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 20 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));

  const detail = decided.primary.cost_detail;
  assert.equal(detail.T_trained_adapter.passes, 0);
  assert.equal(detail.C1_bare_base.passes, 0);
  assert.equal(detail.T_trained_adapter.per_pass, null, 'zero passes has no per-pass cost to report');
  assert.equal(detail.C1_bare_base.per_pass, null);
  assert.equal(decided.primary.cost_per_pass_worse, null, 'never `false` for a comparison that was not measured');
  assert.match(detail.unmeasured, /T_trained_adapter and C1_bare_base passed no sealed brief/);
  assert.deepEqual(JSON.parse(JSON.stringify(detail)), detail, 'the detail survives JSON serialisation unchanged');
  assert.ok(!decided.decision.negative_reasons.includes('worse cost per pass'), JSON.stringify(decided.decision.negative_reasons));
});

test('a trained arm with zero passes has no per-pass cost to compare against the base', () => {
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => (arm === 'T_trained_adapter' ? { inference_tokens: 100, functional: false } : { inference_tokens: 10 }),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 20 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));

  const detail = decided.primary.cost_detail;
  assert.equal(detail.T_trained_adapter.passes, 0);
  assert.ok(detail.C1_bare_base.passes > 0, 'the base arm passed briefs, so it has a measured cost');
  assert.equal(detail.T_trained_adapter.per_pass, null);
  assert.equal(decided.primary.cost_per_pass_worse, null);
  assert.match(detail.unmeasured, /T_trained_adapter passed no sealed brief/);
  assert.ok(!detail.unmeasured.includes('C1_bare_base'), 'the measured arm is not named as the unmeasured one');
  assert.ok(!decided.decision.negative_reasons.includes('worse cost per pass'), JSON.stringify(decided.decision.negative_reasons));
});

test('a base arm with zero passes has no per-pass cost to compare against the trained arm', () => {
  const { briefs, results, seal } = sealedFixture({
    perArm: (arm) => (arm === 'C1_bare_base' ? { inference_tokens: 10, functional: false } : { inference_tokens: 100 }),
  });
  const decided = analyseSealed(results, briefs, { seal, iterations: 20 });
  assert.equal(decided.ok, true, JSON.stringify(decided.problems));

  const detail = decided.primary.cost_detail;
  assert.equal(detail.C1_bare_base.passes, 0);
  assert.ok(detail.T_trained_adapter.passes > 0, 'the trained arm passed briefs, so it has a measured cost');
  assert.equal(detail.C1_bare_base.per_pass, null);
  assert.equal(decided.primary.cost_per_pass_worse, null);
  assert.match(detail.unmeasured, /C1_bare_base passed no sealed brief/);
  assert.ok(!detail.unmeasured.includes('T_trained_adapter'), 'the measured arm is not named as the unmeasured one');
  assert.ok(!decided.decision.negative_reasons.includes('worse cost per pass'), JSON.stringify(decided.decision.negative_reasons));
});
