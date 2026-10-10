/**
 * The verdict layer of the cross-arm parity instrument is pure, so it is tested without a browser.
 *
 * The tests that matter here are the ones that prove a reading BITES: an assertion that identical arms
 * are clean is worth little on its own, so each check below is paired with a synthetic drift that the
 * same assertion must reject. A parity instrument that cannot fail is a parity instrument that cannot
 * report.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  ADVISORY_CODES,
  REFERENCE_PALETTE,
  assertFindingsConsistent,
  assembleFindings,
  exitCodeFor,
  parseArgs,
} from '../scripts/check-cross-arm-parity.mjs';
import {
  ARM_PIXEL_CODES,
  PARITY_CODES,
  armPixelFindings,
  armPixelPairs,
  collapsePaletteFindings,
  crossArmFindings,
  normaliseColour,
  paletteFindings,
  paritySummary,
  translateIdentityCode,
  viewportFindings,
} from '../src/eval/parity.mjs';
import { IDENTITY_CODES, identityFindings } from '../src/eval/conformance.mjs';

const ROOT = resolve(import.meta.dirname, '..');

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
  // Number.isFinite, not typeof: `typeof NaN === 'number'`, so a finding carrying a NaN reading satisfied the
  // old check while telling a reader nothing. Found by the mwg-train-0xk sweep (mwg-train-0xk).
  assert.ok(
    below.every((finding) => typeof finding.axis === 'string' && Number.isFinite(finding.actual)),
    'every below-budget finding must name the axis and a real (finite) reading',
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

/**
 * The clause of the boards' Theme Palette line that states a colour, so the guard can check the ROLE and
 * not merely that the hex appears somewhere in the file. A substring check passes when the palette swaps
 * roles, or when the old value survives in a changelog beside the new one.
 */
export function paletteClauseFor(paletteLine, hex) {
  return paletteLine.split(',').find((clause) => clause.toLowerCase().includes(hex.toLowerCase())) ?? '';
}

/** Which word the boards' README uses for each role, so the token-to-role mapping is stated once. */
export const PALETTE_ROLES = Object.freeze({
  '--bg': 'background',
  'body-background': 'background',
  '--surface': 'surfaces',
  '--accent': 'accents',
  '--muted': 'text',
});

test('the declared palette is still the one the reference boards state, BY ROLE', () => {
  // The instrument hard-codes the boards' palette as a literal, because which hex is a background rather
  // than a surface is a semantic mapping a regex should not be guessing at. This is the guard that keeps
  // the literal honest. A cross-family review caught the first version of this test asserting only that
  // each hex appears SOMEWHERE in the README, which passes if the roles are swapped. So the role word is
  // checked in the same clause as the value.
  const readme = readFileSync(new URL('../docs/design/archetypes/booking/README.md', import.meta.url), 'utf8');
  const paletteLine = readme.split('\n').find((line) => /theme palette/i.test(line));
  assert.ok(paletteLine, "the boards' README no longer states a Theme Palette, so there is nothing to guard");

  for (const [token, hex] of Object.entries(REFERENCE_PALETTE)) {
    const clause = paletteClauseFor(paletteLine, hex);
    assert.notEqual(clause, '', `reference palette ${token} ${hex} is no longer stated in the boards' README`);
    const role = PALETTE_ROLES[token];
    assert.ok(
      clause.toLowerCase().includes(role),
      `${hex} is stated in the README but not as the ${role} the palette claims it is: "${clause.trim()}"`,
    );
  }

  // Control: the guard must be able to fail. A clause pairing the right hex with the WRONG role is
  // rejected, which is the exact swap the substring version of this test allowed through.
  const swapped = '- **Theme Palette:** Deep slate surfaces (`#0f172a`), card background (`#1e293b`).';
  assert.equal(paletteClauseFor(swapped, '#0f172a').toLowerCase().includes('background'), false);
  assert.equal(paletteClauseFor(swapped, '#1e293b').toLowerCase().includes('surfaces'), false);
});

