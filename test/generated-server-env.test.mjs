// mwg-train-6wpn. Generated projects are untrusted: they run with the prober's or verifier's privileges, so the
// environment they are handed decides whether a secret in this shell can leave the machine.
//
// Three tests, deliberately different in kind. The first pins the policy. The second drives the real launch path
// with a generated server that reports its own environment, because a policy no call site consults is not a fix.
// The third scans the call sites themselves, because the fix that started this bead covered one file while nine
// others had the same defect - a per-file fix with no guard is how the tenth site appears.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { GENERATED_SERVER_ENV_ALLOWLIST, generatedServerEnv, startGeneratedServer } from '../src/eval/generated-server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

// Files that start a generated server with a deliberate exception, each with the owner and the reason. An entry
// here is a debt, not an exemption: the same test fails if the file is FIXED without removing the entry, so this
// list can only shrink by someone doing the work.
const KNOWN_UNFIXED = {
  'src/corpus/harness.mjs': 'mwg-train-i5i2.5 (owner: mwg-train-hud) - the harness sandbox bead, blocked; it inherits the parent environment by design until that lands',
};

const SCANNED_DIRS = ['scripts', 'src/eval', 'src/corpus'];

// A spawn that runs a generated project's server. Matched by the argument list rather than by the option object, so
// the scan still sees a call site that was written in another style.
const startsGeneratedServer = (text) => {
  const calls = [];
  const spawnCall = /\bspawn\s*\(/g;
  let match;
  while ((match = spawnCall.exec(text)) !== null) {
    // Read to the end of the call by balancing parentheses, so a nested call cannot end it early.
    let depth = 0;
    let index = match.index + match[0].length - 1;
    let end = -1;
    for (; index < text.length; index += 1) {
      const ch = text[index];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    if (end === -1) continue;
    const call = text.slice(match.index, end);
    if (!/'server\.mjs'|"server\.mjs"/.test(call)) continue;
    calls.push({ call, line: text.slice(0, match.index).split('\n').length });
  }
  return calls;
};

const appliesEnvPolicy = (call) => /env\s*:/.test(call) && /generatedServerEnv\s*\(|startGeneratedServer\s*\(/.test(call);

test('the allowlist strips the parent environment and keeps what a node server needs', () => {
  const canaries = {
    MWG_TRAIN_TEST_SECRET_CANARY: 'sk-live-do-not-leak-me',
    MWG_TRAIN_TEST_INNOCUOUS_CANARY: 'this-is-not-even-a-secret',
  };
  const saved = Object.fromEntries(Object.keys(canaries).map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, canaries);
    const env = generatedServerEnv();
    for (const name of Object.keys(canaries)) {
      // An innocuous canary as well as a secret-looking one: a denylist keyed on how a variable looks would pass
      // the second and fail the first, and the point of an allowlist is that appearance does not matter.
      assert.equal(env[name], undefined, `${name} must not be inherited by a generated server`);
    }
    assert.deepEqual(
      Object.keys(env).filter((name) => !GENERATED_SERVER_ENV_ALLOWLIST.includes(name)),
      [],
      'nothing outside the allowlist may pass through',
    );
    assert.equal(env.PATH, process.env.PATH, 'the allowlist keeps what a node process needs to start');
    assert.notDeepEqual(env, process.env, 'the whole parent environment must not be handed over');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('the launch path starts a server without the parent environment', async () => {
  const canary = 'sk-live-the-real-spawn-path-must-not-inherit-this';
  const saved = process.env.MWG_TRAIN_TEST_SPAWN_CANARY;
  process.env.MWG_TRAIN_TEST_SPAWN_CANARY = canary;
  const dir = mkdtempSync(join(tmpdir(), 'generated-env-'));
  const envFile = join(dir, 'child-env.json');
  writeFileSync(
    join(dir, 'server.mjs'),
    `import { writeFileSync } from 'node:fs';\n` +
      `writeFileSync(${JSON.stringify(envFile)}, JSON.stringify(process.env));\n` +
      `// Stay alive so the test can check the process group, exactly as a real server does.\n` +
      `setTimeout(() => {}, 10000);\n`,
  );
  let child = null;
  try {
    child = startGeneratedServer({ projectDir: dir, port: 0, dbPath: join(dir, 'x.sqlite') });
    const deadline = Date.now() + 10_000;
    while (!existsSync(envFile) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.ok(existsSync(envFile), 'the generated server ran and reported its environment');
    const childEnv = JSON.parse(readFileSync(envFile, 'utf8'));
    assert.equal(childEnv.MWG_TRAIN_TEST_SPAWN_CANARY, undefined, 'the canary must not reach the generated server');
    assert.equal(childEnv.PATH, process.env.PATH, 'PATH still reaches it, so this strips rather than empties');
    // detached is load-bearing: it is what lets a caller kill the whole process tree. Asserted through the group
    // rather than by reading the option back, so removing it fails here instead of leaking servers in production.
    assert.doesNotThrow(() => process.kill(-child.pid, 0), 'the server must be its own process group leader');
  } finally {
    if (child?.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }
    if (saved === undefined) delete process.env.MWG_TRAIN_TEST_SPAWN_CANARY;
    else process.env.MWG_TRAIN_TEST_SPAWN_CANARY = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every call site that starts a generated server applies the policy', () => {
  const offenders = [];
  const files = [];
  for (const dir of SCANNED_DIRS) {
    for (const name of readdirSync(join(ROOT, dir), { recursive: true })) {
      const relative = `${dir}/${name}`;
      if (!relative.endsWith('.mjs')) continue;
      files.push(relative);
    }
  }
  for (const relative of files.sort()) {
    const callSites = startsGeneratedServer(readFileSync(join(ROOT, relative), 'utf8'));
    if (callSites.length === 0) continue;
    const exempt = KNOWN_UNFIXED[relative];
    const unfixed = callSites.filter((site) => !appliesEnvPolicy(site.call));
    if (exempt) {
      // Both directions, so the list cannot rot: a fixed exception must be removed from it, or this fails.
      assert.ok(unfixed.length > 0, `${relative} is listed as a known exception (${exempt}) but now applies the policy - remove it from KNOWN_UNFIXED`);
      continue;
    }
    for (const site of unfixed) {
      offenders.push(`${relative}:${site.line}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these spawn a generated server without the environment policy (use generatedServerEnv() from src/eval/generated-server.mjs):\n  ' +
      offenders.join('\n  '),
  );

  // The scan must reach the sites it is meant to guard, or it would pass by finding nothing.
  const scanners = files.filter((relative) => startsGeneratedServer(readFileSync(join(ROOT, relative), 'utf8')).length > 0);
  assert.ok(scanners.length >= 10, `the scan should see every generated-server launch site, saw ${scanners.length}`);
});
