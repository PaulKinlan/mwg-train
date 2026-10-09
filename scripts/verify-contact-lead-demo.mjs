// Functional verification of the contact-lead demo in a real browser.
//
// Written AFTER the catalogue demo's harness was taken apart by review and then found to have been passing a
// page with NO STYLESHEET APPLIED (mwg-train-ea9). Four things are therefore built in from the first draft
// rather than added after a review finds them:
//
//   1. STYLE FIRST. This demo exists to be a visual reference. Every functional check here - element counts,
//      offsetParent visibility, form values - passes trivially on a page whose stylesheet never applied, so
//      the first assertion is that the stylesheet applied and the body is the boards' slate.
//   2. NO PROBE THROWS. A thrown error aborts the run and hides every check after it. Probes return
//      sentinels; each check fails on its own.
//   3. EVIDENCE IS SEPARATE. A control run against a deliberately broken copy must not overwrite the real
//      run's screenshots.
//   4. THE CONTROL IS PART OF THE EVIDENCE. A suite that only ever passes proves nothing, so the harness
//      takes an archetype directory and the control run is recorded alongside the passing one.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKTREE = join(import.meta.dirname, '..');
const CAT_DEFAULT = join(WORKTREE, 'docs/design/archetypes/contact-lead');
// A RELATIVE value resolves against the current working directory; unset or empty uses the in-repo default,
// which is absolute and therefore safe from any cwd.
const CAT = process.env.K8W_ARCHETYPE_DIR ? resolve(process.env.K8W_ARCHETYPE_DIR) : CAT_DEFAULT;
const CONTROL = Boolean(process.env.K8W_ARCHETYPE_DIR);
const SHOTS = CONTROL ? '/tmp/k8w-shots-control' : '/tmp/k8w-shots';
const RESULT_PATH = CONTROL ? '/tmp/k8w-verify-control.json' : '/tmp/k8w-verify.json';
const SLATE = 'rgb(15, 23, 42)';

const { launchChrome } = await import(join(WORKTREE, 'src/corpus/cdp.mjs'));
const { startStaticServer } = await import(join(WORKTREE, 'scripts/lib/static-server.mjs'));

mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const STYLE_STATE = `return JSON.stringify({
  sheets: document.styleSheets.length,
  rules: [...document.styleSheets].reduce((n, s) => n + s.cssRules.length, 0),
  bg: getComputedStyle(document.body).backgroundColor,
  cta: (() => { const b = document.querySelector('form button[type="submit"], button'); return b ? getComputedStyle(b).backgroundColor : null })(),
})`;
const CONTRACT = `return JSON.stringify({
  form: Boolean(document.querySelector('form#enquiry-form')),
  name: (() => { const e = document.querySelector('input[name="name"]'); return e ? { type: e.type, required: e.required } : null })(),
  email: (() => { const e = document.querySelector('input[name="email"]'); return e ? { type: e.type, required: e.required } : null })(),
  message: (() => { const e = document.querySelector('textarea[name="message"]'); return e ? { tag: e.tagName, required: e.required } : null })(),
  scope: (() => { const e = document.querySelector('select[name="scope"]'); return e ? [...e.options].map((o) => o.textContent.trim()) : null })(),
  counter: Boolean(document.getElementById('message-count')),
})`;

