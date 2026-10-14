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
  });
});

test('an unavailable browser product is visibly unknown, not invented from a host default', () => {
  assert.deepEqual(runEnvironment({ version: { protocolVersion: '1.3' } }), {
    platform: process.platform,
    node_version: process.version,
    browser: { protocolVersion: '1.3' },
    chrome_version: null,
  });
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
    const expected = { platform: process.platform, node_version: process.version,
      browser: { product, protocolVersion: '1.3' }, chrome_version: product };
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(original[key], value, key);
    const projected = versionRecord(original, {});
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(projected[key], value, key);
    assert.throws(() => versionRecord({ ...original, chrome_version: null }, {}), /missing measured.*browser/i);
    assert.throws(() => versionRecord({ ...original, platform: undefined }, {}), /missing measured.*platform/i);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