test('a diverged arm is named whether the mean hides it or not', () => {
  // The inversion a cross-family review caught in the first version of the outlier logic: `identityFindings`
  // messages contain no arm names, and the pair finding was suppressed whenever the mean also failed - so
  // SEVERE drift reported which axis moved but not which arm, while MILD drift named it. Both cases are
  // asserted here, because the severe one is the one that matters and the one that used to be silent.
  const seven = ['raw', 'hono', 'react', 'preact', 'vue', 'webcomponents', 'svelte'];

  const severe = crossArmFindings({
    arms: seven.map((framework) => (framework === 'preact' ? arm(framework, { boxHeight: 0.5 }) : arm(framework))),
    budget: BUDGET,
  });
  assert.ok(severe.identity.geometry < BUDGET.geometry, 'premise: the mean fails at this drift');
  const severeNamed = severe.findings.filter((finding) => finding.pair && finding.pair.split('/').includes('preact'));
  assert.ok(severeNamed.length > 0, 'severe drift must still name the arm responsible, not only the axis');
  assert.ok(
    severeNamed.every((finding) => typeof finding.message === 'string' && finding.message.includes('preact')),
    'the arm must be named in the message a reader actually sees',
  );

  const mild = crossArmFindings({
    arms: seven.map((framework) => (framework === 'preact' ? arm(framework, { boxHeight: 0.13 }) : arm(framework))),
    budget: BUDGET,
  });
  assert.ok(mild.identity.geometry >= BUDGET.geometry, 'premise: the mean passes at this drift');
  const mildNamed = mild.findings.filter((finding) => finding.pair && finding.pair.split('/').includes('preact'));
  assert.ok(mildNamed.length > 0, 'mild drift hidden by the mean must also name the arm');
});

test('an arm that produced no signature is reported, not dropped', () => {
  // `parity.mjs` promises that absence is never silence. A cross-family review caught that promise being
  // unreachable: the live instrument threw instead of recording the arm, and a missing arm could not
  // appear in `missing` because it was never added in the first place.
  const viewports = [{ key: '390x844', width: 390, height: 844 }];
  const summary = paritySummary({
    archetype: 'booking',
    viewports,
    armsByViewport: {
      '390x844': [
        arm('raw', { width: 390, height: 844 }),
        { framework: 'vue', viewport: '390x844', signature: null, error: 'server did not become healthy' },
      ],
    },
    budget: BUDGET,
  });
  assert.deepEqual(summary.viewports[0].measured, ['raw']);
  assert.deepEqual(summary.viewports[0].missing, ['vue'], 'an unmeasured arm must be listed as missing, not absent');
  assert.ok(
    summary.findings.some((finding) => finding.code === PARITY_CODES.ARM_UNMEASURED),
    'an unmeasured arm must produce ARM_UNMEASURED',
  );
});

test('palette findings are collapsed across widths, but not across real differences', () => {
  const same = [
    { arm: 'raw', token: '--bg', expected: '#0f172a', actual: '#ffffff' },
    { arm: 'raw', token: '--bg', expected: '#0f172a', actual: '#ffffff' },
    { arm: 'raw', token: '--bg', expected: '#0f172a', actual: '#ffffff' },
  ];
  assert.equal(collapsePaletteFindings(same).length, 1, 'the same fact at three widths is one fact');

  // Control: a token that differs BY WIDTH is not the same fact and must survive the collapse.
  const differs = [
    { arm: 'raw', token: '--bg', expected: '#0f172a', actual: '#ffffff' },
    { arm: 'raw', token: '--bg', expected: '#0f172a', actual: '#000000' },
  ];
  assert.equal(collapsePaletteFindings(differs).length, 2, 'a token that differs between widths is two facts');
});

test('arm pixel pairs cover every arm once and never pair an arm with itself', () => {
  const arms = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((framework) => ({ framework, screenshot: `${framework}.png`, metrics: {} }));
  const pairs = armPixelPairs({ viewport: '1280x900', arms });
  assert.equal(pairs.length, 21, 'seven arms make twenty-one unordered pairs');
  assert.equal(new Set(pairs.map((pair) => `${pair.a}/${pair.b}`)).size, 21, 'no pair may be repeated in the other order');
  assert.ok(pairs.every((pair) => pair.a !== pair.b), 'an arm must never be compared against itself');
});

test('a screenshot whose analysis FAILED is unmeasured, not a zero profile', () => {
  // Reproduces a review finding exactly, in the file that owns these helpers. `analyseImage` failing stores
  // `{ error }`, which is TRUTHY, so a guard testing only for null let a failed analysis be read as an
  // all-zero profile: the arm scored a fabricated 0.6333 against a healthy one and produced a DIVERGES
  // finding naming two screenshots of which only one had been measured. Only `metrics: null` was covered.
  const healthy = { rowLuminance: Array(32).fill(0).map((v, i) => (i < 8 ? 0.1 : 0.9)), bandLuminance: Array(32).fill(0).map((v, i) => (i < 8 ? 0.1 : 0.9)) };
  const arms = [
    { framework: 'good', screenshot: 'good.png', metrics: healthy },
    { framework: 'failed', screenshot: 'failed.png', metrics: { error: 'timeout waiting for analyseImage' } },
  ];
  const pairs = armPixelPairs({ viewport: '1280x900', arms });
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].error, 'a failed analysis must count as unmeasured, not as a zero profile');
  const { findings, measured } = armPixelFindings({ pairs: pairs.map((pair) => ({ ...pair, distance: pair.error ? null : 0.6333 })), budget: 0.05 });
  assert.equal(measured, 0, 'a failed measurement must not be counted as compared');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, ARM_PIXEL_CODES.ARM_PIXEL_PAIR_UNMEASURED, 'the truth is UNMEASURED, not DIVERGES');
});

