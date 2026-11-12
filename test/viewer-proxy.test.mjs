/**
 * Proxy tests: the header boundary is the security property, so it is tested end to end through a
 * REAL sandbox (the stdio bridge) running the probe fixture: owner-identifying headers go in, and
 * the site must observe that none of them arrived.
 *
 * Requires bwrap (present on the fleet VMs); skipped elsewhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Readable, PassThrough } from 'node:stream';

import { outboundHeaders, assertNoAuthHeaders, proxyRequest, ForbiddenHeaderError, MAX_PROXY_BODY_BYTES } from '../src/viewer/proxy.mjs';
import { cookieNamespaceShimHash } from '../src/viewer/rewrite.mjs';
import { Sandbox } from '../src/viewer/sandbox.mjs';

const FIXTURE = new URL('../test-fixtures/sites/echo', import.meta.url).pathname;

const hasTools = (() => {
  try {
    execFileSync('which', ['bwrap'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** A minimal IncomingMessage stand-in: a Readable carrying .headers and .method. */
function fakeRequest({ method = 'GET', headers = {}, body = '' }) {
  const stream = Readable.from([Buffer.from(body)]);
  stream.headers = headers;
  stream.method = method;
  return stream;
}

/**
 * A minimal ServerResponse stand-in: a real stream (the proxy writes into it) carrying captured
 * status/headers. `done` resolves with { statusCode, headers, body }.
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

async function withSandbox(t, fn) {
  const sandbox = new Sandbox({ id: 'test:proxy', siteDir: FIXTURE });
  t.after(() => sandbox.stop());
  await sandbox.start();
  return fn(sandbox);
}

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
    { cookieNamespace: NS },
  );
  assert.equal(headers.accept, 'text/html');
  assert.equal(headers.cookie, 'theme=dark');
  assert.equal(headers.authorization, undefined);
  assert.equal(headers['x-auth-request-user'], undefined);
  assert.equal(headers['x-forwarded-for'], undefined);
  assert.equal(headers['sec-fetch-site'], undefined);
  assert.equal(headers.host, undefined);
  assertNoAuthHeaders(headers);
});

test('assertNoAuthHeaders throws on a surviving forbidden header (fail-closed)', () => {
  assert.throws(() => assertNoAuthHeaders({ authorization: 'Bearer x' }), ForbiddenHeaderError);
  assert.throws(() => assertNoAuthHeaders({ 'x-auth-request-user': 'p' }), ForbiddenHeaderError);
  assertNoAuthHeaders({ accept: 'text/html', cookie: 'theme=dark' });
});

test(
  'the site observes no auth headers, and only its own namespaced cookies',
  { skip: !hasTools, timeout: 60_000 },
  async (t) => {
    await withSandbox(t, async (sandbox) => {
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
        sandbox,
        prefix: PREFIX,
        sitePath: '/headers',
        cookieNamespace: NS,
      });
      const result = await response.done;
      assert.equal(result.statusCode, 200);
      const observed = JSON.parse(result.body).headers;
      const names = Object.keys(observed);
      assert.ok(!names.includes('authorization'), `authorization leaked: ${JSON.stringify(observed)}`);
      assert.ok(!names.includes('x-auth-request-user'), 'x-auth-request-user leaked');
      assert.ok(!names.includes('x-auth-request-access-token'), 'x-auth-request-access-token leaked');
      assert.ok(!names.includes('x-forwarded-email'), 'x-forwarded-email leaked');
      assert.equal(observed.cookie, 'session=fake-demo');
      assert.ok(!JSON.stringify(observed).includes('OWNER-SESSION'));
    });
  },
);

test('html, js and css bodies are rewritten under the prefix; Location is rewritten', { skip: !hasTools, timeout: 60_000 }, async (t) => {
  await withSandbox(t, async (sandbox) => {
    const page = fakeResponse();
    await proxyRequest({ request: fakeRequest({ headers: {} }), response: page, sandbox, prefix: PREFIX, sitePath: '/', cookieNamespace: NS });
    const pageResult = await page.done;
    assert.equal(pageResult.statusCode, 200);
    assert.match(pageResult.body, /action="\/live\/probe\/original\/submit"/);
    assert.match(pageResult.body, /href="\/live\/probe\/original\/app\/styles\.css"/);
    assert.match(pageResult.body, /src="\/live\/probe\/original\/app\/script\.js"/);

    const js = fakeResponse();
    await proxyRequest({ request: fakeRequest({ headers: {} }), response: js, sandbox, prefix: PREFIX, sitePath: '/app/script.js', cookieNamespace: NS });
    assert.match((await js.done).body, /fetch\('\/live\/probe\/original\/api\/data'\)/);

    const css = fakeResponse();
    await proxyRequest({ request: fakeRequest({ headers: {} }), response: css, sandbox, prefix: PREFIX, sitePath: '/app/styles.css', cookieNamespace: NS });
    assert.match((await css.done).body, /url\(\/live\/probe\/original\/img\/bg\.png\)/);

    const redirect = fakeResponse();
    await proxyRequest({ request: fakeRequest({ headers: {} }), response: redirect, sandbox, prefix: PREFIX, sitePath: '/redirect', cookieNamespace: NS });
    const redirectResult = await redirect.done;
    assert.equal(redirectResult.statusCode, 303);
    assert.equal(redirectResult.headers.location, '/live/probe/original/next');
  });
});

test('set-cookie is namespaced on the way out and restored on the way in', { skip: !hasTools, timeout: 60_000 }, async (t) => {
  await withSandbox(t, async (sandbox) => {
    const first = fakeResponse();
    await proxyRequest({ request: fakeRequest({ headers: {} }), response: first, sandbox, prefix: PREFIX, sitePath: '/cookie', cookieNamespace: NS });
    const firstResult = await first.done;
    const cookies = Array.isArray(firstResult.headers['set-cookie']) ? firstResult.headers['set-cookie'] : [firstResult.headers['set-cookie']];
    // The fixture sets TWO cookies; the bridge must preserve each individually (a comma-folded
    // set-cookie header is not parseable back into cookies).
    assert.equal(cookies.length, 2, `expected both cookies, got ${JSON.stringify(cookies)}`);
    assert.ok(cookies.some((header) => header.startsWith('__vw_probe_original_session=fake-demo-session')));
    assert.ok(cookies.some((header) => header.startsWith('__vw_probe_original_theme=dark')));
    assert.ok(cookies.every((header) => header.includes('Path=/live/probe/original/')));

    // Round-trip: the browser sends back the namespaced cookie plus an owner cookie; the site must
    // see only its own, under its original name.
    const echo = fakeResponse();
    await proxyRequest({
      request: fakeRequest({ headers: { cookie: `${NS}session=fake-demo-session; exe_session=OWNER` } }),
      response: echo,
      sandbox,
      prefix: PREFIX,
      sitePath: '/headers',
      cookieNamespace: NS,
    });
    assert.equal(JSON.parse((await echo.done).body).headers.cookie, 'session=fake-demo-session');
  });
});

/**
 * A request stream that keeps producing same-sized chunks until the consumer stops reading it.
 * `produced()` reports what the source was actually asked for, which is how a test proves the
 * proxy stopped reading an oversized body instead of buffering it to the end.
 */
