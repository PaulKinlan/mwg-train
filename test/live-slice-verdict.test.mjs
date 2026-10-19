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

test('Runtime.evaluate and Page.reload no-acks are unmeasured and unattributed, not app failures', async () => {
  const checks = { reached: 'before the command stalled' };
  for (const [method, invoke, reason] of [
    ['Runtime.evaluate', (page) => page.evaluate('return document.title'), 'CDP_EVALUATE_NO_ACK'],
    ['Page.reload', (page) => page.reload(), 'CDP_RELOAD_NO_ACK'],
  ]) {
    const calls = [];
    const page = new Page({ sessionId: 'offline', connection: {
      on() {},
      async send(command) {
        calls.push(command);
        if (command === 'Page.getFrameTree') return { frameTree: { frame: { loaderId: 'before-reload' } } };
        throw new CdpError('TIMEOUT', `${command} did not answer within 30s`);
      },
    } }, { width: 1280, height: 900 });
    let caught;
    try { await invoke(page); } catch (error) { caught = error; }
    assert.equal(calls.at(-1), method);
    assert.deepEqual(liveSliceTimeoutVerdict(caught, checks), {
      verdict: 'NOT_MEASURED', reason, cause: 'UNATTRIBUTED',
      may_be_app_blocked_before_ack: true, rerun_required: true, checks,
    });
  }
});

test('other live-slice CDP command no-acks remain unattributed, never become app failures', () => {
  for (const method of ['Page.getFrameTree', 'Input.insertText', 'Input.dispatchKeyEvent',
    'Target.attachToTarget', 'Emulation.setDeviceMetricsOverride', 'Fetch.enable']) {
    assert.deepEqual(liveSliceTimeoutVerdict(timeout(`${method} did not answer within 30s`)), {
      verdict: 'NOT_MEASURED', reason: 'CDP_COMMAND_NO_ACK', method,
      cause: 'UNATTRIBUTED', may_be_app_blocked_before_ack: true, rerun_required: true, checks: {},
    });
  }
});

test('app-ready stalls and non-matching CDP failures stay failures, not unmeasured', () => {
  for (const error of [
    timeout('Runtime.evaluate did not answer within 31s'),
    timeout('Runtime.evaluateFoo did not answer within 30s'),
    timeout('Runtime.callFunctionOn did not answer within 30s'),
    timeout('Input.insertText did not answer within 31s'),
    timeout('Input.dispatchKeyEventFoo did not answer within 30s'),
    timeout('Page.reload did not answer within 30s suffix'),
    timeout('prefix Page.reload did not answer within 30s'),
    timeout('Page.navigateFoo did not answer within 30s'),
    timeout('prefix Page.navigate did not answer within 30s'),
    timeout('Page.navigate did not answer within 30s suffix'),
    timeout('Page.navigate did not answer within thirty seconds'),
    ...['NAVIGATION_TIMEOUT', 'RELOAD_TIMEOUT', 'WAIT_TIMEOUT', 'EVAL_FAILED', 'CDP_ERROR', 'CLOSED']
      .flatMap((code) => ['Page.navigate', 'Page.reload', 'Runtime.evaluate', 'Input.insertText']
        .map((method) => timeout(`${method} did not answer within 30s`, code))),
    new Error('Page.navigate did not answer within 30s'),
    new Error('Runtime.evaluate did not answer within 30s'),
    new assert.AssertionError({ message: 'booking result incorrect' }),
  ]) {
    assert.equal(liveSliceTimeoutVerdict(error), null, `${error.code ?? error.name}: ${error.message}`);
  }
});