test('an arm that produced no screenshot is a reported pair, not a missing one', () => {
  const arms = [
    { framework: 'a', screenshot: 'a.png', metrics: {} },
    { framework: 'b', screenshot: null, metrics: null },
  ];
  const pairs = armPixelPairs({ viewport: '1280x900', arms });
  assert.equal(pairs.length, 1, 'the pair must still exist');
  assert.ok(pairs[0].error, 'and it must say why it cannot be compared');
  const { findings } = armPixelFindings({ pairs: pairs.map((pair) => ({ ...pair, distance: null })), budget: 0.05 });
  assert.equal(findings.length, 1, 'an arm with no screenshot must produce a finding');
  assert.equal(findings[0].code, ARM_PIXEL_CODES.ARM_PIXEL_PAIR_UNMEASURED);
});

test('arm pixel drift is reported with BOTH screenshots named, and clean pairs are silent', () => {
  const clean = { viewport: '1280x900', a: 'a', b: 'b', a_shot: 'a.png', b_shot: 'b.png', distance: 0.01, error: null };
  const drifted = { viewport: '1280x900', a: 'a', b: 'c', a_shot: 'a.png', b_shot: 'c.png', distance: 0.5, error: null };
  const { findings, nearest, worst, measured } = armPixelFindings({ pairs: [clean, drifted], budget: 0.05 });
  assert.equal(measured, 2);
  assert.equal(findings.length, 1, 'only the pair over budget may be reported');
  assert.equal(findings[0].pair.join('/'), 'a/c');
  assert.ok(findings[0].message.includes('a.png') && findings[0].message.includes('c.png'), 'both screenshots must be named');
  // The nearest pair is reported even when nothing is over budget, because it is the run's own empirical
  // floor - the evidence that the budget is calibrated rather than chosen.
  assert.equal(nearest.distance, 0.01, 'the nearest pair must be exposed as the floor');
  assert.equal(worst.distance, 0.5, 'and the worst pair must be named');
});

test('a missing budget is refused rather than reported as clean arms', () => {
  // Same hole as the identity judge, reached through the parity entry point (mwg-train-zey): its own
  // outlier loop reads budget?.[axis] and skips silently when that is not a number, and it delegates to
  // the identity judge. With no budget at all, arms that disagree are reported as agreeing.
  const arms = [arm('raw'), arm('hono'), arm('react')];
  const real = crossArmFindings({ arms, budget: BUDGET });
  assert.deepEqual(real.findings, [], 'premise: these arms are within budget when a budget is supplied');
  for (const budget of [undefined, null, {}]) {
    assert.throws(
      () => crossArmFindings({ arms, budget }),
      TypeError,
      `budget ${JSON.stringify(budget)} must be refused rather than produce a clean reading`,
    );
  }
});

test('an identity code the parity layer does not know is named, not read as a mean failure', () => {
  // The translation used to be a two-branch ternary with a fallback of CROSS_ARM_BELOW_BUDGET, which
  // happens to be right for IDENTITY_BELOW_BUDGET and silently wrong for anything else - a future code
  // from the identity layer would be published as "the family mean left its budget", which is exactly the
  // mislabel that mwg-train-bmu's seam bug produced one level in. An unknown code must be visible as
  // unknown, and must carry the code it came from.
  assert.equal(translateIdentityCode('IDENTITY_BELOW_BUDGET'), PARITY_CODES.CROSS_ARM_BELOW_BUDGET);
  assert.equal(translateIdentityCode('IDENTITY_PAIR_BELOW_BUDGET'), PARITY_CODES.CROSS_ARM_PAIR_BELOW_BUDGET);
  assert.equal(translateIdentityCode('IDENTITY_DEGENERATE'), PARITY_CODES.CROSS_ARM_DEGENERATE);
  const unknown = translateIdentityCode('IDENTITY_SOMETHING_NEW');
  assert.notEqual(
    unknown,
    PARITY_CODES.CROSS_ARM_BELOW_BUDGET,
    'an unmapped code must not be published as a mean that left its budget',
  );
  assert.equal(unknown, PARITY_CODES.CROSS_ARM_UNMAPPED_IDENTITY_CODE);
  // And the code we could not translate must still be readable somewhere, or a future reader sees
  // "unmapped" with no way to find out what was unmapped.
  // Three IDENTICAL arms produce NO findings, so this .every() returned true without running its body - a
  // shape check on an empty list. It now uses a drifted arm and asserts the premise, matching the test below
  // it (mwg-train-0xk).
  const carried = crossArmFindings({
    arms: [arm('raw'), arm('hono'), arm('react', { boxHeight: 0.5, controls: 1 })],
    budget: BUDGET,
  });
  assert.ok(carried.findings.length > 0, 'premise: a drifted arm must produce findings for this to inspect');
  assert.ok(
    carried.findings.every((finding) => finding.identity_code === undefined),
    'a translated finding must not carry a redundant identity_code',
  );
});

