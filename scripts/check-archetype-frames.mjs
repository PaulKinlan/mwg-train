/**
 * Detects browser chrome in archetype and training-reference images.
 * These images are supposed to be clean page content without window frames.
 * If chrome is detected on an un-exempted image, this check fails closed.
 *
 * Two detectors run on every decoded image, because mwg-train's chrome has appeared in two shapes:
 *
 *   1. macOS-style traffic-light DOT triplets - saturated red/yellow/green, or dark slate monochrome
 *      dots pushed down by a desktop-blur wrapper. This is the only chrome the generation prompts
 *      name, so the dot geometry is matched directly.
 *   2. An OS window-control GLYPH triad - a minimise bar, a maximise/restore box and a close cross,
 *      drawn as three small glyphs in one spaced row in the top-right corner of a panel. Signal Grid's
 *      victory dialog was drawn with exactly that `- [] X` set (mwg-train-m5ws) while the brief asked
 *      for a native site-owned <dialog> and forbade window chrome; dot detection cannot see a glyph set,
 *      so the board passed a gate that only looked for dots. The glyph detector reads three neutral or
 *      single-hue glyphs of matching size on an even baseline and treats that row as window controls.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import jpeg from 'jpeg-js';
import { CROP_LEDGER_PATH, cropSourceProblems } from './generate-training-boards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHETYPES_DIR = path.join(ROOT, 'docs', 'design', 'archetypes');
const TRAINING_DIR = path.join(ROOT, 'docs', 'design', 'training');
const CLEAN_PINS_PATH = path.join(ROOT, '.fleet', 'frame-scan-pins.json');
const SCAN_ALGORITHM = 'window-chrome-v3';

// These images were generated with browser chrome before this gate was added.
// They are exempt by exact content hash to avoid breaking the sealed evaluation corpus.
// A replacement image at the same path will NOT be exempt.
const EXEMPT_HASHES = new Set([
]);

/**
 * Parses the JPEG once and looks for either shape of window chrome.
 * @param {Buffer} bytes
 * @returns {boolean} true if chrome is detected
 */
export function hasBrowserChrome(bytes) {
  const image = decodeJpeg(bytes);
  if (!image) return true; // Fail closed on decode failures
  return hasTrafficLightTriplet(image) || hasWindowControlTriad(image);
}

/**
 * Decodes a JPEG for the detectors. Returns null when the bytes cannot be read, which the caller
 * treats as chrome so an unscannable image can never pass the gate.
 */
function decodeJpeg(bytes) {
  let rawImageData;
  try {
    rawImageData = jpeg.decode(bytes, { useTArray: true });
  } catch (e) {
    console.error(`Error decoding image: ${e.message}`);
    return null;
  }
  if (!rawImageData) return null;
  return rawImageData;
}

/**
 * Looks for the macOS-style traffic-light dot triplet.
 * @param {{width: number, height: number, data: Uint8Array}} image decoded RGBA pixels
 * @returns {boolean} true if a traffic-light triplet is detected
 */
