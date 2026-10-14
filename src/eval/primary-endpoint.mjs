/**
 * An evidence-coverage gate in front of the preregistered arithmetic in endpoint.mjs.
 * This does not invent browser or rule checks for prose briefs. Missing proof is NOT_EVALUABLE,
 * never a negative outcome (which would make missing instrumentation look like model failure).
 */
import { ARMS, checkDesign, pairedDifference, passRate } from './endpoint.mjs';
import { sealHash } from './prereg.mjs';
import { EVAL_SEAL } from '../train/disjoint.mjs';
import { MWG_RULE_IDS } from '../corpus/rules.mjs';

export const UMBRELLA_IDS = Object.freeze(['accessibility/accessibility', 'forms/forms', 'html/html']);
const CHECKERS = new Set(MWG_RULE_IDS);
const sha = /^sha256:[a-f0-9]{64}$/;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const tally = (records) => records.reduce((acc, row) => { acc[row] = (acc[row] ?? 0) + 1; return acc; }, {});
const values = (row, name) => Array.isArray(row[name]) ? row[name] : [];

/** Analyse the immutable brief vocabulary itself, *before* any model outputs exist. */
export function auditPrimaryCoverage(allBriefs) {
  const test = allBriefs.filter((b) => b.split === 'test');
  const primary = test.filter((b) => b.task === 'generate');
  const repair = test.filter((b) => b.task === 'repair');
  const rules = tally(primary.flatMap((b) => values(b, 'required_rules')));
  const entries = Object.entries(rules).sort(([a], [b]) => a.localeCompare(b));
  const ruleRows = entries.map(([rule_id, denominator]) => ({
    rule_id, denominator, implemented_automated_check: CHECKERS.has(rule_id), umbrella: UMBRELLA_IDS.includes(rule_id),
  }));
  return {
    universe: { sealed_rows: allBriefs.length, test_rows: test.length, primary_briefs: primary.length,
      primary_families: new Set(primary.map((b) => b.family_id)).size, secondary_repair_briefs: repair.length,
      primary_routes: primary.reduce((n, b) => n + values(b, 'routes').length, 0),
      primary_journeys: primary.reduce((n, b) => n + values(b, 'journeys').length, 0),
      primary_assertions: primary.reduce((n, b) => n + values(b, 'assertions').length, 0),
      primary_rule_pairs: Object.values(rules).reduce((a, b) => a + b, 0) },
    per_rule: ruleRows,
    automated_pairs: ruleRows.filter((r) => r.implemented_automated_check).reduce((n, r) => n + r.denominator, 0),
    umbrella_pairs: ruleRows.filter((r) => r.umbrella).reduce((n, r) => n + r.denominator, 0),
    briefs_with_all_rules_automated: primary.filter((b) => values(b, 'required_rules').every((r) => CHECKERS.has(r))).length,
  };
}

function observation(value, expectedKind) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    (value.status === 'PASS' || value.status === 'FAIL') &&
    value.evidence?.kind === expectedKind && sha.test(value.evidence?.sha256 ?? '') &&
    typeof value.evidence?.path === 'string' && value.evidence.path.length > 0;
}
const measure = (value) => value.status === 'PASS';

/**
 * The `witnesses` are receipts from a separate browser/artifact runner, NOT from model output.
 * An evidence reference alone is not proof its browser run occurred; that runner must independently
 * verify artifact bytes and the exact tree/build identity before a production decision is allowed.
 */
