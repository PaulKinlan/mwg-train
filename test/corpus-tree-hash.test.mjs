/**
 * Tree-hash tests: the snapshot hash a record's `*_sha` carries must cover every file in the tree.
 *
 * mwg-train-yvop pinned here: `readdirSync(..., { withFileTypes: true })` reports a symlink as a
 * symlink, never as a directory, so a walk that tested `entry.isDirectory()` alone stepped over a
 * linked subtree and hashed a tree without its files. These tests assert that a linked directory is
 * hashed like a real one, and that following the link cannot loop: a cyclic link, and a directory
 * reachable under two names, both terminate and hash deterministically.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hashTree } from '../src/corpus/tree-hash.mjs';

/** Write `files` under a fresh temp directory and return its path. */
function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'tree-hash-test-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}

function cleanup(t, ...roots) {
  t.after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });
}

test('a file inside a symlinked directory is part of the hash', (t) => {
  const outside = makeTree({ 'plugin.html': '<p>linked</p>' });
  const root = makeTree({ 'index.html': '<p>home</p>' });
  const control = makeTree({ 'index.html': '<p>home</p>' });
  cleanup(t, outside, root, control);

  symlinkSync(outside, join(root, 'linked'), 'dir');

  assert.notEqual(hashTree(root), hashTree(control), 'the linked subtree must change the hash');
});

test('a symlinked directory hashes exactly like a real directory of the same content', (t) => {
  const outside = makeTree({ 'plugin/plugin.html': '<p>linked</p>' });
  const linked = makeTree({ 'index.html': '<p>home</p>' });
  const real = makeTree({ 'index.html': '<p>home</p>', 'plugin/plugin.html': '<p>linked</p>' });
  cleanup(t, outside, linked, real);

  symlinkSync(join(outside, 'plugin'), join(linked, 'plugin'), 'dir');

  assert.equal(hashTree(linked), hashTree(real), 'a link must not be a different species of directory');
});

test('a cyclic symlink terminates and adds nothing to the hash', (t) => {
  const root = makeTree({ 'index.html': '<p>home</p>' });
  const control = makeTree({ 'index.html': '<p>home</p>' });
  cleanup(t, root, control);

  symlinkSync(root, join(root, 'loop'), 'dir');
  mkdirSync(join(root, 'nested'));
  symlinkSync(root, join(root, 'nested', 'back-to-root'), 'dir');

  assert.equal(hashTree(root), hashTree(control), 'a cycle walks no new files, so the hash is unchanged');
});

test('a directory reachable under two names is hashed once, under the first sorted name', (t) => {
  const root = makeTree({ 'index.html': '<p>home</p>', 'plugins/plugin.html': '<p>shared</p>' });
  const control = makeTree({ 'index.html': '<p>home</p>', 'plugins/plugin.html': '<p>shared</p>' });
  cleanup(t, root, control);

  // `plugins` sorts before `vendor`, so the real path is hashed under `plugins/` and the alias is
  // dropped. Counting the same bytes twice would make the hash depend on how many names a tree has.
  symlinkSync(join(root, 'plugins'), join(root, 'vendor'), 'dir');

  assert.equal(hashTree(root), hashTree(control));
});

test('a symlink named node_modules is still skipped', (t) => {
  const outside = makeTree({ 'x.js': 'installed()' });
  const root = makeTree({ 'index.html': '<p>home</p>' });
  const control = makeTree({ 'index.html': '<p>home</p>' });
  cleanup(t, outside, root, control);

  symlinkSync(outside, join(root, 'node_modules'), 'dir');

  assert.equal(hashTree(root), hashTree(control), 'the node_modules skip is by name, before any stat follows the link');
});
