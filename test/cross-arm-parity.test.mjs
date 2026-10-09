/**
 * The verdict layer of the cross-arm parity instrument is pure, so it is tested without a browser.
 *
 * The tests that matter here are the ones that prove a reading BITES: an assertion that identical arms
 * are clean is worth little on its own, so each check below is paired with a synthetic drift that the
 * same assertion must reject. A parity instrument that cannot fail is a parity instrument that cannot
 * report.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARITY_CODES,
  crossArmFindings,
  normaliseColour,
  paletteFindings,
  paritySummary,
  viewportFindings,
} from '../src/eval/parity.mjs';

/** A signature with the fields the conformance comparators read, parameterised so drift can be injected. */
function signature({ width = 1280, height = 900, title = 'Booking', boxHeight = 0.1, controls = 5 } = {}) {
  return {
    title,
    viewport: { width, height },
    nodes: [
      { tag: 'main', depth: 1, type: null, name: null, role: null },
      { tag: 'form', depth: 2, type: null, name: null, role: null },
      { tag: 'h1', depth: 2, type: null, name: null, role: null },
    ],
    boxes: [
      { tag: 'main', x: 0, y: 0, w: 1, h: boxHeight },
      { tag: 'form', x: 0.1, y: 0.1, w: 0.8, h: boxHeight },
    ],
    labels: [{ for: 'name', text: 'Name' }],
    controls: Array.from({ length: controls }, (_, index) => ({
      tag: 'input',
      type: 'text',
      name: `field${index}`,
      label: `Field ${index}`,
    })),
    headings: ['Book a place'],
  };
}

function arm(framework, options) {
  return { framework, signature: signature(options) };
}

const BUDGET = { structural: 0.75, geometry: 0.9, controls: 0.95, overall: 0.8 };

test('colour comparison equates the forms a browser reports with the form a source writes', () => {
  // The whole point: the boards declare hex, the browser reports rgb(), and they are the same colour.
  assert.equal(normaliseColour('#0f172a'), normaliseColour('rgb(15, 23, 42)'));
  assert.equal(normaliseColour('#fff'), '#ffffff');
  assert.equal(normaliseColour('rgb(16, 185, 129)'), '#10b981');
  assert.equal(normaliseColour('  #10B981  '), '#10b981');
  // Fail closed: an unrecognised syntax is compared literally rather than silently treated as equal.
  assert.notEqual(normaliseColour('color(display-p3 0 0 0)'), normaliseColour('#000000'));
  assert.equal(normaliseColour(null), '');
  assert.equal(normaliseColour(undefined), '');
});

test('a viewport that did not take effect is a finding, not a quiet measurement', () => {
  const requested = { key: '390x844', width: 390, height: 844 };
  const honest = viewportFindings({ arms: [arm('raw', { width: 390, height: 844 })], requested });
  assert.deepEqual(honest, [], 'an arm at the requested size must not be reported');

  // Control: the same arm measured at the wrong width must be caught, and must say both numbers.
  const wrong = viewportFindings({ arms: [arm('raw', { width: 1280, height: 900 })], requested });
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].code, PARITY_CODES.VIEWPORT_NOT_APPLIED);
  assert.deepEqual(wrong[0].actual, { width: 1280, height: 900 });
  assert.deepEqual(wrong[0].expected, { width: 390, height: 844 });

  // Absence fails closed too: no signature at all is a finding, not a missing row.
  const unmeasured = viewportFindings({ arms: [{ framework: 'vue' }], requested });
  assert.equal(unmeasured.length, 1);
  assert.equal(unmeasured[0].code, PARITY_CODES.ARM_UNMEASURED);
});

test('arms that agree produce no budget findings, and measured drift does', () => {
  const agree = crossArmFindings({ arms: [arm('raw'), arm('hono'), arm('react')], budget: BUDGET });
  assert.deepEqual(agree.findings, [], 'three arms with the same signature must be within budget');
  assert.equal(agree.identity.overall, 1, 'identical arms must score a perfect identity');

  // Control: one arm with different geometry and a different control count must be below budget,
  // and the finding must name the pair and the axis rather than just assert disagreement.
  const drifted = crossArmFindings({
    arms: [arm('raw'), arm('hono'), arm('react', { boxHeight: 0.5, controls: 1 })],
    budget: BUDGET,
  });
  assert.ok(drifted.findings.length > 0, 'a drifted arm must produce a finding');
  const below = drifted.findings.filter((finding) => finding.code === PARITY_CODES.CROSS_ARM_BELOW_BUDGET);
  assert.ok(below.length > 0, 'the drifted arm must be reported as below budget');
  assert.ok(
    below.every((finding) => typeof finding.axis === 'string' && typeof finding.actual === 'number'),
    'every below-budget finding must name the axis and the actual reading',
  );
  assert.ok(
    below.some((finding) => typeof finding.pair === 'string' && finding.pair.includes('/')),
    'the weakest agreement must be attributable to a named arm pair',
  );
});

