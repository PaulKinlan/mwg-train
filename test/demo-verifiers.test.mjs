import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sandboxAvailable } from '../src/eval/generated-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The three board-family demo acceptance verifiers, run for real.
 *
 * Why this suite exists (mwg-train-bt9g): a third reference board landed while the
 * account-recovery verifier still asserted exactly two images and two iframes, and nothing in
 * the automated tree ran the verifier - the defect reached review and was found by hand. These
 * runners drive a real browser against the committed comparison pages, so they cannot run
 * inside check:all (offline, no browser, no spawned server), and until this suite existed a
 * change to a verifier - or to the page a verifier counts - selected nothing. The coverage
 * contract (.fleet/coverage-mapping.json) maps each verifier to this suite, so the fast gate
 * runs the real thing whenever a verifier changes. A page change that breaks a count surfaces
 * here too, because each verifier drives its own comparison page's current DOM.
 *
 * Each runner is bounded per spawn; they write their evidence under /tmp/xvd-* and exit
 * non-zero when any check fails (that is the property bt9g's repro relied on).
 */
const VERIFIERS = [
  'scripts/verify-account-recovery-demo.mjs',
  'scripts/verify-event-registration-demo.mjs',
  'scripts/verify-contact-lead-demo.mjs',
];

test('the demo acceptance verifiers pass against their committed comparison pages', () => {
  for (const verifier of VERIFIERS) {
    const result = spawnSync('node', [path.join(ROOT, verifier)], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 240_000,
    });
    assert.strictEqual(
      result.status,
      0,
      `${verifier} failed:\n${`${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-800)}`,
    );
    assert.ok(
      (result.stdout ?? '').trim().length > 0,
      `${verifier}: expected a summary on stdout`,
    );
  }
});

/**
 * mwg-train-hogz review P1. A capability verifier writes its own report JSON, so the fact that decided whether
 * model-authored code ran behind a PID namespace or beside the operator's processes never reached the file it
 * emitted: the report read the same either way, and the field was not there at all. These runs drive one verifier
 * through both postures it can launch under and read the posture back out of the file it wrote, so a dropped field,
 * a constant, or a posture taken from anything but the launch fails one of them.
 */
const REPORT_VERIFIER = 'scripts/verify-pricing-tiers.mjs';

/** A port nothing is listening on yet: the verifier's own default collides with the suites that run beside this one. */
async function freePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => {
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = probe.address();
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

/** Run the verifier for real and return the report it emitted, which is the evidence a reviewer reads. */
async function pricingVerifierReport(shots, env = {}) {
  const port = await freePort();
  const result = spawnSync('node', [path.join(ROOT, REPORT_VERIFIER)], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 240_000,
    env: { ...process.env, PRICING_SHOTS: shots, PRICING_ARM: 'raw', PRICING_PORT: String(port), ...env },
  });
  assert.strictEqual(
    result.status,
    0,
    `${REPORT_VERIFIER} failed:\n${`${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-800)}`,
  );
  return JSON.parse(readFileSync(path.join(shots, 'report-raw.json'), 'utf8'));
}

test('a verifier report states the containment it launched under', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const shots = mkdtempSync(path.join(tmpdir(), 'hogz-verifier-contained-'));
  t.after(() => rmSync(shots, { recursive: true, force: true }));

  const report = await pricingVerifierReport(shots);
  assert.deepEqual(
    report.sandboxPosture,
    { mechanism: 'bubblewrap', optIn: null },
    'the emitted report must name the containment the verifier launched, and a contained run names no opt-in',
  );
});

test('a verifier report names the opt-in that allowed a host run', async (t) => {
  // The documented escape hatch, on a machine with no bubblewrap: the journey still passes, and the report has to
  // carry the variable that allowed generated code out of the sandbox instead of reading like a contained run.
  const shots = mkdtempSync(path.join(tmpdir(), 'hogz-verifier-host-'));
  t.after(() => rmSync(shots, { recursive: true, force: true }));

  const report = await pricingVerifierReport(shots, {
    MWG_BWRAP_PATH: '/nonexistent/bwrap',
    MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER: '1',
  });
  assert.deepEqual(
    report.sandboxPosture,
    { mechanism: 'host-opt-in', optIn: 'MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER=1' },
    'a host run that names no opt-in leaves a reviewer unable to tell what let the server out of the sandbox',
  );
});
