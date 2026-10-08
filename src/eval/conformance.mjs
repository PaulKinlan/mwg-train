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
 *   - geometry    the layout: normalised bounding boxes, so a card grid that is in the right place
 *                 scores well even if the markup differs.
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
  const boxes = {};
  const seen = {};
  const boxTags = ['header', 'nav', 'main', 'aside', 'footer', 'form', 'fieldset', 'label', 'input', 'select', 'textarea', 'button', 'h1', 'h2', 'h3', 'ul', 'li', 'article', 'section', 'table'];
  for (const element of document.querySelectorAll(boxTags.join(','))) {
    const tag = element.tagName.toLowerCase();
    seen[tag] = (seen[tag] ?? 0) + 1;
    const rect = element.getBoundingClientRect();
    boxes[tag + ':' + (seen[tag] - 1)] = {
      x: +(rect.x / innerWidth).toFixed(4), y: +(rect.y / innerHeight).toFixed(4),
      w: +(rect.width / innerWidth).toFixed(4), h: +(rect.height / innerHeight).toFixed(4),
    };
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

function tokens(nodes) {
  return (nodes ?? []).map((node) => `${node.tag}@${node.depth}`);
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

function iou(box, other) {
  const left = Math.max(box.x, other.x);
  const top = Math.max(box.y, other.y);
  const right = Math.min(box.x + box.w, other.x + other.w);
  const bottom = Math.min(box.y + box.h, other.y + other.h);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = box.w * box.h + other.w * other.h - overlap;
  return union <= 0 ? (overlap > 0 ? 1 : 0) : overlap / union;
}

/** The layout: mean IoU over every keyed box the target or the candidate has, unmatched counting as 0. */
export function geometrySimilarity(target, candidate) {
  const keys = new Set([...Object.keys(target?.boxes ?? {}), ...Object.keys(candidate?.boxes ?? {})]);
  if (keys.size === 0) return 1;
  let total = 0;
  for (const key of keys) {
    const box = target?.boxes?.[key];
    const other = candidate?.boxes?.[key];
    total += box && other ? iou(box, other) : 0;
  }
  return round(total / keys.size);
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
