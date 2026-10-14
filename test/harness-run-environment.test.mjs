import assert from 'node:assert/strict';
import test from 'node:test';
import { runEnvironment } from '../src/corpus/harness.mjs';

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