// NOTE: the guard that used to sit here scanned the SOURCE for the literal shape `code: 'IDENTITY_...'`.
// A review found that a fourth code written as a constant reference would slip past it, so it is replaced
// by the set-based guard below, which reads the published IDENTITY_CODES list and requires the emissions
// to come from it. It is worth recording that the old guard did fail loudly when the emission syntax
// changed - but only because it was scanning for that exact syntax, which is the weakness, not the virtue.
test('the unmapped fallback is literal: inherited object keys are not translations', () => {
  // IDENTITY_TO_PARITY is a normal object, so `IDENTITY_TO_PARITY['constructor']` finds the INHERITED
  // constructor and translateIdentityCode hands back a function instead of the unmapped code. Today no
  // emission is named after a prototype member, so nothing is broken - but the fallback claims to cover
  // "anything unmapped", and it does not cover anything that happens to be inherited.
  for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
    assert.equal(
      translateIdentityCode(inherited),
      PARITY_CODES.CROSS_ARM_UNMAPPED_IDENTITY_CODE,
      `"${inherited}" is not a translation and must resolve to the unmapped code`,
    );
  }
});

test('identity_code is ABSENT on a translated finding, not merely undefined', () => {
  // The contract is "present only when translation failed". `{ identity_code: undefined }` satisfies a
  // value check while still creating an own property, so the assertion has to be about the property.
  // A DRIFTED arm, so there is a finding to inspect. Three agreeing arms produce none, and a loop over an
  // empty list passes without checking anything - which is how this assertion was vacuous on the first run.
  const translated = crossArmFindings({
    arms: [arm('raw'), arm('hono'), arm('react', { boxHeight: 0.5, controls: 1 })],
    budget: BUDGET,
  });
  assert.ok(translated.findings.length > 0, 'premise: the drifted arm must produce a finding to inspect');
  for (const finding of translated.findings) {
    assert.equal(
      Object.hasOwn(finding, 'identity_code'),
      false,
      `a translated finding must not carry an identity_code property at all: ${finding.code}`,
    );
  }
});

test('the identity layer publishes its code list, so the map is checked against a set and not a syntax', () => {
  // The class guard scanned for the literal shape `code: 'IDENTITY_...'`, which a fourth emission written
  // as a constant reference would slip past. The codes are now a shared frozen list that identityFindings
  // itself emits from, and that list is what the map is checked against.
  assert.ok(Array.isArray(IDENTITY_CODES) || typeof IDENTITY_CODES === 'object', 'IDENTITY_CODES must be exported');
  const codes = Object.values(IDENTITY_CODES).sort();
  assert.ok(codes.length >= 3, `expected several identity codes, found ${codes.join(', ')}`);
  assert.deepEqual(
    codes.filter((code) => translateIdentityCode(code) === PARITY_CODES.CROSS_ARM_UNMAPPED_IDENTITY_CODE),
    [],
    `every published identity code must be translated; unmapped: ${codes.join(', ')}`,
  );
  // And the source must emit from that list rather than from free-floating literals, or the list is
  // decoration that a new code can bypass.
  const source = readFileSync(join(ROOT, 'src/eval/conformance.mjs'), 'utf8');
  const literals = [...new Set([...source.matchAll(/code: '(IDENTITY_[A-Z_]+)'/g)].map((match) => match[1]))].sort();
  assert.deepEqual(literals, [], `identity codes must come from IDENTITY_CODES, found literals: ${literals.join(', ')}`);
});

