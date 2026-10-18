import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createPortReservation } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { MODERN_RULES, MODERN_RULE_IDS } from '../src/corpus/modern-rules.mjs';
import { decidePair } from '../src/corpus/accept.mjs';
import { runOptionalModernRules, runProjectVersion } from '../src/corpus/harness.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';

const html = `<!doctype html><html><head><style>
.card { background-color: white; }
.card:has(input:checked) { background-color: rgb(10, 20, 30); }
.container { container-type: inline-size; width: 600px; }
.target { color: blue; }
@container (min-width: 500px) { .target { color: red; } }
.vt { view-transition-name: demo-item; }
</style></head><body>
<button commandfor="modal" command="show-modal">Open dialog</button>
<dialog id="modal" aria-label="Confirm"><form method="dialog"><button>Close</button></form></dialog>
<button popovertarget="help">Help</button><div id="help" popover="auto">Help text</div>
<div class="container"><p class="target">Responsive</p></div>
<div class="card"><input type="checkbox" aria-label="Active"></div>
<div class="vt">Animated</div>
<button id="transition" type="button">Animate</button>
<script>document.querySelector('#transition').addEventListener('click', () => document.startViewTransition(() => {
  document.querySelector('.vt').textContent = 'Animated again';
}));</script>
</body></html>`;

test('five optional modern-platform diagnostics observe real browser behaviour and honest applicability', async (t) => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(request.url === '/static' ? html.replace(/<script>[\s\S]*?<\/script>/, '')
      : request.url === '/duplicate-after' ? html.replace("document.querySelector('.vt').textContent = 'Animated again';",
        "document.querySelector('.vt').textContent = 'Animated again'; document.querySelector('.vt').insertAdjacentHTML('afterend', '<div class=\"vt\">Duplicate</div>');")
      : request.url === '/no-change' ? html.replace("document.querySelector('.vt').textContent = 'Animated again';", '')
      : request.url === '/style-change' ? html.replace("document.querySelector('.vt').textContent = 'Animated again';",
        "document.querySelector('.vt').style.backgroundColor = 'red';")
      : request.url === '/stubborn' ? html.replace('</body>', `<script>
        sessionStorage.setItem('__mwgOptionalLoadCount', String(Number(sessionStorage.getItem('__mwgOptionalLoadCount') ?? 0) + 1));
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && document.querySelector('#modal').open) {
            event.preventDefault(); event.stopImmediatePropagation();
          }
        }, true);
      </script></body>`) : request.url === '/broken' ? html.replace('aria-label="Confirm"', '')
        .replace('popovertarget="help"', 'popovertarget="missing"')
        .replace('container-type: inline-size;', '')
        .replace('background-color: rgb(10, 20, 30);', 'background-color: white;') : html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  let chrome;
  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const transitionId = 'ui-behaviors/same-document-transitions';
    const declared = JSON.parse(readFileSync(new URL('../docs/eval/specs/booking.json', import.meta.url), 'utf8'));
    declared.view_transition_trigger = '#transition';
    const checkContext = buildProjectFromSpec({ spec: declared, frameworkName: 'raw' }).spec.check_context;
    assert.equal(checkContext.viewTransitionTrigger, '#transition', 'the authored spec must reach the browser-check context');
    assert.equal((await MODERN_RULES[transitionId].check(page, {})).status, 'ERROR', 'a styled element alone cannot prove execution');
    for (const id of MODERN_RULE_IDS) {
      const result = await MODERN_RULES[id].check(page, id === transitionId ? checkContext : {});
      assert.equal(result.status, 'PASS', `${id}: ${JSON.stringify(result)}`);
      assert.equal(result.rule, id);
    }
    await page.evaluate(`document.querySelectorAll('.vt').forEach((element) => element.insertAdjacentHTML('afterend','<div class="vt">Duplicate</div>')); return true`);
    assert.equal((await MODERN_RULES[transitionId].check(page, {})).status, 'FAIL');
    await page.goto(`http://127.0.0.1:${server.address().port}/static`);
    assert.equal((await MODERN_RULES[transitionId].check(page, { viewTransitionTrigger: '#transition' })).status, 'ERROR',
      'a declared trigger with no transition must remain unmeasured');
    await page.goto(`http://127.0.0.1:${server.address().port}/duplicate-after`);
    assert.equal((await MODERN_RULES[transitionId].check(page, { viewTransitionTrigger: '#transition' })).status, 'FAIL',
      'duplicate names created by the transition must not be missed');
    await page.goto(`http://127.0.0.1:${server.address().port}/no-change`);
    assert.equal((await MODERN_RULES[transitionId].check(page, { viewTransitionTrigger: '#transition' })).status, 'ERROR',
      'a completed transition with an empty callback must not count as a demonstrated change');
    await page.goto(`http://127.0.0.1:${server.address().port}/style-change`);
    assert.equal((await MODERN_RULES[transitionId].check(page, { viewTransitionTrigger: '#transition' })).status, 'PASS',
      'a computed visual change without changing text is still observable');
    await page.goto(`http://127.0.0.1:${server.address().port}/broken`);
    assert.equal((await MODERN_RULES['ui-behaviors/platform-controls-dismiss-dialog'].check(page, {})).status, 'FAIL');
    for (const id of ['ui-behaviors/declarative-dialog-popover-control', 'css/size-aware-styling', 'css/child-state-based-styling']) {
      assert.equal((await MODERN_RULES[id].check(page, {})).status, 'ERROR', id);
    }
    const isolatedUrl = `http://127.0.0.1:${server.address().port}/stubborn`;
    await page.evaluate(`sessionStorage.removeItem('__mwgOptionalLoadCount'); return true`);
    const isolated = await runOptionalModernRules(page, isolatedUrl, {});
    assert.equal(isolated.find((result) => result.rule === 'ui-behaviors/platform-controls-dismiss-dialog').status, 'FAIL');
    assert.equal(isolated.find((result) => result.rule === 'ui-behaviors/declarative-dialog-popover-control').status, 'PASS',
      'an undismissable dialog cannot taint a working popover on the next pristine page');
    assert.equal(await page.evaluate(`return document.querySelector('#modal').open`), false,
      'the final evidence page must not retain the failed modal');
    assert.equal(await page.evaluate(`return Number(sessionStorage.getItem('__mwgOptionalLoadCount'))`), MODERN_RULE_IDS.length + 1,
      'the final evidence page must be a fresh navigation after the last optional diagnostic');
    await page.goto('data:text/html,<html><body><p>No optional features</p></body></html>');
    for (const id of MODERN_RULE_IDS) {
      const result = await MODERN_RULES[id].check(page, {});
      assert.equal(result.status, 'NOT_APPLICABLE', `${id}: ${JSON.stringify(result)}`);
    }
    await page.close();
  } finally { if (chrome) await chrome.close(); }
});

