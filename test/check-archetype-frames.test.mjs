import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import jpeg from 'jpeg-js';
import { hasBrowserChrome, loadCleanPins, scanFrames } from '../scripts/check-archetype-frames.mjs';
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

test('every declared training board is included in the real frame scan', () => {
  const pins = loadCleanPins();
  const result = scanFrames({ cleanPins: pins });
  assert.equal(result.decoded, 0, 'unchanged current files must use reviewed SHA pins, not re-decode 67 full JPEGs every fast gate');
  assert.equal(Object.keys(pins).length, result.images.length);
  const training = result.images.filter((file) => file.startsWith(join(ROOT, 'docs/design/training/')));
  for (const family of TRAINING_TARGET_FAMILIES) {
    assert.ok(training.includes(join(ROOT, 'docs/design/training', family.family_id, 'reference.jpg')),
      `${family.family_id}: the frame scanner must include its committed reference`);
  }
  assert.deepEqual(result.failed, [], 'no committed training board may retain a detected browser frame');
});
