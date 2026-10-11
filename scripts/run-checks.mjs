/**
 * The gate's check list, in one place.
 *
 * `check:all` used to be a single 600-character shell string in package.json chaining 24 commands with `&&`, and
 * `test/checks-wired.test.mjs` derived what the gate runs by parsing `npm run <name>` back out of it. That removed a
 * real trap - a hand-written mirror that let `check:all` be green while `npm test` was red - but it left the guard
 * coupled to shell string formatting, and the string could be malformed in ways the derivation silently tolerated
 * (`npm run check:bar && check:foo` scraped a usable-looking name out of a command a shell cannot run).
 *
 * So the list lives here as data. `check:all` calls this file, and the test reads the same two exports. There is no
 * longer a shell string to get the formatting right in, and nothing for a person or a script to mis-parse.
 *
 * The contract that keeps the gate useful is unchanged and is enforced by the test: every `check:`/`scan:`/`lint:`
 * script in package.json is either in `CHECKS` or in `EXCLUDED` with a reason, and every name in `CHECKS` is a real
 * script. Everything in `CHECKS` runs offline - no network, no browser, no spawned server - which is what lets the
 * gate run anywhere. A check that cannot meet that belongs in `EXCLUDED` with its reason.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The checks the gate runs, in the order it runs them. Order is deliberate where a cheap check can fail fast before
 * an expensive one - the list is executed top to bottom and stops at the first failure, exactly as `&&` did.
 */
export const CHECKS = [
  'lint:provenance',
  'check:quotes',
  'check:briefs',
  'check:originals',
  'check:disjoint',
  'check:eval-projects',
  'check:targets',
  'check:specs',
  'check:archetype-assets',
  'check:build-key',
  'check:pilot-corpus',
  'check:set-separation',
  'check:train-evidence',
  'check:train-records',
  'scan:owner-auth',
  'check:brief-schema',
  'check:route-conformance',
  'check:rules-pin',
  'check:design-schema',
  'check:train-design',
  'check:baseline-label',
  'check:doc-links',
  'check:pilot-served',
  'check:served-gap',
];

/**
 * The checks that must NOT be in the gate, and why. This is the one thing that cannot be derived: it is a statement
 * about the environment a check needs, which only a person knows.
 */
export const EXCLUDED = new Map([
  ['check:served-routes', 'requires a spawned HTTP server'],
  ['check:served-routes:strict', 'requires a spawned HTTP server'],
  ['check:cross-arm-parity', 'requires Chrome'],
  ['check:cross-arm-parity:strict', 'requires Chrome'],
]);

/**
 * Run every check in order and stop at the first failure.
 *
 * Output is inherited rather than captured: the gate's log is how a failure is read, and the previous shell string
 * streamed it. The exit code is the failing check's, so a caller cannot mistake a failed gate for a pass.
 */
export function runChecks(names = CHECKS, spawn = spawnSync) {
  for (const [index, name] of names.entries()) {
    process.stdout.write(`\n[${index + 1}/${names.length}] npm run ${name}\n`);
    const result = spawn('npm', ['run', name], { cwd: ROOT, stdio: 'inherit' });
    if (result.error) {
      process.stderr.write(`check:all - ${name} could not be started: ${result.error.message}\n`);
      return 1;
    }
    if (result.status !== 0) {
      // A check killed by a signal has no exit status - `spawnSync` leaves `status` null and names the signal. The
      // gate still fails either way, but the log the merger reads should say which, rather than "exit null".
      const how = result.status === null || result.status === undefined
        ? `signal ${result.signal ?? 'unknown'}`
        : `exit ${result.status}`;
      process.stderr.write(`\ncheck:all - FAILED at ${name} (${how}); ${index} of ${names.length} checks ran\n`);
      return result.status ?? 1;
    }
  }
  process.stdout.write(`\ncheck:all - PASS - ${names.length} check(s)\n`);
  return 0;
}

if (process.argv[2] === '--list') {
  // The list, readable by a person and by a script, so neither has to parse anything.
  for (const name of CHECKS) process.stdout.write(`${name}\n`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runChecks());
}
