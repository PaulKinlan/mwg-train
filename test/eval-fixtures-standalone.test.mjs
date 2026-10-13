/**
 * Is an evaluation fixture runnable on its own?
 *
 * `docs/eval/projects/*` are handed to an evaluator as a self-contained project directory, and the
 * whole point of that shape is that the directory can be copied out of the repository and still run.
 * It could not: every generated `server.mjs` imported the shared kit through
 * `../../../../../src/eval/site-kit.mjs`, a path that resolves only while the project sits inside the
 * checkout, so copying a starter made all ten unrunnable with ERR_MODULE_NOT_FOUND.
 *
 * This test copies a fixture into a temporary directory - with no repository around it - starts it,
 * and asserts it serves. It is deliberately a *behaviour* check rather than a file check:
 * `check:eval-projects` already re-derives every fixture file byte-for-byte, which is what stops the
 * vendored kit drifting from `src/eval/site-kit.mjs`, but nothing else proved that the result runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { startArmServer } from './helpers/arm-server.mjs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = 'docs/eval/projects/already-modern/cf-06';

/** Start `server.mjs` in `dir` and resolve once it announces its port. */
function startServer(dir) {
  return new Promise((resolveStart, rejectStart) => {
    const child = startArmServer({ projectDir: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectStart(new Error(`server did not announce SITE_READY within 10s. stdout=${out} stderr=${err}`));
    }, 10_000);

    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = /SITE_READY (\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolveStart({ child, port: Number(match[1]) });
      }
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectStart(error);
    });
    child.on('exit', (code) => {
      if (!/SITE_READY/.test(out)) {
        clearTimeout(timer);
        rejectStart(new Error(`server exited ${code} before announcing a port. stderr=${err}`));
      }
    });
  });
}

test('a fixture copied out of the repository runs on its own', async () => {
  const source = join(ROOT, FIXTURE);
  assert.ok(existsSync(join(source, 'server.mjs')), `${FIXTURE}/server.mjs should exist`);

  // Copy only the project directory: no repository, no node_modules, no shared src/.
  const sandbox = mkdtempSync(join(tmpdir(), 'eval-standalone-'));
  const site = join(sandbox, 'site');
  cpSync(source, site, { recursive: true });

  let child = null;
  try {
    const started = await startServer(site);
    child = started.child;

    const response = await fetch(`http://127.0.0.1:${started.port}/`);
    assert.equal(response.status, 200, 'the copied fixture should serve its root page');
    const html = await response.text();
    assert.ok(html.length > 0, 'the served page should not be empty');
  } finally {
    if (child) child.kill('SIGKILL');
    rmSync(sandbox, { recursive: true, force: true });
    // Give the killed child a moment to release the port before the next test file runs.
    await delay(50);
  }
});