test('a budget with a non-finite axis is refused, because the two layers disagree about it', () => {
  // Found by the mwg-train-7yp confirm review. A MIXED budget passes requireBudget, which throws only when
  // zero axes are numeric, and then the two layers do opposite wrong things: identityFindings silently skips
  // the NaN axis because `actual < NaN` is false, while the parity outlier loop proceeds because
  // `typeof NaN === 'number'` and `weakest[axis] >= NaN` is always false - so it publishes
  // CROSS_ARM_PAIR_BELOW_BUDGET with `minimum: NaN` and a message claiming the mean is "within the NaN
  // budget". Silence in one layer, a fabricated judgement in the other.
  //
  // This REVERSES a behaviour the 7yp review recorded as passing - that a mixed budget still judges its
  // finite axis. That behaviour is what produces the disagreement, so refusing the budget outright is the
  // fix rather than a regression. IDENTITY_BUDGET and ARM_PIXEL_BUDGET are complete literals, so no
  // shipped caller sends a partial or non-finite budget.
  const identity = { identity: { structural: 0.5 }, weakest_by_axis: {}, weakest_pair: null, degenerate: false };
  assert.equal(identityFindings(identity, { structural: 0.9 }).length, 1, 'a finite budget must still judge');
  for (const budget of [{ structural: 0.75, geometry: NaN }, { structural: 0.75, geometry: Infinity }]) {
    assert.throws(
      () => identityFindings(identity, budget),
      TypeError,
      `a budget with a non-finite axis must be refused, got ${JSON.stringify(budget)}`,
    );
  }
  // And the same budget must not reach the parity layer, where it would fabricate a finding.
  const arms = [arm('raw'), arm('hono'), arm('react')];
  for (const budget of [{ ...BUDGET, geometry: NaN }, { ...BUDGET, geometry: Infinity }]) {
    // The ERROR TYPE alone is not the check. Reverting the message to a bare JSON.stringify - which renders
    // NaN and Infinity as `null`, the exact defect the replacer was added for - passes a TypeError-only
    // assertion. So assert what the message SAYS: the offending axis, and the value as written rather than
    // null. This is the same shape as the ReferenceError that nearly satisfied assert.throws earlier.
    assert.throws(
      () => crossArmFindings({ arms, budget }),
      (error) => {
        assert.match(error.message, /geometry/, 'the refusal must name the offending axis');
        assert.match(error.message, /"NaN"|"Infinity"/, 'and must render the non-finite value as written');
        assert.doesNotMatch(error.message, /"geometry":null/, 'never as null, which reads as an empty floor');
        return true;
      },
      'a non-finite axis must be refused at the parity entry point too, not turned into a finding',
    );
  }
});

test('an arm that rendered a blank page is reported, not allowed to abort the whole report', () => {
  // captureSignature returns a TRUTHY signature for a blank page - it carries the viewport, and nodes,
  // boxes and controls are empty. So the blank arm passed crossArmFindings' `arm.signature` filter and
  // reached conformanceScore, which refuses an unmeasurable signature: the TypeError propagated out of
  // crossArmFindings and took every viewport, palette and pixel finding with it. One blank arm cost the
  // entire report. parity.mjs's own contract is that an absence is a finding with a code, never a missing
  // row, and ARM_UNMEASURED already exists for the arm-with-no-signature case.
  const blankViewport = { key: 'desktop', width: 1280, height: 900 };
  const blank = { viewport: blankViewport, nodes: [], boxes: [], controls: [] };
  const arms = [arm('raw'), arm('hono'), arm('react')];
  // one DRIFTED arm, so there is a real finding that must survive the blank one
  arms.push(arm('drifted', { boxHeight: 0.5, controls: 1 }));
  arms.push({ framework: 'blank-render', signature: blank });

  const result = crossArmFindings({ arms, budget: BUDGET });
  const unmeasured = result.findings.filter((finding) => finding.code === 'ARM_UNMEASURED');
  assert.deepEqual(unmeasured.map((finding) => finding.arm), ['blank-render'], 'the blank arm must be named as unmeasured');
  assert.ok(
    result.findings.some((finding) => finding.code !== 'ARM_UNMEASURED'),
    'and the findings for the arms that DID render must survive it',
  );
});

test('a viewport where every arm rendered blank is degenerate, not a crash', () => {
  const blankViewport = { key: 'mobile', width: 390, height: 844 };
  const blank = { viewport: blankViewport, nodes: [], boxes: [], controls: [] };
  const arms = ['a', 'b', 'c'].map((framework) => ({ framework, signature: blank }));
  const result = crossArmFindings({ arms, budget: BUDGET });
  assert.equal(result.identity, null);
  assert.deepEqual(result.findings.map((finding) => finding.code), ['ARM_UNMEASURED', 'ARM_UNMEASURED', 'ARM_UNMEASURED', 'CROSS_ARM_DEGENERATE']);
});

