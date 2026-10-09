/**
 * The functional-route capabilities (mwg-train-37a): list pages, a detail page, and account
 * login/logout, in all 7 framework arms. Two halves:
 *
 *  1. The spec gate: capabilities and seed_accounts validate (closed set, fail closed), and a spec
 *     without them emits none of the capability code - the byte-invariance half of the hard gate
 *     (the wholesale half is `npm run check:specs`, 35/35).
 *  2. The functional half: a capability-enabled spec is built for all seven arms, each server
 *     is started, and the routes are driven over HTTP - login, protection, listing, detail, logout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateSpec, specForFamily, buildProjectFromSpec, CAPABILITY_KEYS } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}

function bookingSpec() {
  return specForFamily('booking', ROOT);
}

test('spec gate: capabilities and seed_accounts validate as a closed set', () => {
  const base = bookingSpec();
  // happy path
  assert.deepEqual(validateSpec({ ...base, capabilities: { list_pages: true, detail_page: true, auth: true }, seed_accounts: [{ email: 'a@b.c', password: 'pw' }] }), []);
  // unknown capability refused
  assert.ok(validateSpec({ ...base, capabilities: { teleport: true } }).some((p) => p.includes('unknown capability')));
  // non-boolean refused
  assert.ok(validateSpec({ ...base, capabilities: { auth: 'yes' } }).some((p) => p.includes('must be a boolean')));
  // auth + session refused (both own the sid cookie)
  assert.ok(validateSpec({ ...base, session: true, capabilities: { auth: true } }).some((p) => p.includes('cannot combine with session')));
  // seed_accounts without auth refused
  assert.ok(validateSpec({ ...base, seed_accounts: [{ email: 'a@b.c', password: 'pw' }] }).some((p) => p.includes('only meaningful with capabilities.auth')));
  // malformed account refused; unknown account key refused
  assert.ok(validateSpec({ ...base, capabilities: { auth: true }, seed_accounts: [{ email: 'not-an-email', password: 'pw' }] }).some((p) => p.includes('email address')));
  assert.ok(validateSpec({ ...base, capabilities: { auth: true }, seed_accounts: [{ email: 'a@b.c', password: 'pw', role: 'admin' }] }).some((p) => p.includes('unknown key')));
  // list_pages without a list route refused
  const noLists = { ...base, routes: base.routes.filter((route) => route.kind !== 'list') };
  assert.ok(validateSpec({ ...noLists, capabilities: { list_pages: true } }).some((p) => p.includes('no route has kind list')));
});

test('byte-invariance: a spec without capabilities emits no capability code, in any arm', () => {
  for (const family of ['booking', 'contact-lead', 'catalogue', 'account-recovery', 'event-registration']) {
    for (const arm of ARMS) {
      const { files } = buildProjectFromSpec({ spec: specForFamily(family, ROOT), frameworkName: arm });
      assert.equal(/auth_sessions|loginPage|detailPage|listPage|capabilities/.test(files['server.mjs']), false, `${family}/${arm} emitted capability code without opting in`);
    }
  }
});

test('functional: login, protection, list, detail and logout work in all 7 arms', async (t) => {
  const spec = {
    ...bookingSpec(),
    capabilities: { list_pages: true, detail_page: true, auth: true },
    seed_accounts: [{ email: 'paul@example.com', password: 'hunter2', display_name: 'Paul' }],
  };
  const write = spec.routes.find((route) => route.method === 'POST');
  const formBody = new URLSearchParams(
    Object.fromEntries(Object.entries(spec.journey.fill).map(([selector, value]) => [selector.match(/\[name=["']?([^\]"']+)/)[1], value])),
  ).toString();
  const firstFill = Object.values(spec.journey.fill)[0];

  assert.deepEqual(ARMS.slice().sort(), ['hono', 'preact', 'raw', 'react', 'svelte', 'vue', 'webcomponents']);
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `caps-${arm}-`));
      const port = await availablePort();
      const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
      writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (arm === 'svelte') assert.equal(manifest.dependencies.svelte, '5.57.2', 'standalone Svelte SSR declares its compiler/runtime');
      if (arm === 'webcomponents') assert.deepEqual(manifest.dependencies, {}, 'Web Components uses the platform without packages');
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'test.sqlite')], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
      try {
        const base = `http://127.0.0.1:${port}`;
        // Readiness, not a fixed delay: poll the health endpoint until the server answers.
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);
        const homepage = await fetch(base);
        const html = await homepage.text();
        assert.equal(homepage.status, 200, `${arm} server renders its generated page`);
        assert.match(html, /Evening class booking/, `${arm} SSR includes the booking heading`);
        assert.match(html, /<form[^>]*id="booking-form"/, `${arm} SSR includes the functional form`);
        if (arm === 'webcomponents') assert.match(html, /<record-echo>/, 'the custom element wraps the server-rendered light DOM');

        const listPath = spec.routes.find((route) => route.kind === 'list').path;
        const listAnon = await fetch(`${base}${listPath}`, { redirect: 'manual' });
        assert.equal(listAnon.status, 303, 'unauthenticated list redirects');
        assert.equal(listAnon.headers.get('location'), '/login');

        // The detail page answers BEFORE the lookup: an unknown reference must get the same
        // redirect as a real one, or the difference reveals which references exist.
        const detailRoute = spec.routes.find((route) => route.kind === 'read-by-reference').path;
        const detailAnon = await fetch(`${base}${detailRoute.replace(':ref', 'no-such-ref')}`, { redirect: 'manual' });
        assert.equal(detailAnon.status, 303, 'unauthenticated detail redirects before any lookup');
        assert.equal(detailAnon.headers.get('location'), '/login');

        // The JSON record APIs are guarded too: a page redirect means nothing if the data is open.
        const recordsAnon = await fetch(`${base}/api/records`, { redirect: 'manual' });
        assert.equal(recordsAnon.status, 401, 'unauthenticated /api/records is refused');
        const recordAnon = await fetch(`${base}/api/record/anything`, { redirect: 'manual' });
        assert.equal(recordAnon.status, 401, 'unauthenticated /api/record/:ref is refused');

        const wrong = await fetch(`${base}/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'email=paul@example.com&password=wrong',
          redirect: 'manual',
        });
        assert.equal(wrong.status, 401, 'wrong credentials are refused');

        const right = await fetch(`${base}/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'email=paul@example.com&password=hunter2',
          redirect: 'manual',
        });
        const cookie = (right.headers.get('set-cookie') ?? '').split(';')[0];
        assert.equal(right.status, 303);
        assert.ok(cookie.startsWith('sid='), 'login issues a session cookie');

        const me = await fetch(`${base}/api/me`, { headers: { cookie } });
        assert.equal((await me.json()).email, 'paul@example.com');

        const posted = await fetch(`${base}${write.path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
          body: formBody,
          redirect: 'manual',
        });
        assert.equal(posted.status, 303, 'the write route still works');

        const list = await fetch(`${base}${listPath}`, { headers: { cookie } });
        assert.ok((await list.text()).includes(firstFill), 'the list page shows the stored record');

        const [record] = await (await fetch(`${base}/api/records`, { headers: { cookie } })).json();
        const detailPath = spec.routes.find((route) => route.kind === 'read-by-reference').path.replace(':ref', record.ref);
        const detail = await fetch(`${base}${detailPath}`, { headers: { cookie } });
        const detailHtml = await detail.text();
        assert.equal(detail.status, 200);
        assert.ok(detailHtml.includes('<dt>') && detailHtml.includes(firstFill), 'the detail page renders the record fields');

        await fetch(`${base}/logout`, { method: 'POST', headers: { cookie }, redirect: 'manual' });
        const meAfter = await fetch(`${base}/api/me`, { headers: { cookie } });
        assert.equal(meAfter.status, 401, 'logout ends the session');
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGKILL');
          await exited;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
