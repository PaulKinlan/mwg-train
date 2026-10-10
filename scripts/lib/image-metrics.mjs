/**
 * Image metrics and cross-arm visual comparison for headless Chrome.
 *
 * WHY THE MEASUREMENT HAPPENS IN THE BROWSER:
 * This repository deliberately has NO image-decoding dependencies (no pngjs, pixelmatch,
 * sharp, jimp, canvas, or native decoders) and will not add one. The only image decoder
 * available in the instrument's toolchain is the headless Chrome browser it already drives.
 * Consequently, image decoding and pixel measurement happen INSIDE a browser page: an image
 * is loaded by URL, rendered onto an HTML5 canvas at natural size, and measured via
 * getImageData. This module exports that self-contained analysis page HTML, as well as the
 * pure verdict layer that compares the resulting plain data structures without I/O.
 */

const CODES = Object.freeze({
  PALETTE_NOT_SHARED: 'BOARD_PALETTE_NOT_SHARED',
  LUMINANCE_DIVERGES: 'BOARD_LUMINANCE_DIVERGES',
  INK_DIVERGES: 'BOARD_INK_DIVERGES',
  STRUCTURE_DIVERGES: 'BOARD_STRUCTURE_DIVERGES',
  STRUCTURE_UNMEASURED: 'BOARD_STRUCTURE_UNMEASURED',
});

export function round4(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Number(value.toFixed(4));
}

/**
 * A complete, self-contained HTML page that loads an image URL onto a canvas at natural size
 * and computes plain serialisable metrics via getImageData.
 */
