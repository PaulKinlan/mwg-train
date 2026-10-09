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
});

function round4(value) {
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
          bands: bands
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

    const baseReport = baseUnshared.slice();
    baseReport.colours = baseUnshared;
    baseReport.unshared = baseUnshared;
    baseReport.share = round4(baseUnsharedShare);

    const candReport = candUnshared.slice();
    candReport.colours = candUnshared;
    candReport.unshared = candUnshared;
    candReport.share = round4(candUnsharedShare);

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
  const baseRows = Array.isArray(baseline?.rows) ? baseline.rows : [];
  const candRows = Array.isArray(candidate?.rows) ? candidate.rows : [];

  let rowAbsDiffSum = 0;
  let baseRowSum = 0;
  let candRowSum = 0;
  for (let i = 0; i < 32; i++) {
    const bVal = baseRows[i] ?? 0;
    const cVal = candRows[i] ?? 0;
    rowAbsDiffSum += Math.abs(cVal - bVal);
    baseRowSum += bVal;
    candRowSum += cVal;
  }
  const rowMeanDiff = rowAbsDiffSum / 32;
  const baseRowMean = baseRowSum / 32;
  const candRowMean = candRowSum / 32;

  if (rowMeanDiff > 0.10) {
    let dir;
    if (candRowMean > baseRowMean) {
      dir = `candidate horizontal bands have higher ink density (${round4(candRowMean).toFixed(4)}) than baseline (${round4(baseRowMean).toFixed(4)})`;
    } else if (candRowMean < baseRowMean) {
      dir = `candidate horizontal bands have lower ink density (${round4(candRowMean).toFixed(4)}) than baseline (${round4(baseRowMean).toFixed(4)})`;
    } else {
      dir = `candidate ink is redistributed across horizontal bands relative to baseline`;
    }
    findings.push({
      code: CODES.STRUCTURE_DIVERGES,
      axis: 'structure',
      baseline: round4(baseRowMean),
      candidate: round4(candRowMean),
      message: `Axis 'structure': row profile mean absolute difference is ${round4(rowMeanDiff).toFixed(4)} (exceeds threshold 0.1000); baseline row ink mean is ${round4(baseRowMean).toFixed(4)}, candidate row ink mean is ${round4(candRowMean).toFixed(4)} (${dir}).`,
    });
  }

  // 5. Column band comparison (32 vertical bands)
  const baseBands = Array.isArray(baseline?.bands) ? baseline.bands : [];
  const candBands = Array.isArray(candidate?.bands) ? candidate.bands : [];

  let colAbsDiffSum = 0;
  let baseColSum = 0;
  let candColSum = 0;
  for (let i = 0; i < 32; i++) {
    const bVal = baseBands[i] ?? 0;
    const cVal = candBands[i] ?? 0;
    colAbsDiffSum += Math.abs(cVal - bVal);
    baseColSum += bVal;
    candColSum += cVal;
  }
  const colMeanDiff = colAbsDiffSum / 32;
  const baseColMean = baseColSum / 32;
  const candColMean = candColSum / 32;

  if (colMeanDiff > 0.10) {
    let dir;
    if (candColMean > baseColMean) {
      dir = `candidate vertical bands have higher ink density (${round4(candColMean).toFixed(4)}) than baseline (${round4(baseColMean).toFixed(4)})`;
    } else if (candColMean < baseColMean) {
      dir = `candidate vertical bands have lower ink density (${round4(candColMean).toFixed(4)}) than baseline (${round4(baseColMean).toFixed(4)})`;
    } else {
      dir = `candidate ink is redistributed across vertical bands relative to baseline`;
    }
    findings.push({
      code: CODES.STRUCTURE_DIVERGES,
      axis: 'structure',
      baseline: round4(baseColMean),
      candidate: round4(candColMean),
      message: `Axis 'structure': column profile mean absolute difference is ${round4(colMeanDiff).toFixed(4)} (exceeds threshold 0.1000); baseline column ink mean is ${round4(baseColMean).toFixed(4)}, candidate column ink mean is ${round4(candColMean).toFixed(4)} (${dir}).`,
    });
  }

  return findings;
}

/**
 * Explanatory notes suitable for inclusion in cross-arm parity reports.
 */
export const ANALYSIS_METRIC_NOTES =
  'These visual metrics compare quantised colour distribution, mean luminance, ink coverage, and coarse 32-band horizontal and vertical structure across rendered images. ' +
  'They do not establish that a layout, component hierarchy, or specific design element is correct, nor do they verify semantic markup or typography. ' +
  'Two completely different designs can share identical global luminance, ink density, and colour histograms while looking visually distinct to a human.';
