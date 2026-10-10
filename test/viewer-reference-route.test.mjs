import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

// A real JPEG, taken from the tree rather than invented, so the positive case is not passing on a fixture that only
// looks like one.
const REAL_JPEG = readFileSync(join(ROOT, 'docs', 'design', 'training', 'tr-01', 'reference.jpg'));

async function serve(t, repoRoot) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-reference-state-'));
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot });
  t.after(() => { pool.stopAll(); server.close(); liveServer.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${server.address().port}`;
}

// A tree where the reference boards are addressed: one genuine JPEG, one file that is named reference.jpg but is HTML,
// one family reached only through a symlink, and one family with nothing at all.
function boardTree() {
  const root = mkdtempSync(join(tmpdir(), 'viewer-reference-repo-'));
  const training = join(root, 'docs', 'design', 'training');
  mkdirSync(join(training, 'tr-01'), { recursive: true });
  writeFileSync(join(training, 'tr-01', 'reference.jpg'), REAL_JPEG);
  mkdirSync(join(training, 'tr-02'), { recursive: true });
  writeFileSync(join(training, 'tr-02', 'reference.jpg'), '<!doctype html><script>alert(1)</script>');
  symlinkSync(join(training, 'tr-01'), join(training, 'tr-03'));
  mkdirSync(join(root, 'data', 'A1_self_generated', 'targets', 'tr-01'), { recursive: true });
  writeFileSync(join(root, 'data', 'A1_self_generated', 'targets', 'tr-01', 'target.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return root;
}

test('reference route serves a real board with nosniff, and refuses anything that is not one', async (t) => {
  const root = boardTree();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = await serve(t, root);

  const good = await fetch(`${base}/tuning/reference/tr-01.jpg`);
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('content-type'), 'image/jpeg');
  // The point of this bead: without nosniff a browser is free to sniff the bytes and decide they are something else.
  assert.equal(good.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await good.arrayBuffer()), REAL_JPEG);

  // The extension and the content-type are a claim about the bytes. This file is named reference.jpg and is HTML.
  const liar = await fetch(`${base}/tuning/reference/tr-02.jpg`);
  assert.equal(liar.status, 404, 'a file named reference.jpg that is not a JPEG must not be served');

  // A symlinked family is not an authored board, the same posture the route already took before this change.
  const linked = await fetch(`${base}/tuning/reference/tr-03.jpg`);
  assert.equal(linked.status, 404, 'a symlinked reference board must not be served');

  const absent = await fetch(`${base}/tuning/reference/tr-99.jpg`);
  assert.equal(absent.status, 404);
});

test('the sibling tuning target route sets nosniff too, because the defect was the class not the instance', async (t) => {
  const root = boardTree();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = await serve(t, root);

  const target = await fetch(`${base}/tuning/target/tr-01.png`);
  assert.equal(target.status, 200);
  assert.equal(target.headers.get('x-content-type-options'), 'nosniff');
});
