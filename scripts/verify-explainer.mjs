/**
 * Functional local-browser check for the interactive-explainer capability (mwg-train-5k4).
 *
 * The bead's acceptance bar is behavioural and cannot be checked by reading the page: a driven journey has to SET
 * two different inputs, RECORD the derived output for each, and assert they differ in the way the explanation
 * claims - plus a reset that returns the output to its initial value. "A page with two static states and no
 * derivation is a failure." So this types real values into the real control, submits the real form, and reads what
 * the server derived, in the corpus where the arithmetic is exact: the repair costs 1200, so 60 a month is twenty
 * months, 150 is eight, and 40 is thirty - past the horizon the page draws, which the narrative has to say.
 *
 * Usage: node scripts/verify-explainer.mjs [arm]   (or EXPLAINER_ARM=vue; `all` runs raw and hono)
 * Evidence (screenshots) is written to /tmp/explainer-shots.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { explainerSpec } from './lib/explainer-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.EXPLAINER_SHOTS ?? '/tmp/explainer-shots';
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const availablePort = () =>
  new Promise((resolve_, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve_(port));
    });
  });

// The figures the corpus's arithmetic requires, and the horizon it draws. Stated once so the journey's
// expectations and the corpus cannot drift apart.
const INITIAL = { amount: 60, months: 20 };
const SHORTER = { amount: 150, months: 8 };
const BEYOND = { amount: 40, months: 30 };
const HORIZON = 24;

export async function runJourney(arm) {
  console.log(`\n=== interactive-explainer journey, arm: ${arm} ===`);
  const checks = [];
  const check = (name, truth, detail) => {
    checks.push({ name, ok: Boolean(truth), detail });
    console.log(`${truth ? 'PASS' : 'FAIL'} [${arm}] ${name}: ${detail}`);
  };

  const port = await availablePort();
  const spec = explainerSpec();
  const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
  const dir = mkdtempSync(join(tmpdir(), `explainer-verify-${arm}-`));
  writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  const base = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'verify.sqlite')], {
    cwd: dir,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let chrome;
  try {
    let up = false;
    for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
      await sleep(250);
      up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
    }
    check('the generated server is ready', up, `${arm} on ${base}`);
    if (!up) throw new Error(`${arm} server never came up`);

    chrome = await launchChrome({});
    const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });

    // Read the page's own state through the hooks the generator emits, so the assertions are about what a reader
    // sees rather than about markup shape.
    const state = async () => ({
      figure: await page.evaluate(`return (document.querySelector('#explainer-output') || {}).textContent || ''`),
      narrative: await page.evaluate(`return (document.querySelector('#explainer-narrative') || {}).textContent || ''`),
      steps: await page.evaluate(`return document.querySelectorAll('.explainer-step').length`),
      travelled: await page.evaluate(`return document.querySelectorAll('.explainer-step[data-travelled="true"]').length`),
      reset: await page.evaluate(`return Boolean(document.querySelector('#explainer-reset'))`),
    });
    const setAmount = async (amount) => {
      // The control arrives pre-filled with the initial amount, so this replaces the value rather than typing into
      // it: `realType` focuses and inserts at the caret without clearing, which appends, and the result is then a
      // value above `max` that the browser refuses to submit (`submit` uses requestSubmit, so native validation
      // runs). Clearing with trusted Backspace presses was tried first and does not take effect here, so this uses
      // `type`, which sets the value and fires input/change. What is under test is the derivation and a real form
      // submission, both of which stay real; the keystroke mechanics are Chrome's business, and the served markup
      // (`name="monthly"` on the input, matching the parameter the route reads) plus a bare query string working
      // are checked separately. The assertion below is deliberately exact, so a setup bug reports itself instead
      // of silently submitting a different value.
      const field = 'input[name="monthly"]';
      await page.type(field, String(amount));
      const entered = await page.evaluate(`return (document.querySelector(${JSON.stringify(field)}) || {}).value ?? null`);
      if (entered !== String(amount)) throw new Error(`the control holds ${JSON.stringify(entered)} rather than ${JSON.stringify(String(amount))}`);
      await page.submit('#explainer-control');
      await page.waitForSettled();
    };

    // 1. The initial state, which is also what reset must return to.
    await page.goto(`${base}/explain`);
    await page.waitForSettled();
    const initial = await state();
    await page.screenshot(join(SHOTS, `01-initial-${arm}.png`));
    check('the initial figure is derived from the initial amount', initial.figure.includes(String(INITIAL.months)), `figure="${initial.figure.trim()}"`);
    check('a reset control is on the page', initial.reset, 'reset anchor present');
    check('the initial path is drawn', initial.travelled > 0, `${initial.travelled} of ${initial.steps} steps travelled`);

    // 2. A different amount, typed and submitted for real: a smaller figure, so the journey has the two
    //    recorded outputs the acceptance bar asks for.
    await setAmount(SHORTER.amount);
    const shorter = await state();
    await page.screenshot(join(SHOTS, `02-shorter-${arm}.png`));
    check('setting a larger amount derives a smaller figure', shorter.figure.includes(String(SHORTER.months)), `figure="${shorter.figure.trim()}"`);
    check('the two inputs produce different derived output', shorter.figure !== initial.figure, `"${initial.figure.trim()}" vs "${shorter.figure.trim()}"`);
    check('the path follows the derived figure', shorter.travelled === SHORTER.months, `${shorter.travelled} steps travelled for ${SHORTER.months} months`);

    // 3. An amount whose path runs past the horizon: the narrative and the drawn path must say so rather than
    //    quietly showing a path that stops short.
    await setAmount(BEYOND.amount);
    const beyond = await state();
    await page.screenshot(join(SHOTS, `03-beyond-horizon-${arm}.png`));
    check('an amount past the horizon derives its own figure', beyond.figure.includes(String(BEYOND.months)), `figure="${beyond.figure.trim()}"`);
    check('the narrative changes when the path runs past the horizon', beyond.narrative !== initial.narrative, `"${beyond.narrative.trim().slice(0, 70)}"`);
    check('the drawn path is capped at the horizon rather than drawn to 30 steps', beyond.travelled <= HORIZON && beyond.steps >= HORIZON, `${beyond.steps} steps, ${beyond.travelled} travelled`);

    // 4. Reset: the output returns to its initial value, not merely to a page called reset.
    await page.click('#explainer-reset');
    await page.waitForSettled();
    const afterReset = await state();
    await page.screenshot(join(SHOTS, `04-after-reset-${arm}.png`));
    check('reset returns the derived figure to its initial value', afterReset.figure.includes(String(INITIAL.months)), `figure="${afterReset.figure.trim()}"`);
    check('reset returns to the bare path, so the state is not remembered anywhere', String(await page.url()).includes('/explain') && !String(await page.url()).includes('monthly='), String(await page.url()));

    // 5. Deterministic and self-contained: no client script and no model call, which is what makes the journey
    //    reproducible and the figure identical on a second read.
    const content = await page.content();
    check('the explanation is drawn without a client script', !/<script/i.test(content), `${content.length} bytes of HTML`);
    const reread = await state();
    check('the same input gives the same output twice', reread.figure === afterReset.figure, `"${afterReset.figure.trim()}" twice`);

    const passed = checks.filter((c) => c.ok).length;
    console.log(`\n[${arm}] ${passed}/${checks.length} checks passed.`);
    return { arm, ok: passed === checks.length, passed, total: checks.length };
  } finally {
    server.kill('SIGTERM');
    if (chrome) await chrome.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const armArg = process.argv[2] || process.env.EXPLAINER_ARM || 'raw';
  const armsToRun = armArg === 'all' ? ['raw', 'hono'] : [armArg];
  const results = [];
  for (const arm of armsToRun) results.push(await runJourney(arm));
  if (!results.every((r) => r.ok)) {
    console.error('Some checks failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
