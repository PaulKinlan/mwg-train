/**
 * Functional local-browser check for the checkout capability (mwg-train-le6).
 *
 * The acceptance bar is a driven journey, not a rendered page: add two items with quantities 2 and 3 in
 * the browser, apply a shipping tier, see a total that matches this script's own arithmetic, pay, and
 * re-read the receipt by reference - and separately, submit a payment that is declined and see that the
 * cart is still there. A page that renders canned totals passes every HTTP check and fails this one.
 *
 * Usage: node scripts/verify-checkout.mjs   (CHECKOUT_ARM=vue to check another arm)
 * Evidence (screenshots + a JSON report) is written to /tmp/checkout-shots.
 */
import { startGeneratedServer } from '../src/eval/generated-server.mjs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { checkoutSpec } from './lib/checkout-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.CHECKOUT_SHOTS ?? '/tmp/checkout-shots';
const PORT = Number(process.env.CHECKOUT_PORT ?? 7921);
const ARM = process.env.CHECKOUT_ARM ?? 'raw';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const money = (minor) => `GBP ${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
const figure = (html, id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1]?.trim();

// This script's own arithmetic, from the fixture's policy rather than from the page.
const spec = checkoutSpec();
const variants = spec.fields.find((field) => field.type === 'select').options;
const policy = spec.checkout;
const taxRate = policy.tax_rate_percent;
const shippingOf = (name) => policy.shipping.find((tier) => tier.name === name).price_minor;
const FIRST = { title: 'Dabinett Heritage bottle', variant: variants[1], quantity: 2, price: 1250 };
const SECOND = { title: 'Kingston Black Reserve bottle', variant: variants[2], quantity: 3, price: 750 };
const subtotal = FIRST.price * FIRST.quantity + SECOND.price * SECOND.quantity;
const tax = Math.round((subtotal * taxRate) / 100);

const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: ARM });
const dir = mkdtempSync(join(tmpdir(), `checkout-verify-${ARM}-`));
writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
const base = `http://127.0.0.1:${PORT}`;
const server = startGeneratedServer({
  projectDir: dir,
  port: PORT,
  dbPath: join(dir, 'verify.sqlite'),
  stdio: ['ignore', 'ignore', 'pipe'],
  // Not detached: this script kills the sandbox by pid, and the kernel tears the whole PID
  // namespace down with it, so nothing is left behind either way.
  detached: false,
});
let chrome;
try {
  let up = false;
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    await sleep(250);
    up = await fetch(`${base}/__health`).then((response) => response.ok, () => false);
  }
  check('the generated server is ready', up, `${ARM} on ${base}`);
  chrome = await launchChrome({});
  const page = await chrome.newPage({ viewport: { width: 1280, height: 1000 } });

  // Products are created through the shop's OWN form, so the price is typed into the form the way a
  // shopkeeper would rather than inserted into the database behind the page's back.
  const addProduct = async ({ title, variant, quantity, price }) => {
    await page.goto(`${base}/`);
    await page.type('input[name=title]', title);
    await page.type('input[name=price_minor]', String(price));
    await page.evaluate("const quantityInput = document.querySelector('input[name=quantity]'); if (quantityInput) quantityInput.value = '1'; return true;");
    const submitted = await page.submit('form#order-form');
    check(`the shop form accepts ${title}`, submitted?.valid !== false, `valid=${submitted?.valid}`);
    const productUrl = await page.url();
    check(`the product route serves ${title}`, productUrl.includes('/product/'), productUrl);
    await page.selectOption('select[name=variant]', variant);
    await page.evaluate(`document.querySelector('input[name=quantity]').value = '${quantity}'; return true;`);
    const add = await page.submit('#add-to-cart');
    check(`the add form accepts ${variant}`, add?.valid !== false, `valid=${add?.valid}`);
    return page.url();
  };

  const firstCart = await addProduct(FIRST);
  check('adding the first item lands on the cart', firstCart.endsWith('/cart'), firstCart);
  await addProduct(SECOND);
  const cart = await page.content();
  check('the cart holds two lines', /2 line\(s\), 5 item\(s\)/.test(cart), '2 lines, 5 items');

  // The checkout page: figures the browser can see, against this script's own arithmetic.
  await page.goto(`${base}/checkout`);
  const checkout = await page.content();
  check('the checkout lists both lines', (checkout.match(/data-qty="/g) ?? []).length === 2, 'two lines');
  check('subtotal matches the independent calculation', figure(checkout, 'checkout-subtotal') === money(subtotal), `${money(subtotal)}`);
  check('the default shipping tier is applied', figure(checkout, 'checkout-shipping') === money(shippingOf('Standard')), money(shippingOf('Standard')));
  check('tax is the policy rate on the lines', figure(checkout, 'checkout-tax') === money(tax), money(tax));
  check('the total adds up', figure(checkout, 'checkout-total') === money(subtotal + shippingOf('Standard') + tax), money(subtotal + shippingOf('Standard') + tax));
  const checkoutShot = join(SHOTS, `checkout-${ARM}.png`);
  await page.screenshot(checkoutShot);

  // Choosing the other tier re-derives the total in the page the visitor is looking at.
  await page.selectOption('select[name=shipping]', 'Express');
  await page.submit('form[method=get]');
  const express = await page.content();
  const expressTotal = subtotal + shippingOf('Express') + tax;
  check('the chosen tier changes the shipping figure', figure(express, 'checkout-shipping') === money(shippingOf('Express')), money(shippingOf('Express')));
  check('the chosen tier changes the total', figure(express, 'checkout-total') === money(expressTotal), money(expressTotal));
  const expressShot = join(SHOTS, `checkout-express-${ARM}.png`);
  await page.screenshot(expressShot);

  // Pay: the card is typed into the form, and nothing about it is stored.
  await page.type('#card', '4242424242424242');
  await page.submit('form[action="/checkout/pay"]');
  const receiptUrl = await page.url();
  check('paying lands on a receipt', /\/checkout\/receipt\/[^/]+$/.test(receiptUrl), receiptUrl);
  const receipt = await page.content();
  check('the receipt subtotal is the same arithmetic', figure(receipt, 'receipt-subtotal') === money(subtotal), money(subtotal));
  check('the receipt records the tier that was paid for', figure(receipt, 'receipt-shipping') === money(shippingOf('Express')), money(shippingOf('Express')));
  check('the receipt tax is the same arithmetic', figure(receipt, 'receipt-tax') === money(tax), money(tax));
  check('the receipt total still adds up', figure(receipt, 'receipt-total') === money(expressTotal), money(expressTotal));
  check('the receipt carries its reference', figure(receipt, 'receipt-ref') === receiptUrl.split('/').pop(), receiptUrl.split('/').pop());
  const receiptShot = join(SHOTS, `receipt-${ARM}.png`);
  await page.screenshot(receiptShot);

  // A paid checkout consumes the cart, and the receipt is durable: a reload re-reads it.
  await page.goto(`${base}/checkout/receipt/${receiptUrl.split('/').pop()}`);
  check('the receipt survives a reload', figure(await page.content(), 'receipt-total') === money(expressTotal), 'reload of the receipt');
  await page.goto(`${base}/cart`);
  const consumed = await page.content();
  check('a paid checkout consumes the cart', /0 line\(s\), 0 item\(s\)/.test(consumed), '0 lines, 0 items');

  // The decline path: the cart must be exactly as it was, and the page must say why.
  await addProduct({ ...FIRST, quantity: 1, title: 'Foxwhelp Bittersweet bottle' });
  await page.goto(`${base}/checkout`);
  await page.type('#card', '4000000000000002');
  await page.submit('form[action="/checkout/pay"]');
  const declined = await page.content();
  check('a declined payment says why', /id="decline-reason"/.test(declined) && /declined/i.test(declined), 'the reason is on the page');
  check('the decline is announced, not just coloured', /role="alert"/.test(declined), 'role=alert');
  check('the decline says the cart was kept', /id="cart-kept"/.test(declined), 'cart kept');
  // Capture the decline WHILE it is on screen: navigating away first produced a screenshot that showed
  // the ordinary checkout page under a file name claiming it was the decline.
  const declinedShot = join(SHOTS, `checkout-declined-${ARM}.png`);
  await page.screenshot(declinedShot);
  check('the decline screenshot is of the declined page', figure(await page.content(), 'decline-reason') !== undefined, declinedShot);
  await page.goto(`${base}/cart`);
  const afterDecline = await page.content();
  check('the declined payment kept the cart', /1 line\(s\), 1 item\(s\)/.test(afterDecline), '1 line, 1 item');

  writeFileSync(join(SHOTS, `report-${ARM}.json`), `${JSON.stringify({ arm: ARM, base, checks, shots: [checkoutShot, expressShot, receiptShot, declinedShot] }, null, 2)}\n`);
} catch (error) {
  check('the browser journey ran to completion', false, error.stack ?? String(error));
} finally {
  if (chrome) await chrome.close();
  server.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}
const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (evidence in ${SHOTS})`);
if (failed.length > 0) process.exitCode = 1;
