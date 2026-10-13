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
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { captureSignature } from '../src/eval/render.mjs';
import { conformanceScore, isMeasurable, structuralSimilarity } from '../src/eval/conformance.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TMP = mkdtempSync(join(tmpdir(), 'mwg-capture-state-'));

// mwg-train-7sh0. Three of the four tests below each launched their own browser, and a Chrome start is the
// dominant cost of this file: measured at 7.7-8.1s for the file with three launches. One browser is now shared and
// closed here. It is launched LAZILY rather than in a before() hook, so a run that selects only the no-browser
// guard test - or one that fails before reaching any browser - still starts no Chrome.
let chromePromise = null;
const getChrome = () => (chromePromise ??= launchChrome());

after(async () => {
  if (chromePromise) await chromePromise.then((c) => c.close()).catch(() => {});
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
  // mwg-train-uh9q. Two pages with IDENTICAL rendered output; the second carries hidden markup. A capture that
  // emits the hidden element as a node makes them compare as 0.5 structurally, which is a scoring defect, not a
  // cosmetic one.
  '/plain': '<h1>VISIBLE</h1><p>visible words</p>',
  '/hidden': '<h1>VISIBLE</h1><p>visible words</p><div hidden role="alert">invisible words</div>',
  // mwg-train-0qnu. visibility:hidden on a parent does NOT stop a child rendering - CSS lets the child set
  // visibility:visible - so the walk must not prune there. display:none is the opposite case and must still prune.
  '/override': '<div style="visibility:hidden"><p style="visibility:visible">Visible</p></div>',
  '/none': '<div style="display:none"><p>invisible words</p></div><p>Visible</p>',
  // Content that RENDERS but is not in textContent. The branch's earlier work narrowed "does this render" to
  // "does it have textContent or a media tag", so these pages went from measurable on main to refused here.
  '/generated': '<style>.g::before{content:"Generated label"}</style><p class="g"></p>',
  // ...and the controls that must NOT become measurable, so the new rule cannot re-break the earlier findings.
  '/empty-mount': '<figure></figure>',
  '/empty-wrapper': '<div><span><figure></figure></span></div>',
  '/hidden-generated': '<style>.g::before{content:"Generated label"}</style><p class="g" hidden></p>',
  // mwg-train-rdkd. A pseudo-element is not rendered because it has content DECLARED: one that is itself
  // display:none paints nothing, so this page is blank white and must not be measured.
  '/pseudo-hidden': '<style>.g::before{content:"Generated label";display:none}</style><p class="g"></p>',
  // The pseudo-level version of the visibility:hidden override, verified by reading a screenshot of it: the
  // element is hidden, its ::before sets visibility:visible, and the glyph IS painted - so the page is not empty.
  '/pseudo-override': '<style>.g::before{content:"Generated label";visibility:visible}</style><p class="g" style="visibility:hidden"></p>',
  // mwg-train-mr6t. The refusal state a DRIVE has to reach: nothing about the served document distinguishes it
  // from the clean form - the page only shows the error after an empty submission - which is exactly why a path
  // cannot select it and the drive exists. The form is served with the error only when the submission is a GET
  // without the field, so the state is produced by acting, not by asking for a URL.
  // mwg-train-mr6t, from a real sweep: the react arm failed with submit(form#order-form) failed: not found
  // while its own page.mjs emitted that exact id - it had been served and not yet hydrated. This page reproduces
  // the race deliberately: the markup is in a template and is moved into the document 250ms after load, so a
  // drive that does not wait acts on a form that is not there yet.
  '/hydrated-form': '<div id="mount">loading</div><template id="tpl"><form id="late-form"><input id="n" name="n"><button type="submit">Send</button></form></template>'
    + '<script>setTimeout(function () { var m = document.getElementById("mount"); m.appendChild(document.getElementById("tpl").content.cloneNode(true));'
    + ' var f = document.getElementById("late-form");'
    + ' f.addEventListener("submit", function (e) { e.preventDefault(); var p = document.createElement("p");'
    + ' p.setAttribute("role", "alert"); p.textContent = "Late refusal shown"; document.body.appendChild(p); }); }, 1500);</script>',
  '/refusal-form': '<form id="reserve" action="/refusal-form" method="get"><label for="r">Researcher name</label><input id="r" name="researcher"><button type="submit">Request reservation</button></form>'
    + '<script>document.getElementById("reserve").addEventListener("submit", (e) => { e.preventDefault(); const v = document.getElementById("r").value; document.getElementById("banner")?.remove(); const p = document.createElement("p"); p.id = "banner"; p.setAttribute("role", "alert"); p.textContent = v ? "Reservation submitted for " + v : "Your reservation could not be submitted"; document.body.appendChild(p); });</script>',
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
  const chrome = await getChrome();
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-state-'));
  try {

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

test('captureSignature refuses to capture an HTTP 404 response', async () => {
  const chrome = await getChrome();
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-404-'));
  try {
    const projectDir = join(runDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFixture(projectDir);

    await assert.rejects(
      () => captureSignature({ chrome, projectDir, port: 9597, runDir, path: '/does-not-exist.html' }),
      (error) => error instanceof Error && /returned HTTP 404 Not Found/.test(error.message),
      'must refuse 404'
    );
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('hidden markup neither moves a score nor hides a visible override beneath it', async () => {
  // mwg-train-uh9q. The previous fix recorded `visible: false` on each node and honoured it in isMeasurable, but
  // tokens() maps EVERY node to a structural token and did not honour it - so a page carrying hidden markup
  // scored 0.5 structural similarity against a page with identical rendered output, from a real capture.
  //
  // The capture now refuses to emit a hidden element or anything inside it, so this is asserted on two REAL
  // pages rather than on hand-built signatures: a hand-built signature can always contain a node the page did not
  // render, which is exactly the shape the metric cannot protect itself from. A source guard in
  // test/conformance.test.mjs covers the code; this covers the behaviour.
  // The fixture is written into the run directory, as the test above does - pointing projectDir at TMP instead
  // gives the harness no server.mjs and it fails with "server did not become ready", which is how this test
  // first failed. Each test keeps its own run directory and ports; only the browser is shared.
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-state-hidden-'));
  const projectDir = join(runDir, 'project');
  mkdirSync(projectDir, { recursive: true });
  writeFixture(projectDir);
  try {
    const chrome = await getChrome();
    const plain = await captureSignature({ chrome, projectDir, port: 7944, runDir, path: '/plain' });
    const hidden = await captureSignature({ chrome, projectDir, port: 7945, runDir, path: '/hidden' });

    assert.deepEqual(hidden.nodes, plain.nodes, 'hidden markup must not add nodes');

    // The control that makes this meaningful: without it both pages could be empty and everything below would
    // pass for the wrong reason.
    assert.ok(plain.nodes.length > 0, 'the visible page must actually capture nodes');
    assert.equal(isMeasurable(plain), true);
    assert.equal(isMeasurable(hidden), true, 'the hidden page still renders its visible paragraphs');

    assert.equal(structuralSimilarity(plain, hidden), 1, 'identical rendered output must compare as identical');
    assert.equal(conformanceScore(plain, hidden).structural, 1);

    // A visible child inside a visibility:hidden parent is rendered, so pruning the SUBTREE there loses real
    // content. This was a false negative: the page matched the visible content but captured no nodes, and
    // isMeasurable then reported a page with visible text as an empty shell.
    const override = await captureSignature({ chrome, projectDir, port: 7946, runDir, path: '/override' });
    assert.deepEqual(override.nodes.map((n) => n.tag), ['p'], 'the visible override is a node');
    assert.ok(override.nodes[0].textLength > 0, 'and its text is counted');
    assert.equal(isMeasurable(override), true, 'so the page is measurable and not an empty shell');

    // The control that keeps the fix honest: display:none must STILL prune, because nothing inside it can render.
    // Without this, "always descend" would be indistinguishable from "never prune".
    const none = await captureSignature({ chrome, projectDir, port: 7947, runDir, path: '/none' });
    assert.deepEqual(none.nodes.map((n) => n.tag), ['p'], 'only the element outside the display:none subtree');
    assert.equal(none.nodes[0].textLength, 'Visible'.length, 'and the hidden words contribute no text');
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('CSS-generated content counts only when the pseudo-element itself renders', async () => {
  // mwg-train-0qnu's sibling, and a regression this branch introduced. main's rule counted any node that is not a
  // div, span or custom element, so a <p> with no textContent counted; the text-based rule needs textLength > 0
  // and refused it. That is icon fonts and CSS-generated labels, not an exotic case - and it is a false negative,
  // the direction that silently refuses to score a real page.
  //
  // The field is recorded at CAPTURE because it cannot be derived from a signature at scoring time, and the
  // controls below are what stop it from re-breaking the empty-shell findings this branch exists to fix.
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-generated-'));
  const projectDir = join(runDir, 'project');
  mkdirSync(projectDir, { recursive: true });
  writeFixture(projectDir);
  try {
    const chrome = await getChrome();

    const generated = await captureSignature({ chrome, projectDir, port: 7948, runDir, path: '/generated' });
    assert.equal(isMeasurable(generated), true, 'generated text is rendered text, so the page is measurable');
    assert.equal(generated.nodes[0].generated, true, 'and it is recorded as generated at capture');
    // The point of the field: the DOM reports no text, which is exactly why textLength alone was not enough.
    assert.equal(generated.nodes[0].textLength, 0, 'textContent stays empty - this is why the field is needed');
    assert.equal(conformanceScore(generated, generated).overall, 1, 'and it still scores against itself');

    // CONTROLS - the empty-shell findings must stay fixed. Without these, "generated content counts" could be
    // widened into "anything counts" and the page-level tree rule would be gone without a test noticing.
    const emptyMount = await captureSignature({ chrome, projectDir, port: 7949, runDir, path: '/empty-mount' });
    assert.equal(isMeasurable(emptyMount), false, 'an empty <figure> mount is still an empty shell');
    const emptyWrapper = await captureSignature({ chrome, projectDir, port: 7950, runDir, path: '/empty-wrapper' });
    assert.equal(isMeasurable(emptyWrapper), false, 'and so is a tree of empty wrappers');
    const hiddenGenerated = await captureSignature({ chrome, projectDir, port: 7951, runDir, path: '/hidden-generated' });
    assert.equal(isMeasurable(hiddenGenerated), false, 'generated content on a HIDDEN element renders nothing');

    // The adversarial case from the review, and the reason the rule reads the pseudo-element's own rendering
    // rather than whether content is declared: content declares the text, display:none stops it painting.
    const pseudoHidden = await captureSignature({ chrome, projectDir, port: 7952, runDir, path: '/pseudo-hidden' });
    assert.equal(isMeasurable(pseudoHidden), false, 'a pseudo-element that does not render paints nothing');
    assert.equal(pseudoHidden.nodes[0].generated, false, 'and it is not recorded as generated');

    // And the mirror of that: visibility is inherited and a pseudo-element is a child, so a pseudo that sets
    // visibility:visible paints inside a hidden element. A screenshot proves the glyph is there, so refusing this
    // page would be a false negative - the direction that refuses to score a real page.
    const pseudoOverride = await captureSignature({ chrome, projectDir, port: 7953, runDir, path: '/pseudo-override' });
    assert.equal(isMeasurable(pseudoOverride), true, 'a pseudo that overrides visibility on a hidden element renders');
    assert.equal(pseudoOverride.nodes[0].generated, true, 'and the element is collected because its pseudo paints');
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('a drive reaches a state no path can select, and the screenshot is of that state', async () => {
  // mwg-train-mr6t. Reference boards exist for refusals two to four interactions into a journey (a form after an
  // empty submission, a cart after a refused checkout). No path serves those states, so the board could only ever
  // be compared against the page as it loaded, which is a different state - and the earlier fix for that
  // (board-states kind: interaction, path null) made them permanently exempt instead of measurable.
  //
  // Asserted on a real page with a real submission because the alternative - asserting that a `drive` parameter
  // exists - passes with the drive wired to nothing, which is the failure mode this whole test file exists for.
  const chrome = await getChrome();
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-drive-'));
  try {
    const projectDir = join(runDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFixture(projectDir);

    const clean = await captureSignature({ chrome, projectDir, port: 7961, runDir, path: '/refusal-form' });
    const screenshotPath = join(runDir, 'driven.png');
    const driven = await captureSignature({
      chrome,
      projectDir,
      port: 7962,
      runDir,
      path: '/refusal-form',
      screenshotPath,
      drive: { fill: { '#r': '' }, submit: 'form#reserve', expectText: 'could not be submitted' },
    });

    // The driven capture rendered something and its structure differs from the clean form: the error banner is a
    // node the clean page does not have, so "the drive was accepted and then ignored" cannot pass.
    assert.ok(driven.nodes.length > 0, 'the driven capture produced no nodes');
    assert.notDeepEqual(driven.nodes, clean.nodes, 'the driven capture produced the same nodes as the untouched page, so the drive did nothing');
    assert.ok(existsSync(screenshotPath), 'no screenshot was written for the driven state');
    assert.ok(statSync(screenshotPath).size > 0, 'the driven screenshot is empty');
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('a drive that does not reach the state it claims is refused rather than measured', async () => {
  // The one dangerous outcome: the submission SUCCEEDED, the page shows no refusal, and the screenshot is then
  // compared against a refusal board and reported as a visual difference. `expectText` turns that into an
  // unmeasured state. The drive here fills the field, so the fixture succeeds and the refusal never renders.
  const chrome = await getChrome();
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-drive-expect-'));
  try {
    const projectDir = join(runDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFixture(projectDir);

    await assert.rejects(
      () =>
        captureSignature({
          chrome,
          projectDir,
          port: 7963,
          runDir,
          path: '/refusal-form',
          drive: { fill: { '#r': 'A. Researcher' }, submit: 'form#reserve', expectText: 'could not be submitted' },
        }),
      (error) => error instanceof Error && /did not reach the expected state/.test(error.message),
      'a drive that silently succeeded was not refused',
    );
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('a drive that names no action is refused before any browser starts', async () => {
  // It would capture the plain page and be compared as if it were the state, so it is a TypeError on the
  // parameter contract, tested here with chrome: null because the guard must run before the browser is used.
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-drive-guard-'));
  try {
    await assert.rejects(
      () => captureSignature({ chrome: null, projectDir: TMP, port: 7964, runDir, drive: { startPath: '/' } }),
      (error) => error instanceof TypeError && /at least one action/.test(error.message),
      'a drive with no action was not refused',
    );
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test('a drive waits for a form the arm has not hydrated yet', async () => {
  // mwg-train-mr6t, from a real sweep: the react arm was served with `form#order-form` in its HTML and had no
  // such form in the document when the drive ran, so `submit` reported "not found" - and the instrument reported
  // that arm as an unmeasured state. The form appears 250ms after load here, which is far shorter than the wait
  // and far longer than the settle the capture does before driving.
  const chrome = await getChrome();
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-capture-drive-hydrate-'));
  try {
    const projectDir = join(runDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFixture(projectDir);

    const driven = await captureSignature({
      chrome,
      projectDir,
      port: 7965,
      runDir,
      path: '/hydrated-form',
      drive: { submit: 'form#late-form', expectText: 'Late refusal shown' },
    });
    assert.ok(driven.nodes.length > 0, 'the driven capture produced no nodes');
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});
