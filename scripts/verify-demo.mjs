/**
 * Functional local-browser check for the interactive-demo capability (mwg-train-kyu).
 *
 * The bead's acceptance bar is behavioural: "a driven journey that changes the configuration, runs it, reads the
 * output, then submits invalid input and reads the error. A demo that only shows a fixed output is a screenshot, not
 * a demo." So this types a real expression into the real field, chooses a mode through the real control, submits the
 * real form, and reads what the generated server worked out - and then does the same with input the evaluator cannot
 * work out, and reads the message it gets back.
 *
 * The corpus makes the arithmetic exact: `(12 * 3.5) + (8 * 2.6)` is 42 + 20.8 = 62.8, and `max(7, 2) / 2` is 3.5,
 * which the whole mode rounds to 4. So the journey can state the numbers rather than accept whatever appears.
 *
 * Usage: node scripts/verify-demo.mjs [arm]   (or DEMO_ARM=vue; `all` runs raw and hono)
 * Evidence (screenshots) is written to /tmp/demo-shots.
 */
import { spawn } from 'node:child_process';
import { generatedServerEnv } from '../src/eval/generated-server.mjs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { demoSpec } from './lib/demo-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.DEMO_SHOTS ?? '/tmp/demo-shots';
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

// What the corpus's arithmetic requires. Stated once so the journey's expectations and the corpus cannot drift.
const INITIAL = '62.8';
const RUN = { expression: 'max(7, 2) / 2', whole: '4', exact: '3.5' };
const TOO_DEEP = `${'('.repeat(12)}1${')'.repeat(12)}`;

export async function runJourney(arm) {
  console.log(`\n=== interactive-demo journey, arm: ${arm} ===`);
  const checks = [];
  const check = (name, truth, detail) => {
    checks.push({ name, ok: Boolean(truth), detail });
    console.log(`${truth ? 'PASS' : 'FAIL'} [${arm}] ${name}: ${detail}`);
  };

  const port = await availablePort();
  const spec = demoSpec();
  const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
  const dir = mkdtempSync(join(tmpdir(), `demo-verify-${arm}-`));
  writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  const base = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'verify.sqlite')], {
    cwd: dir,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: generatedServerEnv(),
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

    const state = async () => ({
      output: await page.evaluate(`return (document.querySelector('#demo-output') || {}).textContent || ''`),
      error: await page.evaluate(`return (document.querySelector('#demo-error') || {}).textContent || ''`),
      steps: await page.evaluate(`return document.querySelectorAll('.demo-step').length`),
      limits: await page.evaluate(`return (document.querySelector('#demo-limits') || {}).textContent || ''`),
      config: await page.evaluate(`return Boolean(document.querySelector('#demo-config'))`),
    });

    // Configure through the real controls and run through the real form: the field arrives pre-filled, so this sets
    // it outright rather than appending (typing into a pre-filled field appends, which is how an earlier verifier of
    // mine submitted a value the browser refused).
    const configureAndRun = async (expression, mode) => {
      await page.type('#demo-expression', expression);
      await page.selectOption('#demo-mode', mode);
      await page.submit('#demo-config');
      await page.waitForSettled();
      return state();
    };

    // 1. The initial configuration, which must already run: a demo that opens on an error is a broken demo.
    await page.goto(`${base}/demo`);
    await page.waitForSettled();
    const initial = await state();
    await page.screenshot(join(SHOTS, `01-initial-${arm}.png`));
    check('the configuration surface is on the page', initial.config, 'form present');
    check('the initial configuration runs and shows its value', initial.output.includes(INITIAL), `value="${initial.output.trim()}"`);
    check('the value is shown with the tokens it came from', initial.steps > 0, `${initial.steps} tokens listed`);
    check('the limits it runs under are stated on the page', /characters|tokens|depth/i.test(initial.limits), `"${initial.limits.trim().slice(0, 80)}"`);
    check('no error is shown for a good configuration', initial.error === '', `error element is ${initial.error === '' ? 'empty' : `"${initial.error}"`}`);

    // 2. Change the configuration and run it: a different expression AND a mode that rounds, so the result differs
    //    for two independent reasons.
    const whole = await configureAndRun(RUN.expression, 'whole');
    await page.screenshot(join(SHOTS, `02-run-whole-${arm}.png`));
    check('running a changed configuration shows its own result', whole.output.includes(RUN.whole), `value="${whole.output.trim()}" for ${RUN.expression} in whole mode`);
    check('the run result differs from the initial one', whole.output !== initial.output, `"${initial.output.trim()}" then "${whole.output.trim()}"`);

    // 3. The same expression in the other mode, to show the choice is the thing that changes it.
    const exact = await configureAndRun(RUN.expression, 'exact');
    check('the other mode keeps the decimals', exact.output.includes(RUN.exact), `value="${exact.output.trim()}" in exact mode`);
    check('the mode choice is what changed the result', exact.output !== whole.output, `whole "${whole.output.trim()}" vs exact "${exact.output.trim()}"`);

    // 4. The failure path, which the bead requires to be as readable as the success path.
    const bad = await configureAndRun('sqr(9)', 'exact');
    await page.screenshot(join(SHOTS, `03-error-${arm}.png`));
    check('bad input is reported rather than swallowed', bad.error.length > 0, `"${bad.error.trim().slice(0, 90)}"`);
    check('the message explains itself and where', /sqr|unknown|position/i.test(bad.error), `"${bad.error.trim().slice(0, 90)}"`);
    check('the page is not blank after a failure', bad.config, 'the configuration surface is still there');
    check('no stack trace reaches the page', !/at Object\.|at Module\.|node:internal/.test(bad.error), 'message only');

    // 5. A limit, driven rather than assumed: a deep nesting must come back as an error, not a stack overflow.
    const deep = await configureAndRun(TOO_DEEP, 'exact');
    check('a deeply nested expression is refused by the depth limit', /depth|deep|nested/i.test(deep.error), `"${deep.error.trim().slice(0, 90)}"`);

    // 6. Deterministic and self-contained: the run is arithmetic on the configuration, with no network at runtime.
    const content = await page.content();
    check('the demo runs without a client script', !/<script/i.test(content), `${content.length} bytes of HTML`);
    check('the page makes no network call of its own', !/\bfetch\s*\(|XMLHttpRequest/.test(content), 'no fetch or XHR on the page');

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
  const armArg = process.argv[2] || process.env.DEMO_ARM || 'raw';
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
