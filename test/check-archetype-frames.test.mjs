import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import jpeg from 'jpeg-js';
import { frameScanPinDocument, hasBrowserChrome, loadScanPins, scanFrames } from '../scripts/check-archetype-frames.mjs';
import { TRAINING_TARGET_FAMILIES } from '../src/train/targets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function image(withChrome) {
  const width = 320, height = 170;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const dot = withChrome && y >= 12 && y <= 20 ? Math.floor((x - 18) / 20) : -1;
    const rgb = dot === 0 && x >= 18 && x < 25 ? [242, 79, 75]
      : dot === 1 && x >= 38 && x < 45 ? [248, 197, 45]
        : dot === 2 && x >= 58 && x < 65 ? [50, 189, 90] : [235, 239, 242];
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  }
  return jpeg.encode({ width, height, data }, 96).data;
}

/**
 * Draws an OS window-control glyph row the way the offending board draws one: a minimise bar, a
 * maximise/restore box and a close cross, in one ink, evenly spaced, on a flat panel.
 *
 * `glyphs` is the row's shapes in order, so a test can drop the minimise bar or append a fourth glyph and
 * assert the detector stops calling it a window-control set.
 */
function windowControls({ x = 230, y = 20, glyphs = ['bar', 'box', 'cross'], gap = 10, ink = [64, 68, 74], background = [246, 246, 246] } = {}) {
  const width = 320, height = 170, size = 13;
  const data = Buffer.alloc(width * height * 4);
  const put = (px, py) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    const i = (py * width + px) * 4;
    data[i] = ink[0]; data[i + 1] = ink[1]; data[i + 2] = ink[2]; data[i + 3] = 255;
  };
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const i = (py * width + px) * 4;
    data[i] = background[0]; data[i + 1] = background[1]; data[i + 2] = background[2]; data[i + 3] = 255;
  }
  let left = x;
  for (const glyph of glyphs) {
    if (glyph === 'bar') for (let dy = 5; dy < 8; dy++) for (let dx = 0; dx < size; dx++) put(left + dx, y + dy);
    if (glyph === 'box') {
      for (let dx = 0; dx < size; dx++) { put(left + dx, y); put(left + dx, y + 1); put(left + dx, y + size - 2); put(left + dx, y + size - 1); }
      for (let dy = 0; dy < size; dy++) { put(left, y + dy); put(left + 1, y + dy); put(left + size - 2, y + dy); put(left + size - 1, y + dy); }
    }
    if (glyph === 'cross') {
      for (let dy = 0; dy < size; dy++) {
        for (const dx of [dy, size - 1 - dy]) { put(left + dx, y + dy); if (dx + 1 < size) put(left + dx + 1, y + dy); }
      }
    }
    left += size + gap;
  }
  return jpeg.encode({ width, height, data }, 96).data;
}

test('frame gate scans training references as well as archetypes, rejecting chrome and symlinks', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'concept-frame-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archetypesDir = join(root, 'docs/design/archetypes');
  const trainingDir = join(root, 'docs/design/training');
  mkdirSync(join(archetypesDir, 'booking'), { recursive: true });
  mkdirSync(join(trainingDir, 'tr-01'), { recursive: true });
  const board = join(trainingDir, 'tr-01/reference.jpg');
  writeFileSync(join(archetypesDir, 'booking/step1.jpg'), image(false));
  writeFileSync(board, image(true));
  assert.equal(hasBrowserChrome(image(true)), true);
  assert.equal(hasBrowserChrome(image(false)), false);
  let result = scanFrames({ archetypesDir, trainingDir });
  assert.equal(result.images.length, 2);
  assert.deepEqual(result.failed, [board]);
  writeFileSync(board, image(false));
  result = scanFrames({ archetypesDir, trainingDir });
  assert.deepEqual(result.failed, []);
  const pins = Object.fromEntries(result.images.map((file) => [relative(root, file).replaceAll('\\', '/'),
    createHash('sha256').update(readFileSync(file)).digest('hex')]));
  assert.equal(scanFrames({ root, archetypesDir, trainingDir, cleanPins: pins }).decoded, 0,
    'byte-identical clean images need no full-JPEG re-decode');
  writeFileSync(board, image(true));
  result = scanFrames({ root, archetypesDir, trainingDir, cleanPins: pins });
  assert.deepEqual(result.failed, [board], 'changed pixels are decoded and cannot reuse a clean pin');
  assert.equal(result.decoded, 1);
  writeFileSync(board, Buffer.concat([image(false), Buffer.from([0])]));
  result = scanFrames({ root, archetypesDir, trainingDir, cleanPins: pins });
  assert.deepEqual(result.failed, [board], 'a byte-changed but visually clean JPEG needs a deliberate re-pin too');
  assert.deepEqual(result.stale, [board]);
  rmSync(board);
  symlinkSync(join(archetypesDir, 'booking/step1.jpg'), board);
  assert.deepEqual(scanFrames({ archetypesDir, trainingDir }).failed, [board], 'a symlink cannot hide a board from the gate');
});

