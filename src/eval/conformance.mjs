/**
 * Visual and structural conformance: how close does a built page come to the target design?
 *
 * Why this exists: the eval reports raw output as a baseline, but a baseline with no target is just a
 * number. The target is the achievable ideal for a brief family, and this module turns "does it look
 * like the target" into a score that can be computed the same way for every arm. It is deliberately
 * three cheap, explainable axes rather than one opaque one:
 *
 *   - structural  the element tree: the same kinds of things in the same order (a `form` where a
 *                 `form` belongs), so a page that renders the right components scores well even if a
 *                 framework emits a different wrapper.
 *   - geometry    the layout: normalised bounding boxes matched within each tag class by nearest
 *                 position, so a page that moved down because header markup sits above it, or that
 *                 added one field, does not collapse every later element to zero.
 *   - controls    the things a person operates: the same inputs, with labels.
 *
 * All three read a *signature* captured in the browser (`SIGNATURE_SCRIPT`), which is plain data. The
 * metrics are pure functions of two signatures, so they are unit-tested without a browser, and a
 * target image is only ever a rendering of the same signature - one target, one picture and one
 * number, taken from the same page.
 *
 * Pixel similarity is deliberately not one of the axes: comparing PNG bytes would need a decoder and
 * would punish a framework for anti-aliasing. Geometry is the honest version of the same question.
 */

export const WEIGHTS = Object.freeze({ structural: 0.4, geometry: 0.35, controls: 0.25 });

/**
 * Evaluated inside the page. Returns the signature the metrics consume. Written as a statement with an
 * explicit `return` because the CDP caller wraps the expression in an async function body - a bare
 * trailing expression would be discarded and the signature would come back undefined.
 */
export const SIGNATURE_SCRIPT = `return (() => {
  const SKIP = new Set(['script', 'style', 'template', 'link', 'meta', 'noscript']);
  const nodes = [];
  const walk = (element, depth) => {
    for (const child of element.children) {
      const tag = child.tagName.toLowerCase();
      if (SKIP.has(tag)) continue;
      nodes.push({ tag, depth, type: child.getAttribute('type') ?? null, name: child.getAttribute('name') ?? null, role: child.getAttribute('role') ?? null });
      walk(child, depth + 1);
    }
  };
  walk(document.body, 0);
  const boxes = [];
  const boxTags = ['header', 'nav', 'main', 'aside', 'footer', 'form', 'fieldset', 'label', 'input', 'select', 'textarea', 'button', 'h1', 'h2', 'h3', 'ul', 'li', 'article', 'section', 'table'];
  for (const element of document.querySelectorAll(boxTags.join(','))) {
    const tag = element.tagName.toLowerCase();
    const rect = element.getBoundingClientRect();
    boxes.push({
      tag,
      x: +(rect.x / innerWidth).toFixed(4), y: +(rect.y / innerHeight).toFixed(4),
      w: +(rect.width / innerWidth).toFixed(4), h: +(rect.height / innerHeight).toFixed(4),
    });
  }
  const labels = [];
  for (const label of document.querySelectorAll('label[for]')) labels.push({ for: label.getAttribute('for'), text: (label.textContent ?? '').trim().slice(0, 80) });
  const byId = new Map(labels.map((label) => [label.for, label.text]));
  const controls = [];
  for (const element of document.querySelectorAll('input, select, textarea')) {
    const type = element.getAttribute('type') ?? null;
    if (type === 'hidden') continue;
    const id = element.getAttribute('id');
    const label = (id && byId.get(id)) || element.getAttribute('aria-label') || null;
    controls.push({ tag: element.tagName.toLowerCase(), type, name: element.getAttribute('name') ?? null, label });
  }
  const headings = [...document.querySelectorAll('h1, h2, h3')].map((h) => (h.textContent ?? '').trim().slice(0, 120));
  return { title: document.title, viewport: { width: innerWidth, height: innerHeight }, nodes, boxes, labels, controls, headings };
})();`;

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * Tags in document order, without depth.
 *
 * Depth was in the token and it made the metric useless: one wrapper `<div id="root">` - which
 * every React and Vue page has - shifted every child down a level, `form@1` stopped matching
 * `form@2`, and an otherwise identical page scored 0. The contract is "the same kinds of thing in the
 * same order"; that is what this tokenises. A wrapper costs one extra `div` token, not a failure.
 */
