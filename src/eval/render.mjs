/**
 * Rendering one project to a conformance signature.
 *
 * Both the target renderer and the family scorers need the same thing: start a project, load its main
 * page in the shared headless Chrome, and read the signature the metrics consume. Keeping it in one
 * place is what stops the two scorers drifting, and what makes "the server is always stopped" a
 * property of the code rather than a habit in two `finally` blocks.
 */
import { startServer, stopServer } from '../corpus/harness.mjs';

import { SIGNATURE_SCRIPT } from './conformance.mjs';
import { TARGET_VIEWPORT } from './targets.mjs';

/**
 * Render one project at `/` and return its signature. The server is stopped even if the page failed
 * to open; a rejected `newPage` must not leave a project listening on the port.
 *
 * `viewport` defaults to the frozen `TARGET_VIEWPORT` so every existing caller is byte-identical to
 * before this parameter existed. It is a parameter rather than a second function because rendering a
 * project at a width is the same job however wide the window is; the cross-arm parity instrument needs
 * the same signature at three widths, and a copy of this function would be a second place for "the
 * server is always stopped" to stop being true.
 *
 * `screenshotPath` and `collect` are the same argument applied to the other two things an instrument
 * wants from a loaded page: an image, and one extra expression's worth of measurements (the cross-arm
 * instrument reads computed design tokens this way). They are taken HERE, on the page that is already
 * open and measured, rather than in a second visit - a second visit would measure a different page load
 * and could disagree with the signature.
 *
 * `path` is which page of the project to render, and it defaults to `/` so every existing caller is
 * byte-identical to before this parameter existed. It is a parameter rather than a second function for the
 * same reason `viewport` is: rendering a project at a state is the same job whatever the state is, and the
 * server lifecycle, the settle wait and the signature script must not acquire a second place to drift.
 *
 * It exists because the cross-arm instrument compares rendered arms against the archetype's reference
 * boards, and boards exist for states that are not the root - catalogue's empty page, contact-lead's
 * refusal re-render. Until this parameter existed captureSignature reached `/` and nothing else, so those
 * states could not be compared to their boards at all (mwg-train-bosi).
 *
 * A path must be root-relative. It is concatenated onto the local origin, so anything else would either
 * escape the origin or silently render the wrong page, and both failures would surface as a measurement of
 * the arm rather than as a mistake in the call.
 *
 * `drive` is the same argument for a state that has NO path: a page whose refusal, validation or empty state
 * only exists after somebody acts on it. A path selects a document; a drive selects a state of a document, by
 * filling fields and submitting, and only then measuring. It is passed HERE rather than done by the caller
 * because the drive has to happen on the page that is measured: a caller that opened a second page would
 * measure a different load, and the signature, the `collect` probe and the screenshot would disagree.
 *
 * `drive.expectText` is not decoration. Without it a drive that silently SUCCEEDED - the submission was
 * accepted, no refusal was rendered - would produce a clean screenshot of a different page, which would then
 * be compared against a refusal board and reported as a visual difference. A drive that does not reach the
 * state its board depicts throws instead, so the comparison is reported as unmeasured rather than as a wrong
 * answer (mwg-train-mr6t).
 */
