/**
 * Sandbox boundary tests. These assert the security properties of the thing that runs untrusted
 * generated sites - they probe the sandbox from the inside (via the fixture's own routes) and
 * assert what is NOT reachable, not just what is.
 *
 * Requires bwrap and socat (present on the fleet VMs); skipped elsewhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { Sandbox } from '../src/viewer/sandbox.mjs';

const FIXTURE = new URL('../test-fixtures/sites/echo', import.meta.url).pathname;

const hasTools = (() => {
  try {
    execFileSync('which', ['bwrap', 'socat'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

async function socketJson(socketPath, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path, timeout: 5000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.end();
  });
}

test('sandbox: the site runs, and the boundary holds', { skip: !hasTools, timeout: 60_000 }, async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-sandbox-test-'));
  // A host-side run of the fixture (the proxy tests) writes its fallback db next to server.mjs;
  // clean it so the read-only-tree assertion measures THIS sandbox run only.
  rmSync(join(FIXTURE, 'probe.sqlite'), { force: true });
  const sandbox = new Sandbox({ id: 'test:probe', siteDir: FIXTURE, bridgeDir: join(stateDir, 'bridge') });
  t.after(() => {
    sandbox.stop();
    rmSync(stateDir, { recursive: true, force: true });
  });
  await sandbox.start();

  // 1. the site is actually serving through the relay
  const health = await socketJson(sandbox.socketPath, '/__health');
  assert.equal(health.status, 200);

  // 2. no route to the host loopback proxies (the exe.dev VM exposes them on 127.0.0.1)
  const hostProxy = await socketJson(sandbox.socketPath, `/can-reach?url=${encodeURIComponent('http://127.0.0.1:9999/')}`);
  assert.equal(hostProxy.json.reachable, false, 'the site must not reach a host loopback proxy');

  // 3. no external network
  const external = await socketJson(sandbox.socketPath, `/can-reach?url=${encodeURIComponent('https://example.com/')}`);
  assert.equal(external.json.reachable, false, 'the site must not have external network access');

  // 4. the host filesystem is not visible: no repo, no journal, no home config
  for (const target of ['/home/exedev/journal', '/home/exedev/worktrees', '/home/exedev/.config', '/home/exedev/.ssh']) {
    const fsResult = await socketJson(sandbox.socketPath, `/fs?path=${encodeURIComponent(target)}`);
    assert.equal(fsResult.json.exists, false, `${target} must not be visible inside the sandbox`);
  }

  // 5. the environment is scrubbed to the allowlist: no token/proxy/auth variables
  const env = await socketJson(sandbox.socketPath, '/env');
  const suspicious = env.json.keys.filter((key) => /token|key|secret|proxy|auth|github|anthropic|openai/i.test(key));
  assert.deepEqual(suspicious, [], `env leaked: ${suspicious.join(', ')}`);
  assert.ok(env.json.keys.includes('PATH'));
  assert.ok(env.json.keys.length < 10, `env should be minimal, got: ${env.json.keys.join(', ')}`);

  // 6. the site tree is mounted read-only: the probe writes its db to /data, not /site
  assert.equal(existsSync(join(FIXTURE, 'probe.sqlite')), false, 'the fixture must not have written into its own tree');

  // 7. stop() tears the instance down
  sandbox.stop();
  assert.equal(sandbox.alive, false);
});
