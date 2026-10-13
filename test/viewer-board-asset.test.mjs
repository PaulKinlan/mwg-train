import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createViewer, registeredBoardAsset } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function fixture(t) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'viewer-board-fixture-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const siteDir = join(repoRoot, 'site');
  const assetsDir = join(repoRoot, 'assets', 'archetypes', 'account-recovery');
  const imagesDir = join(assetsDir, 'images');
  mkdirSync(siteDir, { recursive: true });
  mkdirSync(imagesDir, { recursive: true });
  const bytes = Buffer.from('registered-board-image');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(imagesDir, 'board.jpg'), bytes);
  writeFileSync(join(assetsDir, 'set.json'), JSON.stringify({ archetype: 'account-recovery', images: [
    { name: 'board.jpg', sha256, bytes: bytes.length },
  ] }));
  writeFileSync(join(siteDir, 'server.mjs'), `const ASSET_STORE = "assets/archetypes/account-recovery";\nconst ASSET_DIGESTS = {"board.jpg":"${sha256}"};\n`);
  return { repoRoot, siteDir, assetsDir, imagesDir, bytes, sha256, archetype: 'account-recovery', name: 'board.jpg' };
}

test('only the generated server and register agreement can expose a verified board', (t) => {
  const asset = fixture(t);
  const valid = registeredBoardAsset(asset);
  assert.equal(valid?.type, 'image/jpeg');
  assert.deepEqual(valid?.body, asset.bytes);
  assert.equal(registeredBoardAsset({ ...asset, name: '../board.jpg' }), null);
  assert.equal(registeredBoardAsset({ ...asset, archetype: '../../secrets' }), null);
  assert.equal(registeredBoardAsset({ ...asset, name: 'unregistered.jpg' }), null);

  writeFileSync(join(asset.imagesDir, asset.name), 'modified-board-image');
  assert.equal(registeredBoardAsset(asset), null, 'changed image bytes fail the pin');
  writeFileSync(join(asset.imagesDir, asset.name), asset.bytes);
  writeFileSync(join(asset.siteDir, 'server.mjs'), 'no asset pins in this server');
  assert.equal(registeredBoardAsset(asset), null, 'a server with no board pin cannot receive an image');
  writeFileSync(join(asset.siteDir, 'server.mjs'), `const ASSET_STORE = "assets/archetypes/account-recovery";\nconst ASSET_DIGESTS = {"board.jpg":"${asset.sha256}"};\n`);
  writeFileSync(join(asset.assetsDir, 'set.json'), JSON.stringify({ archetype: asset.archetype, images: [
    { name: asset.name, sha256: '0'.repeat(64), bytes: asset.bytes.length },
  ] }));
  assert.equal(registeredBoardAsset(asset), null, 'a changed register cannot override the generated tree pin');
});

test('a symlinked board cannot expose an arbitrary host file to a site', (t) => {
  const asset = fixture(t);
  rmSync(join(asset.imagesDir, asset.name));
  writeFileSync(join(asset.repoRoot, 'private-file'), asset.bytes);
  symlinkSync(join(asset.repoRoot, 'private-file'), join(asset.imagesDir, asset.name));
  assert.equal(registeredBoardAsset(asset), null);
});

test('live proxy serves the pinned board as an image and still proxies ordinary site files', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-board-state-'));
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), repoRoot: ROOT, stateDir, allowAnonymous: true });
  t.after(async () => {
    pool.stopAll();
    await Promise.all([new Promise((done) => server.close(done)), new Promise((done) => liveServer.close(done))]);
    rmSync(stateDir, { recursive: true, force: true });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  await new Promise((done) => liveServer.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${liveServer.address().port}/live/account-recovery-hono/original`;
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<img[^>]*alt="Reference board for account-recovery"/);
  const board = await fetch(`${base}/app/step1-request.jpg`);
  assert.equal(board.status, 200);
  assert.equal(board.headers.get('content-type'), 'image/jpeg');
  assert.equal(board.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(board.headers.get('x-asset-source'), 'registered-board');
  const actual = createHash('sha256').update(Buffer.from(await board.arrayBuffer())).digest('hex');
  const register = JSON.parse(readFileSync(join(ROOT, 'assets/archetypes/account-recovery/set.json')));
  assert.equal(actual, register.images.find((image) => image.name === 'step1-request.jpg').sha256);
  const head = await fetch(`${base}/app/step1-request.jpg`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(register.images[0].bytes));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(`${base}/app/not-registered.jpg`)).status, 404);
  const stylesheet = await fetch(`${base}/app/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.notEqual(stylesheet.headers.get('x-asset-source'), 'registered-board');
});