test('a blank-rendered arm is not listed as measured in the viewport summary', () => {
  // The summary and the findings contradicted each other: crossArmFindings correctly reported a blank arm as
  // ARM_UNMEASURED, while paritySummary listed the same arm under `measured`, because both `measured` and
  // `missing` filtered on truthiness and a blank page still yields a truthy signature. A report that says an
  // arm was measured and that it measured nothing, in the same viewport, is worse than either alone.
  const requested = { key: 'desktop', width: 1280, height: 900 };
  const blank = { viewport: requested, nodes: [], boxes: [], controls: [] };
  const arms = [arm('raw'), arm('hono'), arm('react'), { framework: 'blank-render', signature: blank }];
  const summary = paritySummary({
    archetype: 'booking',
    viewports: [requested],
    armsByViewport: { desktop: arms },
    budget: BUDGET,
  });
  const viewport = summary.viewports[0];
  assert.deepEqual(viewport.missing, ['blank-render'], 'the blank arm belongs in missing, not measured');
  assert.deepEqual(viewport.measured, ['hono', 'raw', 'react'], 'and must not be counted as measured');
  assert.ok(
    viewport.findings.some((finding) => finding.code === 'ARM_UNMEASURED' && finding.arm === 'blank-render'),
    'while still being named as unmeasured in the findings',
  );
});

test('two palette findings that differ only by code both survive the collapse', () => {
  // mwg-train-oon. The dedup key was arm|token|expected|actual with no `code`, so two findings identical on
  // those four fields collapsed into one and the SECOND was republished under the FIRST one's code and
  // message. That is the same shape as mwg-train-7yp - a copy-through structure that assumes one specific
  // case - which is why it is worth fixing rather than only noting. Latent today: paletteFindings emits only
  // PALETTE_DIVERGES, so the second code below is synthetic, but a second code is one commit away.
  const base = { arm: 'react', token: 'accent', expected: '#10b981', actual: '#0ea472', viewport: { key: 'desktop' } };
  const collapsed = collapsePaletteFindings([
    { ...base, code: 'PALETTE_DIVERGES', message: 'the accent diverges' },
    { ...base, code: 'PALETTE_FUTURE_CODE', message: 'a different reason entirely' },
  ]);
  assert.equal(collapsed.length, 2, 'findings with different codes are different findings');
  assert.deepEqual(collapsed.map((finding) => finding.code).sort(), ['PALETTE_DIVERGES', 'PALETTE_FUTURE_CODE'].sort());
  assert.deepEqual(collapsed.map((finding) => finding.message).sort(), ['a different reason entirely', 'the accent diverges'].sort());

  // and the collapse still does what it is FOR: the same code at three widths is one finding that collects
  // the widths, rather than three findings.
  const threeWidths = ['desktop', 'mobile', 'tablet'].map((key) => ({ ...base, viewport: { key }, code: 'PALETTE_DIVERGES', message: 'the accent diverges' }));
  const collected = collapsePaletteFindings(threeWidths);
  assert.equal(collected.length, 1, 'the same finding at three widths is still one finding');
  // `viewports` holds the viewport OBJECTS, not their keys - my first version expected strings, so it failed
  // on the shape of the value rather than on the behaviour. The code was right; the expectation was wrong.
  assert.deepEqual(collected[0].viewports.map((viewport) => viewport.key).sort(), ['desktop', 'mobile', 'tablet']);
});

// -----------------------------------------------------------------------------------------------------------
// The gate policy, and the write separation. Both are pure decisions, so they are tested here rather than
// by running the browser.
//
// mwg-train-a90: `check:cross-arm-parity` rewrote two tracked documents every time it ran (timings change
// run to run, so the tree was never clean afterwards) and exited 0 while printing 140 FINDING lines.
// A report in the shape the script actually produces: the union PLUS each axis published beside it, which
// assertFindingsConsistent() checks the union against. Every synthetic report here must be built this way,
// because a report that publishes an axis the union omits is refused rather than scored.
function reportWith({ parity = [], palette = [], board = [], pixels = [] } = {}) {
  return {
    parity_findings: parity,
    palette_findings: palette,
    board_comparison: { findings: board },
    arm_pixels: { findings: pixels },
    findings: [...parity, ...palette, ...board, ...pixels],
  };
}

