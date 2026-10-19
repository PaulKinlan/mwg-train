import test from 'node:test';
import assert from 'node:assert/strict';
import { screenshotTimeoutVerdict } from '../src/eval/live-slice-verdict.mjs';

test('a screenshot instrument timeout is inconclusive, never an app failure or success', () => {
  const error = Object.assign(new Error('Page.captureScreenshot did not answer within 30s'), { code: 'TIMEOUT' });
  const checks = { validation: 'passed before screenshot stalled' };
  assert.deepEqual(screenshotTimeoutVerdict(error, checks), {
    verdict: 'NOT_MEASURED', reason: 'CDP_SCREENSHOT_TIMEOUT', checks,
  });
  assert.equal(screenshotTimeoutVerdict(Object.assign(new Error('Page.navigate did not answer within 30s'), { code: 'TIMEOUT' })), null);
  assert.equal(screenshotTimeoutVerdict(new Error('Page.captureScreenshot did not answer within 30s')), null);
  assert.equal(screenshotTimeoutVerdict(new assert.AssertionError({ message: 'booking result incorrect' })), null);
});
