/**
 * Detects browser chrome (specifically macOS-style traffic lights) in archetype and training-reference images.
 * These images are supposed to be clean page content without window frames.
 * If chrome is detected on an un-exempted image, this check fails closed.
 * 
 * Note: We only check for macOS traffic lights because mwg-train's generated
 * chrome is exclusively macOS-style (as defined in its generation prompts).
 * The detector catches both standard saturated traffic lights and dark slate
 * monochrome dot triplets (even when pushed down by desktop-blur wrappers).
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
const SCAN_ALGORITHM = 'macos-triplets-chroma-v2';

// These images were generated with browser chrome before this gate was added.
// They are exempt by exact content hash to avoid breaking the sealed evaluation corpus.
// A replacement image at the same path will NOT be exempt.
const EXEMPT_HASHES = new Set([
]);

/**
 * Parses the JPEG and looks for a macOS-style window frame.
 * @param {Buffer} bytes 
 * @returns {boolean} true if chrome is detected
 */
export function hasBrowserChrome(bytes) {

  let rawImageData;
  try {
    rawImageData = jpeg.decode(bytes, { useTArray: true });
  } catch (e) {
    console.error(`Error decoding image: ${e.message}`);
    return true; // Fail closed on decode failures
  }
  
  if (!rawImageData) return true; // Fail closed if no data
  
  const { width, height, data } = rawImageData;
  
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

export function scanFrames({ archetypesDir = ARCHETYPES_DIR, trainingDir = TRAINING_DIR, root = ROOT, cleanPins = null } = {}) {
  const images = [...findJpegs(archetypesDir), ...findJpegs(trainingDir)].sort();
  const failed = [];
  const exempt = [];
  const stale = [];
  const hashes = {};
  let decoded = 0;
  for (const image of images) {
    const rel = path.relative(root, image).split(path.sep).join('/');
    // Do not follow a symlink into an unscanned file, even if it happens to contain a valid image.
    if (fs.lstatSync(image).isSymbolicLink()) { failed.push(image); continue; }
    const bytes = fs.readFileSync(image);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    hashes[rel] = hash;
    // Content-addressed clean evidence: unchanged bytes need no repeat full-JPEG decode on every fast gate.
    // New or altered images are ALWAYS decoded and fail until a deliberate clean re-pin. A metadata-only
    // change can never waive the first scan, and the pin file is reviewed alongside the changed JPEG.
    if (cleanPins?.[rel] === hash) continue;
    decoded++;
    if (hasBrowserChrome(bytes)) {
      if (EXEMPT_HASHES.has(hash)) exempt.push(image);
      else failed.push(image);
    } else if (cleanPins) {
      stale.push(image);
      failed.push(image);
    }
  }
  if (cleanPins) for (const rel of Object.keys(cleanPins)) {
    if (Object.hasOwn(hashes, rel)) continue;
    const removed = path.resolve(root, rel);
    stale.push(removed);
    failed.push(removed);
  }
  return { images, failed, exempt, stale, hashes, decoded };
}

export function loadCleanPins(file = CLEAN_PINS_PATH) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schemaVersion !== 1 || data.algorithm !== SCAN_ALGORITHM || !data.images
    || typeof data.images !== 'object' || Array.isArray(data.images)
    || Object.entries(data.images).some(([fileName, hash]) => !/^docs\/design\/(?:archetypes|training)\//.test(fileName)
      || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('frame scan pins have an invalid version, path or digest');
  return data.images;
}

function runCheck() {
  const pinClean = process.argv.includes('--pin-clean');
  let cleanPins = null;
  if (!pinClean) {
    try { cleanPins = loadCleanPins(); }
    catch (error) { console.error(`check:archetype-frames - FAILED: ${error.message}; run --pin-clean after inspecting all images`); process.exit(1); }
  }
  const { images, failed, exempt, stale, hashes, decoded } = scanFrames({ cleanPins });
  for (const image of exempt) console.warn(`EXEMPT: Browser chrome detected in ${path.relative(ROOT, image)} (grandfathered image)`);
  for (const image of failed) console.error(`check:archetype-frames - FAILED: ${stale.includes(image) ? 'unverified changed/unpinned JPEG' : 'browser chrome or unscannable link'} in ${path.relative(ROOT, image)}`);
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
    fs.writeFileSync(CLEAN_PINS_PATH, JSON.stringify({ schemaVersion: 1, algorithm: SCAN_ALGORITHM, images: hashes }, null, 2) + '\n');
    console.log(`check:archetype-frames - PINNED ${images.length} clean images after decoding ${decoded} JPEGs`);
  } else console.log(`check:archetype-frames - PASS - checked ${images.length} pinned image digests; decoded ${decoded} changed JPEGs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCheck();
}