function tokens(nodes) {
  return (nodes ?? []).map((node) => node.tag);
}

/** Length of the longest common subsequence - order-sensitive, so a rearranged page scores lower. */
export function lcsLength(a, b) {
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

function multisetJaccard(a, b) {
  const counts = new Map();
  for (const token of a) counts.set(token, (counts.get(token) ?? 0) + 1);
  let intersection = 0;
  let union = a.length;
  for (const token of b) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      counts.set(token, remaining - 1);
      intersection += 1;
    } else {
      union += 1;
    }
  }
  return union === 0 ? 1 : intersection / union;
}

/** The element tree: 0.6 * order (LCS) + 0.4 * composition (multiset). */
export function structuralSimilarity(target, candidate) {
  const a = tokens(target?.nodes);
  const b = tokens(candidate?.nodes);
  if (a.length === 0 && b.length === 0) return 1;
  const order = lcsLength(a, b) / Math.max(a.length, b.length);
  return round(0.6 * order + 0.4 * multisetJaccard(a, b));
}

/**
 * How alike two boxes are: half position, half size.
 *
 * IoU was the obvious choice and the wrong one. IoU is translation-sensitive, so a page that renders
 * the same form 80px lower because it has a header scored 0 on every field - which is how the
 * booking family first came out at 0.054 geometry not because its layout was wrong but because it had
 * moved. Position is measured as centre distance in viewport units, so a modest shift costs a little
 * and a genuine rearrangement costs a lot; size is the aspect-and-area agreement.
 */
function boxScore(box, other) {
  const distance = Math.hypot(box.x + box.w / 2 - (other.x + other.w / 2), box.y + box.h / 2 - (other.y + other.h / 2));
  const position = Math.max(0, 1 - distance);
  const widthRatio = Math.max(box.w, other.w) === 0 ? 0 : Math.min(box.w, other.w) / Math.max(box.w, other.w);
  const heightRatio = Math.max(box.h, other.h) === 0 ? 0 : Math.min(box.h, other.h) / Math.max(box.h, other.h);
  return 0.5 * position + 0.5 * widthRatio * heightRatio;
}

/**
 * The layout: boxes matched within each tag class by maximum-weight greedy pairing, unmatched boxes
 * counting as zero against a denominator of `max(target, candidate)` per tag.
 *
 * Pairing by index instead collapses on an insertion: one extra `<label>` early shifts every later
 * `label:n`, so every subsequent field's IoU is computed against the wrong box and the whole page
 * reads as rearranged. Matching by position keeps the insertion local - the extra box is the only
 * one that goes unmatched.
 */
export function geometrySimilarity(target, candidate) {
  const group = (boxes) => {
    const map = new Map();
    for (const box of boxes ?? []) {
      if (!map.has(box.tag)) map.set(box.tag, []);
      map.get(box.tag).push(box);
    }
    return map;
  };
  const targetGroups = group(target?.boxes);
  const candidateGroups = group(candidate?.boxes);
  const tags = new Set([...targetGroups.keys(), ...candidateGroups.keys()]);
  let score = 0;
  let denominator = 0;
  for (const tag of tags) {
    const boxes = targetGroups.get(tag) ?? [];
    const others = candidateGroups.get(tag) ?? [];
    denominator += Math.max(boxes.length, others.length);
    const pairs = [];
    boxes.forEach((box, i) => others.forEach((other, j) => pairs.push({ i, j, score: boxScore(box, other) })));
    pairs.sort((a, b) => b.score - a.score);
    const usedTarget = new Set();
    const usedCandidate = new Set();
    for (const pair of pairs) {
      if (usedTarget.has(pair.i) || usedCandidate.has(pair.j)) continue;
      usedTarget.add(pair.i);
      usedCandidate.add(pair.j);
      score += pair.score;
    }
  }
  return denominator === 0 ? 1 : round(score / denominator);
}

