/**
 * The preregistered primary endpoint, as code.
 *
 * docs/eval/PREREGISTRATION.md defines the endpoint and the decision rules. This module implements
 * them so the analysis is fixed in advance rather than chosen after seeing the numbers, and so the
 * decision rule cannot quietly become whatever the data supported.
 *
 * Nothing here reads the network or the filesystem: it takes result records and returns pass rates,
 * a cluster bootstrap interval over prompt families, and a decision. See
 * docs/eval/PREREGISTRATION.md sections 3, 4 and 6.
 */

export const ARMS = Object.freeze(['C1_bare_base', 'C2_base_mwg_prompt', 'C3_base_uplift_tool', 'T_trained_adapter']);
export const DESCRIPTIVE_ARMS = Object.freeze(['D_teacher']);

/** Minimum effect of interest, in percentage points of the primary pass rate. */
export const MIN_EFFECT_OF_INTEREST = 10;
/** Non-inferiority margin against the strong controls, in percentage points. */
export const NON_INFERIORITY_MARGIN = -5;

export const BLOCKER_CHECKS = Object.freeze(['blocker_accessibility', 'blocker_security']);

export class EndpointError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EndpointError';
    this.code = code;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function percent(value) {
  return Math.round(value * 1000) / 10;
}

/**
 * Does one evaluated brief pass? All five criteria of PREREGISTRATION §3, and each is a hard fail.
 * The rule bundle comes from the brief, so `requiredRules` is supplied by the caller from the brief
 * and never inferred from what the model built.
 */
export function briefPasses(result, requiredRules) {
  if (!isPlainObject(result)) throw new EndpointError('NOT_AN_OBJECT', 'a result must be an object');
  if (!Array.isArray(requiredRules)) throw new EndpointError('NO_REQUIRED_RULES', 'requiredRules must come from the brief');
  if (result.runnable !== true) return false;
  if (result.functional !== true) return false;
  const applied = isPlainObject(result.rule_results) ? result.rule_results : {};
  for (const rule of requiredRules) {
    if (applied[rule] !== true) return false;
  }
  for (const blocker of BLOCKER_CHECKS) {
    // Fail closed: a result that never recorded the accessibility or security finding count has not
    // demonstrated zero findings, and defaulting a missing count to 0 would let an unevaluated
    // blocker pass the endpoint.
    if (typeof result[blocker] !== 'number' || !Number.isFinite(result[blocker]) || result[blocker] > 0) return false;
  }
  return true;
}

/**
 * The universe the preregistered verdict may be computed over.
 *
 * PREREGISTRATION §6 seals the `test` split and §7 excludes the repair task from the primary
 * endpoint. Nothing in the arithmetic enforces either, so a caller could pass the dev briefs - the
 * split tuning is allowed to touch - and get a reproducible, apparently preregistered verdict. This
 * is the check that makes the sealed universe a precondition rather than a convention.
 */
export function checkUniverse(briefs, { split = 'test', task = 'generate', requireSeal = null } = {}) {
  const problems = [];
  const wrongSplit = briefs.filter((brief) => brief?.split !== split);
  const wrongTask = briefs.filter((brief) => brief?.task !== task);
  for (const brief of wrongSplit) {
    problems.push({ code: 'OUTSIDE_SEALED_SPLIT', brief_id: brief?.brief_id, message: `brief is in split '${brief?.split}', not the sealed '${split}' split` });
  }
  for (const brief of wrongTask) {
    problems.push({ code: 'OUTSIDE_PRIMARY_TASK', brief_id: brief?.brief_id, message: `brief has task '${brief?.task}'; the primary endpoint covers '${task}'` });
  }
  if (requireSeal) {
    const actual = sealHash(briefs);
    if (actual !== requireSeal) problems.push({ code: 'UNSEALED_BRIEFS', brief_id: '(set)', message: `the brief set hashes to ${actual}, not the sealed ${requireSeal}` });
  }
  return problems;
}

/**
 * The design must be complete: every arm evaluated on every brief of the sealed test set. A missing
 * cell is an error rather than a silently smaller denominator, because a per-arm pass rate computed
 * over a different brief set is not a paired comparison at all.
 */
