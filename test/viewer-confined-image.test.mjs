import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import { readConfinedImage } from '../src/viewer/concepts.mjs';

test('the exported image reader refuses out-of-root paths without relying on its callers', () => {
  const parent = mkdtempSync(join(tmpdir(), 'viewer-image-boundary-'));
  const root = join(parent, 'repo');
  const outside = join(parent, 'private');
  mkdirSync(root);
  mkdirSync(outside);
  const insideFile = join(root, 'board.jpg');
  const outsideFile = join(outside, 'board.jpg');
  const inside = Buffer.from('INSIDE_FIXTURE');
  const secret = Buffer.from('OUTSIDE_FIXTURE');
  try {
    writeFileSync(insideFile, inside);
    writeFileSync(outsideFile, secret);
    assert.deepEqual(readConfinedImage(root, insideFile, 'image/jpeg'), { bytes: inside, type: 'image/jpeg' },
      'a regular file under the root still works');
    assert.equal(readConfinedImage(root, outsideFile, 'image/jpeg'), null, 'an absolute sibling is never confined');
    assert.equal(readConfinedImage(root, `${root}${sep}..${sep}private${sep}board.jpg`, 'image/jpeg'), null,
      'a path containing a literal parent traversal must be refused');
    const dottedDir = join(root, '..private');
    mkdirSync(dottedDir);
    writeFileSync(join(dottedDir, 'board.jpg'), inside);
    assert.deepEqual(readConfinedImage(root, join(dottedDir, 'board.jpg'), 'image/jpeg')?.bytes, inside,
      'a harmless in-root name beginning with two dots must not be rejected');
    assert.equal(readConfinedImage(root, root, 'image/jpeg'), null, 'the root itself is not an image');
    symlinkSync(outside, join(root, 'redirect'), 'dir');
    assert.equal(readConfinedImage(root, join(root, 'redirect', 'board.jpg'), 'image/jpeg'), null,
      'a symlinked ancestor cannot redirect an apparently in-root image read');
    symlinkSync(outsideFile, join(root, 'linked.jpg'));
    assert.equal(readConfinedImage(root, join(root, 'linked.jpg'), 'image/jpeg'), null,
      'an out-of-root symlink leaf remains refused');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