const controlDescriptor = (control) => `${control.tag}[${control.type ?? ''}][${control.name ?? ''}]`;

/** The operable parts: the same controls (multiset), and how many of the candidate's carry a label. */
export function controlSimilarity(target, candidate) {
  const targetControls = target?.controls ?? [];
  const candidateControls = candidate?.controls ?? [];
  if (targetControls.length === 0 && candidateControls.length === 0) return 1;
  const match = multisetJaccard(targetControls.map(controlDescriptor), candidateControls.map(controlDescriptor));
  // The label term takes the worse of the two sides. It used to read only the candidate, which made
  // the function asymmetric - so comparing two peer variants gave a different answer depending on
  // which was passed first, and `variantIdentity` (which only ever evaluates i<j) could read the
  // unlabelled raw arm as a perfect 1.000 against every labelled peer. Arm scoring is unchanged: the
  // target's controls are all labelled, so the minimum is still the candidate's fraction.
  const labelledFraction = (controls) => (controls.length === 0 ? 0 : controls.filter((control) => control.label).length / controls.length);
  const labelled = Math.min(labelledFraction(targetControls), labelledFraction(candidateControls));
  return round(0.6 * match + 0.4 * labelled);
}

/** The three axes and their weighted mean, as one object so a report never has to recompute them. */
export function conformanceScore(target, candidate) {
  const structural = structuralSimilarity(target, candidate);
  const geometry = geometrySimilarity(target, candidate);
  const controls = controlSimilarity(target, candidate);
  return {
    structural,
    geometry,
    controls,
    overall: round(WEIGHTS.structural * structural + WEIGHTS.geometry * geometry + WEIGHTS.controls * controls),
  };
}

/**
 * The three numbers the endpoint reports per arm: the raw baseline, the arm's conformance to the
 * target, and the delta. `raw` and `arm` are signatures; `target` is the family's target signature.
 *
 * This is the secondary continuous axis, consumed by `scripts/score-conformance.mjs`. It is not
 * emitted by `src/eval/endpoint.mjs`, whose pass-rate endpoint is frozen by the preregistration; a
 * caller wanting these numbers reads the conformance report, it does not look in an endpoint result.
 */
export function scoreArm({ target, raw, arm }) {
  const baseline = conformanceScore(target, raw);
  const conformant = conformanceScore(target, arm);
  return {
    raw: baseline.overall,
    target: conformant.overall,
    delta: round(conformant.overall - baseline.overall),
    axes: { raw: baseline, arm: conformant },
  };
}

/**
 * How alike are the framework variants that share one target?
 *
 * R2's question is whether a framework difference shows up as a *design* difference. The family has a
 * single shared target, so a variant that scores well against the target is close to the intended
 * design; `variantIdentity` adds the other half - whether the variants agree with *each other*, which
 * is what stops a framework's own layout conventions from being read as an aesthetic result.
 *
 * The report keeps the weakest pair and the per-axis variance rather than only a mean: a family where
 * four variants agree and one is an outlier has a mean that hides the outlier, and the outlier is the
 * finding.
 */
export const IDENTITY_AXES = Object.freeze(['structural', 'geometry', 'controls', 'overall']);

