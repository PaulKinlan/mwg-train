import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { viewerOrigins } from '../src/viewer/cors.mjs';
import { proxyRequest } from '../src/viewer/proxy.mjs';
import { createViewer, liveOriginFor } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function live(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-cors-'));
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT });
  t.after(() => { pool.stopAll(); liveServer.closeAllConnections(); server.close(); liveServer.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => liveServer.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${liveServer.address().port}`;
}

const path = '/live/sample/original/start';
const preflight = (base, origin, method = 'POST', headers = 'content-type') => fetch(`${base}${path}`, {
  method: 'OPTIONS', headers: {
    Origin: origin,
    'Access-Control-Request-Method': method,
    'Access-Control-Request-Headers': headers,
  },
});

test('liveOriginFor makes a separate port but HTTPS generation requires a TLS ingress for that port', () => {
  assert.equal(liveOriginFor({ headers: { host: 'mwg-train.exe.xyz:7700' } }, 7701), 'https://mwg-train.exe.xyz:7701');
  assert.equal(liveOriginFor({ headers: { host: 'mwg-train.exe.xyz' } }, 7701), 'https://mwg-train.exe.xyz:7701');
  assert.equal(liveOriginFor({ headers: { host: '127.0.0.1:7700' } }, 7701), 'http://127.0.0.1:7701');
});

test('allowlist is exact and cannot be broadened to unrelated exe.xyz tenants', () => {
  const allowed = viewerOrigins();
  assert(allowed.has('https://mwg-train.exe.xyz:7700'));
  assert(allowed.has('https://mwg-train.exe.xyz'));
  assert(allowed.has('http://localhost:7700'));
  assert(allowed.has('http://127.0.0.1:7700'));
  assert(!allowed.has('https://evil.exe.xyz:7700'));
  assert(!allowed.has('https://evil.mwg-train.exe.xyz:7700'));
  assert(!allowed.has('http://mwg-train.exe.xyz:7700'));
  assert.throws(() => viewerOrigins({ publicViewerOrigin: 'https://mwg-train.exe.xyz:7700/path' }));
});

test('OPTIONS preflight allows only the exact viewer and known methods/headers; ordinary routes stay isolated', async (t) => {
  const base = await live(t);
  for (const origin of ['http://localhost:7700', 'http://127.0.0.1:7700', 'https://mwg-train.exe.xyz:7700', 'https://mwg-train.exe.xyz']) {
    const result = await preflight(base, origin);
    assert.equal(result.status, 204, origin);
    assert.equal(result.headers.get('access-control-allow-origin'), origin);
    assert.equal(result.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(result.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
    assert.match(result.headers.get('access-control-allow-headers'), /Content-Type/);
    assert.match(result.headers.get('vary'), /Origin/);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal(await result.text(), '');
  }
  for (const origin of ['https://evil.exe.xyz:7700', 'https://evil.mwg-train.exe.xyz:7700', 'null', 'http://localhost:7702']) {
    const result = await preflight(base, origin);
    assert.equal(result.status, 403, origin);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
    assert.equal(result.headers.get('access-control-allow-credentials'), null);
    await result.arrayBuffer();
  }
  for (const [method, headers] of [['DELETE', 'content-type'], ['POST', 'authorization'], ['POST', 'x-auth-request-user'], ['POST', '*']]) {
    const result = await preflight(base, 'https://mwg-train.exe.xyz:7700', method, headers);
    assert.equal(result.status, 403, `${method}/${headers}`);
    await result.arrayBuffer();
  }
  const get = await fetch(`${base}${path}`, { headers: { Origin: 'https://mwg-train.exe.xyz:7700' } });
  assert.equal(get.headers.get('access-control-allow-origin'), 'https://mwg-train.exe.xyz:7700');
  assert.equal(get.headers.get('access-control-allow-credentials'), 'true');
  await get.arrayBuffer();
  const denied = await fetch(`${base}${path}`, { headers: { Origin: 'https://evil.exe.xyz:7700' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  await denied.arrayBuffer();
  const concepts = await fetch(`${base}/concepts`);
  assert.equal(concepts.status, 404);
  await concepts.arrayBuffer();
  const invalid = await fetch(`${base}/`, { method: 'OPTIONS', headers: { Origin: 'https://mwg-train.exe.xyz:7700' } });
  assert.equal(invalid.status, 404);
  await invalid.arrayBuffer();
});

test('untrusted site response cannot widen credentialed CORS or caching policy', async () => {
  const request = Readable.from([]);
  request.method = 'GET'; request.headers = {};
  const response = new PassThrough();
  let returned;
  response.writeHead = (status, headers) => { returned = { status, headers }; return response; };
  const completion = new Promise((resolveEnd) => response.on('finish', resolveEnd));
  await proxyRequest({ request, response,
    sandbox: { request: async () => ({ status: 200, bodyBase64: '', headers: {
      'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true',
      'access-control-expose-headers': '*', 'timing-allow-origin': '*',
      'cache-control': 'public,max-age=86400', vary: 'Host', 'content-type': 'text/plain',
    } }) },
    prefix: '/live/sample/original', sitePath: '/', cookieNamespace: '__vw_sample_original_',
  });
  await completion;
  assert.equal(returned.status, 200);
  for (const name of ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'timing-allow-origin', 'cache-control', 'vary']) {
    assert.equal(returned.headers[name], undefined, name);
  }
});
