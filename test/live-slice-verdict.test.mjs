import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSliceTimeoutVerdict } from '../src/eval/live-slice-verdict.mjs';
import { CdpError, Page } from '../src/corpus/cdp.mjs';

const timeout = (message, code = 'TIMEOUT') => Object.assign(new Error(message), { code });

test('screenshot CDP timeout remains unmeasured, never an app failure or success', () => {
  const checks = { validation: 'passed before screenshot stalled' };
  assert.deepEqual(liveSliceTimeoutVerdict(timeout('Page.captureScreenshot did not answer within 30s'), checks), {
    verdict: 'NOT_MEASURED', reason: 'CDP_SCREENSHOT_TIMEOUT', checks,
  });
});

test('navigate command no-ack is unmeasured and explicitly unattributed, requiring reassessment', () => {
  const checks = { viewports: 'observed before navigation stopped' };
  assert.deepEqual(liveSliceTimeoutVerdict(timeout('Page.navigate did not answer within 30s'), checks), {
    verdict: 'NOT_MEASURED', reason: 'CDP_NAVIGATE_NO_ACK', cause: 'UNATTRIBUTED',
    may_be_app_blocked_before_ack: true, rerun_required: true, checks,
  });
});

test('a lost Page.navigate reply propagates through the real page driver to the verdict', async () => {
  const calls = [];
  const page = new Page({ sessionId: 'offline', connection: {
    on() {},
    async send(method) {
      calls.push(method);
      throw new CdpError('TIMEOUT', `${method} did not answer within 30s`);
    },
  } }, { width: 1280, height: 900 });
  let caught;
  try { await page.goto('http://127.0.0.1:1/'); } catch (error) { caught = error; }
  assert.deepEqual(calls, ['Page.navigate']);
  assert.deepEqual(liveSliceTimeoutVerdict(caught, { reached: 'before navigation' }), {
    verdict: 'NOT_MEASURED', reason: 'CDP_NAVIGATE_NO_ACK', cause: 'UNATTRIBUTED',
    may_be_app_blocked_before_ack: true, rerun_required: true, checks: { reached: 'before navigation' },
  });
});

test('app-driven stalls and non-matching CDP failures stay failures, not unmeasured', () => {
  for (const error of [
    timeout('Runtime.evaluate did not answer within 30s'),
    timeout('Runtime.callFunctionOn did not answer within 30s'),
    timeout('Input.insertText did not answer within 30s'),
    timeout('Input.dispatchKeyEvent did not answer within 30s'),
    timeout('Page.reload did not answer within 30s'),
    timeout('Page.navigateFoo did not answer within 30s'),
    timeout('prefix Page.navigate did not answer within 30s'),
    timeout('Page.navigate did not answer within 30s suffix'),
    timeout('Page.navigate did not answer within thirty seconds'),
    timeout('Page.navigate did not answer within 30s', 'NAVIGATION_TIMEOUT'),
    timeout('Page.navigate did not answer within 30s', 'RELOAD_TIMEOUT'),
    timeout('Page.navigate did not answer within 30s', 'WAIT_TIMEOUT'),
    timeout('Page.navigate did not answer within 30s', 'EVAL_FAILED'),
    timeout('Page.navigate did not answer within 30s', 'CDP_ERROR'),
    timeout('Page.navigate did not answer within 30s', 'CLOSED'),
    new Error('Page.navigate did not answer within 30s'),
    new assert.AssertionError({ message: 'booking result incorrect' }),
  ]) {
    assert.equal(liveSliceTimeoutVerdict(error), null, `${error.code ?? error.name}: ${error.message}`);
  }
});