function hasTrafficLightTriplet(image) {
  const { width, height, data } = image;

  // Traffic light colors: macOS Red, Yellow, Green
  // Require chroma, not merely skin/foliage values that happen to straddle the old broad channel cutoffs.
  const isRed = (r, g, b) => r > 190 && g < 130 && b < 130 && r - g > 70 && r - b > 70;
  const isYellow = (r, g, b) => r > 190 && g > 145 && b < 130 && g - b > 55;
  const isGreen = (r, g, b) => r < 150 && g > 145 && b < 140 && g - r > 45 && g - b > 35;

  // Monochrome dark slate dot triplets embedded in desktop-blur wrappers
  const isMonoRed = (r, g, b) => Math.abs(r - 56) <= 3 && Math.abs(g - 66) <= 3 && Math.abs(b - 79) <= 3;
  const isMonoYellow = (r, g, b) => Math.abs(r - 50) <= 3 && Math.abs(g - 60) <= 3 && Math.abs(b - 73) <= 3;
  const isMonoGreen = (r, g, b) => Math.abs(r - 37) <= 3 && Math.abs(g - 47) <= 3 && Math.abs(b - 61) <= 3;

  // Search up to y=150 to catch dots pushed down by desktop wrappers,
  // and x=300 to catch shifted center alignments.
  for (let y = 5; y < Math.min(150, height); y++) {
    for (let x = 10; x < Math.min(300, width); x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      const redColored = isRed(r, g, b);
      const redMono = isMonoRed(r, g, b);
      
      if (!redColored && !redMono) continue;

      for (let dx1 = 15; dx1 <= 25; dx1++) {
        const idx2 = (y * width + x + dx1) * 4;
        const r2 = data[idx2], g2 = data[idx2 + 1], b2 = data[idx2 + 2];
        
        // Ensure midpoints are not the same color (rejects solid navbars)
        const mid1Idx = (y * width + x + Math.floor(dx1 / 2)) * 4;
        const mid1R = data[mid1Idx], mid1G = data[mid1Idx + 1], mid1B = data[mid1Idx + 2];

        const bgUpIdx = ((y - 5) * width + x) * 4;
        const bgUpR = data[bgUpIdx], bgUpG = data[bgUpIdx + 1], bgUpB = data[bgUpIdx + 2];

        const bgLeftIdx = (y * width + x - 8) * 4;
        const bgLeftR = data[bgLeftIdx], bgLeftG = data[bgLeftIdx + 1], bgLeftB = data[bgLeftIdx + 2];

        if (redColored && isYellow(r2, g2, b2)) {
          for (let dx2 = 15; dx2 <= 25; dx2++) {
            const idx3 = (y * width + x + dx1 + dx2) * 4;
            const r3 = data[idx3], g3 = data[idx3 + 1], b3 = data[idx3 + 2];
            if (isGreen(r3, g3, b3)) return true;
          }
        }
        
        if (redMono && isMonoYellow(r2, g2, b2)) {
          if (Math.abs(mid1R - r) < 8 && Math.abs(mid1G - g) < 8 && Math.abs(mid1B - b) < 8) continue;
          if (Math.abs(mid1R - bgUpR) > 8 || Math.abs(mid1G - bgUpG) > 8 || Math.abs(mid1B - bgUpB) > 8) continue;
          if (Math.abs(bgLeftR - bgUpR) > 8 || Math.abs(bgLeftG - bgUpG) > 8 || Math.abs(bgLeftB - bgUpB) > 8) continue;

          for (let dx2 = 15; dx2 <= 25; dx2++) {
            const idx3 = (y * width + x + dx1 + dx2) * 4;
            const r3 = data[idx3], g3 = data[idx3 + 1], b3 = data[idx3 + 2];
            
            const mid2Idx = (y * width + x + dx1 + Math.floor(dx2 / 2)) * 4;
            const mid2R = data[mid2Idx], mid2G = data[mid2Idx + 1], mid2B = data[mid2Idx + 2];

            if (isMonoGreen(r3, g3, b3)) {
               if (Math.abs(mid2R - r2) < 8 && Math.abs(mid2G - g2) < 8 && Math.abs(mid2B - b2) < 8) continue;
               if (Math.abs(mid2R - bgUpR) > 8 || Math.abs(mid2G - bgUpG) > 8 || Math.abs(mid2B - bgUpB) > 8) continue;
               return true;
            }
          }
        }
      }
    }
  }
  return false;
}

/**
 * A window-control glyph set sits on a panel header, so only the top of the frame is searched;
 * a page-bottom "- [] X" row is not what this check exists to catch.
 */
const CONTROL_BAND_HEIGHT = 0.45;
/** Greys count as ink even when a board's panel tints them, so the chroma cut is deliberately loose. */
const CONTROL_INK_CHROMA = 40;
/** A glyph has to differ from the row background by more than JPEG noise on a flat panel. */
const CONTROL_INK_CONTRAST = 18;
const CONTROL_GLYPH_MAX_SIZE = 26;
/** A per-glyph average ink with less chroma than this is a grey, whatever lightness it has. */
const CONTROL_NEUTRAL_INK_CHROMA = 30;
/** How closely two coloured inks' hue directions have to agree to be one control set. */
const CONTROL_INK_HUE_SIMILARITY = 0.985;

