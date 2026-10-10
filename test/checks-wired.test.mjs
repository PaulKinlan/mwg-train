import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WIRED = new Set([
  // The npm script passes only --if-present, so this runs offline against local git objects.
  // Network is only needed for an acceptance audit that passes --remote explicitly.
  'check:originals',
  'lint:provenance',
  'check:quotes',
  'check:briefs',
  'check:disjoint',
  'check:eval-projects',
  'check:targets',
  'check:specs',
  'check:pilot-corpus',
  'check:train-evidence',
  'scan:owner-auth',
  'check:brief-schema',
  'check:route-conformance',
  'check:rules-pin',
  'check:design-schema',
  'check:baseline-label'
]);

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

  for (const name of checkNames) {
    assert.ok(WIRED.has(name) || EXCLUDED.has(name), `Check ${name} is neither in WIRED nor EXCLUDED`);
  }

  for (const name of WIRED) {
    assert.ok(checkNames.includes(name), `WIRED check ${name} is missing from package.json`);
  }

  for (const name of EXCLUDED.keys()) {
    assert.ok(checkNames.includes(name), `EXCLUDED check ${name} is missing from package.json`);
  }

  const checkAllStr = pkg.scripts['check:all'];
  assert.ok(checkAllStr, 'check:all script is missing');
  
  const checkAllNames = new Set(checkAllStr.split('&&').map(p => {
    const match = p.trim().match(/^npm run (.*)$/);
    return match ? match[1] : p.trim();
  }));

  assert.strictEqual(checkAllNames.size, WIRED.size, 'check:all size mismatch');
  for (const name of WIRED) {
    assert.ok(checkAllNames.has(name), `check:all missing ${name}`);
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

  const errors = await executeChecks(Array.from(WIRED), actualSpawn, 8000);
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