function streamingRequest({ method = 'POST', headers = {}, chunkSize, maxChunks }) {
  const chunk = Buffer.alloc(chunkSize, 0x61);
  let chunksProduced = 0;
  const stream = new Readable({
    read() {
      if (chunksProduced >= maxChunks) return stream.push(null);
      chunksProduced += 1;
      stream.push(chunk);
    },
  });
  stream.headers = headers;
  stream.method = method;
  stream.produced = () => ({ chunks: chunksProduced, bytes: chunksProduced * chunkSize });
  return stream;
}

/**
 * A sandbox stand-in that records what the proxy handed it and answers 200 'forwarded'. `answer`
 * overrides the upstream response, for tests about what the proxy does with a given body and header.
 */
function stubSandbox(answer = {}) {
  const calls = [];
  return {
    calls,
    request: async (args) => {
      calls.push(args);
      return {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        bodyBase64: Buffer.from('forwarded').toString('base64'),
        ...answer,
      };
    },
  };
}

test('a declared content-length past the cap is refused 413 before the body is buffered', async () => {
  const sandbox = stubSandbox();
  const response = fakeResponse();
  // The declaration alone must be enough: nothing has arrived yet, and the body below is empty.
  const request = fakeRequest({ method: 'POST', headers: { 'content-length': String(MAX_PROXY_BODY_BYTES + 1) }, body: '' });
  await proxyRequest({ request, response, sandbox, prefix: PREFIX, sitePath: '/submit', cookieNamespace: NS });
  const result = await response.done;
  assert.equal(result.statusCode, 413);
  assert.equal(result.headers.connection, 'close');
  assert.match(result.body, /request body too large/);
  assert.equal(sandbox.calls.length, 0, 'an oversized body must never reach the sandbox');
});