export function evaluatePrimary(allBriefs, witnesses, { devOnly = false, rulePlan = {}, iterations = 5000, seed = 20261008 } = {}) {
  if (!Array.isArray(allBriefs) || !Array.isArray(witnesses)) throw new TypeError('briefs and witnesses must be arrays');
  if (allBriefs.some((brief) => !brief || typeof brief !== 'object' || Array.isArray(brief))) throw new TypeError('every brief must be an object');
  if (!rulePlan || typeof rulePlan !== 'object' || Array.isArray(rulePlan) || typeof devOnly !== 'boolean' ||
    !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 50_000 || !Number.isSafeInteger(seed)) {
    throw new TypeError('rulePlan, devOnly, iterations and seed must be valid evaluation options');
  }
  const coverage = auditPrimaryCoverage(allBriefs);
  const problems = [];
  if (devOnly) {
    if (allBriefs.some((b) => b.split !== 'dev')) problems.push({ code: 'NOT_DEV_ONLY', message: 'dry audit may not inspect test briefs' });
  } else if (sealHash(allBriefs) !== EVAL_SEAL) {
    problems.push({ code: 'UNSEALED_UNIVERSE', expected: EVAL_SEAL, actual: sealHash(allBriefs) });
  }
  const briefs = allBriefs.filter((b) => b.split === (devOnly ? 'dev' : 'test') && b.task === 'generate');
  if (!briefs.length) problems.push({ code: 'NO_PRIMARY_BRIEFS' });
  const requiredFields = ['routes', 'journeys', 'assertions', 'required_rules'];
  const malformedById = new Map();
  for (const brief of briefs) {
    const fields = requiredFields.filter((field) => !Array.isArray(brief[field]) || !brief[field].length ||
      brief[field].some((item) => typeof item !== 'string' || !item.trim()) || new Set(brief[field]).size !== brief[field].length);
    if (fields.length) {
      malformedById.set(brief.brief_id, fields);
      problems.push({ code: 'MALFORMED_BRIEF', brief_id: brief.brief_id, fields });
    }
  }
  const briefById = new Map(briefs.map((b) => [b.brief_id, b]));
  // Dev fixtures are exploratory; production witnesses must at least carry the measured Linux
  // runtime stamp. Presence and format do NOT attest that a caller-supplied stamp is genuine.
  const design = checkDesign(witnesses, briefs, ARMS, { requireEnvironment: !devOnly });
  problems.push(...design);
  const cells = [];
  for (const witness of witnesses) {
    const brief = briefById.get(witness?.brief_id);
    if (!brief || !ARMS.includes(witness.arm)) {
      if (brief && !ARMS.includes(witness.arm)) problems.push({ code: 'UNKNOWN_ARM', brief_id: brief.brief_id, arm: witness.arm });
      continue;
    }
    const missing = (malformedById.get(brief.brief_id) ?? []).map((field) => `MALFORMED_BRIEF:${field}`);
    if (!sha.test(witness.build_tree_sha256 ?? '')) missing.push('build_tree_sha256');
    if (!observation(witness.runnable, 'build')) missing.push('runnable');
    for (const [field, kind] of [['routes', 'browser'], ['journeys', 'browser'], ['assertions', 'browser']]) {
      if (!witness[field] || typeof witness[field] !== 'object' || Array.isArray(witness[field])) { missing.push(field); continue; }
      const declared = values(brief, field);
      for (const key of declared) if (!own(witness[field], key) || !observation(witness[field][key], kind)) missing.push(`${field}:${key}`);
      for (const key of Object.keys(witness[field])) if (!declared.includes(key)) missing.push(`UNDECLARED_${field}:${key}`);
    }
    if (!witness.rules || typeof witness.rules !== 'object' || Array.isArray(witness.rules)) missing.push('rules');
    for (const rule of values(brief, 'required_rules')) {
      const plan = rulePlan[rule];
      if (!plan || typeof plan.checker_id !== 'string' || !plan.checker_id || !['browser', 'dual-rated'].includes(plan.kind)) missing.push(`UNPLANNED_RULE:${rule}`);
      const actual = witness.rules?.[rule];
      if (!observation(actual, plan?.kind) || actual?.checker_id !== plan?.checker_id) missing.push(`rules:${rule}`);
    }
    for (const rule of Object.keys(witness.rules ?? {})) if (!values(brief, 'required_rules').includes(rule)) missing.push(`UNDECLARED_RULE:${rule}`);
    for (const blocker of ['accessibility', 'security']) {
      const evidence = witness.blockers?.[blocker];
      if (!observation(evidence, 'browser') || !Number.isSafeInteger(evidence.findings) || evidence.findings < 0 ||
        measure(evidence) !== (evidence.findings === 0)) missing.push(`blockers:${blocker}`);
    }
    const functional = ['routes', 'journeys', 'assertions'].every((field) => values(brief, field).every((key) => witness[field]?.[key]?.status === 'PASS'));
    const pass = !missing.length && measure(witness.runnable) && functional &&
      values(brief, 'required_rules').every((rule) => witness.rules[rule].status === 'PASS') &&
      witness.blockers.accessibility.findings === 0 && witness.blockers.security.findings === 0;
    cells.push({ brief_id: brief.brief_id, family_id: brief.family_id, archetype: brief.archetype, arm: witness.arm,
      status: missing.length ? 'NOT_EVALUABLE' : pass ? 'PASS' : 'FAIL', missing,
      // This is only an arithmetic adapter, never fabricated browser evidence.
      result: missing.length ? null : { brief_id: brief.brief_id, arm: witness.arm,
        runnable: measure(witness.runnable), functional,
        rule_results: Object.fromEntries(values(brief, 'required_rules').map((r) => [r, measure(witness.rules[r])])),
        blocker_accessibility: witness.blockers.accessibility.findings, blocker_security: witness.blockers.security.findings },
    });
  }
  const ruleReport = auditRuleDenominators(briefs, witnesses, rulePlan);
  const unevaluable = cells.filter((cell) => cell.status === 'NOT_EVALUABLE');
  for (const cell of unevaluable) problems.push({ code: 'UNMEASURED_CELL', brief_id: cell.brief_id, arm: cell.arm, missing: cell.missing });
  // No sealed verdict from this module until Paul ratifies a complete rule map AND the browser
  // artifact verifier exists. Dev fixtures can test arithmetic, not certify outcomes.
  const arithmetic = !problems.length && devOnly ? {
    warning: 'DEV FIXTURE ONLY: exploratory arithmetic, never the preregistered sealed result',
    pass_rate_by_arm: Object.fromEntries(ARMS.map((arm) => [arm, passRate(cells.map((c) => c.result), briefs, arm)])),
    exploratory_difference: pairedDifference(cells.map((c) => c.result), briefs, 'T_trained_adapter', 'C1_bare_base', { iterations, seed }),
  } : null;
  return { status: problems.length ? 'NOT_EVALUABLE' : devOnly ? 'DRY_AUDIT_ONLY' : 'AWAITING_RATIFICATION',
    reportable: false, problems, coverage, denominators: { per_arm_briefs: briefs.length, all_arms_cells: briefs.length * ARMS.length,
      observed_cells: cells.length, evaluable_cells: cells.filter((c) => c.status !== 'NOT_EVALUABLE').length },
    per_rule: ruleReport, per_family: groupDenominators(briefs, cells, 'family_id'),
    per_archetype: groupDenominators(briefs, cells, 'archetype'), cells, dry_arithmetic: arithmetic };
}

