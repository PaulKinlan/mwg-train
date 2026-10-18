import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { MODERN_RULES, MODERN_RULE_IDS } from '../src/corpus/modern-rules.mjs';
import { decidePair } from '../src/corpus/accept.mjs';
import { runOptionalModernRules } from '../src/corpus/harness.mjs';
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
      : request.url === '/stubborn' ? html.replace('</body>', `<script>
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
    await page.goto(`http://127.0.0.1:${server.address().port}/broken`);
    assert.equal((await MODERN_RULES['ui-behaviors/platform-controls-dismiss-dialog'].check(page, {})).status, 'FAIL');
    for (const id of ['ui-behaviors/declarative-dialog-popover-control', 'css/size-aware-styling', 'css/child-state-based-styling']) {
      assert.equal((await MODERN_RULES[id].check(page, {})).status, 'ERROR', id);
    }
    const isolatedUrl = `http://127.0.0.1:${server.address().port}/stubborn`;
    const isolated = await runOptionalModernRules(page, isolatedUrl, {});
    assert.equal(isolated.find((result) => result.rule === 'ui-behaviors/platform-controls-dismiss-dialog').status, 'FAIL');
    assert.equal(isolated.find((result) => result.rule === 'ui-behaviors/declarative-dialog-popover-control').status, 'PASS',
      'an undismissable dialog cannot taint a working popover on the next pristine page');
    assert.equal(await page.evaluate(`return document.querySelector('#modal').open`), false,
      'the final evidence page must not retain the failed modal');
    await page.goto('data:text/html,<html><body><p>No optional features</p></body></html>');
    for (const id of MODERN_RULE_IDS) {
      const result = await MODERN_RULES[id].check(page, {});
      assert.equal(result.status, 'NOT_APPLICABLE', `${id}: ${JSON.stringify(result)}`);
    }
    await page.close();
  } finally { if (chrome) await chrome.close(); }
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
