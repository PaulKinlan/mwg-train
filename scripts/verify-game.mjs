/**
 * Functional local-browser check for the game capability (mwg-train-ypr).
 *
 * The bead's acceptance bar is behavioural, and two of its three clauses cannot be checked over HTTP at
 * all: that the loop RUNS (state changes with no input, so the field is not a decorative canvas), that the
 * keyboard and the pointer change it, that a terminal state is reached and detectable, and that the
 * restart returns to the initial state WITHOUT a reload. So this drives the real project in real Chrome,
 * presses real keys, watches the document change, plays a game to a win, plays one to a loss, restarts,
 * and then checks the score the browser produced was RECORDED BY THE SERVER - the end-to-end claim the
 * page and the loop only assert between them.
 *
 * Usage: node scripts/verify-game.mjs   (GAME_ARM=vue to check another arm)
 * Evidence (screenshots + a JSON report) is written to /tmp/game-shots.
 */
import { startGeneratedServer } from '../src/eval/generated-server.mjs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { gameSpec } from './lib/game-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.GAME_SHOTS ?? '/tmp/game-shots';
const PORT = Number(process.env.GAME_PORT ?? 7941);
const ARM = process.env.GAME_ARM ?? 'raw';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const GAME = gameSpec().game;

const spec = gameSpec();
const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: ARM });
const dir = mkdtempSync(join(tmpdir(), `game-verify-${ARM}-`));
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
  const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/play`);

  // The state is read from the DOCUMENT, which is what a visitor sees, rather than from a test hook.
  const read = () =>
    page.evaluate(`
      const field = document.getElementById('game-field');
      return {
        state: field.dataset.state,
        result: field.dataset.result,
        lane: Number(field.dataset.lane),
        playerLane: Number(document.getElementById('game-player').dataset.lane),
        score: Number(document.getElementById('game-score').textContent),
        lives: Number(document.getElementById('game-lives').textContent),
        status: document.getElementById('game-state').textContent,
        targetTop: document.getElementById('game-target').style.top,
      };
    `);

  const initial = await read();
  check('the field is served ready', initial.state === 'ready' && initial.status === 'Ready', `${initial.state} / ${initial.status}`);
  const startShot = join(SHOTS, `game-ready-${ARM}.png`);
  await page.screenshot(startShot);

  // THE LOOP RUNS: with no input at all, the target moves down and a life is lost. A decorative canvas
  // would sit still and the score would never change.
  await page.realKey('Enter');
  await sleep(120);
  const playing = await read();
  check('the loop starts and reports it is playing', playing.state === 'playing' && playing.status === 'Playing', `${playing.state} / ${playing.status}`);
  const topBefore = playing.targetTop;
  await sleep(250);
  const moved = await read();
  check('the state advances with no input, so the field is not decorative', moved.targetTop !== topBefore || moved.lives < playing.lives, `target ${topBefore} -> ${moved.targetTop}, lives ${playing.lives} -> ${moved.lives}`);
  // A life is only lost when the target REACHES the bottom, which takes one fall (GAME_FALL_TICKS ticks),
  // so this waits for the event it is asserting rather than sampling once and calling it a miss: the first
  // version of this check did the latter and failed against a loop that was working.
  let missed = await read();
  for (let attempt = 0; attempt < 40 && missed.lives === GAME.lives; attempt += 1) {
    await sleep(100);
    missed = await read();
  }
  check('a missed target costs a life', missed.lives < GAME.lives, `${GAME.lives} -> ${missed.lives}, and it keeps playing: ${missed.state}`);

  // INPUT MATTERS: the arrow keys move the player, and the move is visible in the document.
  const before = await read();
  await page.realKey('ArrowRight');
  const right = await read();
  check('the right arrow moves the player', right.playerLane === before.playerLane + 1, `lane ${before.playerLane} -> ${right.playerLane}`);
  await page.realKey('ArrowLeft');
  const left = await read();
  check('the left arrow moves the player back', left.playerLane === before.playerLane, `lane ${right.playerLane} -> ${left.playerLane}`);

  // THE POINTER WORKS TOO: clicking the right-hand part of the field moves the player there.
  const box = await page.evaluate(`
    const bounds = document.getElementById('game-field').getBoundingClientRect();
    return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  `);
  await page.realPointer(box.x + box.width - 8, box.y + box.height - 8);
  const pointed = await read();
  check('the pointer moves the player', pointed.playerLane === 3, `lane ${pointed.playerLane} after clicking the last lane`);

  // A TERMINAL STATE, the losing one: do nothing and lose every life.
  let lost = await read();
  for (let attempt = 0; attempt < 80 && lost.state !== 'over'; attempt += 1) {
    await sleep(150);
    lost = await read();
  }
  check('the game reaches a terminal state on its own', lost.state === 'over', `state ${lost.state} after ${lost.lives} lives`);
  check('the loss is detectable and says so', lost.result === 'lose' && lost.status === 'You lose', `${lost.result} / ${lost.status}`);
  const loseShot = join(SHOTS, `game-over-lost-${ARM}.png`);
  await page.screenshot(loseShot);
  const urlAtLoss = await page.url();

  // THE RESTART: back to the initial state, with no reload - the URL and the document are the same ones.
  await page.click('#game-restart');
  const restarted = await read();
  check('the restart returns to the initial state', restarted.state === 'ready' && restarted.score === 0 && restarted.lives === GAME.lives, `${restarted.state}, score ${restarted.score}, lives ${restarted.lives}`);
  check('the restart does not reload the page', (await page.url()) === urlAtLoss, `${await page.url()}`);

  // A WIN, driven for real: start, and follow the target's lane with the arrow keys until the score
  // reaches the target. The lane is read from the document, so this is playing the game rather than
  // replaying a recorded sequence.
  await page.realKey('Enter');
  let won = await read();
  for (let attempt = 0; attempt < 400 && won.state === 'playing'; attempt += 1) {
    const seen = await read();
    if (seen.playerLane < seen.lane) await page.realKey('ArrowRight');
    else if (seen.playerLane > seen.lane) await page.realKey('ArrowLeft');
    await sleep(45);
    won = await read();
  }
  check('the game reaches a win', won.state === 'over' && won.result === 'win', `${won.state} / ${won.result} with a score of ${won.score}`);
  check('a win is detectable and says so', won.status === 'You win', won.status);
  check('the win was earned at the declared target', won.score >= GAME.target, `score ${won.score} of ${GAME.target}`);
  // The board the win is announced over has to show the catch: the target on the player's own lane, at the
  // bottom row, not the next throw at the top of another lane. My own hand-off claimed this was true when
  // it was not - the reviewer read the screenshot and said so (review P3), so it is an assertion now.
  check('the win is drawn where it was caught', won.lane === won.playerLane, `target lane ${won.lane}, player lane ${won.playerLane}`);
  check('the caught target is on the player\'s row, not at the top of the field', Number.parseInt(won.targetTop, 10) === GAME.height - 22, `target top ${won.targetTop}, expected ${GAME.height - 22}`);
  const winShot = join(SHOTS, `game-over-won-${ARM}.png`);
  await page.screenshot(winShot);

  // THE RECORD: the score the browser produced is on the server, which is what makes it a score rather
  // than a number that scrolled past.
  await sleep(400);
  await page.goto(`${base}/play/scores`);
  const board = await page.content();
  const recorded = [...board.matchAll(/<span class="score">(\d+)<\/span> - (\w+)/g)].map((match) => ({ score: Number(match[1]), outcome: match[2] }));
  check('the winning score was recorded by the server', recorded.some((row) => row.outcome === 'win' && row.score === won.score), JSON.stringify(recorded));
  check('the losing game was recorded too', recorded.some((row) => row.outcome === 'lose'), JSON.stringify(recorded));
  check('the scoreboard is best first', recorded.length > 0 && recorded[0].score === Math.max(...recorded.map((row) => row.score)), JSON.stringify(recorded));
  const boardShot = join(SHOTS, `game-scores-${ARM}.png`);
  await page.screenshot(boardShot);

  writeFileSync(
    join(SHOTS, `report-${ARM}.json`),
    `${JSON.stringify({ arm: ARM, base, checks, shots: [startShot, loseShot, winShot, boardShot] }, null, 2)}\n`,
  );
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
