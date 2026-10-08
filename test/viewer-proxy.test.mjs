/**
 * Proxy tests: the header boundary is the security property, so it is tested end to end through a
 * real unix-socket relay against the probe fixture: owner-identifying headers go in, and the site
 * must observe that none of them arrived.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, PassThrough } from 'node:stream';

import { outboundHeaders, assertNoAuthHeaders, proxyRequest, ForbiddenHeaderError } from '../src/viewer/proxy.mjs';

const FIXTURE = new URL('../test-fixtures/sites/echo', import.meta.url).pathname;

/** Start the probe directly plus a socat relay, matching the sandbox's bridge topology. */
async function startRelayedFixture(t) {
  const port = 18300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), 'viewer-proxy-test-'));
  const socketPath = join(dir, 'sock');
  const site = spawn(process.execPath, [join(FIXTURE, 'server.mjs'), '--port', String(port), '--db', join(dir, 'p.sqlite')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = spawn('socat', [`UNIX-LISTEN:${socketPath},fork,reuseaddr`, `TCP:127.0.0.1:${port}`], { stdio: 'ignore' });
  t.after(() => {
    site.kill('SIGKILL');
    relay.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  });
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (existsSync(socketPath)) {
      try {
        await socketHealth(socketPath);
        return { socketPath, port };
      } catch {
        /* wait */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('fixture did not come up');
}

function socketHealth(socketPath) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: '/__health', timeout: 1000 }, (response) => {
      response.resume();
      response.on('end', resolve);
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.end();
  });
}

/** A minimal IncomingMessage stand-in: a Readable carrying .headers and .method. */
function fakeRequest({ method = 'GET', headers = {}, body = '' }) {
  const stream = Readable.from([Buffer.from(body)]);
  stream.headers = headers;
  stream.method = method;
  return stream;
}

/**
 * A minimal ServerResponse stand-in: a real stream (the proxy pipes binary bodies into it)
 * carrying captured status/headers. `done` resolves with { statusCode, headers, body }.
 */
function fakeResponse() {
  const stream = new PassThrough();
  const captured = { statusCode: null, headers: {} };
  stream.writeHead = (status, headers = {}) => {
    captured.statusCode = status;
    captured.headers = headers;
    return stream;
  };
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.done = new Promise((resolve) => {
    stream.on('end', () => resolve({ ...captured, body: Buffer.concat(chunks).toString('utf8') }));
  });
  return stream;
}

const PREFIX = '/live/probe/original';
const NS = '__vw_probe_original_';

test('outboundHeaders forwards an allowlist and drops everything owner-identifying', () => {
  const headers = outboundHeaders(
    {
      accept: 'text/html',
      'user-agent': 'test',
      cookie: 'exe_session=OWNER; __vw_probe_original_theme=dark',
      authorization: 'Bearer owner-token',
      'x-auth-request-user': 'paul',
      'x-forwarded-for': '1.2.3.4',
      'sec-fetch-site': 'none',
    },
    { cookieNamespace: NS, host: '127.0.0.1' },
  );
  assert.equal(headers.accept, 'text/html');
  assert.equal(headers.cookie, 'theme=dark');
  assert.equal(headers.authorization, undefined);
  assert.equal(headers['x-auth-request-user'], undefined);
  assert.equal(headers['x-forwarded-for'], undefined);
  assert.equal(headers['sec-fetch-site'], undefined);
  assertNoAuthHeaders(headers);
});

test('assertNoAuthHeaders throws on a surviving forbidden header (fail-closed)', () => {
  assert.throws(() => assertNoAuthHeaders({ authorization: 'Bearer x' }), ForbiddenHeaderError);
  assert.throws(() => assertNoAuthHeaders({ 'x-auth-request-user': 'p' }), ForbiddenHeaderError);
  assertNoAuthHeaders({ accept: 'text/html', cookie: 'theme=dark' });
});

