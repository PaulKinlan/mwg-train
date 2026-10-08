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
  // A candidate with no controls has none to label: scoring it 1 for "no unlabelled controls" would
  // let a page that dropped the form score as well as one that kept it labelled.
  const labelled = candidateControls.length === 0 ? 0 : candidateControls.filter((control) => control.label).length / candidateControls.length;
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
