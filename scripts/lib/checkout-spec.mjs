/**
 * The checkout specification used by both the capability's test suite and its browser check, so the two
 * cannot drift: `test/checkout-capability.test.mjs` proves the spec gate and the seven arms over HTTP,
 * and `scripts/verify-checkout.mjs` drives the same project in a real browser (mwg-train-le6).
 *
 * It builds on the cart specification rather than restating it, because a checkout is arithmetic over
 * the cart's own lines: it adds a price to the product (an integer number of minor units), the policy
 * block (currency, tax, shipping tiers), and nothing else. The money vocabulary is the fixture's own:
 * `price_minor` is a number field the product record carries, and it is declared AFTER the quantity
 * field because the engine binds the first number field as the quantity to accumulate.
 */
import { cartSpec } from './cart-spec.mjs';

export function checkoutSpec(overrides = {}) {
  const base = cartSpec();
  return {
    ...base,
    family_id: 'storefront-checkout',
    title: 'Cider storefront checkout',
    capabilities: { ...base.capabilities, checkout: true },
    fields: [
      ...base.fields,
      { name: 'price_minor', slug: 'price_minor', type: 'number', label: 'Price in minor units', required: true },
    ],
    checkout: {
      currency: 'GBP',
      price_field: 'price_minor',
      tax_rate_percent: 20,
      shipping: [
        { name: 'Standard', price_minor: 500 },
        { name: 'Express', price_minor: 1200 },
      ],
    },
    journey: {
      ...base.journey,
      fill: { ...base.journey.fill, 'input[name=price_minor]': '1250' },
    },
    state: {
      ...base.state,
      tables: base.state.tables.map((table) =>
        table.name === 'cart_items'
          ? {
              ...table,
              columns: [
                ...table.columns,
                {
                  name: 'unit_price_minor',
                  type: 'INTEGER',
                  constraints: 'NOT NULL',
                  purpose: 'the price the item was added at, in minor units, so a receipt re-read later still adds up',
                },
              ],
            }
          : table,
      ),
    },
    persistence: {
      ...base.persistence,
      write_route: '/checkout/pay',
      read_route: '/checkout/receipt/:ref',
      reference: 'server-issued receipt reference, returned in the Location header of a 303',
      reload_assertion: 'reloading /checkout/receipt/<ref> re-renders the same subtotal, shipping, tax and total',
    },
    validation: {
      ...base.validation,
      required_fields: [...base.validation.required_fields, 'price_minor'],
    },
    acceptance: [
      ...base.acceptance,
      'the total is server-side arithmetic over the cart lines and matches an independent calculation',
      'choosing a shipping tier changes the total, and the tier is recorded with the receipt',
      'a declined payment says why, charges nothing, and leaves the cart exactly as it was',
      'the receipt can be re-read by reference and still adds up',
    ],
    ...overrides,
  };
}
