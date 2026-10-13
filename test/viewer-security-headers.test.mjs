// mwg-train-mslb. The viewer renders generated corpus content and links into a separate live origin, so a
// restrictive Content-Security-Policy is cheap defence in depth for a surface that displays untrusted material.
//
// These tests assert the served headers over real HTTP rather than the header constants, because the failure mode
// worth catching is a route that builds its response some other way. The style hash assertion is deliberately a
// cross-check: the policy names a hash of the page's style block, so a CSS edit that the header did not follow
// would silently unstyle every page, and this test fails instead.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { PAGE_CSS, pageStyleHash } from '../src/viewer/pages.mjs';
import { assetHeaders, createViewer, originVerdict, viewerHeaders } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function serve(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-headers-state-'));
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT });
  t.after(() => {
    pool.stopAll();
    server.close();
    liveServer.close();
    rmSync(stateDir, { recursive: true, force: true });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${server.address().port}`;
}

const policyOf = (response) => response.headers.get('content-security-policy') ?? '';
const directives = (policy) =>
  Object.fromEntries(policy.split(';').map((part) => {
    const [name, ...rest] = part.trim().split(/\s+/);
    return [name, rest.join(' ')];
  }));

test('every viewer response carries a restrictive policy and nosniff', async (t) => {
  const base = await serve(t);
  const routes = ['/', '/concepts', '/tuning', '/pipeline', '/healthz', '/no-such-route'];
  for (const route of routes) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${route}: nosniff must be set`);
    assert.ok(response.headers.get('content-security-policy'), `${route}: a policy must be set`);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer', `${route}: referrer-policy must be set`);
    const policy = directives(policyOf(response));
    assert.equal(policy['default-src'], "'none'", `${route}: default-src must be none`);
    assert.equal(policy['object-src'], "'none'", `${route}: object-src must be none`);
    assert.equal(policy['base-uri'], "'none'", `${route}: base-uri must be none`);
    assert.equal(policy['frame-ancestors'], "'none'", `${route}: frame-ancestors must be none`);
    assert.equal(policy['script-src'], "'self'", `${route}: scripts come only from this origin`);
    assert.ok(!policyOf(response).includes("'unsafe-inline'"), `${route}: 'unsafe-inline' must not appear anywhere`);
    assert.ok(!policyOf(response).includes("'unsafe-eval'"), `${route}: 'unsafe-eval' must not appear anywhere`);
  }
});

test('every file this viewer serves carries nosniff', async (t) => {
  // The policy is for documents; nosniff belongs on everything the viewer serves from its own disk, because a
  // browser must never sniff those bytes into being executable. Pinned as a shape rather than only through routes,
  // since a route with no file present would otherwise pass by serving nothing (mwg-train-sj8a).
  const headers = assetHeaders('image/png');
  assert.equal(headers['x-content-type-options'], 'nosniff', 'the shared file-response shape carries nosniff');
  assert.equal(headers['cache-control'], 'no-store');
  assert.equal(headers['content-type'], 'image/png');

  const base = await serve(t);
  for (const route of ['/tuning/client.js']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, `${route} is served`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${route}: nosniff must be set`);
  }
});

test('evidence files are served with nosniff, like every other file', async (t) => {
  // The evidence route was the one file response that hand-wrote its headers and so had no nosniff: it serves the
  // screenshots and JSON a run recorded, and the pages link them directly (mwg-train-sj8a).
  const base = await serve(t);
  const index = await (await fetch(`${base}/`)).text();
  const project = index.match(/href="\/project\/([a-z0-9-]+)(?:\?[^"]*)?"/i)?.[1];
  assert.ok(project, 'the index links to a project');
  const page = await (await fetch(`${base}/project/${project}`)).text();
  const evidence = page.match(/href="(\/evidence\/[^"]+)"/)?.[1];
  if (!evidence) {
    // A checkout with no materialised run has no evidence directory to serve. Said out loud rather than passed
    // silently: the shape assertion above still covers the header, and this test starts biting wherever runs exist.
    t.skip('no evidence file is linked: this checkout has no materialised pilot run');
    return;
  }
  const response = await fetch(`${base}${evidence.replace(/&amp;/g, '&')}`);
  assert.equal(response.status, 200, `${evidence} is served`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', 'an evidence file must not be sniffable');
  assert.ok(
    ['image/png', 'image/jpeg', 'application/json'].includes(response.headers.get('content-type')),
    `evidence keeps its recorded type, got ${response.headers.get('content-type')}`,
  );
  assert.ok((await response.arrayBuffer()).byteLength > 0, 'the evidence file has bytes');
});

test('the policy names the hash of the style block the page actually emits', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/`);
  const body = await response.text();
  const style = body.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(style, 'the page carries its styles in one block');
  const hash = createHash('sha256').update(style[1]).digest('base64');
  const policy = directives(policyOf(response));
  assert.ok(
    policy['style-src'].includes(`'sha256-${hash}'`),
    `style-src must name the hash of the served block.\n  served: ${hash}\n  policy: ${policy['style-src']}`,
  );
  // And the helper and the constant agree, so the exported pair cannot drift from each other either.
  assert.equal(pageStyleHash(), hash, 'pageStyleHash() must hash the block the page emits, byte for byte');
  assert.ok(style[1].includes(PAGE_CSS.slice(0, 40)), 'the served block is PAGE_CSS');
});

