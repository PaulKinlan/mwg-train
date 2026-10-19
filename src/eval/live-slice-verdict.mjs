// A missing CDP reply is not evidence of an app pass or of a particular cause. Keep
// renderer/app-controlled stalls out of this classifier so they remain failures.
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
  return null;
}