test('the exit code gates arm-against-arm parity but not the advisory board and palette drift', () => {
  const board = { code: 'BOARD_STRUCTURE_DIVERGES' };
  const palette = { code: 'PALETTE_DIVERGES' };

  assert.equal(exitCodeFor(reportWith()), 0);

  // The committed report's ACTUAL state: 140 advisory findings and no parity drift. Exiting non-zero here
  // would make this check red on every clean checkout for a divergence the report itself documents as
  // expected, which is how a gate stops being read. It must stay visible - the CLI prints it - but not fail.
  assert.equal(exitCodeFor(reportWith({ board: [board, board], palette: [palette] })), 0);
  // ...and --strict is what fails on it, which is what --strict always did.
  assert.equal(exitCodeFor(reportWith({ board: [board] }), { strict: true }), 1);

  // Parity gates, with or without --strict, on BOTH axes measured between arms.
  assert.equal(exitCodeFor(reportWith({ parity: [{ code: 'CROSS_ARM_BELOW_BUDGET' }] })), 1);
  assert.equal(exitCodeFor(reportWith({ parity: [{ code: 'CROSS_ARM_BELOW_BUDGET' }] }), { strict: true }), 1);
  assert.equal(
    exitCodeFor(reportWith({ pixels: [{ code: 'CROSS_ARM_PIXEL_PAIR_DIVERGES' }], palette: [palette], board: [board] })),
    1,
    'arm-against-arm PIXEL divergence is parity, not advisory, and must fail the default check',
  );

  // A code nobody has classified GATES, so a new measurement cannot become advisory by default...
  assert.equal(exitCodeFor(reportWith({ parity: [{ code: 'SOMETHING_NOBODY_CLASSIFIED' }] })), 1);
  // ...and a board that could not be read is an unmeasured comparison, not a passing one.
  assert.equal(exitCodeFor(reportWith({ board: [{ code: 'BOARDS_MISSING' }] })), 1);

  // A malformed report is an error, not a silent zero.
  assert.throws(() => exitCodeFor({}), TypeError);
  assert.throws(() => exitCodeFor(undefined), TypeError);
});

test('a report publishing a finding the union omits is refused, not scored', () => {
  // The union is assembled by hand in main() from four axes, which is precisely the wiring a unit test
  // cannot see. Two mutations that dropped an axis from that line passed the whole suite before this guard,
  // so the guard has to work on the DATA the gate is handed.
  const orphan = { code: 'CROSS_ARM_PIXEL_PAIR_DIVERGES' };
  const report = reportWith({ palette: [{ code: 'PALETTE_DIVERGES' }] });
  // Published as an axis finding but missing from the union: the gate would be scoring a different set from
  // the one the report publishes.
  report.arm_pixels.findings = [orphan];
  assert.throws(() => exitCodeFor(report), /absent from report\.findings/);
  assert.throws(() => assertFindingsConsistent(report), /absent from report\.findings/);

  // An axis deleted outright is an error too, even while the union still holds its findings - otherwise an
  // empty axis could be dropped silently.
  for (const key of ['parity_findings', 'palette_findings']) {
    const missing = reportWith();
    delete missing[key];
    assert.throws(() => assertFindingsConsistent(missing), /missing the .* axis/, `${key} must be required`);
  }
  const noBoard = reportWith();
  delete noBoard.board_comparison;
  assert.throws(() => assertFindingsConsistent(noBoard), /missing the .* axis/);
  const noPixels = reportWith();
  delete noPixels.arm_pixels;
  assert.throws(() => assertFindingsConsistent(noPixels), /missing the .* axis/);

  // The shapes the gate really sees are accepted, and the axes are reported back.
  assert.equal(assertFindingsConsistent(reportWith()), 'parity_findings=0 palette_findings=0 board_comparison.findings=0 arm_pixels.findings=0');
});

test('the committed report satisfies its own union, so the guard is not vacuous today', () => {
  // Data-driven rather than synthetic: this is the artifact the repository ships, and it carries 140
  // published findings. If the union ever stops matching what the report publishes, this fails on real data.
  const report = JSON.parse(readFileSync(join(ROOT, 'docs/eval/conformance/booking-cross-arm.json'), 'utf8'));
  const axes = assertFindingsConsistent(report);
  assert.match(axes, /palette_findings=35/, `the committed report must publish its palette axis, got ${axes}`);
  assert.match(axes, /board_comparison\.findings=105/, `the committed report must publish its board axis, got ${axes}`);
  assert.ok(report.findings.length >= 140, `the committed union must still carry every published finding, got ${report.findings.length}`);
  assert.equal(exitCodeFor(report), 0, 'the committed report has no arm-against-arm drift and must not fail');
});