export function checkDesign(results, briefs, arms = ARMS) {
  const problems = [];
  const briefIds = new Set(briefs.map((brief) => brief.brief_id));
  const seen = new Map();
  for (const result of results) {
    if (!briefIds.has(result?.brief_id)) {
      problems.push({ code: 'UNKNOWN_BRIEF', brief_id: result?.brief_id, arm: result?.arm, message: 'result for a brief that is not in the sealed set' });
      continue;
    }
    const key = `${result.brief_id}::${result.arm}`;
    if (seen.has(key)) problems.push({ code: 'DUPLICATE_RESULT', brief_id: result.brief_id, arm: result.arm, message: 'two results for the same brief and arm' });
    seen.set(key, result);
  }
  for (const brief of briefs) {
    for (const arm of arms) {
      if (!seen.has(`${brief.brief_id}::${arm}`)) {
        problems.push({ code: 'MISSING_CELL', brief_id: brief.brief_id, arm, message: 'the design is incomplete: this brief was not evaluated in this arm' });
      }
    }
  }
  return problems;
}

/**
 * The sanctioned entry point for a *reportable* verdict.
 *
 * `pairedDifference` and `decide` are primitives: they compute over whatever brief list they are
 * handed, which is what exploratory work needs and exactly what a preregistered result must not do.
 * This is the function that refuses - it enforces the sealed universe (split, task, and the seal of
 * the set) and a complete design before any number is produced, and returns the problems instead of
 * a verdict when either fails. A consequence worth stating plainly: if you call the primitives
 * directly you are not running the preregistered analysis, whatever the output looks like.
 */
export function analyseSealed(results, briefs, { seal = null, arms = ARMS, iterations = 5000, seed = 20261008 } = {}) {
  const problems = [...checkUniverse(briefs, { requireSeal: seal }), ...checkDesign(results, briefs, arms)];
  if (problems.length > 0) return { ok: false, problems, decision: null, primary: null, controls: [] };
  const primary = pairedDifference(results, briefs, 'T_trained_adapter', 'C1_bare_base', { iterations, seed });
  const controls = ['C2_base_mwg_prompt', 'C3_base_uplift_tool'].map((arm) => pairedDifference(results, briefs, 'T_trained_adapter', arm, { iterations, seed }));
  return { ok: true, problems: [], decision: decide(primary, controls), primary, controls };
}

/** Deterministic PRNG (mulberry32) so a bootstrap interval is reproducible from the recorded seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function passByBrief(results, briefs, arm) {
  const out = new Map();
  for (const brief of briefs) {
    const result = results.find((r) => r.brief_id === brief.brief_id && r.arm === arm);
    out.set(brief.brief_id, result ? briefPasses(result, brief.required_rules) : false);
  }
  return out;
}

/** Pass rate over a set of briefs, as a fraction in [0,1]. */
export function passRate(results, briefs, arm) {
  const passes = passByBrief(results, briefs, arm);
  let n = 0;
  let passed = 0;
  for (const brief of briefs) {
    n += 1;
    if (passes.get(brief.brief_id)) passed += 1;
  }
  return n === 0 ? 0 : passed / n;
}

/**
 * Paired difference in pass rate between two arms over the same briefs, with a 95% interval from a
 * cluster bootstrap that resamples FAMILIES (PREREGISTRATION §3): variants of one family are not
 * independent observations, so resampling briefs would understate the interval.
 */
// PRIMITIVE: computes over whatever brief list it is given. See `analyseSealed` for the checked path.
export function pairedDifference(results, briefs, armA, armB, { iterations = 5000, seed = 20261008 } = {}) {
  const a = passByBrief(results, briefs, armA);
  const b = passByBrief(results, briefs, armB);
  const deltaFor = (sample) => {
    let n = 0;
    let sum = 0;
    for (const brief of sample) {
      n += 1;
      sum += (a.get(brief.brief_id) ? 1 : 0) - (b.get(brief.brief_id) ? 1 : 0);
    }
    return n === 0 ? 0 : sum / n;
  };

  const point = deltaFor(briefs);
  const families = new Map();
  for (const brief of briefs) {
    if (!families.has(brief.family_id)) families.set(brief.family_id, []);
    families.get(brief.family_id).push(brief);
  }
  const clusters = [...families.values()];

  const random = rng(seed);
  const deltas = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let c = 0; c < clusters.length; c += 1) {
      sample.push(...clusters[Math.floor(random() * clusters.length)]);
    }
    deltas.push(deltaFor(sample));
  }
  deltas.sort((x, y) => x - y);
  const at = (q) => deltas[Math.min(deltas.length - 1, Math.max(0, Math.floor(q * deltas.length)))];
  return {
    arm_a: armA,
    arm_b: armB,
    point,
    ci95: [at(0.025), at(0.975)],
    iterations,
    seed,
    families: clusters.length,
    briefs: briefs.length,
  };
}