test('the frame gate reads an OS window-control glyph triad as chrome, not only macOS dots', (t) => {
  // mwg-train-m5ws: Signal Grid's victory dialog was drawn with a monochrome "- [] X" set. The dot
  // detector cannot see a glyph set, so the gate passed a board whose brief asked for a native <dialog>.
  assert.equal(hasBrowserChrome(windowControls()), true,
    'a minimise bar plus maximise and close glyphs in the top-right is window chrome');
  assert.equal(hasBrowserChrome(windowControls({ ink: [250, 250, 250], background: [24, 28, 36] })), true,
    'the same set drawn light-on-dark is the same chrome');
  assert.equal(hasBrowserChrome(image(false)), false, 'a plain page is not chrome');

  const root = mkdtempSync(join(tmpdir(), 'window-control-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archetypesDir = join(root, 'docs/design/archetypes');
  const trainingDir = join(root, 'docs/design/training');
  mkdirSync(join(archetypesDir, 'booking'), { recursive: true });
  mkdirSync(trainingDir, { recursive: true });
  const dialog = join(archetypesDir, 'booking/step4-victory.jpg');
  writeFileSync(dialog, windowControls());
  assert.deepEqual(scanFrames({ archetypesDir, trainingDir }).failed, [dialog],
    'a board drawn with window controls fails the gate even though it has no traffic lights');
});

test('a triad detector that fires on three ordinary glyphs would be worse than no gate', () => {
  // Specificity is the whole point: a text line in the same corner must not fail the build. Each case
  // below keeps three glyph-shaped blobs in the top-right and removes exactly one property of a control set.
  assert.equal(hasBrowserChrome(windowControls({ glyphs: ['box', 'box', 'box'] })), false,
    'three box-shaped glyphs have no minimise bar');
  assert.equal(hasBrowserChrome(windowControls({ glyphs: ['bar', 'box', 'cross', 'box'] })), false,
    'a fourth glyph on the same baseline is a button row or text, not a window control set');
  assert.equal(hasBrowserChrome(windowControls({ glyphs: ['bar', 'bar', 'bar'] })), false,
    'three bars are a menu, not minimise/maximise/close');
  assert.equal(hasBrowserChrome(windowControls({ x: 30 })), false,
    'a left-hand glyph row is page content, not window chrome');
  assert.equal(hasBrowserChrome(windowControls({ y: 120 })), false,
    'the bottom of the page is not a window header');
  assert.equal(hasBrowserChrome(windowControls({ glyphs: ['bar', 'box', 'cross'], gap: 60 })), false,
    'controls sit in one tight group, so a widely spaced row is not one');
});

test('a reviewed deviation accepts exactly the bytes that were reviewed, and nothing else', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'window-control-deviation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archetypesDir = join(root, 'docs/design/archetypes');
  const trainingDir = join(root, 'docs/design/training');
  mkdirSync(join(archetypesDir, 'booking'), { recursive: true });
  mkdirSync(trainingDir, { recursive: true });
  const dialog = join(archetypesDir, 'booking/step4-victory.jpg');
  writeFileSync(dialog, windowControls());
  const rel = relative(root, dialog).replaceAll('\\', '/');
  const digest = createHash('sha256').update(readFileSync(dialog)).digest('hex');
  const reviewedFindings = { [rel]: { sha256: digest, finding: 'minimise/maximise/close glyph triad', bead: 'mwg-train-m5ws' } };
  const reviewed = scanFrames({ root, archetypesDir, trainingDir, reviewedFindings });
  assert.deepEqual(reviewed.failed, [], 'the reviewed bytes are recorded, not silently passed');
  assert.deepEqual(reviewed.deviations, [dialog], 'the reviewed bytes are still reported as a deviation');
  assert.deepEqual(reviewed.pinnedFindings, reviewedFindings, 'a re-pin carries the reviewed record forward');

  writeFileSync(dialog, windowControls({ ink: [12, 12, 12] }));
  const replaced = scanFrames({ root, archetypesDir, trainingDir, reviewedFindings });
  assert.deepEqual(replaced.failed, [dialog], 'a replacement at the same path is new bytes and must be re-reviewed');

  writeFileSync(dialog, image(false));
  const cleaned = scanFrames({ root, archetypesDir, trainingDir, reviewedFindings });
  assert.deepEqual(cleaned.failed, [dialog], 'the deviation has to be removed once the board is clean');
  assert.deepEqual(cleaned.staleDeviations, [dialog], 'a deviation that no longer describes the bytes is stale');
});

test('a recorded deviation is only accepted when it names the pinned digest, what was found and its bead', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'window-control-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const board = join(root, 'docs/design/archetypes/booking/step4-victory.jpg');
  mkdirSync(join(root, 'docs/design/archetypes/booking'), { recursive: true });
  writeFileSync(board, windowControls());
  const rel = 'docs/design/archetypes/booking/step4-victory.jpg';
  const digest = createHash('sha256').update(readFileSync(board)).digest('hex');
  const pinsFile = join(root, 'pins.json');
  const write = (reviewedFindings) => writeFileSync(pinsFile,
    JSON.stringify({ schemaVersion: 1, algorithm: 'window-chrome-v3', reviewedFindings, images: { [rel]: digest } }));
  const finding = { sha256: digest, finding: 'minimise/maximise/close glyph triad', bead: 'mwg-train-m5ws' };

  write({ [rel]: finding });
  assert.deepEqual(loadScanPins(pinsFile).reviewedFindings, { [rel]: finding });
  write({ [rel]: { ...finding, sha256: 'a'.repeat(64) } });
  assert.throws(() => loadScanPins(pinsFile), /must name the pinned digest of a scanned board/,
    'a finding that does not name the committed bytes could excuse bytes nobody reviewed');
  write({ [rel]: { ...finding, finding: ' ' } });
  assert.throws(() => loadScanPins(pinsFile), /must state what window chrome was found/);
  write({ [rel]: { ...finding, bead: 'not a bead' } });
  assert.throws(() => loadScanPins(pinsFile), /must name the bead that accepts the deviation/);
  write({ [`${rel.replace('booking', 'booking2')}`]: finding });
  assert.throws(() => loadScanPins(pinsFile), /must name the pinned digest of a scanned board/,
    'a finding cannot point at a board the pin set does not contain');
  write({});
  assert.equal(loadScanPins(pinsFile).algorithm, 'window-chrome-v3', 'the run compares this to its own detector');
});

