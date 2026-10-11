/**
 * The storefront cart capability (mwg-train-11d): a cart the visitor BUILDS across pages, with a
 * variant choice that is written with the record.
 *
 * The engine's session store cannot express this - `drafts` is keyed `(sid, name)`, so a second add
 * overwrites the first - so `capabilities.cart` owns a multi-row `cart_items` table. Two halves, like
 * the 37a capability tests: the spec gate (a closed set that fails closed), and the functional half
 * (all seven arms built, started, and driven over HTTP: two products added, both lines preserved with
 * the variant each was added with).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { cartSpec } from '../scripts/lib/cart-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}


test('spec gate: the cart capability validates as a closed set, and fails closed', () => {
  assert.deepEqual(validateSpec(cartSpec()), [], 'a legitimate cart specification validates');
  // Unknown keys stay refused now that the set has a fourth member.
  assert.ok(validateSpec(cartSpec({ capabilities: { basket: true } })).some((p) => p.includes('unknown capability')));
  assert.ok(validateSpec(cartSpec({ capabilities: { cart: 'yes' } })).some((p) => p.includes('must be a boolean')));
  // The cart owns the sid cookie, as the session flow and auth both do.
  assert.ok(validateSpec(cartSpec({ session: true })).some((p) => p.includes('cannot combine with session')));
  assert.ok(validateSpec(cartSpec({ capabilities: { cart: true, auth: true } })).some((p) => p.includes('cannot combine with auth')));
  assert.ok(
    validateSpec(cartSpec({ capabilities: { cart: true, detail_page: true } })).some((p) => p.includes('cannot combine with detail_page')),
    'the cart owns the record page, so the read-only detail page would be dead code',
  );
  // Each of the three things the cart needs is refused rather than silently omitted.
  const noProduct = cartSpec({ routes: cartSpec().routes.filter((route) => route.kind !== 'read-by-reference') });
  assert.ok(validateSpec(noProduct).some((p) => p.includes('no route is read-by-reference')));
  const noVariant = cartSpec({ fields: cartSpec().fields.filter((field) => field.type !== 'select') });
  assert.ok(validateSpec(noVariant).some((p) => p.includes('no select field')));
  const noQuantity = cartSpec({ fields: cartSpec().fields.filter((field) => field.type !== 'number') });
  assert.ok(validateSpec(noQuantity).some((p) => p.includes('no number field')));
  // The builder binds the FIRST read-by-reference route as the product page, so a second would be
  // declared and never served; and a cart with no write route has nothing to put in it.
  const twoProductRoutes = cartSpec({
    routes: [...cartSpec().routes, { method: 'GET', path: '/other/:ref', kind: 'read-by-reference' }],
  });
  assert.ok(validateSpec(twoProductRoutes).some((p) => p.includes('only the first would serve the product page')));
  const noWriteRoute = cartSpec({ routes: cartSpec().routes.filter((route) => route.kind !== 'write') });
  assert.ok(validateSpec(noWriteRoute).some((p) => p.includes('nothing to add to the cart')));
});

test('byte-invariance: a specification that does not opt in emits no cart code', () => {
  for (const family of ['booking', 'catalogue', 'account-recovery']) {
    for (const arm of ARMS) {
      const { files } = buildProjectFromSpec({ spec: specForFamily(family, ROOT), frameworkName: arm });
      assert.equal(
        /cart_items|cartProductPage|cartPage|insertCartItem|selectCartItems/.test(files['server.mjs']),
        false,
        `${family}/${arm} emitted cart code without opting in`,
      );
    }
  }
});

test('functional: the cart accumulates across pages, with the variant each item was added with', async (t) => {
  const spec = cartSpec();
  assert.deepEqual(ARMS.slice().sort(), ['hono', 'preact', 'raw', 'react', 'svelte', 'vue', 'webcomponents']);
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `cart-${arm}-`));
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
        // Two different products, each created by the shop's own write route.
        const seed = async (title) => {
          const response = await post('/orders', { title, quantity: '1' });
          assert.equal(response.status, 303, `${arm} records an order`);
          return response.headers.get('location').split('/').pop();
        };
        const firstRef = await seed('Dabinett Heritage');
        const secondRef = await seed('Kingston Black Reserve');

        // The product page carries the variant choice and the quantity to add.
        const product = await fetch(`${base}/product/${firstRef}`);
        assert.equal(product.status, 200, `${arm} serves the product route`);
        const productHtml = await product.text();
        assert.match(productHtml, /<form[^>]*id="add-to-cart"[^>]*action="\/cart\/add"/, `${arm} product page posts to the cart`);
        assert.match(productHtml, /<select[^>]*name="variant"/, `${arm} product page offers the variant select`);
        assert.match(productHtml, /<input[^>]*name="quantity"[^>]*type="number"/, `${arm} product page takes a quantity`);
        assert.match(productHtml, /<option value="Dabinett Heritage"/, `${arm} product page lists the declared options`);

        // Add the first product: the visitor gets a cart, and the cart knows one line.
        const addFirst = await post('/cart/add', { ref: firstRef, variant: 'Dabinett Heritage', quantity: '2' });
        assert.equal(addFirst.status, 303, `${arm} add redirects`);
        assert.equal(addFirst.headers.get('location'), '/cart');
        const cookie = (addFirst.headers.get('set-cookie') ?? '').split(';')[0];
        assert.match(cookie, /^sid=/, `${arm} add sets a sid cookie`);
        const oneLine = await (await fetch(`${base}/cart`, { headers: { cookie } })).text();
        assert.match(oneLine, /1 line\(s\), 2 item\(s\)/, `${arm} cart counts one line and two items`);

        // Adding a DIFFERENT product must not overwrite the first: this is the whole capability.
        const addSecond = await post('/cart/add', { ref: secondRef, variant: 'Kingston Black Reserve', quantity: '3' }, { cookie });
        assert.equal(addSecond.status, 303, `${arm} second add redirects`);
        const twoLines = await (await fetch(`${base}/cart`, { headers: { cookie } })).text();
        assert.match(twoLines, /2 line\(s\), 5 item\(s\)/, `${arm} the cart accumulated rather than overwrote`);
        assert.equal((twoLines.match(/<li data-ref=/g) ?? []).length, 2, `${arm} the cart renders exactly two lines`);
        assert.match(twoLines, new RegExp(`<li data-ref="${firstRef}" data-variant="Dabinett Heritage"`), `${arm} keeps the first line's variant`);
        assert.match(twoLines, new RegExp(`<li data-ref="${secondRef}" data-variant="Kingston Black Reserve"`), `${arm} keeps the second line's variant`);

        // The cart is the visitor's, not the server's: another visitor sees nothing.
        const anonymous = await (await fetch(`${base}/cart`)).text();
        assert.match(anonymous, /0 line\(s\), 0 item\(s\)/, `${arm} an anonymous visitor has an empty cart`);
        assert.match(anonymous, /id="cart-empty"/, `${arm} an empty cart says so`);

        // A POST is not the form: an add with no product or no variant must be refused rather than
        // stored and then rendered as an empty line (mwg-train-11d review).
        const noProduct = await post('/cart/add', { variant: 'Dabinett Heritage', quantity: '1' });
        assert.equal(noProduct.status, 422, `${arm} refuses an add with no product`);
        const noVariant = await post('/cart/add', { ref: firstRef, quantity: '1' });
        assert.equal(noVariant.status, 422, `${arm} refuses an add with no variant`);
        const stillEmpty = await (await fetch(`${base}/cart`, { headers: { cookie } })).text();
        assert.match(stillEmpty, /2 line\(s\), 5 item\(s\)/, `${arm} a refused add changed nothing`);

        // An empty `sid=` cookie must not become the key an item is stored under: the read side treats
        // an empty sid as absent, so the cart would accept the add and then lose it (mwg-train-11d review).
        const emptySid = await post('/cart/add', { ref: firstRef, variant: 'Dabinett Heritage', quantity: '4' }, { cookie: 'sid=' });
        assert.equal(emptySid.status, 303, `${arm} accepts an add from a browser carrying an empty sid cookie`);
        const refreshedSid = (emptySid.headers.get('set-cookie') ?? '').split(';')[0];
        assert.match(refreshedSid, /^sid=.+/, `${arm} issues a real sid instead of storing rows under the empty one`);
        const afterEmptySid = await (await fetch(`${base}/cart`, { headers: { cookie: refreshedSid } })).text();
        assert.match(afterEmptySid, /1 line\(s\), 4 item\(s\)/, `${arm} the item added under an empty sid is reachable at /cart`);
      } finally {
        child.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('the cart capability is registered, not silently dead', () => {
  // A capability nobody can switch on is the failure `mwg-train-37a` designed the closed set to make
  // visible: the key must be in the set, default off, and named in the builder's own contract.
  const frameworks = readFileSync(join(ROOT, 'pilot/frameworks.mjs'), 'utf8');
  assert.match(frameworks, /const capabilitiesOf = \(archetype\) => \(\{ list_pages: false, detail_page: false, auth: false, cart: false/);
});