/**
 * Apply the preregistered decision rules (PREREGISTRATION §4). Returns the hypothesis outcomes and a
 * null/negative classification; nothing here is left to interpretation after the fact.
 *
 * PRIMITIVE: this does not check which briefs it is describing. For a reportable verdict use
 * `analyseSealed`, which enforces the sealed universe and a complete design first.
 */
export function decide(primary, controls) {
  const inPoints = (x) => x * 100;
  const h1 = primary.point * 100 >= MIN_EFFECT_OF_INTEREST && inPoints(primary.ci95[0]) > 0;
  const nullResult = inPoints(primary.ci95[0]) <= 0 || inPoints(primary.ci95[1]) < MIN_EFFECT_OF_INTEREST;

  // H2 is non-inferiority against BOTH strong controls, so a comparison that omits one of them cannot
  // support it: the earlier form tested only the controls it was given, which made "the adapter is no
  // worse than the best prompt and the best tool" true on the strength of the prompt alone.
  const STRONG_CONTROLS = ['C2_base_mwg_prompt', 'C3_base_uplift_tool'];
  const strongControls = controls.filter((c) => STRONG_CONTROLS.includes(c.arm_b));
  const missingStrong = STRONG_CONTROLS.filter((arm) => !strongControls.some((c) => c.arm_b === arm));
  const nonInferior = strongControls.filter((c) => inPoints(c.ci95[0]) > NON_INFERIORITY_MARGIN);
  const h2 = missingStrong.length === 0 && nonInferior.length === strongControls.length && strongControls.length > 0;
  const h2Detail = strongControls.map((c) => ({
    control: c.arm_b,
    delta_pp: percent(c.point),
    ci95_pp: [percent(c.ci95[0]), percent(c.ci95[1])],
    non_inferior: inPoints(c.ci95[0]) > NON_INFERIORITY_MARGIN,
  }));
  if (missingStrong.length > 0) {
    h2Detail.push({ control: missingStrong.join(', '), delta_pp: null, ci95_pp: null, non_inferior: null, note: 'no comparison supplied; H2 is not evaluable without it' });
  }

  const negativeReasons = [];
  if (primary.ci95[1] < 0) negativeReasons.push('functional pass rate below the unguided base with an interval excluding zero');
  for (const control of controls) {
    // Default the treated arm rather than reading an undefined key: a silent miss here would drop a
    // real regression from the negative classification.
    const armA = control.arm_a ?? 'T_trained_adapter';
    const armB = control.arm_b;
    for (const blocker of BLOCKER_CHECKS) {
      const delta = (control.blocker_rates?.[blocker]?.[armA] ?? 0) - (control.blocker_rates?.[blocker]?.[armB] ?? 0);
      if (delta > 0 && (control.blocker_cis?.[blocker]?.[0] ?? -1) > 0) {
        negativeReasons.push(`more ${blocker.replace('blocker_', '')} findings than ${armB}, interval excluding zero`);
      }
    }
  }
  if (primary.cost_per_pass_worse === true) negativeReasons.push('worse cost per pass');
  if (primary.over_application_worse === true) negativeReasons.push('more edits or regressions on already-modern briefs');

  return {
    h1_supported: h1,
    h1_detail: { delta_pp: percent(primary.point), ci95_pp: [percent(primary.ci95[0]), percent(primary.ci95[1])], min_effect_pp: MIN_EFFECT_OF_INTEREST },
    h2_non_inferior_to_strong_controls: h2,
    h2_detail: h2Detail,
    null_result: nullResult,
    negative: negativeReasons.length > 0,
    negative_reasons: negativeReasons,
    reading: h1
      ? h2
        ? 'training beat the unguided base and held up against supplying guidance: a usable positive'
        : 'training beat the unguided base but did not hold up against supplying guidance: evidence for retrieval, not training'
      : nullResult && !h1
        ? 'null: the interval is compatible with no useful improvement'
        : 'no preregistered decision reached',
  };
}