/**
 * Every page the viewer links to from its own index and nav. A fixed list of routes is what let an inline handler
 * live on the project page while this suite stayed green: the policy is only as good as the pages the test looks
 * at, so the test walks the viewer's own links instead of naming a few routes (mwg-train-i56c).
 */
async function linkedPages(base) {
  const routes = new Set(['/', '/concepts', '/tuning', '/pipeline']);
  for (const seed of ['/', '/concepts']) {
    const body = await (await fetch(`${base}${seed}`)).text();
    for (const match of body.matchAll(/href="(\/[^"#]*)"/g)) {
      // Query strings carry the selected run: the page is the same page, so compare paths.
      const path = match[1].split('?')[0];
      // /live/ is a sandboxed site proxied through this origin and carries its own policy, not this one; the rest
      // of the exclusions are assets rather than pages.
      if (path.startsWith('/live/') || /\.(jpe?g|png|webp|gif|css|js|json|txt|ico|svg)$/i.test(path)) continue;
      routes.add(path);
    }
  }
  return [...routes].slice(0, 12);
}

test('every linked viewer page is servable under the policy: no inline style, script or handler', async (t) => {
  const base = await serve(t);
  const routes = await linkedPages(base);
  assert.ok(
    routes.some((route) => route.startsWith('/project/')),
    `the crawl must reach a project page - that is the page the inline handler hid on. Saw: ${routes.join(', ')}`,
  );
  for (const route of routes) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, `${route} is served`);
    const body = await response.text();
    // Not a source-text check: this is the HTML the server actually produced. An inline style attribute, inline
    // <script> or inline handler that a page grew would be silently blocked by the policy above, and this says so
    // here rather than in a bug report about a control that does nothing when it is used.
    assert.ok(!/\sstyle="/.test(body), `${route}: an inline style attribute would be blocked by style-src`);
    assert.ok(!/<script(?![^>]*\bsrc=)/i.test(body), `${route}: an inline script would be blocked by script-src`);
    // \s before 'on': without it, 'content="' matches and the test reports a handler that is not there.
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(body), `${route}: an inline event handler would be blocked by script-src`);
  }
});

