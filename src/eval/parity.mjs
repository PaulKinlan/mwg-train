/**
 * Cross-arm parity: the verdict layer for the `check-cross-arm-parity` instrument.
 *
 * Everything here is a pure function over already-captured signatures and computed design tokens.
 * Rendering belongs to the CDP layer, measuring to the signature, and JUDGING to this module, so the
 * decision "do these arms agree" can be tested without a browser and cannot quietly become a property
 * of how the browser was driven.
 *
 * Three things are deliberately NOT done here:
 *
 * - No pixel comparison. The repository already documents why (`src/eval/conformance.mjs`): a PNG
 *   comparison would need an image decoder and would punish a framework for anti-aliasing. Geometry is
 *   the honest version of the same question, so geometry is what is compared.
 * - No tolerance-free equality. Two frameworks legitimately emit different markup for the same design,
 *   so exact agreement is not the standard; the standard is agreement within an explicit budget, and a
 *   reading below it is reported with the arm pair, the axis and both numbers.
 * - No silence about absence. An arm that produced no signature, a viewport that did not take effect,
 *   a token the page never set: each is a finding with a code, never a missing row in a report that
 *   still reads as clean. Absence of evidence is not evidence of parity.
 */
import { IDENTITY_AXES, identityFindings, variantIdentity } from './conformance.mjs';

/**
 * Findings carry the same shape the repository's other instruments emit, so a reader who has seen one
 * report has seen them all: code, axis, actual, minimum, message, and the pair when the finding names
 * two things rather than one.
 */
export const PARITY_CODES = Object.freeze({
  ARM_UNMEASURED: 'ARM_UNMEASURED',
  VIEWPORT_NOT_APPLIED: 'VIEWPORT_NOT_APPLIED',
  CROSS_ARM_DEGENERATE: 'CROSS_ARM_DEGENERATE',
  CROSS_ARM_BELOW_BUDGET: 'CROSS_ARM_BELOW_BUDGET',
  CROSS_ARM_PAIR_BELOW_BUDGET: 'CROSS_ARM_PAIR_BELOW_BUDGET',
  PALETTE_DIVERGES: 'PALETTE_DIVERGES',
  PALETTE_UNDECLARED: 'PALETTE_UNDECLARED',
});

/** The design tokens every generated arm sets on `:root`. Used to read them back, not to require them. */
export const TOKEN_NAMES = Object.freeze(['--fg', '--bg', '--accent', '--muted', '--line']);

/**
 * Normalise a CSS colour for comparison. Browsers report computed colours in forms the source never
 * used (`rgb(15, 23, 42)` for `#0f172a`), so a raw string comparison would report divergence between a
 * page and a palette that agree exactly. Only the three syntaxes the tokens and the boards actually
 * use are supported; anything else is returned trimmed and is compared literally, which fails closed
 * towards reporting a divergence rather than hiding one.
 */
export function normaliseColour(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === '') return '';
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((character) => character + character).join('') : hex[1];
    return `#${digits}`;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+[\d.]+)?\s*\)$/.exec(text);
  if (rgb) {
    const channel = (part) => Number(part).toString(16).padStart(2, '0');
    return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
  }
  return text;
}

/**
 * Did each arm render at the viewport it was asked for?
 *
 * A viewport override that silently fails is the most expensive kind of wrong measurement, because
 * every parity number afterwards is real but about the wrong window. The signature records the
 * `innerWidth`/`innerHeight` the page actually had, so this is checked rather than assumed.
 */
export function viewportFindings({ arms, requested }) {
  const findings = [];
  for (const arm of arms) {
    const actual = arm?.signature?.viewport;
    if (!actual) {
      findings.push({
        code: PARITY_CODES.ARM_UNMEASURED,
        arm: arm?.framework ?? 'unknown',
        viewport: requested.key,
        message: `${arm?.framework ?? 'unknown'} produced no signature at ${requested.key}`,
      });
      continue;
    }
    if (actual.width !== requested.width || actual.height !== requested.height) {
      findings.push({
        code: PARITY_CODES.VIEWPORT_NOT_APPLIED,
        arm: arm.framework,
        viewport: requested.key,
        expected: { width: requested.width, height: requested.height },
        actual: { width: actual.width, height: actual.height },
        message: `${arm.framework} was asked for ${requested.width}x${requested.height} and rendered ${actual.width}x${actual.height}, so every parity number at this width is about the wrong window`,
      });
    }
  }
  return findings;
}

/**
 * Do the arms agree with each other at one viewport?
 *
 * The comparison itself is the repository's existing bidirectional pairwise identity over signatures -
 * the same function the variant-identity scorer uses - so "do these agree" has one definition in this
 * codebase rather than two. The first measured arm is the reference only because the function wants a
 * target; the number that matters here is the pairwise identity, which is symmetric and does not care
 * which arm was named first.
 */
