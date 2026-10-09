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

import { ANALYSIS_METRIC_NOTES, summariseComparison } from '../scripts/lib/image-metrics.mjs';
import { metricDistance } from '../scripts/check-cross-arm-parity.mjs';

const FLAT = (value) => new Array(32).fill(value);

/**
 * A metric object with a controlled shape. `structure` is a 32-number profile applied to BOTH the row and
 * column luminance bands, so a test can state exactly what structure it means.
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
  const same = metrics();
  assert.deepEqual(summariseComparison(same, metrics()), []);
});

test('a divergent image produces a finding on every axis', () => {
  const baseline = metrics();
  const diverged = metrics({
    mean: 0.7,
    ink: 0.15,
    // A genuinely different SHAPE, not merely a different brightness: the first version of this test passed a
    // uniformly brighter profile (flat, 0.62) and expected a structure finding, which was wrong of the test
    // and right of the instrument - a flat image of a different brightness differs in brightness, not shape.
    structure: FLAT(0.5).map((value, index) => (index < 8 ? 0.05 : 0.75)),
    colours: [{ hex: '#f0e0d0', share: 0.85, count: 8500 }],
  });
  const codes = new Set(summariseComparison(baseline, diverged).map((finding) => finding.code));
  for (const code of ['BOARD_PALETTE_NOT_SHARED', 'BOARD_LUMINANCE_DIVERGES', 'BOARD_INK_DIVERGES', 'BOARD_STRUCTURE_DIVERGES']) {
    assert.ok(codes.has(code), `${code} must fire for an image that diverges on that axis`);
  }
});

test('a dark image and a light image with the same shape are NOT reported as a structural difference', () => {
  // This is the defect a cross-family review found, expressed as a test. Structure used to be judged on
  // ink coverage, which thresholds at 0.85 - so a dark slate board is almost entirely "ink" and its band
  // profile saturates near 1.0 whatever its layout, while a light arm sits near 0.05. A uniformly dark
  // image and a uniformly light image have the SAME shape: flat. Under the old metric they differed by
  // 0.95 of structure and every dark board looked structurally unlike every light arm. Under the
  // luminance profile they differ in brightness, which is a different axis, and not in structure.
  const dark = metrics({ mean: 0.15, ink: 0.95 });
  const light = metrics({ mean: 0.88, ink: 0.05 });
  const findings = summariseComparison(dark, light);
  const structure = findings.filter((finding) => finding.axis === 'structure');
  assert.deepEqual(structure, [], 'flatness is flatness whatever the polarity');
  assert.ok(findings.some((finding) => finding.axis === 'luminance'), 'the brightness difference must still be reported');
});

test('the structure axis still bites when the shape really differs', () => {
  // The converse control. Making structure polarity-independent must not make it blind: a header band and a
  // footer band that are empty where the other is full is exactly the difference this axis exists to see.
  const flat = metrics({ mean: 0.5 });
  const banded = metrics({ mean: 0.5, structure: FLAT(0.5).map((value, index) => (index < 8 ? 0.05 : 0.75)) });
  const structure = summariseComparison(flat, banded).filter((finding) => finding.axis === 'structure');
  assert.ok(structure.length > 0, 'a real structural difference must still be reported');
  assert.ok(
    structure.every((finding) => typeof finding.message === 'string' && finding.message.includes('mean luminance per')),
    'the message must name which profile was compared, so a reader knows what was measured',
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

test('the metric distance is unchanged by polarity and changed by structure', () => {
  const dark = metrics({ mean: 0.15, ink: 0.95 });
  const light = metrics({ mean: 0.88, ink: 0.05 });
  // Same shape, opposite brightness: a READER may care, but structure is what this distance measures.
  assert.equal(metricDistance(dark, light), 0, 'a flat dark image and a flat light image are equally flat');
  // Different shape, same brightness: the distance must see it.
  const banded = metrics({ mean: 0.5, structure: FLAT(0.5).map((value, index) => (index < 8 ? 0.05 : 0.75)) });
  assert.ok(metricDistance(metrics({ mean: 0.5 }), banded) > 0.1, 'a banded image is not the same shape as a flat one');
});

test('the published notes name the limits, including the polarity caveat', () => {
  assert.match(ANALYSIS_METRIC_NOTES, /polarity/i, 'the notes must warn that luminance and ink are polarity-sensitive');
  assert.match(ANALYSIS_METRIC_NOTES, /do not establish/i, 'the notes must say what the metrics do not establish');
});
