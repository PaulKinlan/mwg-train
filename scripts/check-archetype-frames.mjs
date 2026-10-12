/**
 * Detects browser chrome (specifically macOS-style traffic lights) in archetype images.
 * Archetype images are supposed to be clean content without window frames.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHETYPES_DIR = path.join(ROOT, 'docs', 'design', 'archetypes');

// These images were generated with browser chrome before this gate was added.
// They are exempt by exact content hash to avoid breaking the sealed evaluation corpus.
// A replacement image at the same path will NOT be exempt.
const EXEMPT_HASHES = new Set([
  'f3ae7b333e8e141e1bb8c63392e440124f7d171f08498a67cb2091183d01c1ca', // fan-community-site/step2-contribution.jpg
]);

/**
 * Parses the JPEG and looks for a macOS-style window frame.
 * @param {Buffer} bytes 
 * @returns {boolean} true if chrome is detected
 */
function hasBrowserChrome(bytes) {

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

function runCheck() {
  const images = findJpegs(ARCHETYPES_DIR);
  let failed = false;

  for (const image of images) {
    const bytes = fs.readFileSync(image);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    
    if (hasBrowserChrome(bytes)) {
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
