import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpError, Page } from '../src/corpus/cdp.mjs';
import { verifyTr01LiveSlice } from '../scripts/verify-tr01-live-slice.mjs';

const script = new URL('../scripts/verify-tr01-live-slice.mjs', import.meta.url).pathname;
const evidence = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tr01-live-slice-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// No private paid cordon or browser is ever supplied to this suite.
test('live-slice CLI refuses to run without an explicit quarantined project and evidence directory', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: verify-tr01-live-slice\.mjs/);
});

test('the CLI runner records a lost navigation reply as NOT_MEASURED and sets shell exit status 2', async (t) => {
  const dir = evidence(t);
  writeFileSync(join(dir, 'verdict.json'), '{"verdict":"ACCEPT_LINUX_FUNCTION"}\n');
  writeFileSync(join(dir, 'desktop-form.png'), 'stale screenshot');
  const methods = [];
  const page = new Page({ sessionId: 'offline', connection: {
    on() {},
    async send(method) {
      methods.push(method);
      throw new CdpError('TIMEOUT', `${method} did not answer within 30s`);
    },
  } }, { width: 1280, height: 900 });
  let stopped = false, closed = false;
  const start = async () => ({ mechanism: 'bubblewrap', async stop() { stopped = true; } });
  const launch = async () => ({ async newPage() { return page; }, async close() { closed = true; } });
  const oldExit = process.exitCode, oldError = console.error;
  const printed = [];
  console.error = (line) => printed.push(line);
  try {
    await verifyTr01LiveSlice({ project: 'unused-offline-fixture', evidenceDir: dir, start, launch });
    assert.equal(process.exitCode, 2, 'the script must make the shell see an inconclusive exit');
    assert.deepEqual(methods, ['Page.navigate']);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'verdict.json'))), {
      verdict: 'NOT_MEASURED', reason: 'CDP_NAVIGATE_NO_ACK', cause: 'UNATTRIBUTED',
      may_be_app_blocked_before_ack: true, rerun_required: true, checks: {},
    });
    assert.deepEqual(JSON.parse(printed.at(-1)), JSON.parse(readFileSync(join(dir, 'verdict.json'))));
    assert.equal(statSync(join(dir, 'verdict.json')).mode & 0o777, 0o600);
    assert.equal(existsSync(join(dir, 'desktop-form.png')), false, 'stale success evidence must be cleared');
    assert.equal(stopped && closed, true);
  } finally {
    process.exitCode = oldExit;
    console.error = oldError;
  }
});

test('an app-attributable navigation stall does not write an inconclusive verdict or exit 2', async (t) => {
  const dir = evidence(t);
  const page = { async goto() { throw new CdpError('NAVIGATION_TIMEOUT', 'app-ready exceeded 30s'); } };
  let stopped = false, closed = false;
  const oldExit = process.exitCode;
  try {
    await assert.rejects(verifyTr01LiveSlice({ project: 'unused-offline-fixture', evidenceDir: dir,
      start: async () => ({ mechanism: 'bubblewrap', async stop() { stopped = true; } }),
      launch: async () => ({ async newPage() { return page; }, async close() { closed = true; } }),
    }), /app-ready exceeded 30s/);
    assert.equal(process.exitCode, oldExit);
    assert.equal(existsSync(join(dir, 'verdict.json')), false);
    assert.equal(stopped && closed, true);
  } finally { process.exitCode = oldExit; }
});