test('the run selector navigates without a script, because an inline handler cannot', async (t) => {
  const base = await serve(t);
  const index = await (await fetch(`${base}/`)).text();
  const project = index.match(/href="\/project\/([a-z0-9-]+)(?:\?[^"]*)?"/i)?.[1];
  assert.ok(project, 'the index links to a project');
  const response = await fetch(`${base}/project/${project}`);
  const body = await response.text();
  // The select used to auto-submit through onchange="this.form.submit()", which script-src 'self' blocks: the
  // control would have looked fine and done nothing. It is a GET form with a submit button now, so it works with
  // no script at all (mwg-train-i56c).
  const form = body.match(/<form[^>]*action="\/project\/[^"]*"[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(form, 'the project page carries a run form');
  assert.ok(!/onchange/i.test(form), 'the selector must not rely on an inline handler');
  assert.match(form, /<select name="run"/, 'the run select posts its value as `run`');
  assert.match(form, /<button type="submit"/, 'a submit button is what replaces the inline handler');
  assert.match(form, /method="get"/i, 'a GET form needs no script to navigate');

  // And the no-script path really works: asking for another run returns that run.
  const others = [...body.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  if (others.length > 1) {
    const other = others.find((run) => run !== others[others.length - 1]) ?? others[0];
    const selected = await fetch(`${base}/project/${project}?run=${encodeURIComponent(other)}`);
    assert.equal(selected.status, 200);
    const selectedBody = await selected.text();
    assert.ok(
      selectedBody.includes(`value="${other}" selected`),
      'selecting a run through the form shows that run',
    );
  }
});

test('the live-start form posts to an origin the policy admits', async (t) => {
  const base = await serve(t);
  // Find a project the index links to, then ask for it through a host the live origin trusts.
  const index = await (await fetch(`${base}/`)).text();
  const match = index.match(/href="\/project\/([a-z0-9-]+)(?:\?[^"]*)?"/i);
  assert.ok(match, 'the index links to at least one project');
  const response = await fetch(`${base}/project/${match[1]}`, { headers: { host: '127.0.0.1' } });
  assert.equal(response.status, 200);
  const body = await response.text();
  const policy = directives(policyOf(response));
  // Every form on the page, not just the first: a policy that admits one form and blocks another is a page with a
  // button that silently does nothing, which is exactly the breakage a CSP is most likely to cause here.
  const actions = [...body.matchAll(/<form[^>]*action="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(actions.length > 0, 'a project page carries the serve-live form');
  const sources = policy['form-action'].split(' ').map((source) => (source === "'self'" ? new URL(base).origin : source));
  const origins = [...new Set(actions.map((action) => new URL(action, base).origin))];
  for (const origin of origins) {
    assert.ok(
      sources.some((source) => source === origin),
      `form-action must admit every origin a form posts to.\n  form posts to: ${origin}\n  policy: ${policy['form-action']}`,
    );
  }
  // The live origin is a different origin from the viewer by design: that is what keeps served site code away from
  // the evidence pages. If that ever stops being true this test should be revisited, not silently relaxed.
  assert.ok(
    origins.some((origin) => origin !== new URL(base).origin),
    'the serve-live form posts to the separate live origin',
  );
});

test('a page with only same-origin forms needs no live origin, and gets none', () => {
  const policy = directives(viewerHeaders()['content-security-policy']);
  assert.equal(policy['form-action'], "'self'");
  assert.equal(directives(viewerHeaders('http://127.0.0.1:7701')['content-security-policy'])['form-action'], "'self' http://127.0.0.1:7701");
});

test('a state-changing POST from another origin is refused before anything acts', async (t) => {
  const base = await serve(t);
  const attacker = { origin: 'https://evil.example' };
  // /tuning/generate spends money at the hosted image model, so it is the route worth protecting most.
  const generate = await fetch(`${base}/tuning/generate`, {
    method: 'POST',
    headers: { ...attacker, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'anything' }),
  });
  assert.equal(generate.status, 403, 'a cross-origin POST must be refused');
  const body = await generate.text();
  assert.match(body, /refused:/, 'and say it was refused');
  // A refusal has to happen BEFORE the work: the message must be the origin refusal, not a model error, because a
  // 403 that still reached the endpoint would have spent the operator's money on the way.
  assert.ok(!/image model|generate|timed out|fetch failed/i.test(body), `the refusal must precede the action, got: ${body.slice(0, 200)}`);

  // The live origin starts a sandbox, and it is a different port on the same host, so it needs the same protection.
  const start = await fetch(`${base}/live/account-recovery-hono/original/start`, { method: 'POST', headers: attacker, redirect: 'manual' });
  assert.equal(start.status, 403, 'a cross-origin POST to the live origin must be refused');
});