test('assembleFindings requires all four axes and concatenates them in a fixed order', () => {
  const parity = [{ code: 'P' }];
  const palette = [{ code: 'A' }];
  const board = [{ code: 'B' }];
  const armPixels = [{ code: 'X' }];

  // The order is fixed rather than incidental: this union is scored and printed, so a reshuffle changes the
  // artifact even when the membership does not.
  assert.deepEqual(
    assembleFindings({ parity, palette, board, armPixels }),
    [...parity, ...palette, ...board, ...armPixels],
  );

  // EVERY axis key is required, and that is the whole point of extracting this from main(). While both
  // gating axes are empty, a mutation that drops one of them is invisible to a content-based guard, because
  // dropping an empty axis changes nothing the guard can see (mwg-train-qfg). Here it is a missing key.
  for (const key of ['parity', 'palette', 'board', 'armPixels']) {
    const args = { parity, palette, board, armPixels };
    delete args[key];
    // The message has to NAME the axis, not merely report that something is missing - a guard that says
    // "an axis is missing" when four axes exist is a guard whose reader still has to find it. A mutation
    // crossing two labels in the table above left this test green until the axis name was asserted.
    assert.throws(
      () => assembleFindings(args),
      new RegExp(`the ${key} axis must be an array, got no key at all`),
      `${key} must be required, empty or not, and named in the error`,
    );
  }

  // An empty array is still a valid AXIS. "this axis produced no findings" and "this axis was not passed"
  // are different claims, and only the second one is a wiring bug.
  assert.deepEqual(assembleFindings({ parity: [], palette: [], board: [], armPixels: [] }), []);

  // A non-array axis is refused rather than spread. `null` and `undefined` both spread to nothing, so
  // without this a caller passing a missing comparison would quietly contribute no findings - the same
  // silent omission in a different disguise.
  for (const bad of [null, 'findings', {}, 0, 7]) {
    assert.throws(() => assembleFindings({ parity: bad, palette: [], board: [], armPixels: [] }), TypeError, `${String(bad)} must be refused`);
  }
});

test('the committed report reassembles from its four axes, in published order', () => {
  // Real data, not synthetic: the shipped artifact carries 140 published findings across all four axes, and
  // this asserts its `findings` is EXACTLY the four axes concatenated in the published order. Equality
  // rather than membership, so an axis present with the right findings but in the WRONG PLACE fails here,
  // and so does an axis dropped from the union that has findings of its own.
  //
  // WHAT THIS TEST DOES NOT CATCH, stated because the first version of this comment claimed it caught the
  // a90 regression and a review disproved that by mutation: it cannot see a dropped axis that has NO
  // findings in this artifact. `parity_findings` and `arm_pixels.findings` are both empty in the committed
  // booking report, and concatenating an empty array changes nothing, so deleting `...armPixels` from the
  // union leaves this test GREEN. That is the same blindness this bead was filed about, reappearing one
  // layer up - which is precisely why the guard had to become a missing KEY rather than a shorter array.
  // The synthetic test above, with non-empty fixtures for all four axes, is what catches that mutation.
  // This one catches ordering and duplication. Both are worth having, and neither is the other.
  const report = JSON.parse(readFileSync(join(ROOT, 'docs/eval/conformance/booking-cross-arm.json'), 'utf8'));
  assert.deepEqual(
    assembleFindings({
      parity: report.parity_findings,
      palette: report.palette_findings,
      board: report.board_comparison?.findings,
      armPixels: report.arm_pixels?.findings,
    }),
    report.findings,
  );
});

test('the check does not write the committed report unless it is asked to', () => {
  // A check that rewrites the artifact it checks dirties the tree on every run, so a reader cannot tell
  // the tool's own output from a real edit.
  assert.equal(parseArgs([]).write, false, 'writing must be off by default');
  assert.equal(parseArgs(['--write']).write, true);
  assert.equal(parseArgs(['--archetype', 'booking', '--write']).write, true);
  // The other flags must not accidentally turn writing on.
  assert.equal(parseArgs(['--strict']).write, false);
  assert.equal(parseArgs(['--rerender']).write, false);
});

test('every finding code the committed report actually carries is classified deliberately', () => {
  // The committed report is the only place that shows which codes this pipeline really emits, so it is what
  // stops ADVISORY_CODES losing a real entry: drop one and that code's findings begin to GATE, turning the
  // check red on a condition the report documents as expected. The convention is the one ADVISORY_CODES
  // states - BOARD_* measures an arm against the boards, PALETTE_* against the declared tokens - and
  // anything else is arm-against-arm and gates.
  const report = JSON.parse(readFileSync(join(ROOT, 'docs/eval/conformance/booking-cross-arm.json'), 'utf8'));
  const codes = [...new Set(report.findings.map((finding) => finding.code))].sort();
  assert.ok(codes.length > 0, 'the committed report must carry findings for this guard to mean anything');
  const advisory = codes.filter((code) => code.startsWith('BOARD_') || code.startsWith('PALETTE_'));
  assert.ok(
    advisory.length >= 5,
    `the committed report must still exercise the advisory codes, saw ${advisory.join(', ')}`,
  );
  for (const code of codes) {
    if (advisory.includes(code)) {
      assert.ok(ADVISORY_CODES.includes(code), `${code} is in the committed report and must be classified advisory`);
    } else {
      assert.ok(!ADVISORY_CODES.includes(code), `${code} is in the committed report and must gate`);
    }
  }
});
