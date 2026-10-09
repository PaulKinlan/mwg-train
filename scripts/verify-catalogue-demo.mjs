// Functional verification of the catalogue demo in a real browser.
//
// Three of this harness's own bugs produced false failures before it was trusted, each of which looked
// exactly like a demo defect: counting ALL [data-price] cards when the demo filters by HIDING them (12 vs
// 2 visible), clicking the #cart-form submit with an EMPTY part number (the form validates and correctly
// refuses), and calling page.reload, which is not part of the CDP wrapper. The probe is verified before the
// effect. page.console is dumped on failure so a page-side error cannot hide behind a finding.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKTREE = join(import.meta.dirname, '..');
// Overridable so the harness can be pointed at a deliberately BROKEN copy of the demo. A suite of checks
// that only ever passes proves nothing, so the control run is part of the evidence: XVD_ARCHETYPE_DIR=...
const CAT = process.env.XVD_ARCHETYPE_DIR ? resolve(process.env.XVD_ARCHETYPE_DIR)
  : join(WORKTREE, 'docs/design/archetypes/catalogue');
const SHOTS = '/tmp/xvd-shots';

const { launchChrome } = await import(join(WORKTREE, 'src/corpus/cdp.mjs'));
const { startStaticServer } = await import(join(WORKTREE, 'scripts/lib/static-server.mjs'));

mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

// visible() uses offsetParent, because the demo filters by hiding cards - counting the DOM nodes measures
// the markup, not the search.
const COUNTS = `return JSON.stringify({
  all: document.querySelectorAll('[data-price]').length,
  visible: [...document.querySelectorAll('[data-price]')].filter((el) => el.offsetParent !== null).length,
  q: document.getElementById('q') ? document.getElementById('q').value : null,
  url: location.pathname + location.search
})`;
const CART = `return JSON.stringify({
  keys: Object.keys(localStorage),
  cart: localStorage.getItem('kiln-copper-cart-v1'),
  badge: (document.getElementById('cart-badge') || {}).textContent,
  lines: document.querySelectorAll('#cart-items li').length,
  subtotal: (document.getElementById('cart-subtotal') || {}).textContent,
  total: (document.getElementById('cart-total') || {}).textContent,
  status: (document.getElementById('cart-form-status') || {}).textContent
})`;

