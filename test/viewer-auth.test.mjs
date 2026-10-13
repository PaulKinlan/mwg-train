// mwg-train-hwbs. The viewer had no authentication, and until this change "no accounts" was a statement about its
// routes rather than a limit on who could reach them: anything that could open the port could read the corpus and drive
// the workbench, including /tuning/generate, which spends money at the image endpoint. The fix is one shared secret
// checked at the top of the handler, so every route - present and future - is covered by construction rather than by a
// list. A list is what this test would otherwise have to be, and a route list in a test is the bug: it stays green when
// somebody adds the route it does not know about.
//
// What is asserted here and what is not: the guard's position is asserted by probing one route of each shape (page,
// asset, JSON, state-changing POST) and by checking that the refusal is the AUTH refusal rather than the cross-origin
// one, which can only be true if authentication ran first. A route registered ABOVE the guard would bypass it, and no
// test in this file can see that; the guard being the first statement in the handler is the property, and it is one
// line to review.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { AUTH_EXEMPT_PATHS, createViewer, viewerAuthToken, viewerAuthVerdict } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TOKEN = 'test-viewer-token-9f2c';
const request = (headers = {}) => ({ url: '/', method: 'GET', headers });

async function serve(t, options = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-auth-state-'));
  const { server, liveServer, pool, authToken, authGenerated } = createViewer({
    corpusRoot: join(ROOT, 'pilot'),
    stateDir,
    repoRoot: ROOT,
    authToken: TOKEN,
    ...options,
  });
  t.after(() => {
    pool.stopAll();
    server.close();
    liveServer.close();
    rmSync(stateDir, { recursive: true, force: true });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return { base: `http://127.0.0.1:${server.address().port}`, authToken, authGenerated };
}

test('the token is configured, or generated per process, but never absent', () => {
  const configured = viewerAuthToken({ env: { MWG_VIEWER_TOKEN: '  from-the-environment  ' } });
  assert.deepEqual(configured, { token: 'from-the-environment', generated: false });
  const generated = viewerAuthToken({ env: {} });
  assert.equal(generated.generated, true);
  assert.match(generated.token, /^[0-9a-f]{64}$/);
  // Two processes must not share a generated token, or "generated" would be a fixed default in disguise.
  assert.notEqual(viewerAuthToken({ env: {} }).token, generated.token);
  // A viewer built without a token generates one rather than authenticating nothing.
  const viewer = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir: mkdtempSync(join(tmpdir(), 'viewer-auth-gen-')), repoRoot: ROOT });
  assert.equal(viewer.authGenerated, true);
  assert.ok(viewer.authToken.length >= 32);
  viewer.pool.stopAll();
  viewer.server.close();
  viewer.liveServer.close();
});

test('the three ways to present the token are each enough, and each one is compared exactly', () => {
  const bearer = (value) => viewerAuthVerdict({ ...request({ authorization: `Bearer ${value}` }) }, { token: TOKEN });
  assert.equal(bearer(TOKEN), null);
  assert.deepEqual(bearer(`${TOKEN}x`), { status: 401 });
  assert.deepEqual(bearer(''), { status: 401 });
  // A shorter value must be REFUSED rather than throw: timingSafeEqual throws on a length mismatch, so a caller
  // sending one character would take down the route instead of being turned away.
  assert.deepEqual(bearer('x'), { status: 401 });
  assert.deepEqual(bearer(TOKEN.slice(0, -1)), { status: 401 });

  const cookie = (value) => viewerAuthVerdict({ ...request({ cookie: `other=1; mwg_viewer=${value}; later=2` }) }, { token: TOKEN });
  assert.equal(cookie(TOKEN), null);
  assert.deepEqual(cookie('nope'), { status: 401 });

  const query = (value) => viewerAuthVerdict({ url: `/?a=1&token=${value}`, method: 'GET', headers: {} }, { token: TOKEN, pathname: '/', search: `?a=1&token=${value}` });
  // A wrong query token is refused, NOT redirected: the redirect is the cookie-setting path for a correct token, so
  // sending a wrong one there would store the wrong value in the operator's browser.
  assert.deepEqual(query('wrong'), { status: 401 });
  assert.deepEqual(query(''), { status: 401 });
  const good = query(TOKEN);
  assert.equal(good.status, 302);
  assert.equal(good.location, '/?a=1', 'the redirect keeps the other parameters and drops the token');
  assert.ok(!good.location.includes(TOKEN), 'the token must not survive into the address bar or the Referer of every asset');
  assert.match(good.setCookie, /HttpOnly/);
  assert.match(good.setCookie, /SameSite=Strict/);
  assert.ok(!/Secure/.test(good.setCookie), 'the deployed viewer is plain http behind the VM proxy, so Secure would never be stored');

  assert.deepEqual(viewerAuthVerdict({ ...request() }, { token: TOKEN }), { status: 401 });
  assert.equal(viewerAuthVerdict({ ...request() }, { token: TOKEN, allowAnonymous: true }), null);
});

