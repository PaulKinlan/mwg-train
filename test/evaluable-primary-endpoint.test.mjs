import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARMS } from '../src/eval/endpoint.mjs';
import { auditPrimaryCoverage, evaluatePrimary } from '../src/eval/primary-endpoint.mjs';
const SEALED = readFileSync(new URL('../docs/eval/briefs/manifest.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
const SHA = `sha256:${'a'.repeat(64)}`;
const evidence = (kind, status = 'PASS') => ({ status, evidence: { kind, sha256: SHA, path: `dev-only/${kind}.json` } });
const dev = { split: 'dev', task: 'generate', brief_id: 'dev-only-v1', family_id: 'dev-only', archetype: 'booking',
  routes: ['/', '/book'], journeys: ['submit booking and reload confirmation'],
  assertions: ['reload reads saved server record'], required_rules: ['forms/required-field-feedback'] };
const rulePlan = { 'forms/required-field-feedback': { checker_id: 'dev-fixture-required-feedback', kind: 'browser' } };
function receipt(arm, options = {}) {
  return { brief_id: dev.brief_id, arm, build_tree_sha256: SHA, runnable: evidence('build'),
    routes: { '/': evidence('browser'), '/book': evidence('browser') },
    journeys: { [dev.journeys[0]]: evidence('browser') },
    assertions: { [dev.assertions[0]]: evidence('browser') },
    rules: { [dev.required_rules[0]]: { ...evidence('browser'), checker_id: rulePlan[dev.required_rules[0]].checker_id } },
    blockers: { accessibility: { ...evidence('browser'), findings: 0 }, security: { ...evidence('browser'), findings: 0 } }, ...options };
}
const complete = () => ARMS.map((arm) => receipt(arm));

test('sealed witnesses require recorded Linux, Node and CDP Chrome versions without a guessed version pin', () => {
  const brief = SEALED.find((b) => b.split === 'test' && b.task === 'generate');
  const witness = receipt(ARMS[0], { brief_id: brief.brief_id, platform: 'linux', node_version: 'v0.0.0',
    chrome_version: 'unverified', browser: { product: 'unverified' } });
  const audit = evaluatePrimary(SEALED, [witness]);
  assert.equal(audit.status, 'NOT_EVALUABLE');
  assert.equal(audit.reportable, false);
  assert.ok(audit.problems.some((p) => p.code === 'NODE_VERSION_UNRECORDED'));
  assert.ok(audit.problems.some((p) => p.code === 'CHROME_VERSION_UNRECORDED'));
  const darwin = evaluatePrimary(SEALED, [{ ...witness, platform: 'darwin' }]);
  assert.ok(darwin.problems.some((p) => p.code === 'PLATFORM_NOT_LINUX'));
});

test('input guard runs before audit and reports deterministic errors for malformed collections', () => {
  assert.throws(() => evaluatePrimary(null, []), { name: 'TypeError', message: 'briefs and witnesses must be arrays' });
  assert.throws(() => evaluatePrimary([], null), { name: 'TypeError', message: 'briefs and witnesses must be arrays' });
  assert.throws(() => evaluatePrimary([null], []), { name: 'TypeError', message: 'every brief must be an object' });
  for (const options of [{ rulePlan: null }, { devOnly: 'false' }, { iterations: 0 }, { iterations: 50001 }, { seed: NaN }]) {
    assert.throws(() => evaluatePrimary([], [], options), { name: 'TypeError', message: 'rulePlan, devOnly, iterations and seed must be valid evaluation options' });
  }
});

test('audit sealed manifest preserves primary 50-generate vs four repair secondary and rule denominators', () => {
  const audit = auditPrimaryCoverage(SEALED);
  assert.deepEqual(audit.universe, { sealed_rows: 79, test_rows: 54, primary_briefs: 50, primary_families: 30,
    secondary_repair_briefs: 4, primary_routes: 237, primary_journeys: 165,
    primary_assertions: 211, primary_rule_pairs: 138 });
  assert.equal(audit.automated_pairs, 36);
  assert.equal(audit.umbrella_pairs, 67);
  assert.equal(audit.briefs_with_all_rules_automated, 0);
  assert.deepEqual(Object.fromEntries(audit.per_rule.filter((r) => r.umbrella).map((r) => [r.rule_id, r.denominator])),
    { 'accessibility/accessibility': 47, 'forms/forms': 14, 'html/html': 6 });
});

test('a sealed empty run is NOT_EVALUABLE, not a model failure or a 0% pass rate', () => {
  const result = evaluatePrimary(SEALED, []);
  assert.equal(result.status, 'NOT_EVALUABLE');
  assert.equal(result.reportable, false);
  assert.equal(result.denominators.per_arm_briefs, 50);
  assert.equal(result.denominators.all_arms_cells, 200);
  assert.equal(result.denominators.evaluable_cells, 0);
  assert.ok(result.problems.some((p) => p.code === 'MISSING_CELL'));
  assert.equal(result.per_family[0].arms[ARMS[0]].pass_rate, null);
  assert.equal(result.per_rule.find((r) => r.rule_id === 'accessibility/accessibility')[ARMS[0]].applicable_briefs, 47);
  assert.equal(result.per_rule.find((r) => r.rule_id === 'accessibility/accessibility')[ARMS[0]].unmeasured, 47);
});

test('dev-only fixture exercises every required item, per-rule denominator and family bootstrap without a sealed score', () => {
  const result = evaluatePrimary([dev], complete(), { devOnly: true, rulePlan, iterations: 100, seed: 1 });
  assert.equal(result.status, 'DRY_AUDIT_ONLY');
  assert.equal(result.reportable, false);
  assert.equal(result.problems.length, 0);
  assert.equal(result.denominators.all_arms_cells, 4);
  assert.equal(result.denominators.evaluable_cells, 4);
  assert.equal(result.per_rule[0][ARMS[0]].passed, 1);
  assert.equal(result.per_family[0].arms[ARMS[0]].pass_rate, 1);
  assert.equal(result.dry_arithmetic.exploratory_difference.families, 1);
  assert.match(result.dry_arithmetic.warning, /DEV FIXTURE ONLY/);
});

test('missing or unplanned umbrella, browser artifact, and any declared journey refuse rather than count as failure', () => {
  for (const receipts of [
    complete().map((r) => ({ ...r, journeys: {} })),
    complete().map((r) => ({ ...r, rules: { 'accessibility/accessibility': evidence('browser') } })),
    complete().map((r) => ({ ...r, blockers: { ...r.blockers, security: { status: 'PASS', findings: 0 } } })),
  ]) {
    const result = evaluatePrimary([dev], receipts, { devOnly: true, rulePlan, iterations: 10 });
    assert.equal(result.status, 'NOT_EVALUABLE');
    assert.equal(result.reportable, false);
    assert.equal(result.denominators.evaluable_cells, 0);
    assert.equal(result.per_family[0].arms[ARMS[0]].pass_rate, null);
  }
  const umbrella = { ...dev, required_rules: ['accessibility/accessibility'] };
  const result = evaluatePrimary([umbrella], complete().map((r) => ({ ...r, rules: { 'accessibility/accessibility': evidence('browser') } })),
    { devOnly: true });
  assert.match(JSON.stringify(result.problems), /UNPLANNED_RULE:accessibility\/accessibility/);
});

test('zero or malformed declared obligations are NOT_EVALUABLE, never vacuously PASS', () => {
  for (const field of ['routes', 'journeys', 'assertions', 'required_rules']) {
    const brief = { ...dev, [field]: [] };
    const result = evaluatePrimary([brief], complete(), { devOnly: true, rulePlan, iterations: 10 });
    assert.equal(result.status, 'NOT_EVALUABLE');
    assert.equal(result.reportable, false);
    assert.ok(result.problems.some((p) => p.code === 'MALFORMED_BRIEF' && p.fields.includes(field)));
    assert.equal(result.cells[0].status, 'NOT_EVALUABLE');
    assert.equal(result.per_family[0].arms[ARMS[0]].pass_rate, null);
  }
  const duplicate = evaluatePrimary([{ ...dev, routes: ['/', '/'] }], complete(), { devOnly: true, rulePlan });
  assert.ok(duplicate.problems.some((p) => p.code === 'MALFORMED_BRIEF' && p.fields.includes('routes')));
});

test('a fully empty declared brief with matching empty witness maps cannot vacuously pass', () => {
  const emptyBrief = { ...dev, routes: [], journeys: [], assertions: [], required_rules: [] };
  const emptyWitnesses = complete().map((witness) => ({ ...witness, routes: {}, journeys: {}, assertions: {}, rules: {} }));
  const result = evaluatePrimary([emptyBrief], emptyWitnesses, { devOnly: true, rulePlan: {}, iterations: 10 });
  assert.equal(result.status, 'NOT_EVALUABLE');
  assert.equal(result.reportable, false);
  assert.equal(result.denominators.observed_cells, 4);
  assert.equal(result.denominators.evaluable_cells, 0);
  assert.equal(result.dry_arithmetic, null, 'even complete witness coverage is not a score without declared obligations');
  assert.deepEqual(result.problems.find((p) => p.code === 'MALFORMED_BRIEF')?.fields,
    ['routes', 'journeys', 'assertions', 'required_rules']);
  for (const arm of ARMS) {
    assert.equal(result.cells.find((cell) => cell.arm === arm).status, 'NOT_EVALUABLE');
    assert.equal(result.per_family[0].arms[arm].pass_rate, null);
  }
});

test('a measured failure is a failure only when the complete dev fixture evidence set exists', () => {
  const receipts = complete();
  receipts[0].assertions[dev.assertions[0]] = evidence('browser', 'FAIL');
  const result = evaluatePrimary([dev], receipts, { devOnly: true, rulePlan, iterations: 20 });
  assert.equal(result.cells[0].status, 'FAIL');
  assert.equal(result.per_family[0].arms[ARMS[0]].pass_rate, 0);
  assert.equal(result.per_family[0].arms[ARMS[1]].pass_rate, 1);
  assert.equal(result.per_rule[0][ARMS[0]].passed, 1, 'rule rate has own applicable denominator');
});

test('dev audit cannot inspect sealed test fixtures and sealed scores cannot be supplied from an unsealed subset', () => {
  assert.ok(evaluatePrimary([SEALED.find((b) => b.split === 'test')], [], { devOnly: true }).problems.some((p) => p.code === 'NOT_DEV_ONLY'));
  assert.ok(evaluatePrimary([dev], [], {}).problems.some((p) => p.code === 'UNSEALED_UNIVERSE'));
});
