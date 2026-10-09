/**
 * Tests for the browser-measured image metrics and their comparison.
 *
 * The module's measurement half runs in a browser and is exercised by the instrument itself; what is
 * tested here is the half that decides things - the thresholds, the polarity behaviour, and the shape of
 * what gets written to the report - because those are the parts a reviewer cannot see by looking at a
 * screenshot, and the parts that were wrong.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ANALYSIS_METRIC_NOTES, summariseComparison, profileShapeDistance, profileStats } from '../scripts/lib/image-metrics.mjs';
import { metricDistance } from '../scripts/check-cross-arm-parity.mjs';

const FLAT = (value) => new Array(32).fill(value);
/** A profile with real variation, so shape is comparable: a bright band, a dark band. */
const BANDED = (low, high) => FLAT(high).map((value, index) => (index < 8 ? low : high));
/** A different SHAPE entirely: dark at the edges, bright in the middle. Anti-correlated with BANDED. */
const CENTRED = (dark, bright) => FLAT(dark).map((value, index) => (Math.abs(index - 16) < 5 ? bright : dark));

/**
 * A metric object with a controlled shape. `structure` is a 32-number profile applied to BOTH the row and
 * column luminance bands, so a test can state exactly what structure it means. A flat profile is a UNIFORM
 * image, which is a real case (an empty board) and not a stand-in for "no opinion".
 */
function metrics({ mean = 0.5, ink = 0.4, structure = null, colours = null } = {}) {
  const profile = structure ?? FLAT(mean);
  return {
    width: 100,
    height: 100,
    luminance: { mean, p10: mean, p50: mean, p90: mean },
    ink,
    colours: colours ?? [
      { hex: '#202030', share: 0.6, count: 6000 },
      { hex: '#405060', share: 0.4, count: 4000 },
    ],
    rows: FLAT(ink),
    bands: FLAT(ink),
    rowLuminance: profile,
    bandLuminance: profile,
  };
}

test('identical images produce no findings', () => {
  const same = metrics({ structure: BANDED(0.1, 0.8) });
  assert.deepEqual(summariseComparison(same, metrics({ structure: BANDED(0.1, 0.8) })), []);
});

test('a uniform image is not a perfect match for everything', () => {
  // The defect a third cross-family review blocked on, as a permanent guard. Shape used to be the band's
  // deviation from its own mean, which makes a uniform image a zero vector - and then the distance to it is
  // just the candidate's own signal, so every sparse arm "matched" the empty board. The sharpest form of it:
  // a pure white image and a pure black one scored EXACTLY 0.
  const white = { rowLuminance: FLAT(1), bandLuminance: FLAT(1) };
  const black = { rowLuminance: FLAT(0), bandLuminance: FLAT(0) };
  // 1/3, not 1: two FLAT images have the same shape (a flat line) and the same contrast (none), so their
  // only difference is brightness, and the distance is the average of three terms. This is the maximum a
  // pure-brightness difference can reach, which is why the scale is stated rather than assumed to be 0..1.
  assert.ok(metricDistance(white, black) > 0.3, 'a white image and a black image must not be zero apart');
  assert.equal(metricDistance(white, black), 0.3333, 'and the value must be the stated average of its three terms');

  // The scale's reachable maximum, pinned: a flat image against an inverted-contrast banded one differs in
  // shape (1), in brightness (1) and in contrast (1), so the average reaches 1.
  const inverted = { rowLuminance: FLAT(0).map((v, i) => (i % 2 ? 0 : 1)), bandLuminance: FLAT(0).map((v, i) => (i % 2 ? 1 : 0)) };
  assert.ok(metricDistance(inverted, white) > 0.6, 'the far end of the scale must be reachable');

  // And the consequence: a uniform board must not be the closest board to a sparse image.
  const uniform = metrics({ mean: 0.98, ink: 0.02, structure: FLAT(0.98) });
  const sparse = metrics({ mean: 0.95, ink: 0.06, structure: BANDED(0.9, 0.99) });
  const shaped = metrics({ mean: 0.96, ink: 0.05, structure: BANDED(0.9, 0.99) });
  assert.ok(
    metricDistance(sparse, shaped) < metricDistance(sparse, uniform),
    'an image must be closer to a board with a similar shape than to a blank one',
  );

  // And it is reported, not silently scored: a uniform profile has no shape to compare.
  const findings = summariseComparison(uniform, sparse);
  assert.ok(
    findings.some((finding) => finding.code === 'BOARD_STRUCTURE_NOT_COMPARABLE'),
    'a profile with no variation must be reported as not comparable rather than scored',
  );
});

test('a divergent image produces a finding on every axis', () => {
  const baseline = metrics({ structure: BANDED(0.1, 0.8) });
  const diverged = metrics({
    mean: 0.7,
    ink: 0.15,
    // A different SHAPE, not merely a different brightness or amplitude. Two step profiles of different
    // heights correlate at +1 and are the SAME shape - that is the shape axis working as intended, and an
    // earlier fixture of mine mistook an amplitude change for a structural one.
    structure: CENTRED(0.1, 0.95),
    colours: [{ hex: '#f0e0d0', share: 0.85, count: 8500 }],
  });
  const codes = new Set(summariseComparison(baseline, diverged).map((finding) => finding.code));
  for (const code of ['BOARD_PALETTE_NOT_SHARED', 'BOARD_LUMINANCE_DIVERGES', 'BOARD_INK_DIVERGES', 'BOARD_STRUCTURE_DIVERGES']) {
    assert.ok(codes.has(code), `${code} must fire for an image that diverges on that axis`);
  }
});

