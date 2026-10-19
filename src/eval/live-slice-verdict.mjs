// Only additional commands the live-slice driver can actually send belong here. An arbitrary
// TIMEOUT code or CDP-looking string is not proof of a lost command reply.
const LIVE_SLICE_CDP_COMMANDS = new Set([
  'Browser.getVersion', 'Target.createBrowserContext', 'Target.createTarget',
  'Target.attachToTarget', 'Target.closeTarget', 'Page.enable',
  'Page.addScriptToEvaluateOnNewDocument', 'Page.getFrameTree',
  'Runtime.enable', 'Network.enable', 'Network.getCookies',
  'Emulation.setDeviceMetricsOverride', 'Emulation.setTouchEmulationEnabled',
  'Fetch.enable', 'Fetch.failRequest', 'Fetch.continueRequest',
  'Input.insertText', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent',
]);

// A missing CDP reply is not evidence of an app pass or of a particular cause.
// A blocked renderer may also prevent a reply: keep it explicitly unattributed and
// require reassessment. Readiness and assertion failures use different codes.
export function liveSliceTimeoutVerdict(error, checks = {}) {
  if (error?.code !== 'TIMEOUT') return null;
  if (/^Page\.captureScreenshot did not answer within \d+s$/.test(error.message ?? '')) {
    return { verdict: 'NOT_MEASURED', reason: 'CDP_SCREENSHOT_TIMEOUT', checks };
  }
  // A Page.navigate reply can be lost in CDP or delayed by the app *before* the
  // acknowledgement. Unlike a navigation-ready timeout, its cause is unknown.
  // Require a fresh, independently assessed run; never count this as a pass.
  if (/^Page\.navigate did not answer within \d+s$/.test(error.message ?? '')) {
    return { verdict: 'NOT_MEASURED', reason: 'CDP_NAVIGATE_NO_ACK', cause: 'UNATTRIBUTED',
      may_be_app_blocked_before_ack: true, rerun_required: true, checks };
  }
  // These are command-reply timers, not the app-ready NAVIGATION_TIMEOUT,
  // RELOAD_TIMEOUT or WAIT_TIMEOUT. A renderer hang can look identical, so do
  // not assign blame to CDP or the app until a fresh run can distinguish them.
  for (const [method, reason] of [
    ['Runtime.evaluate', 'CDP_EVALUATE_NO_ACK'],
    ['Page.reload', 'CDP_RELOAD_NO_ACK'],
  ]) {
    if (error.message === `${method} did not answer within 30s`)
      return { verdict: 'NOT_MEASURED', reason, cause: 'UNATTRIBUTED',
        may_be_app_blocked_before_ack: true, rerun_required: true, checks };
  }
  const command = /^([A-Za-z]+\.[A-Za-z]+) did not answer within 30s$/.exec(error.message ?? '');
  if (command && LIVE_SLICE_CDP_COMMANDS.has(command[1]))
    return { verdict: 'NOT_MEASURED', reason: 'CDP_COMMAND_NO_ACK', method: command[1],
      cause: 'UNATTRIBUTED', may_be_app_blocked_before_ack: true, rerun_required: true, checks };
  return null;
}