test('a state-changing POST that does not say where it came from is refused', async (t) => {
  const base = await serve(t);
  // No Origin and no Referer: curl-style use has to state its origin now. Documented in the launcher's comment,
  // and the honest default for a tool with no accounts.
  const response = await fetch(`${base}/tuning/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'anything' }),
  });
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Origin or Referer/);
});

test('the viewer accepts its own origin, and a Referer when no Origin is sent', async (t) => {
  const base = await serve(t);
  const origin = new URL(base).origin;
  for (const headers of [{ origin }, { referer: `${origin}/tuning` }]) {
    const response = await fetch(`${base}/tuning/generate`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'anything' }),
    });
    // Whatever the generation route ends up doing without a reachable endpoint, it must not be the origin refusal:
    // that is the difference between "the gate let this through" and "the gate refused a legitimate request".
    assert.notEqual(response.status, 403, `${JSON.stringify(headers)} must be accepted`);
    assert.doesNotMatch(await response.text(), /refused: (origin|no Origin)/);
  }
});

test('read-only requests are unaffected, so the viewer keeps serving pages', async (t) => {
  const base = await serve(t);
  for (const url of ['/', '/concepts', '/tuning']) {
    assert.equal((await fetch(url === '/' ? base : `${base}${url}`)).status, 200, `${url} still serves`);
  }
  // A GET carrying a foreign Origin is not state-changing and is not what this check is for.
  const withOrigin = await fetch(`${base}/`, { headers: { origin: 'https://evil.example' } });
  assert.equal(withOrigin.status, 200, 'GET is not gated');
});

test('the origin verdict itself: this host, one of our ports, and a declaration is required', () => {
  const request = (headers) => ({ headers });
  const ports = { viewerPort: 7700, livePort: 7701 };
  // Same trusted host and one of our ports: allowed. This covers the ordinary case and the serve-live form, which
  // posts from the viewer port to the live port on the same host.
  assert.equal(originVerdict(request({ host: '127.0.0.1:7700', origin: 'http://127.0.0.1:7700' }), ports).allowed, true);
  assert.equal(originVerdict(request({ host: '127.0.0.1:7701', origin: 'http://127.0.0.1:7700' }), ports).allowed, true);
  assert.equal(originVerdict(request({ host: 'localhost:7700', referer: 'http://localhost:7700/tuning' }), ports).allowed, true);
  // A fronting proxy terminates at 443, so the browser sends an origin with no port at all.
  assert.equal(originVerdict(request({ host: 'mwg-train.exe.xyz:7700', origin: 'https://mwg-train.exe.xyz' }), ports).allowed, true);
  // Another host we would not trust, a port that is not ours, no declaration, an unparseable one, a scheme that is
  // not ours, and a trusted *suffix* that is not this host: all refused. The port case is the one a page served
  // from another local port would otherwise pass - the browser test for this change caught exactly that.
  assert.equal(originVerdict(request({ host: '127.0.0.1:7700', origin: 'https://evil.example' }), ports).allowed, false);
  assert.equal(originVerdict(request({ host: 'evil.example', origin: 'http://evil.example' }), ports).allowed, false);
  assert.equal(originVerdict(request({ host: '127.0.0.1:7700', origin: 'http://127.0.0.1:9999' }), ports).allowed, false);
  assert.equal(originVerdict(request({ host: '127.0.0.1:7700' }), ports).allowed, false);
  assert.equal(originVerdict(request({ host: '127.0.0.1:7700', origin: 'not a url' }), ports).allowed, false);
  assert.equal(originVerdict(request({ host: 'mwg-train.exe.xyz:7700', origin: 'http://mwg-train.exe.xyz' }), ports).allowed, false);
  assert.equal(originVerdict(request({ host: 'mwg-train.exe.xyz:7700', origin: 'https://other.exe.xyz' }), ports).allowed, false);
  // The request's own port is always acceptable: a POST back to the port it arrived on is this viewer by definition.
  assert.equal(originVerdict(request({ host: '127.0.0.1:8123', origin: 'http://127.0.0.1:8123' })).allowed, true);
});