export function variantIdentity(target, variants) {
  const targets = variants.map((variant) => ({ framework: variant.framework, ...conformanceScore(target, variant.signature) }));
  const pairwise = [];
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      // Both directions, averaged. Every axis is symmetric now, but averaging makes the pairwise shell
      // robust to a future asymmetric one rather than silently reporting whichever order came first.
      const forward = conformanceScore(variants[i].signature, variants[j].signature);
      const backward = conformanceScore(variants[j].signature, variants[i].signature);
      const axes = Object.fromEntries(IDENTITY_AXES.map((axis) => [axis, round((forward[axis] + backward[axis]) / 2)]));
      pairwise.push({ a: variants[i].framework, b: variants[j].framework, ...axes });
    }
  }
  const mean = (values) => (values.length === 0 ? 1 : round(values.reduce((sum, value) => sum + value, 0) / values.length));
  const identity = Object.fromEntries(IDENTITY_AXES.map((axis) => [axis, mean(pairwise.map((pair) => pair[axis]))]));
  const variance = Object.fromEntries(
    IDENTITY_AXES.map((axis) => {
      if (pairwise.length === 0) return [axis, 0];
      const average = identity[axis];
      return [axis, round(pairwise.reduce((sum, pair) => sum + (pair[axis] - average) ** 2, 0) / pairwise.length)];
    }),
  );
  // The weakest pair per axis, not only by overall: a family can fail the geometry budget because of a
  // pair that is not the overall-worst, and blaming the overall-worst pair names the wrong frameworks.
  const weakestByAxis = Object.fromEntries(
    IDENTITY_AXES.map((axis) => [axis, pairwise.length === 0 ? null : [...pairwise].sort((a, b) => a[axis] - b[axis])[0]]),
  );
  // Two variants that measure nothing agree perfectly. Without this, a family of blank pages scores
  // 1.000 identity and raises no finding, which is the most confidently wrong answer the axis can give.
  const degenerate = variants.length < 2 || variants.every((variant) => (variant.signature?.boxes?.length ?? 0) === 0);
  return { target_conformance: targets, pairwise, identity, variance, weakest_pair: weakestByAxis.overall, weakest_by_axis: weakestByAxis, degenerate };
}

/**
 * Refuse a budget that cannot judge anything.
 *
 * An axis with no budget is not an axis that passed - it is an axis nobody measured against, so the
 * reading is "no findings", which is indistinguishable from "everything agreed". A missing, empty or
 * non-object budget therefore silently reports universal agreement for a family that may have fallen
 * below its floor on every axis. That is a malformed CALLER CONTRACT rather than malformed data, so it
 * throws, which is the same rule the identity-argument guard follows - that one is mwg-train-w46's, and
 * it sits at the top of `identityFindings`, below.
 *
 * This lives here and is exported because `crossArmFindings` in parity.mjs delegates to the judge below
 * AND has its own budget-reading outlier loop: one rule, one place, so the two cannot drift apart.
 */
/**
 * Every code `identityFindings` can emit, as a published set.
 *
 * These exist as a list rather than as literals at each emission because the parity layer has to translate
 * them, and the two files can drift. A guard that pattern-matched the literal shape `code: 'IDENTITY_...'`
 * in the source would miss a fourth code written as a constant reference, so the map is checked against
 * THIS list and the emissions come from it (mwg-train-7yp).
 */
export const IDENTITY_CODES = Object.freeze({
  DEGENERATE: 'IDENTITY_DEGENERATE',
  BELOW_BUDGET: 'IDENTITY_BELOW_BUDGET',
  PAIR_BELOW_BUDGET: 'IDENTITY_PAIR_BELOW_BUDGET',
});

export function requireBudget(budget, caller = 'identityFindings') {
  // `Number.isFinite`, not `typeof value === 'number'`: `typeof NaN === 'number'`, and `actual < NaN` is
  // false for every axis, so a NaN floor silently judges nothing - the same forbidden direction as a
  // missing budget, through a narrower door. Infinity and -Infinity are the same class in opposite
  // directions. Arrays are refused for the same reason: Object.entries([0.75]) is [['0', 0.75]], so an
  // array would "judge" an axis literally named "0".
  const entries = budget && typeof budget === 'object' && !Array.isArray(budget) ? Object.entries(budget) : [];
  const nonFinite = entries.filter(([, value]) => !Number.isFinite(value)).map(([axis]) => axis);
  // A NON-FINITE AXIS IS REFUSED, not just an all-non-finite budget (mwg-train-dwo). A mixed budget used to
  // pass and then split the two layers: the judge silently skipped the NaN axis, while the parity outlier
  // loop proceeded - typeof NaN === 'number' - and published a below-budget finding with `minimum: NaN`.
  // Silence in one layer and a fabricated judgement in the other is worse than refusing the input.
  if (entries.length === 0 || nonFinite.length > 0) {
    const problem = entries.length === 0
      ? 'needs a budget with at least one numeric axis'
      : `cannot judge the axis/axes ${nonFinite.join(', ')}`;
    throw new TypeError(
      `${caller} ${problem}, got ${JSON.stringify(budget) ?? String(budget)}: `
      + 'an axis without a finite floor is unjudged, and unjudged must not read as agreement',
    );
  }
  return budget;
}

