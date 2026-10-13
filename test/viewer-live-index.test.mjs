import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createViewer, viewerOriginFor } from '../src/viewer/server.mjs';
import { renderLiveIndex } from '../src/viewer/pages.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function serve(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-live-home-'));
  const { server, liveServer, pool } = createViewer({
    corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT, allowAnonymous: true,
  });
  t.after(async () => {
    pool.stopAll();
    await Promise.all([new Promise((done) => server.close(done)), new Promise((done) => liveServer.close(done))]);
    rmSync(stateDir, { recursive: true, force: true });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  await new Promise((done) => liveServer.listen(0, '127.0.0.1', done));
  return {
    viewer: `http://127.0.0.1:${server.address().port}`,
    live: `http://127.0.0.1:${liveServer.address().port}`,
  };
}

test('the live origin lists runnable sites, and navigation reaches the paired viewer origin', async (t) => {
  const { viewer, live } = await serve(t);
  const response = await fetch(`${live}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin',
    'the browser must send its origin on Start, without leaking page paths');
  const html = await response.text();
  assert.match(html, /<h1>Sandboxed corpus sites<\/h1>/);
  assert.match(html, /<h2>Available corpus projects<\/h2>/);
  assert.match(html, /No sandboxed sites are running yet/);
  assert.ok(html.includes(`href="${viewer}/"`), 'viewer index must not reload the live origin');
  for (const path of ['/', '/concepts', '/tuning', '/pipeline']) {
    assert.ok(html.includes(`href="${viewer}${path}"`), `${path} must target the bound viewer port`);
    assert.equal((await fetch(`${viewer}${path}`)).status, 200, `${path} must work on the viewer`);
  }
  assert.doesNotMatch(html, /<nav[^>]*>.*?href="\/(?:concepts|tuning|pipeline|)"/s);
  const action = html.match(/<form class="inline-form" method="post" action="(\/live\/([a-z0-9-]+)\/(original|uplifted)(?:\/run\/[^"/]+)?\/start)"/);
  assert.ok(action, 'a corpus project with a clean owner-auth scan must offer a real Start action');
  assert.ok(html.includes(`href="${viewer}/project/${action[2]}"`));
  assert.equal((await fetch(`${viewer}/project/${action[2]}`)).headers.get('referrer-policy'),
    'strict-origin-when-cross-origin', 'the viewer project Start form needs the same browser policy');
  const started = await fetch(`${live}${action[1]}`, { method: 'POST', headers: { Origin: live }, redirect: 'manual' });
  assert.equal(started.status, 303, `Start action must reach the sandbox, got ${await started.text()}`);
  assert.match(started.headers.get('location'), /^\/live\/[a-z0-9-]+\/(original|uplifted)(?:\/run\/[^/]+)?\/$/);
  assert.equal((await fetch(`${live}${started.headers.get('location')}`)).status, 200, 'Open must serve the launched site');
  const after = await (await fetch(`${live}/`)).text();
  assert.ok(after.includes(`href="${started.headers.get('location')}"`), 'running site must be listed as an Open link');
});

test('an empty corpus says so and still links to the working viewer index', () => {
  const html = renderLiveIndex({ views: [], runId: null, runs: [], active: [], viewerOrigin: 'http://127.0.0.1:7700' });
  assert.match(html, /No corpus projects are available here/);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:7700\/"/);
  assert.doesNotMatch(html, /action="\/live\//);
});

test('live navigation refuses an attacker-controlled Host as a link authority', () => {
  assert.equal(viewerOriginFor({ headers: { host: 'evil.test:7701' } }, 7700), 'http://127.0.0.1:7700');
  assert.equal(viewerOriginFor({ headers: { host: 'mwg-train.exe.xyz:7701' } }, 7700), 'https://mwg-train.exe.xyz:7700');
  assert.equal(viewerOriginFor({ headers: { host: '127.0.0.1:7701' } }, 57321), 'http://127.0.0.1:57321');
  assert.equal(viewerOriginFor({ headers: { host: '127.0.0.1:7701' } }, null), null);
});