/**
 * Locates small inked shapes in the top band of a decoded image.
 *
 * The background estimate is the modal luminance of a horizontal window around each pixel rather than a
 * per-row value, so a panel that is itself neutral does not swallow a light glyph drawn on it: glyphs
 * occupy a minority of the window on every row they cross, which is what makes the mode the panel.
 * A one-pixel dilation then reconnects the thin strokes JPEG blurs into two or three fragments.
 *
 * @param {{width: number, height: number, data: Uint8Array}} image decoded RGBA pixels
 * @returns {Array<{minX: number, maxX: number, minY: number, maxY: number, w: number, h: number, r: number, g: number, b: number}>} ink blobs
 */
function findInkBlobs(image) {
  const { width, height, data } = image;
  const maxY = Math.min(height, Math.ceil(height * CONTROL_BAND_HEIGHT));
  const n = width * height;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];

  const mask = new Uint8Array(n);
  const half = 20;
  const buckets = 32;
  const bucketScale = 8;
  const histogram = new Int32Array(buckets);
  const bucket = (value) => Math.min(buckets - 1, (value / bucketScale) | 0);
  for (let y = 0; y < maxY; y++) {
    histogram.fill(0);
    for (let x = Math.max(0, -half); x <= Math.min(width - 1, half); x++) histogram[bucket(lum[y * width + x])]++;
    for (let x = 0; x < width; x++) {
      if (x > 0) {
        const leaving = x - half - 1;
        const entering = x + half;
        if (leaving >= 0) histogram[bucket(lum[y * width + leaving])]--;
        if (entering < width) histogram[bucket(lum[y * width + entering])]++;
      }
      let mode = 0;
      for (let k = 1; k < buckets; k++) if (histogram[k] > histogram[mode]) mode = k;
      const background = mode * bucketScale + bucketScale / 2;
      const i = y * width + x;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > CONTROL_INK_CHROMA) continue;
      if (Math.abs(lum[i] - background) <= CONTROL_INK_CONTRAST) continue;
      mask[i] = 1;
    }
  }

  const core = Uint8Array.from(mask);
  // Reconnect the thin strokes JPEG splits into fragments before labelling; without this a 1px cross
  // arrives as four corner blobs and no glyph ever reaches the size a control set is drawn at.
  const dilated = new Uint8Array(n);
  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= maxY) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          dilated[ny * width + nx] = 1;
        }
      }
    }
  }
  mask.set(dilated);
  const blobs = [];
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  for (let start = 0; start < maxY * width; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let minX = width, maxX = -1, minY = height, maxYOfBlob = -1;
    let inkCount = 0, sumR = 0, sumG = 0, sumB = 0;
    while (sp) {
      const p = stack[--sp];
      const y = (p / width) | 0;
      const x = p - y * width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxYOfBlob) maxYOfBlob = y;
      // The dilated mask is connectivity only; shape and ink colour come from the undilated strokes,
      // otherwise every blob inherits a pixel of panel background and two glyphs in one ink drift apart.
      if (core[p]) {
        inkCount++;
        sumR += data[p * 4];
        sumG += data[p * 4 + 1];
        sumB += data[p * 4 + 2];
      }
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= maxY) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (!mask[q] || seen[q]) continue;
          seen[q] = 1;
          stack[sp++] = q;
        }
      }
    }
    if (!inkCount) continue;
    blobs.push({
      minX, maxX, minY, maxY: maxYOfBlob,
      w: maxX - minX + 1, h: maxYOfBlob - minY + 1,
      r: sumR / inkCount, g: sumG / inkCount, b: sumB / inkCount,
    });
  }
  return blobs;
}

const blobChroma = (blob) => Math.max(blob.r, blob.g, blob.b) - Math.min(blob.r, blob.g, blob.b);

/**
 * Two glyphs belong to one control set when they are drawn in the same ink.
 *
 * A monochrome set is two near-neutral greys of different lightness - a thin minimise bar reads darker
 * than a 2px box at 1376 px wide - so neutral inks match by hue alone rather than by brightness. A set
 * drawn in one colour matches by hue direction; a red/yellow/green mixture does not, and those are the
 * macOS dots, which already have their own detector.
 */
