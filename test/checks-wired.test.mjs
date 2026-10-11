import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECKS, EXCLUDED } from '../scripts/run-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// The set of checks the gate runs is READ from `scripts/run-checks.mjs`, which is also what `check:all` runs. It used
// to be derived by parsing `npm run <name>` back out of a 600-character shell string in package.json, which removed a
// hand-written mirror but left the guard coupled to shell formatting - and the string could be malformed in ways the
// derivation tolerated (`npm run check:bar && check:foo` scraped a usable-looking name out of a command a shell
// cannot run). Now it is data in one place, so there is nothing to parse and nothing for a person to forget.
//
// The failure mode the derivation was introduced to prevent still governs the shape here: `check:all` green while
// `npm test` is red, because check:all does not run this test. What matters is that every check script is either run
// by the gate or excluded with a reason, and that a check cannot be silently absent from both.
//
// `EXCLUDED` stays explicit because it is the one thing that cannot be derived: the checks that must NOT be in the
// gate, and the reason each one is not. Everything the gate does run works offline - no network, no browser, no
// spawned server - which is what lets `check:all` run anywhere; any check that cannot meet that belongs here with
// its reason. It now lives beside the list, in the runner, so the gate and its exclusions are defined together.

// The execution harness that used to live here is gone with the execution: nothing called it but its own mock test,
// and the checks it would run are run by `npm run build` (which is `check:all`) on the merger's merged union.

test('derive and validate check set', () => {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (err) {
    assert.fail(`Could not read package.json: ${err.message}`);
  }

  const checkNames = Object.keys(pkg.scripts).filter(k => /^(check|scan|lint):/.test(k) && k !== 'check:all');
  assert.ok(checkNames.length >= 20, `Derived count too low: ${checkNames.length}`);

  // The gate's list is the authority for what is wired, and since mwg-train-60c it is read from where the gate reads
  // it: scripts/run-checks.mjs. This assertion is the coupling - if package.json stops running the runner, the list in
  // the runner is no longer what the gate does, and every assertion below would be about nothing.
  assert.strictEqual(
    pkg.scripts['check:all'],
    'node scripts/run-checks.mjs',
    'check:all must run scripts/run-checks.mjs, which is where this test reads the gate from',
  );
  const wired = new Set(CHECKS);
  assert.ok(wired.size >= 20, `the gate runs only ${wired.size} check(s)`);
  assert.strictEqual(
    wired.size,
    CHECKS.length,
    'the gate runs the same check twice',
  );

  for (const name of checkNames) {
    assert.ok(
      wired.has(name) || EXCLUDED.has(name),
      `Check ${name} is neither run by check:all nor in EXCLUDED - add it to check:all, or exclude it with a reason`,
    );
  }

  for (const name of wired) {
    assert.ok(checkNames.includes(name), `check:all runs ${name}, which is not a check script in package.json`);
  }

  for (const name of wired) {
    assert.ok(!EXCLUDED.has(name), `${name} is both run by check:all and excluded from it`);
  }

  for (const [name, reason] of EXCLUDED) {
    assert.ok(checkNames.includes(name), `EXCLUDED check ${name} is missing from package.json`);
    assert.ok(reason && reason.trim().length > 0, `EXCLUDED check ${name} states no reason`);
  }

  // The checks themselves are NOT run here. They are run by `check:all`, which is the gate, and by the merger's
  // full gate on the merged union - running all 24 a second time inside `npm test` bought no coverage while making
  // the suite pay the gate's cost twice. It also failed for a reason that was not a defect: each check was given
  // 8 seconds, and under load (the merger's gate preempting an implementer's) a merely slow check reddened the
  // suite. That is the mwg-train-bx2 family of false alarms, caused by the test rather than by anything it tests.
  //
  // What this file is FOR is the structural guard above - every script is either wired into the gate or excluded
  // with a reason, and `check:all` still points at the runner - which is cheap, runs on every `npm test`, and is the
  // thing that actually broke once (mwg-train-9by: check:all green while npm test was red). The harness that would
  // execute checks is not part of this file any more: they run on the merged union, through `npm run build`
  // (which is `check:all`), because the merger's fleet-check runs `npm run build && npm test` when a project
  // defines a build script. That is what makes it safe to keep this test fast (mwg-train-2q9).
});