/** Per-family pass rates for every arm: the reporting rule of PREREGISTRATION §7. */
export function perFamily(results, briefs, arms = ARMS) {
  const families = new Map();
  for (const brief of briefs) {
    if (!families.has(brief.family_id)) families.set(brief.family_id, []);
    families.get(brief.family_id).push(brief);
  }
  const rows = [];
  for (const [familyId, familyBriefs] of families) {
    const row = {
      family_id: familyId,
      stratum: familyBriefs[0].stratum,
      archetype: familyBriefs[0].archetype,
      briefs: familyBriefs.length,
      arms: {},
    };
    for (const arm of arms) {
      row.arms[arm] = {
        passes: familyBriefs.filter((brief) => briefPasses(results.find((r) => r.brief_id === brief.brief_id && r.arm === arm) ?? {}, brief.required_rules)).length,
        pass_rate: percent(passRate(results, familyBriefs, arm)),
      };
    }
    rows.push(row);
  }
  return rows.sort((a, b) => a.family_id.localeCompare(b.family_id));
}

import { sealHash } from './prereg.mjs';

/**
 * Per-rule application rate with the applicable denominator. A rule no brief required is omitted.
 *
 * WEIGHTING: rates here count BRIEFS, so a three-variant family carries three times the weight of a
 * singleton family. That is fine for describing which rules are applied, which is all this function
 * is used for; it is not a family-weighted estimate and must not be read as one. Inferential claims
 * go through `pairedDifference`, which resamples families.
 */
export function perRule(results, briefs, arms = ARMS) {
  const rules = new Map();
  for (const brief of briefs) {
    for (const rule of brief.required_rules ?? []) {
      if (!rules.has(rule)) rules.set(rule, { rule, applicable: new Set(), arms: {} });
      rules.get(rule).applicable.add(brief.brief_id);
    }
  }
  for (const entry of rules.values()) {
    for (const arm of arms) {
      let applied = 0;
      let applicable = 0;
      for (const briefId of entry.applicable) {
        const brief = briefs.find((b) => b.brief_id === briefId);
        if (!brief?.required_rules?.includes(entry.rule)) continue;
        applicable += 1;
        const result = results.find((r) => r.brief_id === briefId && r.arm === arm);
        if (isPlainObject(result?.rule_results) && result.rule_results[entry.rule] === true) applied += 1;
      }
      entry.arms[arm] = { applied, applicable, rate: applicable === 0 ? null : percent(applied / applicable) };
    }
  }
  return [...rules.values()].map((entry) => ({ rule: entry.rule, applicable: entry.applicable.size, arms: entry.arms })).sort((a, b) => a.rule.localeCompare(b.rule));
}

/** Failure taxonomy per arm (PREREGISTRATION §7), counted from the result records. */
export function failureTaxonomy(results, briefs, arms = ARMS) {
  const categories = ['build_failure', 'route_missing', 'journey_failure', 'assertion_failure', 'rule_missing', 'blocker_accessibility', 'blocker_security'];
  const out = {};
  for (const arm of arms) {
    const counts = Object.fromEntries(categories.map((c) => [c, 0]));
    for (const brief of briefs) {
      const result = results.find((r) => r.brief_id === brief.brief_id && r.arm === arm);
      if (!result) continue;
      // The evaluator's own failure list is the authority when it is present; deriving from the
      // boolean criteria as well would count one failure twice.
      const explicit = Array.isArray(result.failures) ? result.failures.filter((f) => f in counts) : [];
      if (explicit.length > 0) {
        for (const failure of explicit) counts[failure] += 1;
      } else {
        if (result.runnable !== true) counts.build_failure += 1;
        else if (result.functional !== true) counts.journey_failure += 1;
      }
      for (const rule of brief.required_rules ?? []) {
        if (result.rule_results?.[rule] !== true) counts.rule_missing += 1;
      }
      if ((result.blocker_accessibility ?? 0) > 0) counts.blocker_accessibility += result.blocker_accessibility;
      if ((result.blocker_security ?? 0) > 0) counts.blocker_security += result.blocker_security;
    }
    out[arm] = counts;
  }
  return out;
}
