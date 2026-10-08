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
 */
export async function captureSignature({ chrome, projectDir, port, runDir }) {
  let server = null;
  let page = null;
  try {
    server = await startServer(projectDir, { port, dbPath: `${runDir}/${port}.sqlite` });
    page = await chrome.newPage({ viewport: TARGET_VIEWPORT });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSettled();
    return await page.evaluate(SIGNATURE_SCRIPT);
  } finally {
    if (page) await page.close().catch(() => {});
    if (server) await stopServer(server);
  }
}