test('a chunked body past the cap is aborted mid-stream and refused 413', async () => {
  const sandbox = stubSandbox();
  const response = fakeResponse();
  const CHUNK = 64 * 1024;
  const TOTAL_CHUNKS = 64; // 4 MiB offered, 1 MiB accepted: the source must not be drained
  const request = streamingRequest({ chunkSize: CHUNK, maxChunks: TOTAL_CHUNKS }); // no content-length: the running total is the only bound
  await proxyRequest({ request, response, sandbox, prefix: PREFIX, sitePath: '/submit', cookieNamespace: NS });
  const result = await response.done;
  assert.equal(result.statusCode, 413);
  const produced = request.produced();
  assert.ok(produced.bytes > MAX_PROXY_BODY_BYTES, 'the cap must be crossed before the refusal is justified');
  // One chunk may already be in flight in the readable's own buffer when the pause lands; what must not
  // happen is the source being drained.
  assert.ok(produced.bytes <= MAX_PROXY_BODY_BYTES + 2 * CHUNK, `reading must stop within a chunk or two of the cap, produced ${produced.bytes}`);
  assert.ok(produced.chunks < TOTAL_CHUNKS, `the stream was drained (${produced.chunks} chunks), not aborted`);
  assert.equal(sandbox.calls.length, 0, 'an oversized body must never reach the sandbox');
});

test('a body within the cap is buffered and forwarded unchanged', async () => {
  const sandbox = stubSandbox();
  const CHUNK = 4 * 1024;
  const request = streamingRequest({ chunkSize: CHUNK, maxChunks: 8 });
  const response = fakeResponse();
  await proxyRequest({ request, response, sandbox, prefix: PREFIX, sitePath: '/submit', cookieNamespace: NS });
  const result = await response.done;
  assert.equal(result.statusCode, 200);
  assert.equal(sandbox.calls.length, 1);
  assert.equal(sandbox.calls[0].method, 'POST');
  assert.equal(sandbox.calls[0].path, '/submit');
  assert.equal(sandbox.calls[0].body.length, CHUNK * 8);
  assert.ok(sandbox.calls[0].body.equals(Buffer.alloc(CHUNK * 8, 0x61)), 'the body must cross the boundary byte-for-byte');
});

test('a body of exactly the cap is forwarded, not refused', async () => {
  const sandbox = stubSandbox();
  const CHUNK = 64 * 1024;
  const chunks = MAX_PROXY_BODY_BYTES / CHUNK;
  assert.ok(Number.isInteger(chunks), 'the cap must be a whole number of chunks for this boundary to be exact');
  const request = streamingRequest({ chunkSize: CHUNK, maxChunks: chunks });
  const response = fakeResponse();
  await proxyRequest({ request, response, sandbox, prefix: PREFIX, sitePath: '/submit', cookieNamespace: NS });
  const result = await response.done;
  assert.equal(result.statusCode, 200);
  assert.equal(sandbox.calls[0].body.length, MAX_PROXY_BODY_BYTES);
});

test('served HTML carries the document.cookie shim, and a CSP response header admits it by hash', async () => {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="/app/styles.css"></head><body></body></html>';
  const sandbox = stubSandbox({
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'self'" },
    bodyBase64: Buffer.from(html).toString('base64'),
  });
  const response = fakeResponse();
  await proxyRequest({ request: fakeRequest({ headers: {} }), response, sandbox, prefix: PREFIX, sitePath: '/', cookieNamespace: NS });
  const result = await response.done;

  const shimAt = result.body.indexOf('data-viewer-cookie-namespace');
  assert.ok(shimAt !== -1, 'a served page must carry the document.cookie shim');
  assert.ok(shimAt < result.body.indexOf('<link rel="stylesheet"'), 'the shim must run before the page\'s own resources');
  assert.ok(result.body.includes(JSON.stringify(NS)), 'the shim must carry this instance\'s namespace');
  // The policy the site sent is still in force; only this one script is admitted, by its exact hash.
  assert.equal(
    result.headers['content-security-policy'],
    `default-src 'none'; script-src 'self' ${cookieNamespaceShimHash(NS)};`,
  );
  // A non-HTML body is not injected, and its policy is left exactly as the site wrote it.
  const plain = fakeResponse();
  const plainSandbox = stubSandbox({ headers: { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': "default-src 'none'" } });
  await proxyRequest({ request: fakeRequest({ headers: {} }), response: plain, sandbox: plainSandbox, prefix: PREFIX, sitePath: '/x', cookieNamespace: NS });
  const plainResult = await plain.done;
  assert.equal(plainResult.body, 'forwarded');
  assert.equal(plainResult.headers['content-security-policy'], "default-src 'none'");
});
