/**
 * Can the capture reach a state other than the root?
 *
 * `captureSignature` navigated to `http://127.0.0.1:<port>/` and nothing else, so every signature it could
 * produce described the homepage. The cross-arm instrument compares rendered arms against an archetype's
 * reference boards, and boards exist for states that are not the root - catalogue's empty page, contact-lead's
 * refusal re-render. A board of a state the capture never reaches has no counterpart on the rendered side, so
 * those comparisons could not run at all (mwg-train-bosi, from the board-gap analysis in
 * docs/provenance/assets/reference-board-gaps.md).
 *
 * This is a behaviour test rather than a signature test. `path` being present in the parameter list proves
 * nothing: an earlier attempt at this change put the parameter OUTSIDE the destructuring object, which made it
 * a positional second argument - `node --check` passed, and every existing caller would have passed `undefined`
 * and thrown. So what is asserted here is that a second page is actually rendered, and that the root is still
 * the default.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { captureSignature } from '../src/eval/render.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TMP = mkdtempSync(join(tmpdir(), 'mwg-capture-state-'));

after(() => {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
});

/**
 * A project the harness can actually serve.
 *
 * `captureSignature` starts a project through src/corpus/harness.mjs, which sets PILOT_PORT and polls
 * /__health. The site-kit fixtures under docs/eval/projects announce their own port with SITE_READY instead, so
 * the harness waits for a port they never opened and times out - proven by running it, not assumed. This
 * fixture therefore honours PILOT_PORT, and it serves two pages with different content so that "path was
 * honoured" and "path was ignored" cannot both pass.
 */
function writeFixture(dir) {
  writeFileSync(join(dir, 'server.mjs'), `
import { createServer } from 'node:http';
const port = Number(process.env.PILOT_PORT || 0);
const pages = {
  '/': '<h1>ROOT PAGE</h1><p id="a">alpha</p>',
  '/empty': '<h1>EMPTY STATE</h1><p id="b">nothing here</p><p id="c">still nothing</p><button id="d">retry</button>',
};
createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/__health') { res.writeHead(200).end('ok'); return; }
  const body = pages[path];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body || '<h1>missing</h1>');
}).listen(port);
`);
}

test('captureSignature renders the requested state, and the root by default', async () => {
  let chrome = null;
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-state-'));
  try {
    chrome = await launchChrome();

    const projectDir = join(runDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFixture(projectDir);

    // The signature is structural - nodes, boxes, controls - so the fixture's two pages are built to differ in
    // STRUCTURE, not only in text. An earlier version of this test used two h1+p pages and compared nodes; both
    // signatures legitimately matched, so it reported "path is being ignored" against correct code. The pages
    // must differ in the thing being measured.
    const root = await captureSignature({ chrome, projectDir, port: 7941, runDir });
    const empty = await captureSignature({ chrome, projectDir, port: 7942, runDir, path: '/empty' });

    // Both really rendered something.
    assert.ok(root.nodes.length > 0, 'the root capture produced no nodes, so this test proves nothing');
    assert.ok(empty.nodes.length > 0, 'the state capture produced no nodes');

    // They are genuinely different documents, which is what fails if `path` is accepted and then ignored. The
    // empty page carries an extra paragraph and a control, so this cannot pass by coincidence.
    assert.notDeepEqual(
      empty.nodes,
      root.nodes,
      'rendering /empty produced the same nodes as /, so path is being ignored',
    );

  } finally {
    if (chrome) await chrome.close().catch(() => {});
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('captureSignature refuses a path that is not root-relative', async () => {
  // Concatenated onto the local origin, so a non-root-relative path would either escape the origin or render
  // the wrong page, and either would be reported as a measurement of the arm rather than as a bad call. The
  // guard runs before the browser is used, so this needs no Chrome and cannot be skipped by it.
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-path-'));
  try {
    for (const bad of ['shortlist', '', 'http://example.test/', '//evil.test/']) {
      await assert.rejects(
        () => captureSignature({ chrome: null, projectDir: TMP, port: 7943, runDir, path: bad }),
        (error) => error instanceof TypeError && /root-relative/.test(error.message),
        `path ${JSON.stringify(bad)} was not refused`,
      );
    }
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});