function groupDenominators(briefs, cells, field) {
  return [...new Set(briefs.map((b) => b[field]))].sort().map((group) => {
    const ids = new Set(briefs.filter((b) => b[field] === group).map((b) => b.brief_id));
    const arms = Object.fromEntries(ARMS.map((arm) => {
      const subset = cells.filter((c) => c.arm === arm && ids.has(c.brief_id));
      const passed = subset.filter((c) => c.status === 'PASS').length;
      const failed = subset.filter((c) => c.status === 'FAIL').length;
      const denominator = ids.size;
      return [arm, { denominator, passed, failed, unmeasured: denominator - passed - failed,
        pass_rate: passed + failed === denominator ? passed / denominator : null }];
    }));
    return { [field]: group, arms };
  });
}

function auditRuleDenominators(briefs, witnesses, rulePlan) {
  const byKey = new Map(witnesses.map((w) => [`${w.brief_id}:${w.arm}`, w]));
  return [...new Set(briefs.flatMap((b) => values(b, 'required_rules')))].sort().map((rule_id) => {
    const applicable = briefs.filter((b) => values(b, 'required_rules').includes(rule_id));
    const numerator = Object.fromEntries(ARMS.map((arm) => [arm, { applicable_briefs: applicable.length,
      observed: 0, passed: 0, failed: 0, unmeasured: applicable.length }]));
    for (const arm of ARMS) {
      for (const brief of applicable) {
        const evidence = byKey.get(`${brief.brief_id}:${arm}`)?.rules?.[rule_id];
        const plan = rulePlan[rule_id];
        if (plan && observation(evidence, plan.kind) && evidence.checker_id === plan.checker_id) {
          numerator[arm].observed += 1;
          numerator[arm][evidence.status === 'PASS' ? 'passed' : 'failed'] += 1;
        }
      }
      numerator[arm].unmeasured = applicable.length - numerator[arm].observed;
    }
    return { rule_id, ...numerator };
  });
}