test('the production corpus runner includes optional diagnostics and restores the evidence page', async () => {
  // Hand-authored local fixture; do not execute a generated project outside its approved sandbox.
  const dir = mkdtempSync(join(tmpdir(), 'mwg-modern-callsite-'));
  const projectDir = join(dir, 'project');
  let chrome;
  try {
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, 'server.mjs'), `
import { createServer } from 'node:http';
const form = '<!doctype html><html><body><h1>Trusted harness fixture</h1>'
  + '<form action="/saved" method="get"><label>Note<input id="note" name="note" required></label><button>Save</button></form>'
  + '<button commandfor="modal" command="show-modal">Open dialog</button>'
  + '<dialog id="modal" aria-label="Modal"><button commandfor="modal" command="close">Close</button></dialog>'
  + '<button popovertarget="help">Help</button><div id="help" popover="auto">Help text</div>'
  + '<script>document.addEventListener("keydown", e => { if (e.key === "Escape" && document.querySelector("#modal").open) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);</script></body></html>';
createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('content-type', url.pathname === '/__health' ? 'application/json' : 'text/html; charset=utf-8');
  if (url.pathname === '/__health') return res.end('{"ok":true}');
  if (url.pathname === '/') return res.end(form);
  if (url.pathname === '/saved') return res.end('<!doctype html><html><body><div id="record-echo">Saved note</div></body></html>');
  res.writeHead(404); res.end('not found');
}).listen(Number(process.env.PILOT_PORT), '127.0.0.1');
`);
    const reservation = createPortReservation();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    chrome = await launchChrome();
    const evidencePages = [];
    const observedChrome = { version: chrome.version, newPage: async (options) => {
      const page = await chrome.newPage(options);
      // Count navigations only after the first optional diagnostic has opened the fixture's modal.
      // Four later rule resets plus the extra restore must happen before the desktop screenshot.
      const navigationsAfterDialog = [];
      let dialogDriven = false;
      const click = page.click.bind(page);
      page.click = async (selector, ...args) => {
        const result = await click(selector, ...args);
        if (selector === 'button[commandfor="modal"][command="show-modal"]') dialogDriven = true;
        return result;
      };
      const goto = page.goto.bind(page);
      page.goto = async (url, ...args) => {
        if (dialogDriven) navigationsAfterDialog.push(url);
        return goto(url, ...args);
      };
      const screenshot = page.screenshot.bind(page);
      page.screenshot = async (...args) => {
        evidencePages.push({ url: await page.url(), modalOpen: await page.evaluate(`return document.querySelector('#modal')?.open ?? false`),
          navigationsAfterDialog: [...navigationsAfterDialog] });
        return screenshot(...args);
      };
      return page;
    } };
    const record = await runProjectVersion({ chrome: observedChrome, projectDir, runDir: dir,
      dbPath: join(dir, 'fixture.sqlite'), label: 'trusted', port,
      spec: { project_id: 'modern-callsite-fixture', archetype: 'fixture', framework: { name: 'raw', version: 'fixture' },
        journey: { kind: 'get-query-reload', startPath: '/', formSelector: 'form', fill: { '#note': 'Saved note' } },
        required_rules: [], check_context: {} } });
    assert.deepEqual(record.errors, [], JSON.stringify(record.errors));
    assert.deepEqual(record.rules.map((result) => result.rule), [...MODERN_RULE_IDS],
      'removing the production runOptionalModernRules call must turn this assertion red');
    assert.equal(record.rules.find((result) => result.rule === 'ui-behaviors/platform-controls-dismiss-dialog')?.status, 'FAIL');
    assert.equal(record.rules.find((result) => result.rule === 'ui-behaviors/declarative-dialog-popover-control')?.status, 'PASS',
      'a failed modal must not taint the popover on the next fresh page');
    assert.ok(existsSync(record.screenshots?.desktop), 'the production evidence capture must run');
    if (process.env.MWG_TEST_SCREENSHOT_PATH) copyFileSync(record.screenshots.desktop, process.env.MWG_TEST_SCREENSHOT_PATH);
    assert.deepEqual(evidencePages[0], { url: `http://127.0.0.1:${port}/`, modalOpen: false,
      navigationsAfterDialog: Array(MODERN_RULE_IDS.length).fill(`http://127.0.0.1:${port}/`) },
      'each later diagnostic must start fresh, followed by the extra landing-page restore before evidence');
  } finally {
    if (chrome) await chrome.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('optional diagnostic improvements do not create an accepted training pair', () => {
  const required = 'forms/required-field-feedback';
  const optional = MODERN_RULE_IDS[0];
  const record = (requiredStatus, optionalStatus) => ({
    echo_expect: 'saved', journeys: [
      { name: 'server-persistence', echoedText: 'saved', steps: [{ step: 'reload' }, { step: 'submit', status: 200 }] },
      { name: 'validation-failure' },
    ], errors: [], security: [], rules: [
      { rule: required, status: requiredStatus }, { rule: optional, status: optionalStatus },
    ],
  });
  const spec = { project_id: 'test', archetype: 'test', framework: { name: 'raw', family: 'raw' }, seeded_defects: ['missing-required'], echo_expect: 'saved', required_rules: [required] };
  const result = decidePair({ original: record('FAIL', 'FAIL'), uplifted: record('FAIL', 'PASS'), spec, uplift: { applied: [], skipped: [], failed: [] } });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.improved_rules, []);
  assert.equal(result.category, 'no-mwg-improvement');
});