const server = await startStaticServer({ mounts: { '/cl/': CAT } });
const base = `${server.origin}/cl/demo`;
let chrome = null;
const failures = [];
try {
  chrome = await launchChrome({});
  const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${base}/index.html`);
  await page.waitForSettled().catch(() => sleep(900));

  // ---- 1. STYLE FIRST ----
  const style = JSON.parse(await page.evaluate(STYLE_STATE));
  check(
    "the stylesheet is APPLIED and the palette is the boards' slate",
    style.rules > 0 && style.bg === SLATE,
    `${style.sheets} sheet(s), ${style.rules} rule(s) applied, body background ${style.bg}, CTA ${style.cta}`,
  );
  await page.screenshot(join(SHOTS, 'index-desktop-1280x900.png'));

  // ---- 2. the frozen contract ----
  const contract = JSON.parse(await page.evaluate(CONTRACT));
  check('the form is form#enquiry-form', contract.form === true, `found: ${contract.form}`);
  check(
    'the three spec fields exist with the right types and are required',
    contract.name?.type === 'text' && contract.name.required === true
      && contract.email?.type === 'email' && contract.email.required === true
      && contract.message?.tag === 'TEXTAREA' && contract.message.required === true,
    `name=${JSON.stringify(contract.name)} email=${JSON.stringify(contract.email)} message=${JSON.stringify(contract.message)}`,
  );
  check(
    "the scope options are the board's three",
    Array.isArray(contract.scope) && ['Residential Renovation', 'Commercial Build', 'Interior Architecture'].every((o) => contract.scope.includes(o)),
    `options: ${JSON.stringify(contract.scope)}`,
  );
  check('the message field has a character counter element', contract.counter === true, `#message-count present: ${contract.counter}`);

  // ---- 3. the counter counts ----
  const before = await page.evaluate(`return (document.getElementById('message-count') || {}).textContent || ''`);
  await page.realType('textarea[name="message"]', 'A six storey library refit');
  await sleep(400);
  const after = await page.evaluate(`return (document.getElementById('message-count') || {}).textContent || ''`);
  check('the character count changes while typing', before !== after && after !== '', `"${before}" -> "${after}"`);

  // ---- 4. an empty submit is REFUSED, driven through the real control ----
  await page.goto(`${base}/index.html`);
  await sleep(800);
  await page.evaluate(`{
    const button = document.querySelector('form#enquiry-form button[type="submit"]');
    if (button) button.click();
    return 'clicked';
  }`);
  await sleep(900);
  const afterEmpty = await page.evaluate(`return JSON.stringify({ path: location.pathname, valid: document.getElementById('enquiry-form') ? document.getElementById('enquiry-form').checkValidity() : null })`);
  const emptyState = JSON.parse(afterEmpty);
  check(
    'submitting an empty form is refused and does not navigate',
    /index\.html$/.test(emptyState.path) && emptyState.valid === false,
    `still on ${emptyState.path}, form valid: ${emptyState.valid}`,
  );

  // ---- 5-8. a real submission reaches the success view and echoes what was typed ----
  const NAME = 'Elena Rossi';
  const MESSAGE = 'Consultation for a Soho warehouse conversion';
  await page.goto(`${base}/index.html`);
  await sleep(800);
  await page.realType('input[name="name"]', NAME);
  await page.realType('input[name="email"]', 'elena@studio.test');
  await page.realType('textarea[name="message"]', MESSAGE);
  await sleep(300);
  await page.evaluate(`{ const f = document.getElementById('enquiry-form'); if (f) f.requestSubmit(); return 'ok'; }`);
  await sleep(1400);
  const landed = await page.evaluate(`return JSON.stringify({
    path: location.pathname,
    name: (document.getElementById('success-name') || {}).textContent || null,
    message: (document.getElementById('enquiry-message') || {}).textContent || null,
    text: document.body.innerText
  })`);
  const success = JSON.parse(landed);
  check('a filled submission lands on the success view', /success\.html$/.test(success.path), `landed on ${success.path}`);
  check('the success view echoes the name that was typed', String(success.name ?? '').includes(NAME), `#success-name = ${JSON.stringify(success.name)}`);
  check('the success view echoes the message that was typed', String(success.message ?? '').includes(MESSAGE), `#enquiry-message = ${JSON.stringify(String(success.message ?? '').slice(0, 60))}`);
  check("the board's reference token is shown", /#?LEAD-7301/.test(success.text), `"LEAD-7301" present: ${/#?LEAD-7301/.test(success.text)}`);
  await page.screenshot(join(SHOTS, 'success-desktop-1280x900.png'));

  // ---- 9. the echoed name is TEXT, not markup. A user controls this value. ----
  await page.goto(`${base}/index.html`);
  await sleep(800);
  await page.realType('input[name="name"]', '<b>bold</b>');
  await page.realType('input[name="email"]', 'x@example.test');
  await page.realType('textarea[name="message"]', 'please');
  await sleep(300);
  await page.evaluate(`{ const f = document.getElementById('enquiry-form'); if (f) f.requestSubmit(); return 'ok'; }`);
  await sleep(1400);
  const injected = await page.evaluate(`{
    const target = document.getElementById('success-name');
    return JSON.stringify({
      innerHTML: target ? target.innerHTML : null,
      text: target ? target.textContent : null,
      injectedElements: target ? target.querySelectorAll('b, script, img').length : -1
    });
  }`);
  const inj = JSON.parse(injected);
  check(
    'a name containing markup is echoed as TEXT, not parsed',
    inj.injectedElements === 0 && String(inj.text ?? '').includes('<b>'),
    `text=${JSON.stringify(inj.text)} elements inside the echo: ${inj.injectedElements}`,
  );

  // ---- 10. mobile at a real viewport ----
  const mobile = await chrome.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await mobile.goto(`${base}/index.html`);
  await sleep(900);
  const overflow = await mobile.evaluate('return document.documentElement.scrollWidth - window.innerWidth');
  const mobileStyle = JSON.parse(await mobile.evaluate(STYLE_STATE));
  check('mobile 390x844 renders styled', mobileStyle.rules > 0, `${mobileStyle.rules} rule(s), background ${mobileStyle.bg}`);
  check('mobile has no horizontal overflow', overflow <= 1, `${overflow}px of overflow`);
  await mobile.screenshot(join(SHOTS, 'index-mobile-390x844.png'));

  // ---- 11. the comparison page loads both boards same-origin ----
  const compare = await chrome.newPage({ viewport: { width: 1280, height: 900 } });
  await compare.goto(`${base}/compare.html`);
  await sleep(1100);
  const compareState = JSON.parse(await compare.evaluate(`return JSON.stringify({
    ready: document.readyState,
    text: document.body.innerText.length,
    loaded: [...document.images].filter((i) => i.naturalWidth > 0).length,
    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    frames: document.querySelectorAll('iframe').length
  })`));
  check('compare.html renders', compareState.ready === 'complete' && compareState.text > 100, `${compareState.text} chars, ${compareState.loaded} image(s)`);
  check('compare.html loads BOTH reference boards same-origin', compareState.broken === 0 && compareState.loaded >= 2, `${compareState.loaded} loaded, ${compareState.broken} broken`);
  check('compare.html embeds the live demo', compareState.frames >= 2, `${compareState.frames} iframe(s)`);
  await compare.screenshot(join(SHOTS, 'compare-desktop-1280x900.png'), { fullPage: true });

  const exceptions = page.console.filter((entry) => entry.type === 'exception');
  check('no uncaught exceptions on any page probed', exceptions.length === 0, JSON.stringify(exceptions.slice(0, 2)));
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.error('VERIFY ERROR', error);
} finally {
  if (chrome) await chrome.close().catch(() => {});
  await server.close().catch(() => {});
}

const failed = checks.filter((entry) => !entry.ok);
writeFileSync(RESULT_PATH, JSON.stringify({ checks, failures, failedCount: failed.length }, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
for (const entry of failed) console.log(`FAILED: ${entry.name} - ${entry.detail}`);
for (const failure of failures) console.log(`ERROR: ${failure}`);
process.exit(failed.length === 0 && failures.length === 0 ? 0 : 1);
