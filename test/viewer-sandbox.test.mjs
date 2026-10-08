/**
 * Sandbox boundary tests. These assert the security properties of the thing that runs untrusted
 * generated sites - they probe the sandbox from the inside (via the fixture's own routes) and
 * assert what is NOT reachable, not just what is. The channel under test is the stdio bridge:
 * there is no filesystem rendezvous the site could substitute.
 *
 * Requires bwrap (present on the fleet VMs); skipped elsewhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

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

test('sandbox: the site runs, and the boundary holds', { skip: !hasTools, timeout: 60_000 }, async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-sandbox-test-'));
  // A host-side run of the fixture (never sandboxed) would write its fallback db next to
  // server.mjs; clean it so the read-only-tree assertion measures THIS sandbox run only.
  rmSync(join(FIXTURE, 'probe.sqlite'), { force: true });
  const sandbox = new Sandbox({ id: 'test:probe', siteDir: FIXTURE });
  t.after(() => {
    sandbox.stop();
    rmSync(stateDir, { recursive: true, force: true });
  });
  await sandbox.start();

  const get = async (path) => {
    const result = await sandbox.request({ method: 'GET', path, headers: { accept: 'application/json' } });
    return { status: result.status, json: JSON.parse(Buffer.from(result.bodyBase64, 'base64').toString('utf8')) };
  };

  // 1. the site is actually serving through the bridge
  const health = await get('/__health');
  assert.equal(health.status, 200);

  // 2. no route to the host loopback proxies (the exe.dev VM exposes them on 127.0.0.1)
  const hostProxy = await get(`/can-reach?url=${encodeURIComponent('http://127.0.0.1:9999/')}`);
  assert.equal(hostProxy.json.reachable, false, 'the site must not reach a host loopback proxy');

  // 3. no external network
  const external = await get(`/can-reach?url=${encodeURIComponent('https://example.com/')}`);
  assert.equal(external.json.reachable, false, 'the site must not have external network access');

  // 4. the host filesystem is not visible: no repo, no journal, no home config
  for (const target of ['/home/exedev/journal', '/home/exedev/worktrees', '/home/exedev/.config', '/home/exedev/.ssh']) {
    const fsResult = await get(`/fs?path=${encodeURIComponent(target)}`);
    assert.equal(fsResult.json.exists, false, `${target} must not be visible inside the sandbox`);
  }

  // 5. the environment is scrubbed to the allowlist: no token/proxy/auth variables
  const env = await get('/env');
  const suspicious = env.json.keys.filter((key) => /token|key|secret|proxy|auth|github|anthropic|openai/i.test(key));
  assert.deepEqual(suspicious, [], `env leaked: ${suspicious.join(', ')}`);
  assert.ok(env.json.keys.includes('PATH'));
  assert.ok(env.json.keys.length < 10, `env should be minimal, got: ${env.json.keys.join(', ')}`);

  // 6. the site tree is mounted read-only: the probe writes its db to /data, not /site
  assert.equal(existsSync(join(FIXTURE, 'probe.sqlite')), false, 'the fixture must not have written into its own tree');

  // 7. concurrent requests over the one bridge all resolve correctly (frame multiplexing)
  const many = await Promise.all([get('/api/data'), get('/__health'), get('/api/data'), get('/__health')]);
  assert.deepEqual(many.map((r) => r.status), [200, 200, 200, 200]);
  assert.deepEqual(many[0].json, { data: [1, 2, 3] });

  // 8. stop() tears the instance down
  sandbox.stop();
  assert.equal(sandbox.alive, false);
});
