/**
 * The checkout capability (mwg-train-le6): arithmetic over the cart's lines, a simulated payment with a
 * decline path, and a durable receipt that still adds up when it is read back.
 *
 * Three halves, like the 37a/11d/4lk capability tests: the spec gate (a closed set that fails closed),
 * the wiring guard (every block the schema validates must reach the builder - a block that validates and
 * is then dropped produces a server that starts and then fails on the write), and the functional half
 * (all seven arms built, started, and driven over HTTP: two lines added with quantities 2 and 3, a
 * shipping tier applied, the totals checked against this file's own arithmetic, a paid receipt re-read
 * by reference, a declined payment that keeps the cart, and the edge cases in between).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { archetypeFromSpec, buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { checkoutSpec } from '../scripts/lib/checkout-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

// The fixture's own numbers, held here so the assertions are an INDEPENDENT calculation rather than the
// page's figures read back at it: 2 x 1250 + 3 x 750, a 500 or 1200 shipping tier, 20% tax on the lines.
const FIRST = { price: 1250, qty: 2 };
const SECOND = { price: 750, qty: 3 };
const SUBTOTAL = FIRST.price * FIRST.qty + SECOND.price * SECOND.qty;
const TAX = Math.round((SUBTOTAL * 20) / 100);

const money = (minor) => `GBP ${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
const figure = (html, id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1]?.trim();

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}

test('spec gate: the checkout capability validates as a closed set, and fails closed', () => {
  assert.deepEqual(validateSpec(checkoutSpec()), [], 'a legitimate checkout specification validates');
  // The set stays closed now that it has a fifth member.
  assert.ok(validateSpec(checkoutSpec({ capabilities: { cart: true, checkout: true, till: true } })).some((p) => p.includes('unknown capability')));
  // A checkout is arithmetic over the CART's lines: without the cart there is nothing to pay for.
  assert.ok(validateSpec(checkoutSpec({ capabilities: { cart: false, checkout: true } })).some((p) => p.includes('needs capabilities.cart')));
  // The cart owns the sid cookie, so a checkout cannot also claim it.
  assert.ok(validateSpec(checkoutSpec({ session: true })).some((p) => p.includes('cannot combine with session')));
  // On without a policy block, a block without the capability, and each malformed field of the block.
  const noBlock = checkoutSpec();
  delete noBlock.checkout;
  assert.ok(validateSpec(noBlock).some((p) => p.includes('no checkout block states the currency')));
  const blockWithoutCapability = checkoutSpec({ capabilities: { cart: true, list_pages: true } });
  assert.ok(validateSpec(blockWithoutCapability).some((p) => p.includes('only meaningful with capabilities.checkout')));
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, till: 'yes' } })).some((p) => p.includes('checkout.till: unknown key')));
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, currency: '  ' } })).some((p) => p.includes('must be a currency name')));
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, tax_rate_percent: 101 } })).some((p) => p.includes('between 0 and 100')));
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, shipping: [] } })).some((p) => p.includes('at least one shipping tier')));
  const duplicateShipping = [
    { name: 'Standard', price_minor: 500 },
    { name: 'Standard', price_minor: 900 },
  ];
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, shipping: duplicateShipping } })).some((p) => p.includes('duplicate shipping tier name')));
  // Money is an integer number of minor units, so a fractional or negative price is refused at the gate
  // rather than rounded somewhere later.
  for (const price_minor of [12.5, -1, '500']) {
    const spec = checkoutSpec({ checkout: { ...checkoutSpec().checkout, shipping: [{ name: 'Standard', price_minor }] } });
    assert.ok(validateSpec(spec).some((p) => p.includes('whole number of minor units')), `${price_minor} must be refused`);
  }
  // The price field has to be a number field this specification actually declares, and it must not be
  // the field the cart accumulates as a quantity - that would charge the quantity as money.
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, price_field: 'total' } })).some((p) => p.includes('not a number field')));
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, price_field: 'quantity' } })).some((p) => p.includes('accumulates as a quantity')));
  assert.ok(validateSpec(checkoutSpec({ checkout: { ...checkoutSpec().checkout, price_field: '  ' } })).some((p) => p.includes("must name the number field")));
  // The capability's own routes are served before the declared ones.
  const colliding = checkoutSpec({ routes: [...checkoutSpec().routes, { method: 'GET', path: '/checkout', kind: 'page' }] });
  assert.ok(validateSpec(colliding).some((p) => p.includes("the checkout capability's own route")));
});

test('wiring guard: every block the schema validates reaches the builder archetype', () => {
  // A block that validates and is then dropped is the nastiest kind of bug here: the specification looks
  // right, the capability flag is on, the builder emits the capability's tables - and the data it needs
  // is missing, so the server starts and then fails on the first write. `archetypeFromSpec` is an
  // explicit list, so this asserts the list covers every block the schema knows (mwg-train-le6).
  const spec = {
    ...checkoutSpec(),
    capabilities: { cart: true, list_pages: true, checkout: true, pricing_tiers: true },
    pricing_tiers: {
      currency: 'GBP',
      annual_months: 10,
      tiers: [
        { name: 'Starter', monthly: 9, features: ['One shop'] },
        { name: 'Studio', monthly: 19, features: ['One shop', 'Two staff'], recommended: true },
        { name: 'Agency', monthly: 49, features: ['One shop', 'Two staff', 'Priority support'] },
      ],
    },
    form: { selector: 'form#order-form', submit: 'button[type=submit]' },
    extra_form: { selector: 'form#second' },
    write_journey: { startPath: '/', steps: [] },
    security_journey: { startPath: '/', steps: [] },
    capacity: 2,
    seed_accounts: [{ email: 'a@b.example', password: 'secret' }],
    password_field: 'password',
  };
  const archetype = archetypeFromSpec(spec);
  const blocks = {
    routes: 'routes',
    fields: 'fields',
    echo: 'echo',
    journey: 'journey',
    session: 'session',
    form: 'form',
    extra_form: 'extraForm',
    write_journey: 'writeJourney',
    security_journey: 'securityJourney',
    password_field: 'passwordField',
    capacity: 'capacity',
    capabilities: 'capabilities',
    pricing_tiers: 'pricingTiers',
    seed_accounts: 'seedAccounts',
    checkout: 'checkout',
  };
  for (const [key, name] of Object.entries(blocks)) {
    assert.notEqual(spec[key], undefined, `${key} must be present in this test's specification`);
    assert.notEqual(archetype[name], undefined, `${key} validated but was dropped by archetypeFromSpec (expected archetype.${name})`);
  }
});

test('byte-invariance: a cart without a checkout emits no checkout code', () => {
  for (const frameworkName of ARMS) {
    const { files } = buildProjectFromSpec({ spec: checkoutSpec({ capabilities: { cart: true, list_pages: true }, checkout: undefined }), frameworkName });
    assert.equal(
      /CHECKOUT|checkoutMoney|unit_price_minor|deleteCartItems/.test(files['server.mjs']),
      false,
      `${frameworkName} emitted checkout code for a cart that did not opt in`,
    );
  }
});

test('functional: a paid receipt adds up, a declined payment keeps the cart', async (t) => {
  const spec = checkoutSpec();
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `checkout-${arm}-`));
      const port = await availablePort();
      const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
      writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'test.sqlite')], {
        cwd: dir,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);
        const post = (path, body, headers = {}) =>
          fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
            body: new URLSearchParams(body).toString(),
            redirect: 'manual',
          });
        const seed = async (title, price) => {
          const response = await post('/orders', { title, quantity: '1', price_minor: String(price) });
          assert.equal(response.status, 303, `${arm} records an order`);
          return response.headers.get('location').split('/').pop();
        };

        // An empty checkout is a page, not a crash: it says so and offers nothing to pay with.
        const empty = await (await fetch(`${base}/checkout`)).text();
        assert.match(empty, /id="checkout-empty"/, `${arm} an empty checkout says the cart is empty`);

        const firstRef = await seed('Dabinett Heritage', FIRST.price);
        const secondRef = await seed('Kingston Black Reserve', SECOND.price);

        // Add two DIFFERENT products with different quantities: the arithmetic has two lines to add.
        const addFirst = await post('/cart/add', { ref: firstRef, variant: 'Dabinett Heritage', quantity: String(FIRST.qty) });
        assert.equal(addFirst.status, 303, `${arm} adds the first item`);
        const cookie = (addFirst.headers.get('set-cookie') ?? '').split(';')[0];
        const addSecond = await post('/cart/add', { ref: secondRef, variant: 'Kingston Black Reserve', quantity: String(SECOND.qty) }, { cookie });
        assert.equal(addSecond.status, 303, `${arm} adds the second item`);

        // The default shipping tier is the first one, and every figure is this file's own arithmetic.
        const checkout = await (await fetch(`${base}/checkout`, { headers: { cookie } })).text();
        assert.match(checkout, /<form[^>]*id="checkout-lines"|id="checkout-lines"/, `${arm} the checkout lists the lines`);
        assert.match(checkout, new RegExp(`data-ref="${firstRef}"[^>]*data-qty="${FIRST.qty}"`), `${arm} the first line carries its quantity`);
        assert.match(checkout, new RegExp(`data-ref="${secondRef}"[^>]*data-qty="${SECOND.qty}"`), `${arm} the second line carries its quantity`);
        assert.equal(figure(checkout, 'checkout-subtotal'), money(SUBTOTAL), `${arm} subtotal is the independent calculation`);
        assert.equal(figure(checkout, 'checkout-shipping'), money(500), `${arm} shipping defaults to the first tier`);
        assert.equal(figure(checkout, 'checkout-tax'), money(TAX), `${arm} tax is 20% of the lines' subtotal`);
        assert.equal(figure(checkout, 'checkout-total'), money(SUBTOTAL + 500 + TAX), `${arm} the total adds up`);
        assert.match(checkout, /<form[^>]*action="\/checkout\/pay"/, `${arm} the checkout offers a way to pay`);

        // Choosing another tier re-derives the total; the tier travels with the payment form.
        const express = await (await fetch(`${base}/checkout?shipping=Express`, { headers: { cookie } })).text();
        assert.equal(figure(express, 'checkout-shipping'), money(1200), `${arm} the chosen tier is applied`);
        assert.equal(figure(express, 'checkout-total'), money(SUBTOTAL + 1200 + TAX), `${arm} the total follows the tier`);
        assert.match(express, /name="shipping" value="Express"/, `${arm} the payment form carries the chosen tier`);

        // A declined payment: it says why, charges nothing, and leaves the cart exactly as it was.
        const declined = await post('/checkout/pay', { shipping: 'Express', card: '4000000000000002' }, { cookie });
        assert.equal(declined.status, 422, `${arm} a declined payment is refused`);
        const declinedHtml = await declined.text();
        assert.match(declinedHtml, /id="decline-reason"[^>]*role="alert"|role="alert"[^>]*id="decline-reason"/, `${arm} the decline reason is announced`);
        assert.match(declinedHtml, /declined/i, `${arm} the decline says why`);
        assert.match(declinedHtml, /id="cart-kept"/, `${arm} the decline says the cart was kept`);
        const cartAfterDecline = await (await fetch(`${base}/cart`, { headers: { cookie } })).text();
        assert.match(cartAfterDecline, /2 line\(s\), 5 item\(s\)/, `${arm} the declined payment kept both cart lines`);

        // A card shape that is not a card is refused as such, and still does not touch the cart.
        const malformed = await post('/checkout/pay', { shipping: 'Standard', card: '1234' }, { cookie });
        assert.equal(malformed.status, 422, `${arm} a malformed card is refused`);
        assert.match(await malformed.text(), /12 to 19 digits/, `${arm} and says what a card should look like`);

        // An unknown shipping tier, and a payment with no cart at all.
        const badTier = await post('/checkout/pay', { shipping: 'Drone', card: '4242424242424242' }, { cookie });
        assert.equal(badTier.status, 422, `${arm} refuses a shipping tier the page does not list`);
        const noCart = await post('/checkout/pay', { shipping: 'Standard', card: '4242424242424242' });
        assert.equal(noCart.status, 422, `${arm} refuses to pay for an empty cart`);

        // The paid path: a receipt reference comes back, the cart is consumed, and the receipt is durable.
        const paid = await post('/checkout/pay', { shipping: 'Express', card: '4242424242424242' }, { cookie });
        assert.equal(paid.status, 303, `${arm} a valid payment redirects`);
        const receiptPath = paid.headers.get('location') ?? '';
        assert.match(receiptPath, /^\/checkout\/receipt\/[^/]+$/, `${arm} the payment answers with a receipt reference`);
        const consumed = await (await fetch(`${base}/cart`, { headers: { cookie } })).text();
        assert.match(consumed, /0 line\(s\), 0 item\(s\)/, `${arm} a paid checkout consumes the cart`);

        // The receipt re-read by reference: the same figures, still adding up, on a second read too.
        for (const attempt of [1, 2]) {
          const receipt = await (await fetch(`${base}${receiptPath}`)).text();
          assert.equal(figure(receipt, 'receipt-subtotal'), money(SUBTOTAL), `${arm} read ${attempt}: subtotal`);
          assert.equal(figure(receipt, 'receipt-shipping'), money(1200), `${arm} read ${attempt}: the tier that was paid for`);
          assert.equal(figure(receipt, 'receipt-tax'), money(TAX), `${arm} read ${attempt}: tax`);
          assert.equal(figure(receipt, 'receipt-total'), money(SUBTOTAL + 1200 + TAX), `${arm} read ${attempt}: total`);
          assert.equal(figure(receipt, 'receipt-ref'), receiptPath.split('/').pop(), `${arm} read ${attempt}: the reference`);
          assert.match(receipt, /data-qty="2"/, `${arm} read ${attempt}: the lines are recorded on the receipt`);
        }
        const missing = await fetch(`${base}/checkout/receipt/nope`);
        assert.equal(missing.status, 404, `${arm} an unknown receipt is a 404`);

        // A product whose price is not a whole number of minor units is refused at the cart, because a
        // checkout cannot add up a line it has no price for.
        const fractionalRef = await seed('Foxwhelp Bittersweet', 12.5);
        const fractional = await post('/cart/add', { ref: fractionalRef, variant: 'Foxwhelp Bittersweet', quantity: '1' });
        assert.equal(fractional.status, 422, `${arm} refuses to add an item that has no whole price`);
      } finally {
        child.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('the checkout capability is registered, not silently dead', () => {
  const frameworks = readFileSync(join(ROOT, 'pilot/frameworks.mjs'), 'utf8');
  assert.match(frameworks, /const capabilitiesOf = \(archetype\) => \(\{ list_pages: false, detail_page: false, auth: false, cart: false, pricing_tiers: false, checkout: false/);
  const spec = readFileSync(join(ROOT, 'src/eval/spec.mjs'), 'utf8');
  assert.match(spec, /CAPABILITY_KEYS = new Set\(\['list_pages', 'detail_page', 'auth', 'cart', 'pricing_tiers', 'checkout'\]\)/);
});
