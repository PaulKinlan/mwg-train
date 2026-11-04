import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runEnvironment, runProjectVersion } from '../src/corpus/harness.mjs';
import { versionRecord } from '../scripts/train-corpus-run.mjs';

test('a corpus run records the host Node/platform and the actual CDP browser version', () => {
  const version = { product: 'Chrome/155.0.8059.39', protocolVersion: '1.3', revision: '@example' };
  assert.deepEqual(runEnvironment({ version }), {
    platform: process.platform,
    node_version: process.version,
    browser: version,
    chrome_version: version.product,
    chrome_sandbox: null,
  });
});

test('a corpus run records the browser containment posture the Chrome handle reports', () => {
  // mwg-train-ry4q: the posture is decided where Chrome is launched, so the record is the only place it can survive
  // into a committed run. Both directions are asserted, because a projection that always claimed `sandboxed: true`
  // would pass a test that only ever checked the default launch.
  const version = { product: 'Chrome/155.0.8059.39', protocolVersion: '1.3' };
  const launched = { sandboxed: true, optIn: null };
  assert.deepEqual(runEnvironment({ version, sandbox: launched }).chrome_sandbox, launched);
  const optedOut = { sandboxed: false, optIn: 'MWG_ALLOW_UNSANDBOXED_CHROME=1' };
  const unsandboxed = runEnvironment({ version, sandbox: optedOut });
  assert.deepEqual(unsandboxed.chrome_sandbox, optedOut,
    'an unsandboxed launch must be recorded as unsandboxed, with the opt-in that allowed it');
  assert.equal(unsandboxed.chrome_sandbox.sandboxed, false);
});

test('a handle that does not disclose its posture records unknown, never an assumed sandbox', () => {
  // A launch that failed before a handle existed, or a test fixture, knows nothing about containment. Recording
  // `sandboxed: true` there would invent the protection this field exists to attest.
  assert.equal(runEnvironment(undefined).chrome_sandbox, null);
  assert.equal(runEnvironment({ version: { product: 'Chrome/155.0.8059.39' } }).chrome_sandbox, null);
});

test('an unavailable browser product is visibly unknown, not invented from a host default', () => {
  assert.deepEqual(runEnvironment({ version: { protocolVersion: '1.3' } }), {
    platform: process.platform,
    node_version: process.version,
    browser: { protocolVersion: '1.3' },
    chrome_version: null,
    chrome_sandbox: null,
  });
});

test('the projection retains each input stamp rather than substituting host or fixture defaults', () => {
  // Synthetic profiles, not measured run evidence. Neither is derived from process.platform/version.
  const profiles = [
    { platform: 'darwin', node_version: 'v22.11.0',
      browser: { product: 'Chrome/144.0.7559.12', protocolVersion: '1.3', revision: '@darwin-fixture' },
      chrome_version: 'Chrome/144.0.7559.12' },
    { platform: 'linux', node_version: 'v25.3.0',
      browser: { product: 'Chromium/155.0.8059.40', protocolVersion: '1.4', revision: '@linux-fixture' },
      chrome_version: 'Chromium/155.0.8059.40' },
  ];
  for (const profile of profiles) {
    const projected = versionRecord({ ...profile, journeys: [], errors: [] }, {});
    for (const [key, expected] of Object.entries(profile)) {
      assert.deepEqual(projected[key], expected, `${profile.platform}/${profile.node_version} ${key}`);
    }
  }
});

test('aggregate corpus projection preserves measured sandbox and heap-only memory containment', () => {
  const record = { platform: 'linux', node_version: 'v22.11.0',
    browser: { product: 'Chrome/140.0.7339.80' }, chrome_version: 'Chrome/140.0.7339.80',
    sandbox: 'bubblewrap', memoryContainment: { mode: 'heap-only', nodeHeapMb: 512, rssContained: false },
    chrome_sandbox: { sandboxed: false, optIn: 'MWG_ALLOW_UNSANDBOXED_CHROME=1' },
    journeys: [], errors: [], console: [] };
  const projected = versionRecord(record, {});
  assert.equal(projected.sandbox, record.sandbox);
  assert.deepEqual(projected.memoryContainment, record.memoryContainment);
  assert.deepEqual(projected.chrome_sandbox, record.chrome_sandbox,
    'the committed row must attest the browser posture as measured, not the server sandbox under another name');
  const unavailable = versionRecord({ ...record, sandbox: null, memoryContainment: null, chrome_sandbox: null }, {});
  assert.equal(unavailable.sandbox, null, 'do not invent a sandbox on pre-launch failures');
  assert.equal(unavailable.memoryContainment, null, 'do not invent memory containment on pre-launch failures');
  assert.equal(unavailable.chrome_sandbox, null, 'do not invent a browser posture on pre-launch failures');
});

test('the returned run record and training-corpus projection keep the measured stamp even on failure', async () => {
  // A real occupied port forces the harness to return before page creation: no Chrome or generated server is run.
  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'mwg-run-stamp-'));
  const product = 'Chrome/155.0.8059.39'; // Synthetic CDP fixture, NOT a measured browser.
  try {
    const original = await runProjectVersion({ chrome: { version: { product, protocolVersion: '1.3' } },
      projectDir: dir, spec: { project_id: 'test-raw', archetype: 'test', framework: { name: 'raw', version: 'test' } },
      label: 'original', port: occupied.address().port, runDir: dir, dbPath: join(dir, 'test.sqlite') });
    assert.ok(original.errors.some((error) => error.includes('already in use')));
    assert.deepEqual(original.runtime_quality, { status: 'NOT_MEASURED', reason: 'browser was not sampled' });
    const expected = { platform: process.platform, node_version: process.version,
      browser: { product, protocolVersion: '1.3' }, chrome_version: product };
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(original[key], value, key);
    const projected = versionRecord(original, {});
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(projected[key], value, key);
    assert.equal(projected.sandbox, null, 'no sandbox launched on occupied-port failure');
    assert.equal(projected.memoryContainment, null, 'no server memory cap on occupied-port failure');
    assert.equal(projected.chrome_sandbox, null, 'a handle that disclosed no posture records none');
    assert.throws(() => versionRecord({ ...original, chrome_version: null }, {}), /missing measured.*browser/i);
    assert.throws(() => versionRecord({ ...original, platform: undefined }, {}), /missing measured.*platform/i);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the returned run record and training-corpus projection carry the browser containment posture', async () => {
  // The same occupied-port shortcut: the record is built before the server starts, so the posture the handle
  // disclosed is reachable without driving a page - which is the point, because a run that dies early still has to
  // say what was protecting the host.
  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'mwg-run-chrome-sandbox-'));
  const product = 'Chrome/155.0.8059.39'; // Synthetic fixture, NOT a measured browser.
  try {
    for (const posture of [
      { sandboxed: true, optIn: null },
      { sandboxed: false, optIn: 'MWG_ALLOW_UNSANDBOXED_CHROME=1' },
    ]) {
      const record = await runProjectVersion({ chrome: { version: { product, protocolVersion: '1.3' }, sandbox: posture },
        projectDir: dir, spec: { project_id: 'test-raw', archetype: 'test', framework: { name: 'raw', version: 'test' } },
        label: 'original', port: occupied.address().port, runDir: dir, dbPath: join(dir, 'test.sqlite') });
      assert.deepEqual(record.chrome_sandbox, posture, 'the record carries the posture the handle reported');
      assert.deepEqual(versionRecord(record, {}).chrome_sandbox, posture,
        'the training-corpus projection keeps the posture instead of dropping it on the way to the committed row');
    }
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