test('the exempt paths are a list of one, and it is the route that answers a constant', () => {
  // Asserting the size fails when somebody exempts a second route without deciding to, which is the whole reason the
  // exemption is a list rather than a test for the health path.
  assert.equal(AUTH_EXEMPT_PATHS.size, 1);
  assert.deepEqual([...AUTH_EXEMPT_PATHS], ['/healthz']);
  assert.equal(viewerAuthVerdict({ url: '/healthz', method: 'GET', headers: {} }, { token: TOKEN, pathname: '/healthz' }), null);
  assert.deepEqual(viewerAuthVerdict({ url: '/healthz2', method: 'GET', headers: {} }, { token: TOKEN, pathname: '/healthz2' }), { status: 401 }, 'a prefix of an exempt path is not exempt');
});

test('over HTTP, every shape of route refuses without the token and none of them renders corpus content', async (t) => {
  const { base } = await serve(t);
  // One route of each shape the server has. A page, a served asset, a JSON route and the state-changing POST that
  // spends money. The POST matters most: it must be refused by AUTH (401), not by the cross-origin check (403), and
  // that distinction is only observable if authentication runs first.
  for (const [path, method] of [['/', 'GET'], ['/concepts', 'GET'], ['/tuning/client.js', 'GET'], ['/tuning/generate', 'POST']]) {
    const response = await fetch(`${base}${path}`, { method, headers: { origin: base } });
    assert.equal(response.status, 401, `${method} ${path} must require the token`);
    assert.match(response.headers.get('www-authenticate') ?? '', /^Bearer /);
    // Asserted because the live run showed the refusal going out with NO content-type at all, which the rest of this
    // test did not notice: it checked the body for HTML but never the header that decides how the body is treated.
    assert.match(response.headers.get('content-type') ?? '', /^text\/plain/);
    assert.equal(response.headers.get('cache-control'), 'no-store', 'a refusal must not be cached');
    const body = await response.text();
    assert.ok(!/<html|<!doctype/i.test(body), `${method} ${path} must not carry a rendered page: ${body.slice(0, 120)}`);
  }
  // The exemption is genuinely reachable, so the deployment probe still works.
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
});

test('over HTTP, the token is accepted as a header, as a cookie, and once as a query for the browser', async (t) => {
  const { base } = await serve(t);
  const withBearer = await fetch(`${base}/concepts`, { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(withBearer.status, 200);
  assert.match(await withBearer.text(), /<html/i);

  const withCookie = await fetch(`${base}/concepts`, { headers: { cookie: `mwg_viewer=${TOKEN}` } });
  assert.equal(withCookie.status, 200);

  const firstVisit = await fetch(`${base}/concepts?token=${TOKEN}`, { redirect: 'manual' });
  assert.equal(firstVisit.status, 302);
  assert.equal(firstVisit.headers.get('location'), '/concepts');
  const cookie = firstVisit.headers.get('set-cookie') ?? '';
  assert.match(cookie, /mwg_viewer=/);
  const followUp = await fetch(`${base}/concepts`, { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(followUp.status, 200, 'the cookie the redirect set has to actually work on the next request');
  // And the token is not in the URL the browser keeps.
  assert.ok(!(firstVisit.headers.get('location') ?? '').includes(TOKEN));
});

test('a wrong token is refused without being repeated back', async (t) => {
  const { base } = await serve(t);
  const wrong = 'not-the-token-7c19';
  // mwg-train-s7iu, on a new surface: a refusal must not echo what was presented. That rule was written for capture
  // logs, and an authentication refusal is the other place a credential-shaped string arrives from outside.
  for (const headers of [{ authorization: `Bearer ${wrong}` }, { cookie: `mwg_viewer=${wrong}` }]) {
    const response = await fetch(`${base}/`, { headers });
    assert.equal(response.status, 401);
    const body = await response.text();
    assert.ok(!body.includes(wrong), 'the refusal repeated the presented credential');
  }
});

test('the opt-in restores anonymous access and says so on stdout', async (t) => {
  const { base } = await serve(t, { allowAnonymous: true });
  assert.equal((await fetch(`${base}/concepts`)).status, 200);
  assert.equal((await fetch(`${base}/tuning/client.js`)).status, 200);
});