test('every declared training board is included in the real frame scan', () => {
  const pins = loadScanPins();
  const result = scanFrames({ cleanPins: pins.images, reviewedFindings: pins.reviewedFindings });
  assert.equal(result.decoded, 0, 'unchanged current files must use reviewed SHA pins, not re-decode 67 full JPEGs every fast gate');
  assert.equal(Object.keys(pins.images).length, result.images.length);
  const training = result.images.filter((file) => file.startsWith(join(ROOT, 'docs/design/training/')));
  for (const family of TRAINING_TARGET_FAMILIES) {
    assert.ok(training.includes(join(ROOT, 'docs/design/training', family.family_id, 'reference.jpg')),
      `${family.family_id}: the frame scanner must include its committed reference`);
  }
  assert.deepEqual(result.failed, [], 'no committed training board may retain a detected browser frame');
  assert.deepEqual(result.deviations, [], 'a routine gate decodes nothing, so it cannot re-report a reviewed deviation');
});

test('the reviewed deviations are the two step 4 boards the extended detector actually finds', () => {
  // The pin set is the regression corpus: with short digests already pinned, decoding just the recorded
  // deviations keeps the detector honest without re-decoding all 251 boards on every gate.
  const pins = loadScanPins();
  const recorded = Object.keys(pins.reviewedFindings).sort();
  assert.deepEqual(recorded, [
    'docs/design/archetypes/browser-puzzle-game/dark/step4-victory-stats-dialog.jpg',
    'docs/design/archetypes/browser-puzzle-game/step4-victory-stats-dialog.jpg',
  ], 'the only accepted window-chrome deviation is Signal Grid step 4 (mwg-train-m5ws)');
  for (const file of recorded) {
    const bytes = readFileSync(join(ROOT, file));
    assert.equal(pins.images[file], createHash('sha256').update(bytes).digest('hex'), `${file}: reviewed digest`);
    assert.equal(pins.reviewedFindings[file].bead, 'mwg-train-m5ws', `${file}: the bead that accepts it`);
    assert.equal(hasBrowserChrome(bytes), true,
      `${file}: a detector regression here would quietly drop the finding from the tree`);
  }
  assert.equal(Object.keys(pins.images).length, 251, 'the pin set covers the whole committed corpus');
  assert.equal(frameScanPinDocument({ images: pins.images, reviewedFindings: pins.reviewedFindings }).algorithm,
    'window-chrome-v3', 'the pins name the detector that produced them');
});
