/**
 * The cart specification used by both the capability's test suite and its browser check, so the two
 * cannot drift: `test/cart-capability.test.mjs` proves the spec gate and the seven arms over HTTP, and
 * `scripts/verify-storefront-cart.mjs` drives the same project in a real browser (mwg-train-11d).
 *
 * It opts into the cart: a product route to add FROM, a variant to choose, and a quantity to
 * accumulate. It is built on a committed specification so the schema's required blocks (state,
 * persistence, validation, acceptance) are real rather than hand-written, and the fields are the
 * storefront's own vocabulary - the training corpus's storefront brief (tr-02) declares exactly these:
 * a variant select, a quantity number, and a cart.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function cartSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'storefront',
    title: 'Cider storefront',
    story: 'A local producer sells limited pressings to be collected at the farm gate.',
    routes: [
      { method: 'GET', path: '/', kind: 'page', effect: 'render the shop page' },
      { method: 'GET', path: '/products', kind: 'list', effect: 'list the products' },
      { method: 'POST', path: '/orders', kind: 'write', redirect: '/product/:ref', effect: 'record an order' },
      { method: 'GET', path: '/product/:ref', kind: 'read-by-reference', effect: 'render one product with its variant choice' },
    ],
    echo: { field: 'title', container: '#order-echo', route: 'read-by-reference' },
    session: false,
    capabilities: { cart: true, list_pages: true },
    journey: {
      startPath: '/',
      formSelector: 'form#order-form',
      fill: { 'input[name=title]': 'Kingston Black Reserve' },
      expectText: 'Kingston Black Reserve',
    },
    fields: [
      { name: 'title', slug: 'title', type: 'text', label: 'Product', required: true },
      {
        name: 'variant',
        slug: 'variant',
        type: 'select',
        label: 'Variant',
        required: true,
        options: ['Kingston Black Reserve', 'Dabinett Heritage', 'Foxwhelp Bittersweet'],
      },
      { name: 'quantity', slug: 'quantity', type: 'number', label: 'Quantity', required: true },
    ],
    state: {
      ...base.state,
      tables: [
        ...base.state.tables,
        {
          name: 'cart_items',
          purpose: 'one row per item the visitor ADDED, so a second add accumulates rather than overwrites',
          columns: [
            { name: 'sid', type: 'TEXT', constraints: 'NOT NULL' },
            { name: 'ref', type: 'TEXT', constraints: 'NOT NULL' },
            { name: 'variant', type: 'TEXT', constraints: 'NOT NULL' },
            { name: 'qty', type: 'INTEGER', constraints: 'NOT NULL' },
          ],
        },
      ],
    },
    persistence: {
      write_route: '/orders',
      read_route: '/product/:ref',
      reference: 'server-issued reference, returned in the Location header of a 303',
      reload_assertion: 'reloading /cart still lists every item added, with the variant each was added with',
    },
    validation: {
      ...base.validation,
      // A select is exempt from the server's required set (`REQUIRED` in pilot/frameworks.mjs filters
      // selects out), and the schema holds the specification to the engine's actual behaviour.
      required_fields: ['title', 'quantity'],
    },
    acceptance: [
      'adding a second, different product leaves the first line in the cart',
      'each cart line carries the variant it was added with',
      'the cart line and item counts change with what was added',
      'the cart belongs to the visitor, not the server: another visitor sees an empty cart',
    ],
    ...overrides,
  };
}
