import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