function sameInk(a, b) {
  const aNeutral = blobChroma(a) <= CONTROL_NEUTRAL_INK_CHROMA;
  const bNeutral = blobChroma(b) <= CONTROL_NEUTRAL_INK_CHROMA;
  if (aNeutral && bNeutral) return true;
  if (aNeutral !== bNeutral) return false;
  const magnitude = Math.hypot(a.r, a.g, a.b) * Math.hypot(b.r, b.g, b.b);
  if (!magnitude) return false;
  return (a.r * b.r + a.g * b.g + a.b * b.b) / magnitude >= CONTROL_INK_HUE_SIMILARITY;
}

/**
 * Looks for an OS window-control glyph triad: a wide, thin minimise bar followed by two box-sized glyphs
 * (maximise/restore and close) on one even baseline with matching gaps, in the top-right of the frame.
 *
 * The shape test is narrow on purpose. Text in the same area is what this must not fire on, and a text
 * line has neighbours it cannot hide: the triad has to stand alone, so a glyph of any size on the same
 * baseline within two cluster widths on either side rejects the candidate. Equality of the two gaps and
 * of the second and third glyph heights is what separates a control set from three accidental glyphs.
 *
 * @param {{width: number, height: number, data: Uint8Array}} image decoded RGBA pixels
 * @returns {boolean} true if a window-control triad is detected
 */
function hasWindowControlTriad(image) {
  const { width } = image;
  const glyphs = findInkBlobs(image).filter((blob) =>
    blob.w >= 3 && blob.w <= CONTROL_GLYPH_MAX_SIZE
    && blob.h >= 1 && blob.h <= CONTROL_GLYPH_MAX_SIZE);
  const centreY = (blob) => (blob.minY + blob.maxY) / 2;
  // Minimise: a horizontal bar, materially wider than it is tall.
  const isBar = (blob) => blob.h <= 7 && blob.w >= 7 && blob.w / blob.h >= 2.2;
  // Maximise/restore and close: box-shaped glyphs of the same size as each other.
  const isBox = (blob) => blob.w >= 6 && blob.h >= 6 && blob.w / blob.h >= 0.6 && blob.w / blob.h <= 1.6;

  for (const bar of glyphs) {
    if (!isBar(bar)) continue;
    for (const box of glyphs) {
      if (box === bar || !isBox(box)) continue;
      if (Math.abs(centreY(box) - centreY(bar)) > 3) continue;
      const firstGap = box.minX - bar.maxX - 1;
      if (firstGap < 5 || firstGap > 26) continue;
      for (const close of glyphs) {
        if (close === bar || close === box || !isBox(close)) continue;
        if (Math.abs(centreY(close) - centreY(box)) > 3) continue;
        if (Math.abs(close.minX - box.maxX - 1 - firstGap) > 3) continue;
        if (Math.abs(close.w - box.w) > Math.max(3, box.w * 0.5)) continue;
        if (Math.abs(close.minY - box.minY) > 3 || Math.abs(close.maxY - box.maxY) > 3) continue;
        if (!sameInk(bar, box) || !sameInk(box, close) || !sameInk(bar, close)) continue;
        // OS window controls live in the top-right corner, never over the left-hand content column.
        if ((bar.minX + close.maxX) / 2 < width * 0.5) continue;
        const reach = firstGap * 2 + (close.maxX - bar.minX);
        const crowd = glyphs.some((other) => {
          if (other === bar || other === box || other === close) return false;
          if (Math.abs(centreY(other) - centreY(box)) > Math.max(6, box.h / 2)) return false;
          return other.maxX >= bar.minX - reach && other.minX <= close.maxX + reach;
        });
        if (crowd) continue;
        return true;
      }
    }
  }
  return false;
}

function findJpegs(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findJpegs(fullPath, list);
    } else if (entry.name.endsWith('.jpg') || entry.name.endsWith('.jpeg')) {
      list.push(fullPath);
    }
  }
  return list;
}