export function crossArmFindings({ arms, budget }) {
  const measured = arms.filter((arm) => arm.signature);
  if (measured.length < 2) {
    return {
      identity: null,
      findings: [
        {
          code: PARITY_CODES.CROSS_ARM_DEGENERATE,
          viewport: arms[0]?.viewport ?? null,
          message: `${measured.length} arm(s) measurable: comparing arms with each other is vacuous, not perfect`,
        },
      ],
    };
  }
  const variants = measured.map((arm) => ({ framework: arm.framework, signature: arm.signature }));
  const identity = variantIdentity(measured[0].signature, variants);
  // `identityFindings` reads the axes off the RESULT (`identity.identity[axis]`), so it is handed the
  // result itself. Passing the axes here does not throw and does not warn - every axis reads as
  // `undefined`, `typeof undefined === 'number'` is false, and the function returns an empty findings
  // list, which looks exactly like agreement. That is a trap worth stating where the call is made.
  const findings = identityFindings(identity, budget).map((finding) => ({
    ...finding,
    code: finding.code === 'IDENTITY_DEGENERATE' ? PARITY_CODES.CROSS_ARM_DEGENERATE : PARITY_CODES.CROSS_ARM_BELOW_BUDGET,
    viewport: measured[0].viewport,
  }));
  // AND THE OUTLIER, WHICH THE MEAN HIDES.
  //
  // `identityFindings` judges the MEAN across pairs. With seven arms there are twenty-one pairs, so one
  // arm that has badly diverged may be averaged away: measured here, an arm whose geometry disagreed
  // with six others at 0.66 left the mean at 0.903, just above the 0.9 budget, and the instrument
  // reported NOTHING - an outlier arm passing as agreement, which is the one answer this instrument
  // exists to prevent. The module's own documentation already calls the outlier the finding, so the
  // weakest pair per axis is judged too, by name, and reported even when the mean is healthy.
  for (const axis of IDENTITY_AXES) {
    const minimum = budget?.[axis];
    const weakest = identity.weakest_by_axis?.[axis];
    if (typeof minimum !== 'number' || !weakest || typeof weakest[axis] !== 'number') continue;
    if (weakest[axis] >= minimum) continue;
    // Only reported when the mean did NOT already report this axis, so one bad arm produces one finding
    // per axis rather than one from the mean and one from the pair saying the same thing twice.
    if (findings.some((finding) => finding.axis === axis)) continue;
    findings.push({
      code: PARITY_CODES.CROSS_ARM_PAIR_BELOW_BUDGET,
      axis,
      actual: weakest[axis],
      minimum,
      pair: `${weakest.a}/${weakest.b}`,
      viewport: measured[0].viewport,
      message: `the mean for ${axis} is ${identity.identity[axis]}, within the ${minimum} budget, but ${weakest.a}/${weakest.b} agree at only ${weakest[axis]} - the mean is hiding that pair`,
    });
  }
  // The axes are handed back under `identity` so a reader gets the numbers, not a wrapper named
  // `identity.identity.overall`; the pairwise detail is kept alongside because a finding names a pair that
  // a reader must be able to look up.
  return { identity: identity.identity, pairwise: identity.pairwise, weakest_pair: identity.weakest_pair, findings };
}

/**
 * Do the arms use the palette the reference boards declare?
 *
 * The boards are images, and diffing a rendered page against a mockup JPEG is not a meaningful pixel
 * comparison. What IS checkable is what the boards declare: their README states the palette as hex, and
 * a page's computed tokens either are those values or are not. Divergence here is reported, not
 * treated as a failure, because on this repository it is a known and expected state with its own
 * follow-up work - the generated arms use the pilot palette, so they do not match the boards yet.
 */
export function paletteFindings({ arms, declared }) {
  if (!declared || Object.keys(declared).length === 0) {
    return [
      {
        code: PARITY_CODES.PALETTE_UNDECLARED,
        message: 'no declared palette was supplied, so no arm can be compared against the reference boards',
      },
    ];
  }
  const findings = [];
  for (const arm of arms) {
    if (!arm.signature) continue;
    for (const [name, expected] of Object.entries(declared)) {
      const actual = normaliseColour(arm.tokens?.[name]);
      if (actual === '') {
        findings.push({
          code: PARITY_CODES.PALETTE_DIVERGES,
          arm: arm.framework,
          token: name,
          expected: normaliseColour(expected),
          actual: null,
          message: `${arm.framework} declares no ${name}, so it cannot satisfy the ${normaliseColour(expected)} the reference boards declare`,
        });
        continue;
      }
      if (actual !== normaliseColour(expected)) {
        findings.push({
          code: PARITY_CODES.PALETTE_DIVERGES,
          arm: arm.framework,
          token: name,
          expected: normaliseColour(expected),
          actual,
          message: `${arm.framework} uses ${actual} for ${name} where the reference boards declare ${normaliseColour(expected)}`,
        });
      }
    }
  }
  return findings;
}

/**
 * A comparison the reader can audit: which arms were measured, at which widths, what the numbers were,
 * and what remains unmeasurable. `measured` and `missing` are sorted name LISTS rather than counts,
 * because a count cannot tell a duplicated arm from a complete set.
 */
export function paritySummary({ archetype, viewports, armsByViewport, budget }) {
  const viewportReports = viewports.map((requested) => {
    const arms = armsByViewport[requested.key] ?? [];
    const crossArm = crossArmFindings({ arms, budget });
    return {
      viewport: requested,
      measured: arms.filter((arm) => arm.signature).map((arm) => arm.framework).sort(),
      missing: arms.filter((arm) => !arm.signature).map((arm) => arm.framework).sort(),
      identity: crossArm.identity,
      pairwise: crossArm.pairwise ?? null,
      weakest_pair: crossArm.weakest_pair ?? null,
      findings: [...viewportFindings({ arms, requested }), ...crossArm.findings],
    };
  });
  return {
    archetype,
    budget,
    viewports: viewportReports,
    findings: viewportReports.flatMap((report) => report.findings),
  };
}

export { IDENTITY_AXES };
