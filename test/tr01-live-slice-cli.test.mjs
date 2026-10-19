import test from 'node:test';
import assert from 'node:assert/strict';

// The paid cordon is private and cannot be a CI fixture. This exercises the runner's
// fail-closed no-input path; its actual browser journey is recorded separately in the report.
test('live-slice verifier refuses to run without an explicit quarantined project and evidence directory', async () => {
  const original = process.argv;
  try {
    process.argv = [process.execPath, 'test/tr01-live-slice-cli.test.mjs'];
    await assert.rejects(import('../scripts/verify-tr01-live-slice.mjs'), /usage: verify-tr01-live-slice\.mjs/);
  } finally {
    process.argv = original;
  }
});