export const ANALYSIS_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Image Analysis</title>
</head>
<body>
<script>
window.analyseImage = function(url) {
  return new Promise(function(resolve, reject) {
    if (!url || typeof url !== 'string') {
      reject(new Error('Invalid image URL provided to analyseImage: ' + String(url)));
      return;
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';

    var timer = setTimeout(function() {
      timer = null;
      img.onload = null;
      img.onerror = null;
      reject(new Error('Image load timed out after 10s: ' + url));
    }, 10000);

    img.onerror = function() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      img.onload = null;
      img.onerror = null;
      reject(new Error('Failed to load image: ' + url));
    };

    img.onload = function() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      img.onload = null;
      img.onerror = null;

      try {
        var width = img.naturalWidth;
        var height = img.naturalHeight;
        if (!width || !height) {
          reject(new Error('Image has empty dimensions (' + width + 'x' + height + '): ' + url));
          return;
        }

        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Failed to obtain 2d canvas context for image: ' + url));
          return;
        }

        ctx.drawImage(img, 0, 0);

        var imageData;
        try {
          imageData = ctx.getImageData(0, 0, width, height);
        } catch (taintErr) {
          reject(new Error(
            'Canvas was tainted when reading pixel data for ' + url + ': ' + taintErr.message +
            '. Cross-origin images drawn without permissive CORS headers taint the canvas and prevent pixel access.'
          ));
          return;
        }

        if (!imageData || !imageData.data || imageData.data.length === 0) {
          reject(new Error('Pixel data is empty for image: ' + url));
          return;
        }

        var data = imageData.data;
        var totalPixels = width * height;
        if (data.length < totalPixels * 4) {
          reject(new Error('Incomplete pixel data buffer for image: ' + url));
          return;
        }

        var colBands = new Uint8Array(width);
        for (var bx = 0; bx < width; bx++) {
          colBands[bx] = Math.min(31, Math.floor((bx / width) * 32));
        }

        var colorCounts = new Uint32Array(4096);
        var rowInkCounts = new Uint32Array(32);
        var rowPixelCounts = new Uint32Array(32);
        var colInkCounts = new Uint32Array(32);
        var colPixelCounts = new Uint32Array(32);
        var luminances = new Float32Array(totalPixels);
        var inkCount = 0;
        var lumSum = 0;
        var pIdx = 0;
        var dIdx = 0;

        for (var y = 0; y < height; y++) {
          var rowBand = Math.min(31, Math.floor((y / height) * 32));
          for (var x = 0; x < width; x++) {
            var colBand = colBands[x];
            var r = data[dIdx];
            var g = data[dIdx + 1];
            var b = data[dIdx + 2];
            dIdx += 4;

            var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            luminances[pIdx++] = lum;
            lumSum += lum;

            var colorIdx = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
            colorCounts[colorIdx]++;

            rowPixelCounts[rowBand]++;
            colPixelCounts[colBand]++;

            if (lum < 0.85) {
              inkCount++;
              rowInkCounts[rowBand]++;
              colInkCounts[colBand]++;
            }
          }
        }

        luminances.sort();

        var meanLum = totalPixels > 0 ? (lumSum / totalPixels) : 0;
        var p10 = luminances[Math.floor(0.10 * (totalPixels - 1))];
        var p50 = luminances[Math.floor(0.50 * (totalPixels - 1))];
        var p90 = luminances[Math.floor(0.90 * (totalPixels - 1))];
        var ink = totalPixels > 0 ? (inkCount / totalPixels) : 0;

        var hexDigits = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
        var uniqueColors = [];
        for (var cIdx = 0; cIdx < 4096; cIdx++) {
          var count = colorCounts[cIdx];
          if (count > 0) {
            var rDigit = hexDigits[(cIdx >> 8) & 0x0f];
            var gDigit = hexDigits[(cIdx >> 4) & 0x0f];
            var bDigit = hexDigits[cIdx & 0x0f];
            var hex = '#' + rDigit + '0' + gDigit + '0' + bDigit + '0';
            uniqueColors.push({
              hex: hex,
              share: totalPixels > 0 ? (count / totalPixels) : 0,
              count: count
            });
          }
        }

        uniqueColors.sort(function(a, b) {
          return (b.count - a.count) || a.hex.localeCompare(b.hex);
        });

        var colours = uniqueColors.slice(0, 12);

        // A SECOND, CONTINUOUS PROFILE, because the ink profiles above cannot describe a dark image.
        // They threshold at 0.85, so on a dark slate board almost every pixel counts as ink and every band
        // saturates near 1.0 - two dark images would look structurally identical whatever their layouts,
        // and a "closest board" chosen on those numbers would be chosen by rounding. Mean luminance per
        // band is continuous, so it separates a header from a table from a footer whatever the polarity.
        var rowLuminance = new Array(32).fill(0);
        var bandLuminance = new Array(32).fill(0);
        var rowLumCounts = new Uint32Array(32);
        var colLumCounts = new Uint32Array(32);
        for (var ly = 0; ly < height; ly++) {
          var lumRowBand = Math.min(31, Math.floor((ly / height) * 32));
          for (var lx = 0; lx < width; lx++) {
            var lumIndex = (ly * width + lx) * 4;
            var pixelLum = (0.2126 * data[lumIndex] + 0.7152 * data[lumIndex + 1] + 0.0722 * data[lumIndex + 2]) / 255;
            var lumColBand = Math.min(31, Math.floor((lx / width) * 32));
            rowLuminance[lumRowBand] += pixelLum;
            rowLumCounts[lumRowBand]++;
            bandLuminance[lumColBand] += pixelLum;
            colLumCounts[lumColBand]++;
          }
        }
        for (var lumBand = 0; lumBand < 32; lumBand++) {
          rowLuminance[lumBand] = rowLumCounts[lumBand] > 0 ? rowLuminance[lumBand] / rowLumCounts[lumBand] : 0;
          bandLuminance[lumBand] = colLumCounts[lumBand] > 0 ? bandLuminance[lumBand] / colLumCounts[lumBand] : 0;
        }

        var rows = new Array(32);
        var bands = new Array(32);
        for (var bIdx = 0; bIdx < 32; bIdx++) {
          rows[bIdx] = rowPixelCounts[bIdx] > 0 ? (rowInkCounts[bIdx] / rowPixelCounts[bIdx]) : 0;
          bands[bIdx] = colPixelCounts[bIdx] > 0 ? (colInkCounts[bIdx] / colPixelCounts[bIdx]) : 0;
        }

        resolve({
          width: width,
          height: height,
          luminance: {
            mean: meanLum,
            p10: p10,
            p50: p50,
            p90: p90
          },
          ink: ink,
          colours: colours,
          rows: rows,
          bands: bands,
          rowLuminance: rowLuminance,
          bandLuminance: bandLuminance
        });
      } catch (err) {
        reject(err);
      }
    };

    img.src = url;
  });
};
</script>
</body>
</html>`;

/**
 * Pure comparison function evaluating baseline against candidate image metrics.
 * Returns an array of structured findings with code, axis, baseline, candidate, and message.
 */
export function summariseComparison(baseline, candidate) {
  const findings = [];

  // 1. Palette comparison
  const baseColours = Array.isArray(baseline?.colours) ? baseline.colours : [];
  const candColours = Array.isArray(candidate?.colours) ? candidate.colours : [];

  const baseHexMap = new Map();
  for (const c of baseColours) {
    if (c && typeof c.hex === 'string') {
      baseHexMap.set(c.hex.toLowerCase(), c);
    }
  }

  const candHexMap = new Map();
  for (const c of candColours) {
    if (c && typeof c.hex === 'string') {
      candHexMap.set(c.hex.toLowerCase(), c);
    }
  }

  const baseUnshared = [];
  let baseUnsharedShare = 0;
  for (const [hex, c] of baseHexMap) {
    if (!candHexMap.has(hex) && (c.share ?? 0) > 0.01) {
      baseUnshared.push({
        hex,
        share: round4(c.share ?? 0),
        count: c.count ?? 0,
      });
      baseUnsharedShare += c.share ?? 0;
    }
  }

  const candUnshared = [];
  let candUnsharedShare = 0;
  for (const [hex, c] of candHexMap) {
    if (!baseHexMap.has(hex) && (c.share ?? 0) > 0.01) {
      candUnshared.push({
        hex,
        share: round4(c.share ?? 0),
        count: c.count ?? 0,
      });
      candUnsharedShare += c.share ?? 0;
    }
  }

  if (baseUnshared.length > 0 || candUnshared.length > 0) {
    let overlapShare = 0;
    for (const [hex, c] of baseHexMap) {
      const candC = candHexMap.get(hex);
      if (candC) {
        overlapShare += Math.min(c.share ?? 0, candC.share ?? 0);
      }
    }
    const totalNonOverlap = Math.max(0, 1 - overlapShare);

    const baseList = baseUnshared.map((c) => `${c.hex} (${c.share.toFixed(4)})`).join(', ') || 'none';
    const candList = candUnshared.map((c) => `${c.hex} (${c.share.toFixed(4)})`).join(', ') || 'none';

    let direction;
    if (candUnsharedShare > baseUnsharedShare) {
      direction = `candidate introduces ${candUnshared.length} unshared colour(s) with higher non-overlapping share (${round4(candUnsharedShare).toFixed(4)}) than baseline (${round4(baseUnsharedShare).toFixed(4)})`;
    } else if (candUnsharedShare < baseUnsharedShare) {
      direction = `candidate omits colours from baseline palette (${round4(candUnsharedShare).toFixed(4)} unshared share in candidate vs ${round4(baseUnsharedShare).toFixed(4)} in baseline)`;
    } else {
      direction = `candidate and baseline diverge with equal unshared colour share (${round4(candUnsharedShare).toFixed(4)})`;
    }

    const message = `Axis 'palette': top-12 colours disagree. Total non-overlapping share is ${round4(totalNonOverlap).toFixed(4)}. ` +
      `Colours in baseline not candidate: [${baseList}] (share ${round4(baseUnsharedShare).toFixed(4)}). ` +
      `Colours in candidate not baseline: [${candList}] (share ${round4(candUnsharedShare).toFixed(4)}). ` +
      `Direction: ${direction}.`;

    // Arrays carrying named properties do not survive JSON.stringify - it serialises indexed elements and
    // silently drops everything else - so a cross-family review found `.share` present in memory and absent
    // from the committed report. Plain objects, because this report's whole purpose is to be read by
    // somebody who was not there when it ran.
    const baseReport = { colours: baseUnshared, share: round4(baseUnsharedShare) };
    const candReport = { colours: candUnshared, share: round4(candUnsharedShare) };

    findings.push({
      code: CODES.PALETTE_NOT_SHARED,
      axis: 'palette',
      baseline: baseReport,
      candidate: candReport,
      message,
    });
  }

  // 2. Mean luminance comparison
  const baseLum = baseline?.luminance?.mean ?? 0;
  const candLum = candidate?.luminance?.mean ?? 0;
  const lumDiff = Math.abs(candLum - baseLum);
  if (lumDiff > 0.15) {
    const dir = candLum > baseLum ? 'higher (brighter)' : 'lower (darker)';
    findings.push({
      code: CODES.LUMINANCE_DIVERGES,
      axis: 'luminance',
      baseline: round4(baseLum),
      candidate: round4(candLum),
      message: `Axis 'luminance': candidate mean luminance (${round4(candLum).toFixed(4)}) is ${dir} than baseline (${round4(baseLum).toFixed(4)}) by ${round4(lumDiff).toFixed(4)} (differs by more than 0.1500).`,
    });
  }

  // 3. Ink coverage comparison
  const baseInk = baseline?.ink ?? 0;
  const candInk = candidate?.ink ?? 0;
  const inkDiff = Math.abs(candInk - baseInk);
  if (inkDiff > 0.10) {
    const dir = candInk > baseInk ? 'higher (heavier coverage)' : 'lower (sparser coverage)';
    findings.push({
      code: CODES.INK_DIVERGES,
      axis: 'ink',
      baseline: round4(baseInk),
      candidate: round4(candInk),
      message: `Axis 'ink': candidate ink coverage (${round4(candInk).toFixed(4)}) is ${dir} than baseline (${round4(baseInk).toFixed(4)}) by ${round4(inkDiff).toFixed(4)} (differs by more than 0.1000).`,
    });
  }

  // 4. Row profile comparison (32 horizontal bands)
  //
  // Judged on the SHAPE of the profile, by correlation, so the answer is unchanged by how bright the image
  // is. Two earlier versions of this were blocked by review: ink coverage saturates on a dark mockup, and
  // subtracting each profile's own mean made a uniform board a zero vector that every sparse image
  // "matched" - it scored a pure white image and a pure black one as identical. See
  // `profileShapeDistance` for both mistakes written up.
  const profileOf = (luminance, ink) => {
    if (Array.isArray(luminance)) return { values: luminance, name: 'mean luminance per band' };
    if (Array.isArray(ink)) return { values: ink, name: 'ink density per band' };
    return { values: [], name: 'no profile available' };
  };
  const baseRowProfile = profileOf(baseline?.rowLuminance, baseline?.rows);
  const candRowProfile = profileOf(candidate?.rowLuminance, candidate?.rows);
  const rowShape = profileShapeDistance(baseRowProfile.values, candRowProfile.values);

  if (!rowShape.comparable) {
    findings.push({
      code: CODES.STRUCTURE_UNMEASURED,
      axis: 'structure',
      profile: 'rows',
      message: `Axis 'structure': one of the two horizontal band profiles has no variation, so their shapes cannot be compared. Reported rather than scored, because scoring it would call a uniform image a perfect structural match for every other image.`,
    });
  } else if (rowShape.distance > 0.10) {
    findings.push({
      code: CODES.STRUCTURE_DIVERGES,
      axis: 'structure',
      profile: 'rows',
      correlation: rowShape.correlation,
      baseline: rowShape.correlation,
      candidate: rowShape.correlation,
      message: `Axis 'structure': horizontal band ${baseRowProfile.name} correlates at ${rowShape.correlation} between the two images (a correlation below 0.80 counts as a different shape, and a negative one as an inverted one), so where the content sits differs.`,
    });
  }

  // 5. Column band comparison (32 vertical bands)
  const baseColProfile = profileOf(baseline?.bandLuminance, baseline?.bands);
  const candColProfile = profileOf(candidate?.bandLuminance, candidate?.bands);
  const colShape = profileShapeDistance(baseColProfile.values, candColProfile.values);

  if (!colShape.comparable) {
    findings.push({
      code: CODES.STRUCTURE_UNMEASURED,
      axis: 'structure',
      profile: 'columns',
      message: `Axis 'structure': one of the two vertical band profiles has no variation, so their shapes cannot be compared. Reported rather than scored, because scoring it would call a uniform image a perfect structural match for every other image.`,
    });
  } else if (colShape.distance > 0.10) {
    findings.push({
      code: CODES.STRUCTURE_DIVERGES,
      axis: 'structure',
      profile: 'columns',
      correlation: colShape.correlation,
      baseline: colShape.correlation,
      candidate: colShape.correlation,
      message: `Axis 'structure': vertical band ${baseColProfile.name} correlates at ${colShape.correlation} between the two images (a correlation below 0.80 counts as a different shape, and a negative one as an inverted one), so where the content sits differs.`,
    });
  }

  return findings;
}

/**
 * The mean and the spread (standard deviation) of a band profile. Exported because the distance in
 * scripts/check-cross-arm-parity.mjs is built from these same two numbers, and a metric that computes its
 * own inputs differently from the axis that reports on them is two metrics wearing one name.
 */
export function profileStats(values) {
  if (!Array.isArray(values) || values.length === 0) return { mean: 0, spread: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean: round4(mean), spread: round4(Math.sqrt(variance)) };
}

/**
 * How different are two band profiles in SHAPE, independent of how bright either one is?
 *
 * Pearson correlation, so scaling or shifting a profile does not change the answer. This replaces two
 * earlier attempts, and a reviewer was right to block both:
 *
 * - Ink coverage thresholds at 0.85, so on a dark mockup every band saturates near 1.0 and the answer is
 *   decided by rounding.
 * - Subtracting each profile's own mean makes every UNIFORM image a zero vector, and then the distance to
 *   it is just the candidate's own signal. Measured: a uniform board attracted every sparse arm, and
 *   `metricDistance` returned 0 for a pure white image against a pure black one - it called them the same
 *   image. That is worse than a wrong number; it is a confidently wrong answer, which is the one thing
 *   this instrument exists to avoid.
 *
 * A flat profile has no shape to compare, which is TWO different cases and they must not be conflated:
 *
 * - BOTH flat: they have the same shape - a flat line - so the distance is 0, and it is left to the
 *   brightness and contrast terms to say how different the two images actually are.
 * - ONE flat: nothing can be demonstrated about similarity, so the distance is 1. Failing closed matters
 *   because a zero reads as a perfect match.
 *
 * A reviewer caught an earlier version returning 1 for both-flat, which made a blank image non-zero from
 * ITSELF. "Cannot be compared" and "is dissimilar" are different claims and the code now keeps them apart.
 */
export function profileShapeDistance(first, second) {
  const empty = { distance: 1, comparable: false, correlation: null, flat: true };
  if (!Array.isArray(first) || !Array.isArray(second) || first.length === 0 || second.length === 0) return empty;
  const length = Math.min(first.length, second.length);
  const a = first.slice(0, length);
  const b = second.slice(0, length);
  const meanA = a.reduce((sum, value) => sum + value, 0) / length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < length; index += 1) {
    const deviationA = a[index] - meanA;
    const deviationB = b[index] - meanB;
    covariance += deviationA * deviationB;
    varianceA += deviationA * deviationA;
    varianceB += deviationB * deviationB;
  }
  const spreadA = Math.sqrt(varianceA / length);
  const spreadB = Math.sqrt(varianceB / length);
  if (spreadA < 1e-6 && spreadB < 1e-6) return { distance: 0, comparable: true, correlation: null, flat: true };
  if (spreadA < 1e-6 || spreadB < 1e-6) return empty;
  const correlation = covariance / (spreadA * spreadB * length);
  // (1 - correlation) / 2, NOT 1 - |correlation|. The absolute value scores a perfectly INVERTED profile - a
  // layout turned upside down, or bright where the other is dark - as a perfect shape match, which is the
  // opposite of true. Correlation itself gets the two cases right that matter: a faded or darkened copy of
  // the same layout correlates at +1 and is the same shape, while an inverted one correlates at -1 and is
  // maximally different. The halving keeps the result in 0..1 for a distance that gets averaged.
  const distance = Math.min(1, Math.max(0, (1 - correlation) / 2));
  return { distance: round4(distance), comparable: true, correlation: round4(correlation), flat: false };
}

/**
 * Explanatory notes suitable for inclusion in cross-arm parity reports.
 */
export const ANALYSIS_METRIC_NOTES =
  'These visual metrics compare quantised colour distribution, mean luminance, ink coverage, and the SHAPE of the 32-band mean-luminance profile horizontally and vertically across rendered images. ' +
  'Shape is judged by correlation between the two profiles, so it does not depend on how bright either image is. Two profiles with NO variation have the same shape - a flat line - and score 0 on the shape term; one flat against one varied cannot be compared and fails closed at 1 FOR THAT TERM, rather than being scored as identical. ' +
  'The distance between two images averages THREE terms - that shape difference, the difference in their mean luminance, and the difference in their contrast (twice the difference in spread) - because shape alone cannot see contrast, brightness alone saturates, and shape plus brightness together scored a half-dark/half-light image as identical to a flat one of the same mean. Measured on the reference boards, ink coverage is 98.6-99.5% for all five, which is why ink is not a term. ' +
  'They do not establish that a layout, component hierarchy, or specific design element is correct, nor do they verify semantic markup or typography. ' +
  'Two completely different designs can share global luminance, ink density and colour histograms while looking visually distinct to a human.';