const server = await startStaticServer({ mounts: { '/cat/': CAT } });
const base = `${server.origin}/cat/demo`;
let chrome = null;
const failures = [];
try {
  chrome = await launchChrome({});

  // ---- desktop rendering ----
  const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/index.html`);
  await sleep(900);
  const initial = JSON.parse(await page.evaluate(COUNTS));
  check('desktop grid renders product cards', initial.all >= 3, `${initial.all} cards, ${initial.visible} visible`);
  await page.screenshot(join(SHOTS, 'index-desktop-1280x900.png'));

  // ---- the search really filters (real key events; measured by VISIBLE cards) ----
  await page.realType('input[name="q"]', 'bearing');
  await sleep(800);
  const bearing = JSON.parse(await page.evaluate(COUNTS));
  check('typing "bearing" narrows the VISIBLE grid', bearing.visible > 0 && bearing.visible < initial.visible, `${initial.visible} -> ${bearing.visible} visible of ${bearing.all} cards`);
  check('the search is reflected in the URL', /q=bearing/.test(bearing.url), bearing.url);
  // Scoped to the SEARCH RESULTS, not the page. A cross-family review caught this check passing off static
  // text: a "Search \"bearing\"" button is always in the DOM, so reading document.body.innerText would
  // have passed even if the search returned nothing at all. Every VISIBLE card must match, which is the
  // filter's own contract and a claim a broken search cannot satisfy.
  const bearingCards = JSON.parse(await page.evaluate(`return JSON.stringify(
    [...document.querySelectorAll('[data-price]')].filter((el) => el.offsetParent !== null).map((el) => el.innerText)
  )`));
  check(
    'the spec expectText "bearing" appears in the SEARCH RESULTS',
    bearingCards.length > 0 && bearingCards.every((text) => text.toLowerCase().includes('bearing')),
    `${bearingCards.length} visible card(s): ${bearingCards.map((text) => text.split('\n')[0]).join(' | ')}`,
  );

  // ---- the empty state ----
  await page.goto(`${base}/index.html`);
  await sleep(800);
  await page.realType('input[name="q"]', 'porcelain teapot');
  await sleep(800);
  const empty = JSON.parse(await page.evaluate(COUNTS));
  check('a query with no match yields the empty state', empty.visible === 0, `${empty.visible} visible of ${empty.all}`);
  await page.screenshot(join(SHOTS, 'index-empty-search-1280x900.png'));

  // ---- the spec's own write contract: field `item`, quantity optional ----
  await page.goto(`${base}/index.html`);
  await sleep(800);
  await page.realType('input[name="item"]', 'VASE-001');
  await sleep(250);
  await page.evaluate(`{ document.getElementById('cart-form').requestSubmit(); return 'ok'; }`);
  await sleep(900);
  const afterForm = JSON.parse(await page.evaluate(CART));
  check('submitting the spec field `item` adds to the cart', afterForm.lines === 1 && /VASE-001/.test(afterForm.cart ?? ''), `lines=${afterForm.lines} badge=${afterForm.badge} status="${String(afterForm.status).slice(0, 60)}"`);
  check('the quantity field is optional (no value was given)', /"qty":1/.test(afterForm.cart ?? ''), afterForm.cart);

  // ---- a card-level quick-add, which must also work and must accumulate ----
  // A SECOND line, and picked so that a second line is genuinely required. A cross-family review caught the
  // first version clicking the first card's control - which is VASE-001, the item the form already added - so
  // the demo grouped the two into one line and the check passed on `lines >= 1` without adding anything. The
  // target is now the first card that is NOT the item already in the cart, and the assertion is strict.
  const quick = await page.evaluate(`{
    const buttons = [...document.querySelectorAll('button')].filter((b) => /add to cart/i.test(b.getAttribute('aria-label') || b.textContent || '') && !b.closest('#cart-form'));
    // A sentinel rather than a throw: the control run strips the script entirely, and a thrown error here
    // aborted the remaining checks, so the persistence check never ran and the control proved less than it
    // should. Fail the check, do not stop the run.
    if (!buttons.length) return JSON.stringify({ label: null, missing: true });
    const target = buttons.find((b) => {
      const card = b.closest('.product-card') || b.parentElement;
      return card && !/rustic vase/i.test(card.innerText);
    }) || buttons[0];
    const card = target.closest('.product-card') || target.parentElement;
    target.click();
    return JSON.stringify({ label: (card ? card.innerText.split('\\n')[0] : '').trim().slice(0, 40) });
  }`);
  await sleep(800);
  const afterQuick = JSON.parse(await page.evaluate(CART));
  check(
    'a card quick-add control adds a SECOND line',
    afterQuick.lines > afterForm.lines,
    JSON.parse(quick).missing
      ? 'no card-level quick-add control found'
      : `clicked card "${JSON.parse(quick).label}", lines ${afterForm.lines} -> ${afterQuick.lines}`,
  );
  check('the drawer reports totals', Number.parseFloat(String(afterQuick.subtotal).replace(/[^0-9.]/g, '')) > 0, `subtotal=${afterQuick.subtotal} total=${afterQuick.total}`);
  await page.screenshot(join(SHOTS, 'index-cart-open-1280x900.png'));

  // ---- persistence across a real navigation ----
  await page.goto(`${base}/index.html`);
  await sleep(900);
  const afterReload = JSON.parse(await page.evaluate(CART));
  // `lines > 0` comes first deliberately. A cross-family review caught this passing on a BROKEN demo: if
  // add-to-cart did nothing, the cart is empty before and after the reload, and `cart === cart` is true for
  // two nulls. Persistence can only be evidenced by something persisted.
  check(
    'the cart survives a page load',
    afterReload.lines > 0 && afterReload.cart === afterQuick.cart && afterReload.lines === afterQuick.lines,
    `lines ${afterQuick.lines} -> ${afterReload.lines}, cart ${afterReload.cart === afterQuick.cart ? 'identical' : 'CHANGED'}`,
  );

  // ---- the quantity stepper ----
  // An ENABLED stepper. The first version clicked the first control it found, which once the cart legitimately
  // held a line at quantity 1 was the DISABLED decrease button - the demo clamps correctly, the click was a
  // no-op, and the check failed for a reason that had nothing to do with persistence. Prefer increase, and say
  // how many controls were disabled so the clamp is visible in the evidence rather than the cause of a red run.
  const step = await page.evaluate(`{
    const label = (b) => (b.getAttribute('aria-label') || b.textContent || '').trim();
    const steppers = [...document.querySelectorAll('#cart-items button')].filter((b) => /increase|decrease|quantity/i.test(label(b)));
    const enabled = steppers.filter((b) => !b.disabled);
    const target = enabled.find((b) => /increase|plus|\\+/i.test(label(b))) || enabled[0];
    if (!target) throw new Error('no ENABLED stepper; found: ' + steppers.map(label).join(', '));
    const before = localStorage.getItem('kiln-copper-cart-v1');
    target.click();
    return JSON.stringify({ label: label(target).slice(0, 40), disabled: steppers.length - enabled.length, before });
  }`);
  await sleep(700);
  const afterStep = JSON.parse(await page.evaluate(CART));
  const stepInfo = JSON.parse(step);
  check(
    'a quantity stepper changes the persisted cart',
    afterStep.cart !== stepInfo.before,
    `clicked "${stepInfo.label}" (${stepInfo.disabled} disabled), cart changed: ${afterStep.cart !== stepInfo.before}`,
  );

  // ---- mobile at a real viewport ----
  const mobile = await chrome.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await mobile.goto(`${base}/index.html`);
  await sleep(900);
  const mobileCounts = JSON.parse(await mobile.evaluate(COUNTS));
  const overflow = await mobile.evaluate('return document.documentElement.scrollWidth - window.innerWidth');
  check('mobile 390x844 renders the grid', mobileCounts.visible >= 3, `${mobileCounts.visible} visible`);
  check('mobile has no horizontal overflow', overflow <= 1, `${overflow}px of overflow`);
  await mobile.screenshot(join(SHOTS, 'index-mobile-390x844.png'));

  // ---- every page renders, and compare.html loads the boards SAME-ORIGIN ----
  for (const name of ['cart.html', 'empty.html', 'compare.html']) {
    const probe = await chrome.newPage({ viewport: { width: 1280, height: 900 } });
    await probe.goto(`${base}/${name}`);
    await sleep(900);
    const state = JSON.parse(await probe.evaluate(`return JSON.stringify({
      ready: document.readyState,
      text: document.body.innerText.length,
      loaded: [...document.images].filter((i) => i.naturalWidth > 0).length,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
      frames: document.querySelectorAll('iframe').length,
      errors: 0
    })`));
    check(`${name} renders`, state.ready === 'complete' && state.text > 100, `${state.text} chars, ${state.loaded} image(s)`);
    check(`${name} has no page errors`, probe.console.filter((entry) => entry.type === 'exception').length === 0, JSON.stringify(probe.console.slice(0, 2)));
    if (name === 'compare.html') {
      check('compare.html loads every reference board same-origin', state.broken === 0 && state.loaded >= 3, `${state.loaded} loaded, ${state.broken} broken`);
      check('compare.html embeds the live demo', state.frames >= 2, `${state.frames} iframe(s)`);
      await probe.screenshot(join(SHOTS, 'compare-desktop-1280x900.png'), { fullPage: true });
    }
    await probe.close();
  }

  const exceptions = page.console.filter((entry) => entry.type === 'exception');
  check('no uncaught exceptions on the main page', exceptions.length === 0, JSON.stringify(exceptions.slice(0, 2)));
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.error('VERIFY ERROR', error);
} finally {
  if (chrome) await chrome.close().catch(() => {});
  await server.close().catch(() => {});
}

const failed = checks.filter((entry) => !entry.ok);
writeFileSync('/tmp/xvd-verify.json', JSON.stringify({ checks, failures, failedCount: failed.length }, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
for (const entry of failed) console.log(`FAILED: ${entry.name} - ${entry.detail}`);
for (const failure of failures) console.log(`ERROR: ${failure}`);
process.exit(failed.length === 0 && failures.length === 0 ? 0 : 1);
