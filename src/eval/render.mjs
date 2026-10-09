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
 */
export async function captureSignature({ chrome, projectDir, port, runDir, viewport = TARGET_VIEWPORT }) {
  let server = null;
  let page = null;
  try {
    server = await startServer(projectDir, { port, dbPath: `${runDir}/${port}.sqlite` });
    page = await chrome.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSettled();
    return await page.evaluate(SIGNATURE_SCRIPT);
  } finally {
    if (page) await page.close().catch(() => {});
    if (server) await stopServer(server);
  }
}