/**
 * Does a family's cross-variant identity meet the preregistered budget? A framework may legitimately
 * change the markup; it may not change the layout, the component hierarchy, the spacing or the visual
 * system, so the budget is per axis and a failure names the axis and the pair responsible for *that*
 * axis.
 */
export function identityFindings(identity, budget) {
  const findings = [];
  // FAIL CLOSED on a malformed argument. An empty finding list means "this family agrees" and nothing else,
  // and nothing in the signature says which shape was expected - this reads `identity.identity[axis]`, the
  // whole `variantIdentity` RESULT, while the axes are what a caller usually has in hand. Handed the axes,
  // every axis read as undefined, the `typeof actual === 'number'` guard declined, and the function returned
  // an empty list: a wrong call indistinguishable from a clean verdict. (Found while building the cross-arm
  // parity instrument - a control that should have bitten a deliberately drifted arm did not, and this was
  // why.) mwg-train-w46.
  if (identity === null || typeof identity !== 'object' || identity.identity === null || typeof identity.identity !== 'object') {
    const received = identity === null
      ? 'null'
      : typeof identity !== 'object'
        ? `a ${typeof identity}`
        : identity.identity === undefined
          ? 'the axes object (the result has an `identity` field holding the per-axis means)'
          : 'a result whose `identity` field is not an object';
    throw new TypeError(`identityFindings: expected the variantIdentity RESULT and got ${received} - pass variantIdentity(target, variants), not its .identity`);
  }
  if (identity?.degenerate) {
    findings.push({ code: IDENTITY_CODES.DEGENERATE, message: 'fewer than two measurable variants: identity is vacuous, not perfect' });
  }
  for (const [axis, minimum] of Object.entries(requireBudget(budget))) {
    const actual = identity?.identity?.[axis];
    const weakest = identity?.weakest_by_axis?.[axis] ?? null;
    if (typeof actual === 'number' && actual < minimum) {
      const pair = weakest ?? identity?.weakest_pair ?? null;
      findings.push({
        code: IDENTITY_CODES.BELOW_BUDGET,
        axis,
        actual,
        minimum,
        message: `variants agree on ${axis} at ${actual}, below the ${minimum} budget`,
        pair: pair ? `${pair.a}/${pair.b}` : null,
      });
    }
    // The weakest PAIR on this axis is judged in its own right, and only when the mean passed - otherwise the
    // mean finding above already names the pair and this would report the same fact twice.
    //
    // Judging the mean alone lets one diverged variant hide behind six agreeing ones. Measured on the test
    // fixture: a mean geometry of 0.9643, comfortably inside the 0.9 budget, with a weakest pair at 0.875,
    // below it, and ZERO findings - a family containing a badly diverged arm reported as being in agreement.
    // The docstring above `variantIdentity` says "the outlier is the finding"; this is what makes that true.
    const pairScore = weakest?.[axis];
    if (typeof pairScore === 'number' && pairScore < minimum && !(typeof actual === 'number' && actual < minimum)) {
      findings.push({
        code: IDENTITY_CODES.PAIR_BELOW_BUDGET,
        axis,
        actual: pairScore,
        minimum,
        pair: `${weakest.a}/${weakest.b}`,
        message: `variants ${weakest.a} and ${weakest.b} agree on ${axis} at ${pairScore}, below the ${minimum} budget, while the family mean is ${actual ?? 'unknown'} - the mean hides this pair`,
      });
    }
  }
  return findings;
}