export function scanFrames({ archetypesDir = ARCHETYPES_DIR, trainingDir = TRAINING_DIR, root = ROOT, cleanPins = null, reviewedFindings = {} } = {}) {
  const images = [...findJpegs(archetypesDir), ...findJpegs(trainingDir)].sort();
  const failed = [];
  const exempt = [];
  const stale = [];
  const deviations = [];
  const staleDeviations = [];
  const pinnedFindings = {};
  // Paths this scan already reached a verdict on, so a replaced board is not reported twice: once as
  // chrome and again as a deviation that no longer matches its digest.
  const reported = new Set();
  const hashes = {};
  let decoded = 0;
  for (const image of images) {
    const rel = path.relative(root, image).split(path.sep).join('/');
    // Do not follow a symlink into an unscanned file, even if it happens to contain a valid image.
    if (fs.lstatSync(image).isSymbolicLink()) { failed.push(image); reported.add(rel); continue; }
    const bytes = fs.readFileSync(image);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    hashes[rel] = hash;
    // Content-addressed clean evidence: unchanged bytes need no repeat full-JPEG decode on every fast gate.
    // New or altered images are ALWAYS decoded and fail until a deliberate clean re-pin. A metadata-only
    // change can never waive the first scan, and the pin file is reviewed alongside the changed JPEG.
    if (cleanPins?.[rel] === hash) continue;
    decoded++;
    if (hasBrowserChrome(bytes)) {
      // A reviewed finding is a statement about EXACT bytes: it names the digest it was reviewed against,
      // so a replacement at the same path is scanned as new bytes and fails unless a person re-reviewes it.
      const reviewed = reviewedFindings[rel];
      if (reviewed?.sha256 === hash) { deviations.push(image); pinnedFindings[rel] = reviewed; }
      else if (EXEMPT_HASHES.has(hash)) exempt.push(image);
      else failed.push(image);
      reported.add(rel);
    } else if (cleanPins) {
      stale.push(image);
      failed.push(image);
      reported.add(rel);
    }
  }
  if (cleanPins) for (const rel of Object.keys(cleanPins)) {
    if (Object.hasOwn(hashes, rel)) continue;
    const removed = path.resolve(root, rel);
    stale.push(removed);
    failed.push(removed);
  }
  // Only a full scan decodes a pinned image, so only a full scan can tell that a reviewed deviation has
  // stopped describing the committed bytes. Carrying it forward would launder a board that was replaced by
  // clean bytes into one that may later be replaced by window chrome, so the record has to be re-reviewed.
  if (!cleanPins) for (const rel of Object.keys(reviewedFindings)) {
    if (reported.has(rel)) continue;
    const image = path.resolve(root, rel);
    staleDeviations.push(image);
    failed.push(image);
  }
  return { images, failed, exempt, stale, deviations, staleDeviations, pinnedFindings, hashes, decoded };
}

/**
 * Reads the pin file. Structural validity only - whether the file was written by the current detector is
 * the caller's question, because a deliberate `--pin-clean` has to be able to read the reviewed deviations
 * out of a file written by an older algorithm instead of dropping them.
 */
export function loadScanPins(file = CLEAN_PINS_PATH) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isBoardPath = (fileName) => /^docs\/design\/(?:archetypes|training)\//.test(fileName);
  const reviewedFindings = data.reviewedFindings ?? {};
  if (data.schemaVersion !== 1 || typeof data.algorithm !== 'string'
    || !isPlainObject(data.images) || !isPlainObject(reviewedFindings)
    || Object.entries(data.images).some(([fileName, hash]) => !isBoardPath(fileName) || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('frame scan pins have an invalid version, path or digest');
  }
  for (const [fileName, finding] of Object.entries(reviewedFindings)) {
    if (!isBoardPath(fileName) || !isPlainObject(finding) || data.images[fileName] !== finding.sha256) {
      throw new Error(`frame scan reviewed finding for ${fileName} must name the pinned digest of a scanned board`);
    }
    if (typeof finding.finding !== 'string' || !finding.finding.trim()) {
      throw new Error(`frame scan reviewed finding for ${fileName} must state what window chrome was found`);
    }
    if (typeof finding.bead !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(finding.bead)) {
      throw new Error(`frame scan reviewed finding for ${fileName} must name the bead that accepts the deviation`);
    }
  }
  return { algorithm: data.algorithm, images: data.images, reviewedFindings };
}