test('the site observes no auth headers, and only its own namespaced cookies', async (t) => {
  const { socketPath } = await startRelayedFixture(t);
  const response = fakeResponse();
  await proxyRequest({
    request: fakeRequest({
      headers: {
        accept: 'application/json',
        cookie: `exe_session=OWNER-SESSION; ${NS}session=fake-demo`,
        authorization: 'Bearer OWNER-TOKEN',
        'x-auth-request-user': 'paulkinlan',
        'x-auth-request-access-token': 'secret',
        'x-forwarded-email': 'owner@example.com',
      },
    }),
    response,
    socketPath,
    prefix: PREFIX,
    sitePath: '/headers',
    cookieNamespace: NS,
  });
  const headersResult = await response.done;
  assert.equal(headersResult.statusCode, 200);
  const observed = JSON.parse(headersResult.body).headers;
  const names = Object.keys(observed);
  assert.ok(!names.includes('authorization'), `authorization leaked: ${JSON.stringify(observed)}`);
  assert.ok(!names.includes('x-auth-request-user'), 'x-auth-request-user leaked');
  assert.ok(!names.includes('x-auth-request-access-token'), 'x-auth-request-access-token leaked');
  assert.ok(!names.includes('x-forwarded-email'), 'x-forwarded-email leaked');
  // The site's own demo cookie arrives with the namespace stripped; the owner's does not arrive.
  assert.equal(observed.cookie, 'session=fake-demo');
  assert.ok(!JSON.stringify(observed).includes('OWNER-SESSION'));
});

test('html, js and css bodies are rewritten under the prefix; Location is rewritten', async (t) => {
  const { socketPath } = await startRelayedFixture(t);

  const page = fakeResponse();
  await proxyRequest({ request: fakeRequest({ headers: {} }), response: page, socketPath, prefix: PREFIX, sitePath: '/', cookieNamespace: NS });
  const pageResult = await page.done;
  assert.equal(pageResult.statusCode, 200);
  assert.match(pageResult.body, /action="\/live\/probe\/original\/submit"/);
  assert.match(pageResult.body, /href="\/live\/probe\/original\/app\/styles\.css"/);
  assert.match(pageResult.body, /src="\/live\/probe\/original\/app\/script\.js"/);

  const js = fakeResponse();
  await proxyRequest({ request: fakeRequest({ headers: {} }), response: js, socketPath, prefix: PREFIX, sitePath: '/app/script.js', cookieNamespace: NS });
  assert.match((await js.done).body, /fetch\('\/live\/probe\/original\/api\/data'\)/);

  const css = fakeResponse();
  await proxyRequest({ request: fakeRequest({ headers: {} }), response: css, socketPath, prefix: PREFIX, sitePath: '/app/styles.css', cookieNamespace: NS });
  assert.match((await css.done).body, /url\(\/live\/probe\/original\/img\/bg\.png\)/);

  const redirect = fakeResponse();
  await proxyRequest({ request: fakeRequest({ headers: {} }), response: redirect, socketPath, prefix: PREFIX, sitePath: '/redirect', cookieNamespace: NS });
  const redirectResult = await redirect.done;
  assert.equal(redirectResult.statusCode, 303);
  assert.equal(redirectResult.headers.location, '/live/probe/original/next');
});

test('set-cookie is namespaced on the way out and restored on the way in', async (t) => {
  const { socketPath } = await startRelayedFixture(t);
  const first = fakeResponse();
  await proxyRequest({ request: fakeRequest({ headers: {} }), response: first, socketPath, prefix: PREFIX, sitePath: '/cookie', cookieNamespace: NS });
  const firstResult = await first.done;
  const cookies = Array.isArray(firstResult.headers['set-cookie']) ? firstResult.headers['set-cookie'] : [firstResult.headers['set-cookie']];
  assert.ok(cookies.some((header) => header.startsWith('__vw_probe_original_session=fake-demo-session')));
  assert.ok(cookies.every((header) => header.includes('Path=/live/probe/original/')));

  // Round-trip: the browser sends back the namespaced cookie plus an owner cookie; the site must
  // see only its own, under its original name.
  const echo = fakeResponse();
  await proxyRequest({
    request: fakeRequest({ headers: { cookie: `${NS}session=fake-demo-session; exe_session=OWNER` } }),
    response: echo,
    socketPath,
    prefix: PREFIX,
    sitePath: '/headers',
    cookieNamespace: NS,
  });
  assert.equal(JSON.parse((await echo.done).body).headers.cookie, 'session=fake-demo-session');
});