test('a dark image and a light image of the same shape differ in brightness, not in structure', () => {
  // Two true statements that a careless metric conflates. The SHAPE is the same, so the structure axis must
  // stay silent. The images are still not the same picture, so the distance must NOT be zero - brightness is
  // part of how an image looks. An earlier version of this test asserted a zero distance and was wrong.
  const dark = metrics({ mean: 0.15, ink: 0.95, structure: BANDED(0.05, 0.25) });
  const light = metrics({ mean: 0.88, ink: 0.05, structure: BANDED(0.78, 0.98) });
  const structure = summariseComparison(dark, light).filter((finding) => finding.axis === 'structure');
  assert.deepEqual(structure, [], 'the same shape is the same shape whatever the polarity');
  assert.ok(metricDistance(dark, light) > 0.1, 'and they are still not the same image');
});

test('the structure axis still bites when the shape really differs', () => {
  // The converse control. Making structure polarity-independent must not make it blind: a header band and a
  // footer band that are empty where the other is full is exactly the difference this axis exists to see.
  const flat = metrics({ mean: 0.5, structure: BANDED(0.1, 0.8) });
  const different = metrics({ mean: 0.5, structure: CENTRED(0.05, 0.95) });
  const structure = summariseComparison(flat, different).filter((finding) => finding.axis === 'structure');
  assert.ok(structure.length > 0, 'a real structural difference must still be reported');
  assert.ok(
    structure.every((finding) => typeof finding.message === 'string' && finding.message.includes('correlates at')),
    'the message must state the correlation a reader can check',
  );
});

test('everything a report needs survives JSON serialisation', () => {
  // Arrays carrying named properties lose them in JSON.stringify, which is how `.share` was present in
  // memory and absent from the committed report.
  const finding = summariseComparison(
    metrics(),
    metrics({ colours: [{ hex: '#f0e0d0', share: 1, count: 10000 }] }),
  ).find((entry) => entry.axis === 'palette');
  assert.ok(finding, 'a palette finding must be produced');
  const roundTripped = JSON.parse(JSON.stringify(finding));
  assert.equal(typeof roundTripped.baseline.share, 'number', 'the baseline share must survive serialisation');
  assert.equal(typeof roundTripped.candidate.share, 'number', 'the candidate share must survive serialisation');
  assert.ok(Array.isArray(roundTripped.baseline.colours), 'the colours must survive as data, not as methods');
});

test('the distance is the average of the three terms it says it uses', () => {
  const dark = metrics({ mean: 0.15, ink: 0.95, structure: BANDED(0.05, 0.25) });
  const light = metrics({ mean: 0.88, ink: 0.05, structure: BANDED(0.78, 0.98) });
  // Same shape, different brightness: NOT zero. Brightness is part of how an image looks.
  const polarity = metricDistance(dark, light);
  assert.ok(polarity > 0.1, 'a dark image and a light image are not the same image');
  // A reversed layout at the same brightness is a shape difference and must be seen.
  const shape = metricDistance(
    metrics({ mean: 0.5, structure: BANDED(0.1, 0.8) }),
    metrics({ mean: 0.5, structure: CENTRED(0.1, 0.8) }),
  );
  assert.ok(shape > 0.1, 'a reversed layout is not the same shape');

  // RECOMPUTABLE: the metric is the average of the SHAPE, BRIGHTNESS and CONTRAST terms, so a reader with the
  // band values in the report gets the number in the report. The contrast term is the one a reviewer found
  // missing: without it a half-dark/half-light image and an almost uniformly grey one with the same mean
  // scored 0 - the same confidently meaningless zero the blank attractor had produced one round earlier.
  const rowShape = profileShapeDistance(FLAT(0.05).map((v, i) => (i < 8 ? 0.05 : 0.25)), FLAT(0.05).map((v, i) => (i < 8 ? 0.78 : 0.98)));
  const left = profileStats(FLAT(0.05).map((v, i) => (i < 8 ? 0.05 : 0.25)));
  const right = profileStats(FLAT(0.05).map((v, i) => (i < 8 ? 0.78 : 0.98)));
  const recomputed = Math.round((
    (rowShape.distance + Math.abs(left.mean - right.mean) + Math.min(1, 2 * Math.abs(left.spread - right.spread))) / 3
  ) * 10000) / 10000;
  assert.ok(Math.abs(recomputed - polarity) < 0.0002, `the report's number must be the average of its stated terms (recomputed ${recomputed}, metric ${polarity}, shape distance ${rowShape.distance})`);
});

test('the published notes name the limits, including the uniform-profile caveat', () => {
  assert.match(ANALYSIS_METRIC_NOTES, /not comparable/i, 'the notes must say a uniform profile is not scored');
  assert.match(ANALYSIS_METRIC_NOTES, /do not establish/i, 'the notes must say what the metrics do not establish');
});