export async function captureSignature({ chrome, projectDir, port, runDir, viewport = TARGET_VIEWPORT, screenshotPath = null, collect = null, path = '/', drive = null }) {
  // `//host/path` is rejected as well as `host/path`: it starts with "/" but a browser reads it as a
  // protocol-relative URL, so the guard would pass a call that leaves the origin. A test caught that.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError(`captureSignature: path must be root-relative and start with a single "/", got ${JSON.stringify(path)}`);
  }
  // A drive that names no action would capture the plain page and be compared as though it were the state, so
  // it is refused rather than treated as a no-op: the failure mode is a silent wrong answer, which is the one
  // thing an instrument must not produce.
  if (drive !== null && (typeof drive !== 'object' || Array.isArray(drive))) {
    throw new TypeError(`captureSignature: drive must be null or an object, got ${JSON.stringify(drive)}`);
  }
  if (drive) {
    const { fill = null, submit = null, expectText = null } = drive;
    if (fill === null && submit === null) {
      throw new TypeError('captureSignature: drive must name at least one action (fill or submit) - a drive with no action captures the plain page');
    }
    if (fill !== null && (typeof fill !== 'object' || Array.isArray(fill))) {
      throw new TypeError(`captureSignature: drive.fill must be an object of selector -> value, got ${JSON.stringify(fill)}`);
    }
    for (const [selector, value] of Object.entries(fill ?? {})) {
      if (typeof selector !== 'string' || !selector.trim()) {
        throw new TypeError('captureSignature: drive.fill has an empty selector');
      }
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new TypeError(`captureSignature: drive.fill[${JSON.stringify(selector)}] must be a string or number, got ${JSON.stringify(value)}`);
      }
    }
    if (submit !== null && (typeof submit !== 'string' || !submit.trim())) {
      throw new TypeError(`captureSignature: drive.submit must be a non-empty selector, got ${JSON.stringify(submit)}`);
    }
    // Required, not optional (mwg-train-pv44): without it the capture cannot tell a refusal from a successful
    // submission, and the screenshot of the wrong state would be compared against the refusal board with full
    // confidence. The mapping validator refuses such an entry; this guard means the API agrees even when called
    // directly.
    if (expectText === null || typeof expectText !== 'string' || !expectText.trim()) {
      throw new TypeError(`captureSignature: drive.expectText is required and must be a non-empty string, got ${JSON.stringify(expectText)}; without it a successful submission cannot be told from the state the board depicts`);
    }
  }
  let server = null;
  let page = null;
  try {
    server = await startServer(projectDir, { port, dbPath: `${runDir}/${port}.sqlite` });

    // Verify route reachability: do not screenshot and score a 404 page against reference boards
    const targetUrl = `http://127.0.0.1:${port}${path}`;
    const res = await fetch(targetUrl).catch(() => ({ status: 0 }));
    if (res.status === 404) {
      throw new Error(`captureSignature: path ${path} returned HTTP 404 Not Found`);
    }

    page = await chrome.newPage({ viewport });
    await page.goto(targetUrl);
    await page.waitForSettled();
    if (drive) {
      // Wait for the selectors before acting on them. An arm that hydrates on the client - react and preact both
      // build their DOM after the response is parsed - can be served with the form in the HTML and still have no
      // form in the document at the moment the drive runs, and `type`/`submit` report that as "not found".
      // Measured on a real sweep: six arms captured the driven state and the react arm failed with
      // `submit(form#order-form) failed: not found` while its own page.mjs emitted exactly that id, which is a
      // race, not a missing form. The wait turns it into the state the board depicts (or a timeout that names
      // the selector, which is what a genuinely missing form should look like).
      for (const selector of [...Object.keys(drive.fill ?? {}), ...(drive.submit ? [drive.submit] : [])]) {
        await page.waitFor(selector);
      }
      for (const [selector, value] of Object.entries(drive.fill ?? {})) await page.type(selector, String(value));
      if (drive.submit) await page.submit(drive.submit);
      // `submit` waits for the document to settle, but a refusal rendered CLIENT-side makes no request, so that
      // wait can return before the framework has painted the error. The longer quiet period is what makes the
      // screenshot and the signature describe the state after the re-render rather than the state before it.
      await page.waitForSettled({ timeout: 10_000, quiet: 300 });
      if (drive.expectText) {
        const text = await page
          .evaluate('return document.body ? document.body.innerText : ""')
          .catch(() => '');
        if (!String(text).includes(drive.expectText)) {
          throw new Error(
            `captureSignature: the drive did not reach the expected state: the page does not contain ${JSON.stringify(drive.expectText)}. A submission that succeeded, or a state that never rendered, must be reported as unmeasured rather than compared against a refusal board.`,
          );
        }
      }
    }
    const signature = await page.evaluate(SIGNATURE_SCRIPT);
    // `collect` is discriminated by whether it was PROVIDED, not by what it returned: a caller whose
    // script legitimately evaluates to null must still receive `collected: null` rather than a signature
    // that looks as though no probe was asked for at all. A cross-family review caught the sentinel
    // conflating those two cases.
    if (typeof collect !== 'string') {
      if (screenshotPath) await page.screenshot(screenshotPath);
      return signature;
    }
    const collected = await page.evaluate(collect);
    if (screenshotPath) await page.screenshot(screenshotPath);
    return { ...signature, collected };
  } finally {
    if (page) await page.close().catch(() => {});
    if (server) await stopServer(server);
  }
}
