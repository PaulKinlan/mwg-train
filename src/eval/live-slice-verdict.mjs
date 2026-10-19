// Distinguish an inconclusive CDP screenshot stall from an application assertion failure.
// This does not retry, change the app verdict or turn instrument errors into passes.
export function screenshotTimeoutVerdict(error, checks = {}) {
  if (error?.code !== 'TIMEOUT' || !/^Page\.captureScreenshot did not answer within \d+s$/.test(error.message ?? '')) return null;
  return { verdict: 'NOT_MEASURED', reason: 'CDP_SCREENSHOT_TIMEOUT', checks };
}
