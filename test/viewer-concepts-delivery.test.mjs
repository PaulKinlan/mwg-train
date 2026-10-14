import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { inflateSync, gunzipSync } from 'node:zlib';

import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function serve(t, { repoRoot = ROOT, allowAnonymous = true } = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), 'concept-delivery-state-'));
  const { server, liveServer, pool } = createViewer({
    corpusRoot: join(ROOT, 'pilot'), repoRoot, stateDir, allowAnonymous, authToken: 'delivery-test-token',
  });
  t.after(() => {
    pool.stopAll();
    server.close();
    liveServer.close();
    rmSync(stateDir, { recursive: true, force: true });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${server.address().port}/concepts`;
}

function rawGet(url, headers = {}) {
  return new Promise((resolveResponse, rejectResponse) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', rejectResponse);
      response.on('end', () => resolveResponse({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks) }));
    });
    request.on('error', rejectResponse);
    request.end();
  });
}

test('/concepts negotiates gzip/deflate without changing its authored HTML or other route policies', async (t) => {
  const url = await serve(t);
  const plain = await rawGet(url);
  const gzip = await rawGet(url, { 'accept-encoding': 'gzip, deflate' });
  const deflate = await rawGet(url, { 'accept-encoding': 'deflate' });
  assert.equal(plain.status, 200);
  assert.equal(gzip.status, 200);
  assert.equal(deflate.status, 200);
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.equal(deflate.headers['content-encoding'], 'deflate');
  assert.deepEqual(gunzipSync(gzip.body), plain.body);
  assert.deepEqual(inflateSync(deflate.body), plain.body);
  assert.ok(plain.body.includes(Buffer.from('href="/concepts/pattern/booking"')));
  assert.ok(plain.body.includes(Buffer.from('href="/concepts/family/tr-01"')));
  assert.ok(!plain.body.includes(Buffer.from('<summary>Site Generation Prompt')), 'the index must not inline every prompt');
  assert.ok(plain.body.length < 60_000, 'the no-JS index has a small, bounded HTML budget');
  assert.ok(gzip.body.length < plain.body.length * 0.3, 'gzip must substantially reduce the actual wire bytes');
  for (const path of ['/pattern/booking', '/family/tr-01']) {
    const detail = await rawGet(url + path);
    const packed = await rawGet(url + path, { 'accept-encoding': 'gzip' });
    assert.equal(detail.status, 200, `${path} serves a detail page`);
    assert.equal(packed.status, 200);
    assert.ok(detail.body.includes(Buffer.from('<summary>Site Generation Prompt')), `${path} has native details without JS`);
    assert.ok(detail.body.length < 160_000, `${path} loads one scope, not all families and patterns`);
    assert.deepEqual(gunzipSync(packed.body), detail.body);
    assert.equal(packed.headers['cache-control'], 'private, no-cache');
    assert.match(packed.headers.etag, /^W\/"[a-f0-9]{64}-gzip"$/);
  }
  assert.equal(Number(gzip.headers['content-length']), gzip.body.length);
  assert.equal(Number(deflate.headers['content-length']), deflate.body.length);
  for (const response of [plain, gzip, deflate]) {
    assert.equal(response.headers['cache-control'], 'private, no-cache');
    assert.equal(response.headers.vary, 'Accept-Encoding');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  }
  const health = await rawGet(url.replace('/concepts', '/healthz'), { 'accept-encoding': 'gzip' });
  assert.equal(health.headers['content-encoding'], undefined, 'compression is route-local, not a global viewer policy');
});

test('/concepts revalidates per representation after authentication and respects q=0', async (t) => {
  const url = await serve(t, { allowAnonymous: false });
  const authorized = { authorization: 'Bearer delivery-test-token', 'accept-encoding': 'gzip' };
  const first = await rawGet(url, authorized);
  assert.equal(first.status, 200);
  assert.match(first.headers.etag, /^W\/"[a-f0-9]{64}-gzip"$/);
  const fresh = await rawGet(url, { ...authorized, 'if-none-match': first.headers.etag });
  assert.equal(fresh.status, 304);
  assert.equal(fresh.body.length, 0);
  assert.equal(fresh.headers.etag, first.headers.etag);
  assert.equal(fresh.headers.vary, 'Accept-Encoding');
  assert.equal(fresh.headers['cache-control'], 'private, no-cache');
  assert.equal(fresh.headers['x-content-type-options'], 'nosniff');
  assert.equal(fresh.headers['content-security-policy'], first.headers['content-security-policy']);
  const refused = await rawGet(url, { 'accept-encoding': 'gzip', 'if-none-match': first.headers.etag });
  assert.equal(refused.status, 401, 'a cached validator must never bypass viewer authentication');
  const identity = await rawGet(url, { authorization: authorized.authorization, 'accept-encoding': 'gzip;q=0,deflate;q=0',
    'if-none-match': first.headers.etag });
  assert.equal(identity.status, 200, 'an identity variant cannot 304 a gzip-only cached representation');
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.notEqual(identity.headers.etag, first.headers.etag);
  const unacceptable = await rawGet(url, { authorization: authorized.authorization,
    'accept-encoding': 'gzip;q=0,deflate;q=0,identity;q=0' });
  assert.equal(unacceptable.status, 406);
  assert.equal(unacceptable.body.length, 0);
  for (const path of ['/pattern/booking', '/family/tr-01']) {
    const detail = await rawGet(url + path, authorized);
    assert.equal(detail.status, 200);
    const revalidated = await rawGet(url + path, { ...authorized, 'if-none-match': detail.headers.etag });
    assert.equal(revalidated.status, 304, `${path} retains private representation-specific 304s`);
    assert.equal(revalidated.headers.etag, detail.headers.etag);
    assert.equal((await rawGet(url + path, { 'if-none-match': detail.headers.etag })).status, 401,
      `${path} must authenticate before revalidation`);
    const otherEncoding = await rawGet(url + path, { authorization: authorized.authorization,
      'accept-encoding': 'gzip;q=0,deflate;q=0', 'if-none-match': detail.headers.etag });
    assert.equal(otherEncoding.status, 200, `${path} cannot 304 a different representation`);
    assert.notEqual(otherEncoding.headers.etag, detail.headers.etag);
  }
});

test('/concepts ETag follows authored source changes while the same viewer process stays running', async (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'concept-delivery-repo-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const dir = join(repoRoot, 'docs/design/archetypes/booking');
  mkdirSync(dir, { recursive: true });
  const plan = join(dir, 'plan.md');
  writeFileSync(plan, '## Use case\nAn authored booking service.\n## Journey\n1. Choose a place.\n');
  writeFileSync(join(dir, 'design.md'), '## Visual thesis\nAn honest booking page.\n## Grammar and layout\nA calendar beside a form.\n');
  const url = await serve(t, { repoRoot });
  const indexBefore = await rawGet(url);
  const before = await rawGet(url + '/pattern/booking');
  assert.equal(before.status, 200);
  assert.match(before.body.toString(), /An authored booking service/);
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('booking service', 'booking service with live updates'));
  const after = await rawGet(url + '/pattern/booking', { 'if-none-match': before.headers.etag });
  assert.equal(after.status, 200, 'changed brief must not receive a stale in-process 304');
  assert.notEqual(after.headers.etag, before.headers.etag);
  assert.match(after.body.toString(), /booking service with live updates/);
  assert.equal((await rawGet(url, { 'if-none-match': indexBefore.headers.etag })).status, 304,
    'a detail-only text edit does not change the light index representation');
  writeFileSync(join(dir, 'step1-browse.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const indexAfter = await rawGet(url, { 'if-none-match': indexBefore.headers.etag });
  assert.equal(indexAfter.status, 200, 'an availability change visible in the index invalidates its own ETag');
  assert.notEqual(indexAfter.headers.etag, indexBefore.headers.etag);
});
