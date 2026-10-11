/**
 * The game specification used by both the capability's test suite and its browser check, so the two cannot
 * drift: `test/game-capability.test.mjs` proves the spec gate and the seven arms over HTTP, and
 * `scripts/verify-game.mjs` plays the same project with real keys in a real browser (mwg-train-ypr).
 *
 * Small enough to finish in a browser gate: three catches win, two misses lose, and one tick is short
 * enough that a driven game ends in about a second.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function gameSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'game',
    title: 'Apple catcher',
    story: 'A small arcade game: catch what falls, and do not let it past you.',
    capabilities: { game: true },
    game: {
      label: 'Catch the apples',
      width: 320,
      height: 240,
      tick_ms: 100,
      target: 3,
      lives: 2,
    },
    ...overrides,
  };
}
