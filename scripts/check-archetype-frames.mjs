/**
 * Detects browser chrome (specifically macOS-style traffic lights) in archetype images.
 * Archetype images are supposed to be clean content without window frames.
 * If chrome is detected on an un-exempted image, this check fails closed.
 * 
 * Note: We only check for macOS traffic lights because mwg-train's generated
 * chrome is exclusively macOS-style (as defined in its generation prompts).
 * A generic solid-band check for Windows/ChromeOS frames produces false
 * positives on flat website navbars. Known framing defects without colored
 * traffic lights are explicitly flagged by hash.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import jpeg from 'jpeg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHETYPES_DIR = path.join(ROOT, 'docs', 'design', 'archetypes');

// These images were generated with browser chrome before this gate was added.
// They are exempt by exact content hash to avoid breaking the sealed evaluation corpus.
// A replacement image at the same path will NOT be exempt.
const EXEMPT_HASHES = new Set([
  '3a7f56d2fc42661a89d067a301c2035dbb89804bacb2533d28d0e745afdf5c11', // booking/step1-browse.jpg
  '73633dd4b1c0a5ae877ec8bdcbe41c1260c4fbf48d25a3f9fac64e1884615074', // booking/step2-form.jpg
  '1b65cd87c9c693be2a159a3f3ead25ae32c4f3faaec664ea7d80684fce6e31ef', // booking/step3-confirmation.jpg
  'd018d5b50bae312f497445e3e449191ea8c3ac6cccbd5c6058463d738e7d06f8', // booking/step4-error.jpg
  '6eae324018056198c8020855961eeb734db79f403355035ed36147c078540b3e', // booking/step5-empty.jpg
  '948370acf1df59694dee09ef8e1f39d71828b4e509dfcfd3503ad6860982fe60', // editorial-blog/step1-index.jpg
  'f04fa714789fa5fe2a4e57c4282fa8c36f64f14558f5add246cd4644edc1a3ea', // event-registration/step1-event.jpg
  'f3ae7b333e8e141e1bb8c63392e440124f7d171f08498a67cb2091183d01c1ca', // fan-community-site/step2-contribution.jpg
  '84730c4bdb444f05892c75bb54bee3fa84640e8eae67638409caf60eec7cbe39'  // account-recovery/step2-sent.jpg
]);

// Framing defects that do not have macOS traffic lights (e.g. solid address bars)
// that our heuristic skips to avoid false positives.
const KNOWN_FRAME_DEFECT_HASHES = new Set([
  '84730c4bdb444f05892c75bb54bee3fa84640e8eae67638409caf60eec7cbe39'  // account-recovery/step2-sent.jpg
]);

/**
 * Parses the JPEG and looks for a macOS-style window frame.
 * @param {Buffer} bytes 
 * @param {string} hash
 * @returns {boolean} true if chrome is detected
 */
function hasBrowserChrome(bytes, hash) {
  if (KNOWN_FRAME_DEFECT_HASHES.has(hash)) {
    return true; // Explicitly flag known framing defects without colored traffic lights
  }

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
  const isRed = (r, g, b) => r > 180 && g < 130 && b < 130;
  const isYellow = (r, g, b) => r > 180 && g > 130 && b < 130;
  const isGreen = (r, g, b) => r < 130 && g > 150 && b < 130;

  // Search the top 100 pixels for a row containing the three circles
  for (let y = 0; y < Math.min(100, height); y++) {
    let foundRed = -1;
    let foundYellow = -1;
    
    for (let x = 0; x < Math.min(200, width); x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      if (isRed(r, g, b)) {
        foundRed = x;
      }
      if (isYellow(r, g, b) && foundRed !== -1 && x - foundRed > 5 && x - foundRed < 30) {
        foundYellow = x;
      }
      if (isGreen(r, g, b) && foundYellow !== -1 && x - foundYellow > 5 && x - foundYellow < 30) {
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

function runCheck() {
  const images = findJpegs(ARCHETYPES_DIR);
  let failed = false;

  for (const image of images) {
    const bytes = fs.readFileSync(image);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    
    if (hasBrowserChrome(bytes, hash)) {
      const relPath = path.relative(ROOT, image);
      if (EXEMPT_HASHES.has(hash)) {
        console.warn(`EXEMPT: Browser chrome detected in ${relPath} (grandfathered image)`);
      } else {
        console.error(`check:archetype-frames - FAILED: Browser chrome detected in ${relPath}`);
        failed = true;
      }
    }
  }

  if (failed) {
    console.error(`check:archetype-frames - FAILED: Archetype images must not contain browser/OS window frames.`);
    process.exit(1);
  } else {
    console.log(`check:archetype-frames - PASS - checked ${images.length} images for browser chrome`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCheck();
}
