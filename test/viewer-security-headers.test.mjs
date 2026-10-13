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
import { createViewer, viewerHeaders } from '../src/viewer/server.mjs';

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

test('the viewer\'s own static assets carry nosniff as well', async (t) => {
  // The policy is for documents; nosniff belongs on everything the viewer generates, including the workbench's
  // script, because a browser must never sniff a response into being executable (mwg-train-mslb).
  const base = await serve(t);
  for (const route of ['/tuning/client.js']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, `${route} is served`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${route}: nosniff must be set`);
  }
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

test('viewer pages carry no inline style attributes and no inline scripts, so the policy needs no exception', async (t) => {
  const base = await serve(t);
  for (const route of ['/', '/concepts', '/tuning', '/pipeline']) {
    const body = await (await fetch(`${base}${route}`)).text();
    // Not a source-text check: this is the HTML the server actually produced. An inline style attribute or an
    // inline <script> that a page grew would be blocked by the policy above, and this says so at the test that
    // would otherwise be a mystery bug report about a style somewhere not applying.
    assert.ok(!/\sstyle="/.test(body), `${route}: an inline style attribute would be blocked by style-src`);
    assert.ok(!/<script(?![^>]*\bsrc=)/i.test(body), `${route}: an inline script would be blocked by script-src`);
    // \s before 'on': without it, 'content="' matches and the test reports a handler that is not there.
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(body), `${route}: an inline event handler would be blocked by script-src`);
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
