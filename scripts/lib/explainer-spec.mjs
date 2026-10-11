/**
 * The interactive-explainer specification used by both the capability's test suite and its browser check, so
 * the two cannot drift: `test/explainer-capability.test.mjs` proves the spec gate and the seven arms over HTTP,
 * and `scripts/verify-explainer.mjs` drives the same project in a real browser (mwg-train-5k4).
 *
 * The scenario is a household working out how long a repair will take to save for, and it is shaped so that the
 * journey can assert something worth asserting: two different amounts change the derived figure, and at least one
 * pair changes which narrative branch the page is on, so the page is not two hard-coded states with a number
 * swapped between them. The repair costs 1200 and the horizon is 24 months, so the arithmetic is exact and the
 * journey can state it: 60 a month is twenty months, 150 is eight, and 40 is thirty - past the horizon the page
 * draws, which the narrative is required to say and to answer with a suggestion rather than a blank. Which band
 * counts as "short" is the generator's choice and the test does not depend on it; what the test asserts is that
 * the figure differs per input and that the narrative differs between the initial amount and the amount that runs
 * past the horizon. All of it is arithmetic on the input - there is no model call and no client script, which is
 * what makes the journey reproducible in every framework arm.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function explainerSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'savings-path',
    title: 'How long to save for the repair',
    story: 'A household sets aside an amount each month and sees how far along the path to its repair that gets it.',
    routes: [
      { method: 'GET', path: '/', kind: 'page', effect: 'introduce the repair and link to the explainer' },
      { method: 'POST', path: '/notes', kind: 'write', redirect: '/notes/:ref', effect: 'record a note about the repair' },
      { method: 'GET', path: '/notes/:ref', kind: 'read-by-reference', effect: 'render one recorded note' },
    ],
    session: false,
    capabilities: { ...base.capabilities, explainer: true },
    explainer: {
      title: 'How long to save for the repair',
      summary: 'The repair costs a fixed amount. Whatever is set aside each month is applied to it, so the number of months is arithmetic on what you enter - change it and the path changes with it.',
      control: { name: 'monthly', label: 'Set aside each month', unit: '£', min: 5, max: 500, initial: 60 },
      target: { label: 'The repair', amount: 1200 },
      horizon: 24
    },
    ...overrides
  };
}
