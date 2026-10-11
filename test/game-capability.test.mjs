/**
 * The game capability (mwg-train-ypr): a client input loop, a terminal state, a restart and a recorded
 * score.
 *
 * Three halves, like the 37a/11d/4lk/le6 capability tests: the spec gate (a closed set that fails closed),
 * the wiring guard (every block the schema validates must reach the builder - the le6 review found a block
 * that validated and was then dropped, which builds a server that starts and fails on use), and the
 * functional half (all seven arms built, started and driven over HTTP).
 *
 * What the browser check proves and this file cannot: that the LOOP actually runs, that keys and the
 * pointer change the state, that the game reaches a terminal state and that the restart returns to the
 * initial state without a reload (`scripts/verify-game.mjs`, real Chrome, real key presses). This file
 * proves the server half: the page a visitor is served, the score it will and will not record, and the
 * scoreboard it reads back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { archetypeFromSpec, buildProjectFromSpec, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { cartSpec } from '../scripts/lib/cart-spec.mjs';
import { gameSpec } from '../scripts/lib/game-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);
const GAME = gameSpec().game;

const textOf = (html, id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1]?.trim();
const attrIn = (html, id, name) => new RegExp(`id="${id}"[^>]*\\b${name}="([^"]*)"`).exec(html)?.[1];

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}

test('spec gate: the game capability validates as a closed set, and fails closed', () => {
  assert.deepEqual(validateSpec(gameSpec()), [], 'a legitimate game specification validates');
  // The set stays closed now that it has a seventh member.
  assert.ok(validateSpec(gameSpec({ capabilities: { game: true, joystick: true } })).some((p) => p.includes('unknown capability')));
  // On without a block, and a block without the capability.
  const noBlock = gameSpec();
  delete noBlock.game;
  assert.ok(validateSpec(noBlock).some((p) => p.includes('no game block states what the game is')));
  assert.ok(validateSpec(gameSpec({ capabilities: { game: false } })).some((p) => p.includes('only meaningful with capabilities.game')));
  // Unknown keys are refused rather than ignored.
  assert.ok(validateSpec(gameSpec({ game: { ...GAME, leaderboard: true } })).some((p) => p.includes('game.leaderboard: unknown key')));
  // Every bound is one something playable needs: a field big enough to see, a tick that is a loop, a
  // target that can be reached and lives to lose. Each is refused at both ends of its range.
  const boundCases = [
    ['width', 40, 'game.width'], ['width', 4000, 'game.width'], ['width', 320.5, 'game.width'],
    ['height', 40, 'game.height'], ['height', 4000, 'game.height'],
    ['tick_ms', 1, 'game.tick_ms'], ['tick_ms', 5000, 'game.tick_ms'], ['tick_ms', 'fast', 'game.tick_ms'],
    ['target', 0, 'game.target'], ['target', 1000, 'game.target'], ['target', 2.5, 'game.target'],
    ['lives', 0, 'game.lives'], ['lives', 50, 'game.lives'],
    ['label', '', 'game.label'], ['label', 7, 'game.label'],
  ];
  for (const [key, value, where] of boundCases) {
    const problems = validateSpec(gameSpec({ game: { ...GAME, [key]: value } }));
    assert.ok(problems.some((p) => p.includes(where)), `${key}=${JSON.stringify(value)} must be refused (${where}), got ${JSON.stringify(problems)}`);
  }
  // The capability's own routes are served before the declared ones, so declaring one would leave a route
  // nothing reaches - including under a different parameter name, which is matched by prefix.
  assert.ok(validateSpec(gameSpec({ routes: [...gameSpec().routes, { method: 'GET', path: '/play', kind: 'page', effect: 'render a page' }] })).some((p) => p.includes("the game capability's own route")));
  assert.ok(validateSpec(gameSpec({ routes: [...gameSpec().routes, { method: 'GET', path: '/play/scores/extra', kind: 'page', effect: 'render a page' }] })).some((p) => p.includes("the game capability's own route")));
  // A neighbouring path that merely starts with the same letters is still allowed.
  assert.deepEqual(validateSpec(gameSpec({ routes: [...gameSpec().routes, { method: 'GET', path: '/playground', kind: 'page', effect: 'render a page' }] })), []);
});

test('wiring guard: the game block reaches the builder, and a spec that does not opt in emits nothing', () => {
  const spec = { ...gameSpec(), routes: gameSpec().routes, fields: gameSpec().fields };
  const archetype = archetypeFromSpec(spec);
  assert.notEqual(spec.game, undefined, 'this test needs a game block');
  assert.deepEqual(archetype.game, spec.game, 'the block validated but was dropped by archetypeFromSpec (expected archetype.game)');
  assert.equal(archetype.capabilities.game, true, 'the capability flag did not reach the builder');
  for (const frameworkName of ARMS) {
    const { files } = buildProjectFromSpec({ spec: gameSpec({ game: undefined, capabilities: { list_pages: true } }), frameworkName });
    assert.equal(
      /game_scores|game_field|GAME_CONFIG|gameTick|id="game-/.test(files['server.mjs']) || /GAME_CONFIG|gameTick/.test(files['app/enhance.js']),
      false,
      `${frameworkName} emitted game code for a specification that did not opt in`,
    );
  }
});

for (const arm of ARMS) {
  test(`functional: ${arm} serves a playable page and records only scores it could have produced`, async () => {
    const dir = mkdtempSync(join(tmpdir(), `game-${arm}-`));
    const port = await availablePort();
    const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec: gameSpec(), frameworkName: arm });
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
      const post = (path, body) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body).toString(),
          redirect: 'manual',
        });

      // The page a visitor is served: complete before any script runs, so the score, the lives, the target,
      // the state and the restart exist in the document itself.
      const play = await (await fetch(`${base}/play`)).text();
      assert.match(play, /id="game-field"[^>]*data-state="ready"/, `${arm} serves the field in its initial state`);
      assert.match(play, /id="game-player"/, `${arm} serves the player`);
      assert.match(play, /id="game-target"/, `${arm} serves the target`);
      assert.equal(textOf(play, 'game-score'), '0', `${arm} starts at a score of zero`);
      assert.equal(textOf(play, 'game-lives'), String(GAME.lives), `${arm} starts with the declared lives`);
      assert.equal(textOf(play, 'game-target-score'), String(GAME.target), `${arm} states the score that wins`);
      assert.equal(textOf(play, 'game-state'), 'Ready', `${arm} says it is ready`);
      assert.match(play, /id="game-restart"/, `${arm} offers a restart`);
      assert.match(play, /src="\/app\/enhance\.js"/, `${arm} loads the one enhancement script`);

      // The loop has to reach the client, with this specification's own numbers, or the page is a picture.
      const script = await (await fetch(`${base}/app/enhance.js`)).text();
      assert.match(script, /gameTick/, `${arm} serves the loop`);
      assert.ok(script.includes(`"tick_ms":${GAME.tick_ms}`) && script.includes(`"target":${GAME.target}`) && script.includes(`"lives":${GAME.lives}`), `${arm} the loop carries the specification's numbers`);
      assert.match(script, /addEventListener\('keydown'/, `${arm} the loop listens for keys`);
      assert.match(script, /addEventListener\('pointerdown'/, `${arm} the loop listens for the pointer`);

      // Nothing has been played, so nothing is recorded.
      const emptyBoard = await (await fetch(`${base}/play/scores`)).text();
      assert.match(emptyBoard, /id="game-no-scores"/, `${arm} an empty scoreboard says so`);

      // The server does not take the browser's word for it. Each of these is a game this game could not
      // have produced, and each is refused with a reason rather than recorded.
      const refusals = [
        ['2', 'win', 'a win below the target'],
        ['3', 'lose', 'a loss at the target'],
        ['9', 'win', 'a score above the target'],
        ['', 'lose', 'a blank score'],
        ['  ', 'lose', 'a whitespace score'],
        ['x', 'lose', 'a non-numeric score'],
        ['-1', 'lose', 'a negative score'],
        ['1.5', 'lose', 'a fractional score'],
        ['3', 'won', 'an outcome that is neither a win nor a loss'],
        ['3', '', 'no outcome at all'],
      ];
      for (const [score, outcome, why] of refusals) {
        const refused = await post('/play/score', { score, outcome });
        assert.equal(refused.status, 422, `${arm} refused ${why} (${JSON.stringify(score)}/${JSON.stringify(outcome)})`);
        assert.ok((await refused.text()).length > 0, `${arm} refuses ${why} with a reason`);
      }
      const stillEmpty = await (await fetch(`${base}/play/scores`)).text();
      assert.match(stillEmpty, /id="game-no-scores"/, `${arm} a refused score is not recorded`);

      // A game that could have happened is recorded, and the scoreboard reads it back best first.
      assert.equal((await post('/play/score', { score: '0', outcome: 'lose' })).status, 303, `${arm} records a loss`);
      assert.equal((await post('/play/score', { score: '3', outcome: 'win' })).status, 303, `${arm} records a win at the target`);
      const board = await (await fetch(`${base}/play/scores`)).text();
      assert.match(board, /id="game-scores"/, `${arm} the scoreboard lists the recorded games`);
      const scores = [...board.matchAll(/<span class="score">(\d+)<\/span> - (\w+)/g)].map((match) => ({ score: Number(match[1]), outcome: match[2] }));
      assert.deepEqual(scores, [{ score: 3, outcome: 'win' }, { score: 0, outcome: 'lose' }], `${arm} the scoreboard is best first`);
      const scoreRef = /data-ref="([^"]+)"/.exec(board)?.[1];
      assert.ok(scoreRef, `${arm} a recorded score has a reference`);

      // A score is not a submitted record: it lives in its own table, so the record read-by-reference
      // route does not serve it and cannot be made to render one (the class of bug mwg-train-le6's review
      // found when a product row was read as a receipt).
      const recordRoute = projectSpec.routes.find((route) => route.kind === 'read-by-reference');
      const asRecord = await fetch(`${base}${recordRoute.path.replace(':ref', scoreRef)}`);
      assert.equal(asRecord.status, 404, `${arm} a score reference is not a record`);

      // Reading the pages again must not have disturbed anything.
      assert.equal((await fetch(`${base}/play`)).status, 200, `${arm} the game page is still served`);
    } finally {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('composition: a game can be combined with the other capabilities, measured rather than assumed', async () => {
  // The rule this repository follows is to refuse a combination only when something is actually broken by
  // it (cart refuses session because both claim the sid). A game owns its own routes and its own table, so
  // the honest answer is to build the combination and see, instead of inventing a restriction.
  // The cart fixture is the one that satisfies the cart's own preconditions (a variant select and a
  // quantity field); that the game neither breaks it nor is broken by it is the question being asked.
  const combined = cartSpec({ capabilities: { cart: true, game: true }, game: GAME });
  assert.deepEqual(validateSpec(combined), [], 'a game with a cart is a legitimate specification');
  const dir = mkdtempSync(join(tmpdir(), 'game-combined-'));
  const port = await availablePort();
  const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec: combined, frameworkName: 'raw' });
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
    assert.ok(up, 'server did not come up');
    for (const path of ['/play', '/play/scores', '/cart']) {
      assert.equal((await fetch(`${base}${path}`)).status, 200, `${path} is served alongside the game`);
    }
    const recorded = await fetch(`${base}/play/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ score: '3', outcome: 'win' }).toString(),
      redirect: 'manual',
    });
    assert.equal(recorded.status, 303, 'a score is recorded in a combined specification');
  } finally {
    child.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});