test('an outlier arm is reported even when the mean is within budget', () => {
  // The case that made this instrument wrong before it was right: with seven arms there are twenty-one
  // pairs, so ONE diverged arm is averaged away. Measured on the real arms, a pair disagreeing at 0.66
  // left the mean at 0.903 - above the 0.9 budget - and the instrument reported nothing, which is an
  // outlier arm passing as agreement. The drift below is chosen from measurement, not taste: at
  // boxHeight 0.13 the mean geometry is 0.9649, comfortably within budget, while the weakest pair is
  // below it. Any larger drift and the mean would fail too, which would test the old path instead.
  const seven = ['raw', 'hono', 'react', 'preact', 'vue', 'webcomponents', 'svelte'];
  const arms = seven.map((framework) => (framework === 'preact' ? arm(framework, { boxHeight: 0.13 }) : arm(framework)));
  const { identity, findings } = crossArmFindings({ arms, budget: BUDGET });

  // The premise of the test: the MEAN is healthy, so the old mean-only check could not have fired.
  assert.ok(identity.geometry >= BUDGET.geometry, `premise: the mean geometry ${identity.geometry} is within budget`);
  assert.equal(identity.overall >= BUDGET.overall, true, 'premise: the mean overall is within budget');
  assert.ok(
    findings.every((finding) => finding.code !== PARITY_CODES.CROSS_ARM_BELOW_BUDGET),
    'premise: no mean-based finding fires, so only the outlier path can report this',
  );

  // The assertion: the diverged arm is named, with the pair and the number.
  const outliers = findings.filter((finding) => finding.code === PARITY_CODES.CROSS_ARM_PAIR_BELOW_BUDGET);
  assert.ok(outliers.length > 0, 'the outlier must be reported even though the mean is within budget');
  assert.ok(
    outliers.every((finding) => typeof finding.pair === 'string' && finding.pair.split('/').includes('preact')),
    'every outlier finding must name the diverged arm in the pair',
  );
  assert.ok(
    outliers.some((finding) => finding.axis === 'geometry' && finding.actual < BUDGET.geometry),
    'the geometry outlier must be reported with its actual reading',
  );

  // Control: with no outlier there is still nothing to report, so the check is not simply always on.
  const clean = crossArmFindings({ arms: seven.map((framework) => arm(framework)), budget: BUDGET });
  assert.deepEqual(clean.findings, [], 'seven agreeing arms must still report nothing');
});

test('comparing nothing is reported as vacuous rather than perfect', () => {
  const one = crossArmFindings({ arms: [arm('raw')], budget: BUDGET });
  assert.equal(one.identity, null);
  assert.equal(one.findings.length, 1);
  assert.equal(one.findings[0].code, PARITY_CODES.CROSS_ARM_DEGENERATE);

  // One function, one return shape: the degenerate case must not hand back a bare array.
  assert.ok(Array.isArray(one.findings), 'findings are always an array');
  assert.ok('identity' in one, 'the shape is stable in both branches');

  const none = crossArmFindings({ arms: [], budget: BUDGET });
  assert.equal(none.findings[0].code, PARITY_CODES.CROSS_ARM_DEGENERATE);
});

test('palette divergence against the reference boards is reported per arm and per token', () => {
  const declared = { '--bg': '#0f172a', '--accent': '#10b981' };
  const matching = paletteFindings({
    arms: [{ framework: 'raw', signature: signature(), tokens: { '--bg': 'rgb(15, 23, 42)', '--accent': '#10B981' } }],
    declared,
  });
  assert.deepEqual(matching, [], 'a page using the declared palette must not be reported');

  // Control 1: the pilot palette the generated arms actually use must diverge, with both values named.
  const pilot = paletteFindings({
    arms: [{ framework: 'raw', signature: signature(), tokens: { '--bg': '#ffffff', '--accent': '#1b4fd8' } }],
    declared,
  });
  assert.equal(pilot.length, 2);
  assert.ok(pilot.every((finding) => finding.code === PARITY_CODES.PALETTE_DIVERGES));
  const background = pilot.find((finding) => finding.token === '--bg');
  assert.equal(background.expected, '#0f172a');
  assert.equal(background.actual, '#ffffff');

  // Control 2: a token the page never set is a finding, not an absent row.
  const missing = paletteFindings({
    arms: [{ framework: 'raw', signature: signature(), tokens: {} }],
    declared,
  });
  assert.equal(missing.length, 2);
  assert.ok(missing.every((finding) => finding.actual === null));

  // Control 3: no declared palette at all cannot be silently clean.
  const undeclared = paletteFindings({ arms: [{ framework: 'raw', signature: signature(), tokens: {} }], declared: {} });
  assert.equal(undeclared.length, 1);
  assert.equal(undeclared[0].code, PARITY_CODES.PALETTE_UNDECLARED);
});

test('the summary reports arm names as sets, so a duplicated arm cannot pass for a complete one', () => {
  const viewports = [{ key: '390x844', width: 390, height: 844 }];
  const summary = paritySummary({
    archetype: 'booking',
    viewports,
    armsByViewport: {
      '390x844': [
        arm('raw', { width: 390, height: 844 }),
        arm('hono', { width: 390, height: 844 }),
        arm('react', { width: 390, height: 844 }),
      ],
    },
    budget: BUDGET,
  });
  assert.deepEqual(summary.viewports[0].measured, ['hono', 'raw', 'react']);
  assert.deepEqual(summary.viewports[0].missing, []);
  assert.deepEqual(summary.findings, []);

  // Control: the same COUNT of arms with one duplicated and one absent must not read as complete.
  const duplicated = paritySummary({
    archetype: 'booking',
    viewports,
    armsByViewport: {
      '390x844': [
        arm('raw', { width: 390, height: 844 }),
        arm('raw', { width: 390, height: 844 }),
        arm('react', { width: 390, height: 844 }),
      ],
    },
    budget: BUDGET,
  });
  assert.notDeepEqual(duplicated.viewports[0].measured, summary.viewports[0].measured);
  // The lengths are EQUAL, which is the point: a count would have called these two sets the same.
  assert.equal(duplicated.viewports[0].measured.length, summary.viewports[0].measured.length);
});