/** The document `--pin-clean` writes: the algorithm that produced it, its reviewed deviations and the digests. */
export function frameScanPinDocument({ images, reviewedFindings = {} }) {
  return { schemaVersion: 1, algorithm: SCAN_ALGORITHM, reviewedFindings, images };
}

function runCheck() {
  const pinClean = process.argv.includes('--pin-clean');
  let pins;
  try { pins = loadScanPins(); }
  catch (error) {
    if (error.code !== 'ENOENT' || !pinClean) {
      console.error(`check:archetype-frames - FAILED: ${error.message}; run --pin-clean after inspecting all images`);
      process.exit(1);
    }
    pins = { algorithm: SCAN_ALGORITHM, images: null, reviewedFindings: {} };
  }
  if (!pinClean && pins.algorithm !== SCAN_ALGORITHM) {
    console.error(`check:archetype-frames - FAILED: the pins were written by ${pins.algorithm}, not ${SCAN_ALGORITHM}; run --pin-clean after inspecting all images`);
    process.exit(1);
  }
  const { images, failed, exempt, stale, deviations, staleDeviations, pinnedFindings, hashes, decoded } = scanFrames({
    cleanPins: pinClean ? null : pins.images,
    reviewedFindings: pins.reviewedFindings,
  });
  for (const image of exempt) console.warn(`EXEMPT: Browser chrome detected in ${path.relative(ROOT, image)} (grandfathered image)`);
  for (const image of deviations) {
    const rel = path.relative(ROOT, image).split(path.sep).join('/');
    const { finding, bead } = pins.reviewedFindings[rel];
    console.warn(`DEVIATION: browser chrome detected in ${rel} (reviewed as ${bead}: ${finding})`);
  }
  for (const image of failed) {
    const reason = staleDeviations.includes(image) ? 'reviewed deviation no longer describes these bytes'
      : stale.includes(image) ? 'unverified changed/unpinned JPEG' : 'browser chrome or unscannable link';
    console.error(`check:archetype-frames - FAILED: ${reason} in ${path.relative(ROOT, image)}`);
  }
  if (failed.length || exempt.length) {
    console.error('check:archetype-frames - FAILED: Concept and training-reference images must have a clean, byte-pinned frame scan.');
    process.exit(1);
  }
  const cropLedgerFile = path.join(ROOT, CROP_LEDGER_PATH);
  if (fs.existsSync(cropLedgerFile)) {
    let cropProblems;
    try { cropProblems = cropSourceProblems(JSON.parse(fs.readFileSync(cropLedgerFile, 'utf8'))); }
    catch (error) { cropProblems = [`unreadable crop ledger: ${error.message}`]; }
    for (const problem of cropProblems) console.error(`check:archetype-frames - FAILED: ${problem}`);
    if (cropProblems.length) process.exit(1);
  } else {
    const register = path.join(ROOT, 'docs/provenance/assets/training-reference-boards.md');
    if (fs.existsSync(register) && fs.readFileSync(register, 'utf8').includes('Offline frame removal:')) {
      console.error('check:archetype-frames - FAILED: register claims cropped originals but the crop ledger is missing');
      process.exit(1);
    }
  }
  if (pinClean) {
    fs.writeFileSync(CLEAN_PINS_PATH,
      JSON.stringify(frameScanPinDocument({ images: hashes, reviewedFindings: pinnedFindings }), null, 2) + '\n');
    console.log(`check:archetype-frames - PINNED ${images.length} clean images after decoding ${decoded} JPEGs`
      + (deviations.length ? `; ${deviations.length} reviewed chrome deviation(s) carried forward` : ''));
  } else {
    const reviewed = Object.keys(pins.reviewedFindings).length;
    console.log(`check:archetype-frames - PASS - checked ${images.length} pinned image digests; decoded ${decoded} changed JPEGs`
      + (reviewed ? `; ${reviewed} reviewed chrome deviation(s) pinned` : ''));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCheck();
}
