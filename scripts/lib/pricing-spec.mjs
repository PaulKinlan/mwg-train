/**
 * The pricing-tiers specification used by both the capability's test suite and its browser check, so
 * the two cannot drift: `test/pricing-tiers-capability.test.mjs` proves the spec gate and the seven
 * arms over HTTP, and `scripts/verify-pricing-tiers.mjs` drives the same project in a real browser
 * (mwg-train-4lk).
 *
 * Three tiers whose inclusions differ by more than price, a monthly/annual toggle whose annual figures
 * are DERIVED from the monthly ones by a stated policy, one tier marked as a recommendation, and a
 * selection that persists into the next step.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function pricingSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'pricing',
    title: 'Workspace plans',
    story: 'A workspace product sells three plans, billed monthly or annually.',
    capabilities: { pricing_tiers: true },
    pricing_tiers: {
      currency: 'GBP',
      annual_months: 10,
      tiers: [
        { name: 'Starter', monthly: 9, features: ['Community support', '1 project'], recommended: false },
        { name: 'Studio', monthly: 19, features: ['Community support', '1 project', 'Priority email'], recommended: true },
        {
          name: 'Agency',
          monthly: 49,
          features: ['Community support', '1 project', 'Priority email', 'SSO and audit log'],
          recommended: false,
        },
      ],
    },
    acceptance: [
      'the monthly prices are the tier figures and the annual prices are derived from them by the stated policy',
      'toggling the billing period changes the displayed price and the saving, computed rather than restated',
      'the upper tier includes at least one feature the lower tier does not, and exactly one tier is a recommendation',
      'choosing a tier persists it, and the next step shows the tier, the period and the price that was recorded',
      'the comparison is readable as a table, so colour or position alone does not carry the difference',
    ],
    ...overrides,
  };
}
