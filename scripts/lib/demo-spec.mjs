/**
 * The interactive-demo specification used by both the capability's test suite and its browser check, so the two
 * cannot drift (mwg-train-kyu).
 *
 * The scenario is someone working out how much paint a room needs. `(12 * 3.5) + (8 * 2.6)` is 42 + 20.8 = 62.8, and
 * the two modes have to disagree about it: `exact` keeps the decimals, `whole` rounds to 63. That difference is the
 * bead's requirement that a configuration choice materially changes the run - a demo whose output never moves is a
 * screenshot, not a demo - so the corpus is built around an expression that is deliberately not a whole number.
 *
 * The limits are wide enough for the initial expression (22 characters, well inside 200) and tight enough that a test
 * can reach each one: a 201-character expression, one with more than 120 tokens, and one nested more than 8 deep.
 * Every one of those is a failure path with a readable message, which is the other half of the acceptance bar.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function demoSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'paint-area',
    title: 'How much paint for the room',
    story: 'Someone works out a room area, changes the expression and the rounding, and runs it again.',
    routes: [
      { method: 'GET', path: '/', kind: 'page', effect: 'introduce the job and link to the demo' },
      { method: 'POST', path: '/notes', kind: 'write', redirect: '/notes/:ref', effect: 'record a note about the job' },
      { method: 'GET', path: '/notes/:ref', kind: 'read-by-reference', effect: 'render one recorded note' }
    ],
    session: false,
    capabilities: { ...base.capabilities, demo: true },
    demo: {
      title: 'How much paint for the room',
      summary: 'Two walls and two walls. Change the expression if your room differs, choose whether to round, and run it - the demo shows the value and the tokens it came from, or a readable error if it cannot be worked out.',
      expression: '(12 * 3.5) + (8 * 2.6)',
      mode: 'exact',
      limits: { characters: 200, tokens: 120, depth: 8 }
    },
    ...overrides
  };
}
