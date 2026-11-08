/**
 * The preregistered primary endpoint, as code.
 *
 * docs/eval/PREREGISTRATION.md defines the endpoint and the decision rules. This module implements
 * them so the analysis is fixed in advance rather than chosen after seeing the numbers, and so the
 * decision rule cannot quietly become whatever the data supported.
 *
 * Nothing here reads the network or the filesystem: it takes result records and the sealed manifest's
 * rows and returns pass rates, a cluster bootstrap interval over prompt families, and a decision. See
 * docs/eval/PREREGISTRATION.md sections 3, 4 and 6.
 */

import { ALREADY_MODERN_MARKER, sealHash } from './prereg.mjs';
import { EVAL_SEAL } from '../train/disjoint.mjs';

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
    // blocker pass the endpoint. The count must be exactly zero, not merely "not positive":
    // `blockerFlagged` treats every measured value other than 0 as a finding, so a negative count
    // accepted here would pass the endpoint while counting against the arm in the §4 comparison.
    if (result[blocker] !== 0) return false;
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
export function checkDesign(results, briefs, arms = ARMS, { requireEnvironment = true } = {}) {
  const problems = [];
  const briefIds = new Set(briefs.map((brief) => brief.brief_id));
  const seen = new Map();
  for (const result of results) {
    if (requireEnvironment) {
      // This audits what a row CLAIMS, not historical provenance. An exact Node/Chrome version pin
      // needs separate ratification; do not derive one from these caller-supplied result records.
      if (result?.platform !== 'linux') {
        problems.push({ code: 'PLATFORM_NOT_LINUX', brief_id: result?.brief_id, arm: result?.arm,
          message: `sealed results require a Linux run record (found ${result?.platform ?? 'none'})` });
      }
      const node = /^v(\d+)\.\d+\.\d+$/.exec(result?.node_version ?? '');
      if (!node || Number(node[1]) < 20) {
        problems.push({ code: 'NODE_VERSION_UNRECORDED', brief_id: result?.brief_id, arm: result?.arm,
          message: 'run record needs a supported, explicit Node version; this is not a version pin' });
      }
      const chrome = /^(?:Chrome|HeadlessChrome|Chromium)\/([1-9]\d*)\.\d+\.\d+\.\d+$/.test(result?.chrome_version ?? '');
      if (!chrome || result?.browser?.product !== result.chrome_version) {
        problems.push({ code: 'CHROME_VERSION_UNRECORDED', brief_id: result?.brief_id, arm: result?.arm,
          message: 'run record needs a CDP browser product matching its Chrome version; this is not a version pin' });
      }
    }
    if (!briefIds.has(result?.brief_id)) {
      problems.push({ code: 'UNKNOWN_BRIEF', brief_id: result?.brief_id, arm: result?.arm, message: 'result for a brief that is not in the sealed universe being analysed' });
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

/** The seal the brief set must hash to: `sha256:` and 64 lowercase hex digits, as `sealHash` emits. */
const SEAL_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * The seal is not optional on a reportable verdict, and the caller does not get to choose it.
 *
 * Two refusals live here, both about the same issue. First the seal must be supplied and well formed,
 * because `checkUniverse` only compares the seal when one is supplied and a default of `null` let a
 * reportable call skip the §13 check entirely. Second it must BE the pinned seal, and the briefs must
 * hash to it: comparing the caller's hash against the caller's briefs made "reportable" a property of
 * the argument, so any set a caller had just sealed themselves produced a decision indistinguishable
 * from a preregistered one. The pin is `EVAL_SEAL`, the constant `check:briefs` enforces and
 * `test/briefs.test.mjs` checks against the hash recorded in PREREGISTRATION §13.
 */
function sealProblems(seal, briefs) {
  if (typeof seal !== 'string' || !SEAL_PATTERN.test(seal)) {
    if (seal === null || seal === undefined || seal === '') {
      return [{ code: 'SEAL_REQUIRED', brief_id: '(set)', message: 'the reportable endpoint needs the pinned brief-set seal (PREREGISTRATION §13); none was supplied' }];
    }
    return [{ code: 'SEAL_INVALID', brief_id: '(set)', message: `the seal must be a sha256 hash of the brief set; found ${JSON.stringify(seal)}` }];
  }
  const problems = [];
  if (seal !== EVAL_SEAL) {
    problems.push({ code: 'SEAL_MISMATCH', brief_id: '(set)', expected: EVAL_SEAL, actual: seal,
      message: `the seal supplied is ${seal}, not the pinned preregistered seal ${EVAL_SEAL}; the reporting hash is fixed in advance, not nominated by the caller` });
  }
  const actual = Array.isArray(briefs) ? sealHash(briefs) : null;
  if (actual !== EVAL_SEAL) {
    problems.push({ code: 'SEAL_MISMATCH', brief_id: '(set)', expected: EVAL_SEAL, actual,
      message: actual === null
        ? 'the briefs must be the rows of the sealed manifest; nothing else can be sealed against §13'
        : `the brief manifest hashes to ${actual}, not the pinned §13 seal ${EVAL_SEAL}; an edited or resealed manifest is not reportable` });
  }
  return problems;
}

/**
 * The sanctioned entry point for a *reportable* verdict.
 *
 * `pairedDifference` and `decide` are primitives: they compute over whatever brief list they are
 * handed, which is what exploratory work needs and exactly what a preregistered result must not do.
 * `briefs` is the sealed manifest itself, not a set the caller already filtered: the pinned seal is
 * checked over the whole manifest before the primary universe is selected from it, so the briefs a
 * verdict is computed over are determined by §13 rather than by what was passed in. The function then
 * enforces a complete design over the `test`/`generate` selection before any number is produced, and
 * returns the problems instead of a verdict when either check fails. A seal problem is returned on its
 * own: until the manifest is the sealed one, nothing about the design is meaningful. A consequence
 * worth stating plainly: if you call the primitives directly you are not running the preregistered
 * analysis, whatever the output looks like.
 *
 * It also forwards every secondary comparison `decide` reads (PREREGISTRATION §4 and §7) rather than
 * handing it bare pass-rate differences: blocker finding rates and mean finding counts per brief, each
 * with their own family-clustered interval, on the primary comparison against the unguided base (C1)
 * and on each strong control, and cost per pass plus already-modern change counts on the primary one.
 * The count comparison carries §4's "rise in findings" on its own: two findings on every affected
 * brief and one on the same briefs are the same incidence and a different finding rate. Those come
 * from the caller-supplied result rows - `inference_tokens` for the cost, `changed_pages` and
 * `regressions` for the already-modern briefs - because the diff and usage numbers are produced by
 * the run, not by this module. A comparison whose inputs are missing is left `null` with the reason
 * recorded in its `*_detail`, never asserted as "not worse".
 */
export function analyseSealed(results, briefs, { seal = null, arms = ARMS, iterations = 5000, seed = 20261008 } = {}) {
  const sealFindings = sealProblems(seal, briefs);
  if (sealFindings.length > 0) return { ok: false, problems: sealFindings, decision: null, primary: null, controls: [] };
  const sealedBriefs = briefs.filter((brief) => brief?.split === 'test' && brief?.task === 'generate');
  // The seal has authenticated the manifest, so this filter is the preregistered selection rule. The
  // universe check still runs on the result: the filter and §6/§7 have to agree, so a regression in
  // either one refuses the verdict instead of quietly narrowing or widening the denominator.
  const problems = [...checkUniverse(sealedBriefs), ...checkDesign(results, sealedBriefs, arms)];
  if (problems.length > 0) return { ok: false, problems, decision: null, primary: null, controls: [] };
  const blockerRatesByArm = blockerRates(results, sealedBriefs, arms);
  const blockerCountsByArm = blockerCounts(results, sealedBriefs, arms);
  // The blocker comparison against C1 travels on the primary comparison: a rise against the unguided
  // base is a preregistered negative in its own right (§4), and the strong controls are not the only
  // arm a regression can be measured against. decide() reads it there.
  const blockerComparison = (arm) => ({
    blocker_rates: blockerRatesByArm,
    blocker_cis: blockerDifferenceCis(results, sealedBriefs, 'T_trained_adapter', arm, { iterations, seed }),
    blocker_counts: blockerCountsByArm,
    blocker_count_cis: blockerDifferenceCis(results, sealedBriefs, 'T_trained_adapter', arm, { iterations, seed }, blockerFindingCount),
  });
  const primary = Object.assign(pairedDifference(results, sealedBriefs, 'T_trained_adapter', 'C1_bare_base', { iterations, seed }),
    costComparison(results, sealedBriefs), overApplicationComparison(results, sealedBriefs),
    blockerComparison('C1_bare_base'));
  const controls = ['C2_base_mwg_prompt', 'C3_base_uplift_tool'].map((arm) => ({
    ...pairedDifference(results, sealedBriefs, 'T_trained_adapter', arm, { iterations, seed }),
    ...blockerComparison(arm),
  }));
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

  return { arm_a: armA, arm_b: armB, ...familyBootstrap(briefs, deltaFor, { iterations, seed }), briefs: briefs.length };
}

/**
 * The cluster bootstrap itself: resample whole FAMILIES, because variants of one family are not
 * independent observations (PREREGISTRATION §3). `delta` is any per-brief statistic, so the pass-rate
 * comparison and the blocker-rate comparison share one resampling rule instead of two that can drift.
 */
function familyBootstrap(briefs, delta, { iterations, seed }) {
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
    deltas.push(delta(sample));
  }
  deltas.sort((x, y) => x - y);
  const at = (q) => deltas[Math.min(deltas.length - 1, Math.max(0, Math.floor(q * deltas.length)))];
  return { point: delta(briefs), ci95: [at(0.025), at(0.975)], iterations, seed, families: clusters.length };
}

function cell(results, brief, arm) {
  return results.find((r) => r.brief_id === brief.brief_id && r.arm === arm);
}

/**
 * Did one cell record a blocker finding? Fail closed, exactly as `briefPasses` does: an accessibility
 * or security count that was never recorded is not a measured zero, so it counts as a finding here
 * too. Defaulting it to 0 would let the one check that catches a real regression go quiet.
 */
function blockerFlagged(result, blocker) {
  const findings = result?.[blocker];
  return !(typeof findings === 'number' && Number.isFinite(findings) && findings === 0);
}

/** Incidence of a blocker finding in one cell: the value the `blocker_rates` share is computed from. */
function blockerIncidence(result, blocker) {
  return blockerFlagged(result, blocker) ? 1 : 0;
}

/**
 * How many accessibility/security findings one cell recorded, fail-closed like `blockerFlagged`.
 *
 * PREREGISTRATION §4 makes "a rise in findings" a negative, and a rise is a count, not a flag: two
 * security findings on every affected brief against one on the same briefs leaves the share of
 * briefs with any finding unchanged, so an incidence-only comparison records no negative at all. The
 * count is therefore the cell's recorded number of findings, with the same floor for the cases the
 * flag catches: a count that was never recorded is not a measured zero, so it enters as the one
 * finding it demonstrably is (an unrecorded count, or a negative one, must never let an arm look
 * cleaner than a measured zero).
 */
function blockerFindingCount(result, blocker) {
  const findings = result?.[blocker];
  if (isCount(findings) && findings > 0) return findings;
  return blockerFlagged(result, blocker) ? 1 : 0;
}

/**
 * The share of sealed briefs with at least one accessibility/security finding, per arm. The
 * denominator is the sealed set, so a missing cell cannot shrink it (the design check has already
 * refused that case). Reported alongside `blockerCounts`: the share is what a reader can compare to
 * a brief, the mean count is what §4's "rise in findings" is actually measured on.
 */
function blockerRates(results, briefs, arms = ARMS) {
  const rates = {};
  for (const blocker of BLOCKER_CHECKS) {
    rates[blocker] = {};
    for (const arm of arms) {
      const flagged = briefs.filter((brief) => blockerFlagged(cell(results, brief, arm), blocker)).length;
      rates[blocker][arm] = briefs.length === 0 ? 0 : flagged / briefs.length;
    }
  }
  return rates;
}

/**
 * Mean accessibility/security findings per sealed brief, per arm - the count `decide` compares. Two
 * findings on every brief and one finding on every brief are the same incidence and different totals,
 * and only the total is the finding rate §4 names.
 */
function blockerCounts(results, briefs, arms = ARMS) {
  const counts = {};
  for (const blocker of BLOCKER_CHECKS) {
    counts[blocker] = {};
    for (const arm of arms) {
      const findings = briefs.reduce((sum, brief) => sum + blockerFindingCount(cell(results, brief, arm), blocker), 0);
      counts[blocker][arm] = briefs.length === 0 ? 0 : findings / briefs.length;
    }
  }
  return counts;
}

/**
 * 95% family-clustered interval on the paired blocker difference, per blocker. `valueOf` is the
 * per-cell statistic, so the incidence comparison and the finding-count comparison share one
 * resampling rule instead of two that can drift apart.
 */
function blockerDifferenceCis(results, briefs, armA, armB, { iterations, seed }, valueOf = blockerIncidence) {
  const cis = {};
  for (const blocker of BLOCKER_CHECKS) {
    const a = new Map(briefs.map((brief) => [brief.brief_id, valueOf(cell(results, brief, armA), blocker)]));
    const b = new Map(briefs.map((brief) => [brief.brief_id, valueOf(cell(results, brief, armB), blocker)]));
    const delta = (sample) => (sample.length === 0 ? 0 : sample.reduce((sum, brief) =>
      sum + (a.get(brief.brief_id) - b.get(brief.brief_id)), 0) / sample.length);
    cis[blocker] = familyBootstrap(briefs, delta, { iterations, seed }).ci95;
  }
  return cis;
}

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Inference tokens per passing brief for one arm (PREREGISTRATION §5, §7). A partial sum is not a
 * cost: one cell without its recorded `inference_tokens` makes the whole comparison unmeasured rather
 * than flattering the arm that did not report. An arm that passed nothing has no tokens-per-pass at
 * all, so `per_pass` is `null` and `passes` carries the zero: `Infinity` is not a cost this report can
 * carry, because JSON writes it as `null` anyway and `Infinity > Infinity` is `false`, which reads as
 * "not worse" for a comparison between two arms that measured nothing.
 */
function costPerPass(results, briefs, arm) {
  let tokens = 0;
  let passes = 0;
  for (const brief of briefs) {
    const result = cell(results, brief, arm);
    if (!isCount(result?.inference_tokens)) return null;
    tokens += result.inference_tokens;
    if (briefPasses(result, brief.required_rules)) passes += 1;
  }
  return { tokens, passes, per_pass: passes === 0 ? null : tokens / passes };
}

/**
 * Why tokens per pass cannot be compared, or `null` when both arms have a measured cost. A missing
 * count is unmeasured for the arm that did not report it; zero passes is unmeasured for the pair,
 * because there is no per-pass figure to order and no arm to prefer when neither passed a brief.
 */
function unmeasuredCostReason(a, b, armA, armB) {
  if (a === null) return `${armA} has a cell without a recorded inference_tokens count`;
  if (b === null) return `${armB} has a cell without a recorded inference_tokens count`;
  const zeroPassArms = [[armA, a], [armB, b]].filter(([, cost]) => cost.passes === 0).map(([arm]) => arm);
  if (zeroPassArms.length === 0) return null;
  return `${zeroPassArms.join(' and ')} passed no sealed brief, so inference tokens per pass is unmeasured`;
}

/**
 * Worse cost-adjusted performance against the unguided base (PREREGISTRATION §4, negative).
 * `decide` reads this flag from the primary comparison, so it is measured over exactly that pair.
 */
function costComparison(results, briefs, armA = 'T_trained_adapter', armB = 'C1_bare_base') {
  const a = costPerPass(results, briefs, armA);
  const b = costPerPass(results, briefs, armB);
  const unmeasured = unmeasuredCostReason(a, b, armA, armB);
  return {
    cost_per_pass_worse: unmeasured === null ? a.per_pass > b.per_pass : null,
    cost_detail: { metric: 'inference_tokens_per_pass', unmeasured, [armA]: a, [armB]: b },
  };
}

/**
 * Increased over-application on the already-modern briefs (PREREGISTRATION §4, §7): more pages changed
 * or more regressions introduced than the comparison arm, over the briefs whose `non_goals` carry the
 * already-modern marker. Reported as a change count, never folded into the pass rate.
 */
function overApplicationComparison(results, briefs, armA = 'T_trained_adapter', armB = 'C1_bare_base') {
  const alreadyModern = briefs.filter((brief) => (brief.non_goals ?? []).includes(ALREADY_MODERN_MARKER));
  if (alreadyModern.length === 0) {
    return {
      over_application_worse: null,
      over_application_detail: { already_modern_briefs: 0, unmeasured: 'the sealed set carries no already-modern brief' },
    };
  }
  const totals = (arm) => {
    let changedPages = 0;
    let regressions = 0;
    for (const brief of alreadyModern) {
      const result = cell(results, brief, arm);
      if (!isCount(result?.changed_pages) || !isCount(result?.regressions)) return null;
      changedPages += result.changed_pages;
      regressions += result.regressions;
    }
    return { changed_pages: changedPages, regressions };
  };
  const a = totals(armA);
  const b = totals(armB);
  const unmeasured = a === null ? `${armA} has an already-modern cell without changed_pages/regressions`
    : b === null ? `${armB} has an already-modern cell without changed_pages/regressions` : null;
  return {
    over_application_worse: unmeasured === null
      ? a.changed_pages > b.changed_pages || a.regressions > b.regressions
      : null,
    over_application_detail: { already_modern_briefs: alreadyModern.length, unmeasured, [armA]: a, [armB]: b },
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
  // The primary comparison against C1 is read here too, not just the strong controls: a blocker rise
  // against the unguided base is a preregistered negative (§4), and attaching the rates only to C2 and
  // C3 made exactly that comparison invisible to the decision.
  //
  // Two measures, deliberately: the share of briefs with any finding, and the mean number of findings
  // per brief. §4's negative is a rise in findings, and incidence alone cannot see one - two security
  // findings on every affected brief against one on the same briefs is the same share and twice the
  // findings, so an incidence-only comparison reports no negative while the trained arm got worse.
  for (const comparison of [primary, ...controls]) {
    // Default the treated arm rather than reading an undefined key: a silent miss here would drop a
    // real regression from the negative classification.
    const armA = comparison.arm_a ?? 'T_trained_adapter';
    const armB = comparison.arm_b;
    for (const blocker of BLOCKER_CHECKS) {
      const label = blocker.replace('blocker_', '');
      const delta = (comparison.blocker_rates?.[blocker]?.[armA] ?? 0) - (comparison.blocker_rates?.[blocker]?.[armB] ?? 0);
      if (delta > 0 && (comparison.blocker_cis?.[blocker]?.[0] ?? -1) > 0) {
        negativeReasons.push(`more ${label} findings than ${armB}, interval excluding zero`);
      }
      const countDelta = (comparison.blocker_counts?.[blocker]?.[armA] ?? 0) - (comparison.blocker_counts?.[blocker]?.[armB] ?? 0);
      if (countDelta > 0 && (comparison.blocker_count_cis?.[blocker]?.[0] ?? -1) > 0) {
        negativeReasons.push(`more ${label} findings per brief than ${armB}, interval excluding zero`);
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
