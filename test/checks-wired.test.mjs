import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// The set of checks the gate runs is DERIVED from `check:all` below, not listed here. It used to be a hand-written
// `WIRED` set that the test then compared against `check:all`, which meant adding a check the correct way - a script
// in package.json plus an entry in check:all - still failed this test until the same name was copied into a third
// place. The failure mode was the worst kind: `check:all` green while `npm test` was red, because check:all does not
// run this test. That trap cost mwg-train-9by a review round, and it is why the derivation and the assertions below
// are shaped the way they are: what matters is that every check script is either run by the gate or excluded with a
// reason, and a check must not be able to be silently absent from both.
//
// `EXCLUDED` stays explicit because it is the one thing that cannot be derived: the checks that must NOT be in the
// gate, and the reason each one is not. Everything the gate does run works offline - no network, no browser, no
// spawned server - which is what lets `check:all` run anywhere; any check that cannot meet that belongs here with
// its reason.

const EXCLUDED = new Map([
  ['check:served-routes', 'requires a spawned HTTP server'],
  ['check:served-routes:strict', 'requires a spawned HTTP server'],
  ['check:cross-arm-parity', 'requires Chrome'],
  ['check:cross-arm-parity:strict', 'requires Chrome']
]);

export async function executeChecks(checkNames, spawnFn, timeoutMs = 8000) {
  // NOTE: bead mwg-train-4oi covers the fail-open behaviour on empty input for existing check scripts.
  // We don't fix it here, but we do catch completely empty stdout/stderr.
  const errors = [];
  for (const name of checkNames) {
    try {
      const output = await spawnFn(name, timeoutMs);
      if (typeof output !== 'string' || output.trim() === '') {
        errors.push(`${name}: produced no output`);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return errors;
}

test('derive and validate check set', async () => {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (err) {
    assert.fail(`Could not read package.json: ${err.message}`);
  }

  const checkNames = Object.keys(pkg.scripts).filter(k => /^(check|scan|lint):/.test(k) && k !== 'check:all');
  assert.ok(checkNames.length >= 20, `Derived count too low: ${checkNames.length}`);

  const checkAllStr = pkg.scripts['check:all'];
  assert.ok(checkAllStr, 'check:all script is missing');

  // The gate's own list is the authority for what is wired. Parsing it here - rather than keeping a second copy in
  // this file - is what makes the trap impossible: there is nothing left for a developer to forget to update.
  const checkAllParts = checkAllStr.split('&&').map((part) => part.trim());
  const wired = new Set(checkAllParts.map((part) => part.replace(/^npm run /, '')));
  assert.ok(wired.size >= 20, `check:all runs only ${wired.size} check(s)`);
  assert.strictEqual(
    new Set(checkAllParts).size,
    checkAllParts.length,
    'check:all runs the same command twice',
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

  const actualSpawn = (name, timeoutMs) => {
    return new Promise((resolve, reject) => {
      const proc = spawn('npm', ['run', name], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.stderr.on('data', d => out += d);

      const t = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('timed out'));
      }, timeoutMs);

      proc.on('close', code => {
        clearTimeout(t);
        if (code !== 0) {
          reject(new Error(`exited non-zero (${code}):\n${out}`));
        } else {
          resolve(out);
        }
      });
      
      proc.on('error', err => {
        clearTimeout(t);
        reject(err);
      });
    });
  };

  const errors = await executeChecks(Array.from(wired), actualSpawn, 8000);
  if (errors.length > 0) {
    assert.fail(`Execution failed:\n${errors.join('\n')}`);
  }
});

test('executeChecks harness can fail', async () => {
  const fakeSpawn = async (name, timeoutMs) => {
    if (name === 'pass') return 'some output';
    if (name === 'fail') throw new Error('exited non-zero');
    if (name === 'timeout') throw new Error('timed out');
    if (name === 'empty') return '   \n ';
    return 'out';
  };

  const errors = await executeChecks(['pass', 'fail', 'timeout', 'empty'], fakeSpawn, 1000);
  
  assert.strictEqual(errors.length, 3, 'Should report exactly 3 failures');
  assert.ok(errors.find(e => e.includes('fail: exited non-zero')), 'Must report non-zero exit');
  assert.ok(errors.find(e => e.includes('timeout: timed out')), 'Must report timeout');
  assert.ok(errors.find(e => e.includes('empty: produced no output')), 'Must report empty output');
});
