// mwg-train-6wpn, and the finding that reshaped it (mwg-train-s1xp).
//
// Stripping a child's environment is not sufficient on Linux: /proc/<pid>/environ exposes the environment block a
// process was started with, and it is readable by the same user, so generated code can walk /proc and read the
// operator's exported keys out of processes it can see. The test that matters here is therefore the third one -
// a generated server that actively tries to steal the canary from /proc and must not find it. The first two pin
// the allowlist and the launch path; the fourth scans the call sites, because the fix that started this bead
// covered one file while nine others had the same defect, and a per-file fix with no guard is how the tenth
// appears.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  GENERATED_SERVER_ENV_ALLOWLIST,
  generatedServerEnv,
  sandboxArgs,
  sandboxAvailable,
  startGeneratedServer,
} from '../src/eval/generated-server.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const CANARY = 'sk-live-the-generated-server-must-not-read-this';

// A generated server that reports what it can see: its own environment, and any process whose environment block
// carries the canary. That second part is the attack rev-1 proved, and it is why this file is not just an
// allowlist test.
function writeProbeServer(dir, reportFile, hostParentPid) {
  writeFileSync(
    join(dir, 'server.mjs'),
    `import { writeFileSync, readdirSync, readFileSync } from 'node:fs';\n` +
      `const leaked = [];\n` +
      `for (const entry of readdirSync('/proc')) {\n` +
      `  if (!/^\\d+$/.test(entry)) continue;\n` +
      `  try {\n` +
      `    const env = readFileSync('/proc/' + entry + '/environ', 'utf8');\n` +
      `    if (env.includes(${JSON.stringify(CANARY)})) leaked.push(entry);\n` +
      `  } catch {}\n` +
      `}\n` +
      `let parentEnviron = 'readable';
` +
      `try {
` +
      `  readFileSync('/proc/' + ${JSON.stringify(String(hostParentPid))} + '/environ');
` +
      `} catch (error) {
` +
      `  parentEnviron = error.code ?? 'error';
` +
      `}
` +
      `writeFileSync(${JSON.stringify(reportFile)}, JSON.stringify({\n` +
      `  parentEnviron,\n` +
      `  env: process.env,\n` +
      `  leaked,\n` +
      `  pids: readdirSync('/proc').filter((e) => /^\\d+$/.test(e)),\n` +
      `}));\n` +
      `setTimeout(() => {}, 10000);\n`,
  );
}

async function waitForFile(path, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
}

function killTree(child) {
  if (!child?.pid) return;
  // The sandbox is its own process group and its own PID namespace: killing the group removes the whole tree, and
  // the kernel removes the namespace with it, so nothing is left behind.
  for (const signal of ['SIGKILL']) {
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        process.kill(child.pid, signal);
      } catch {
        /* already gone */
      }
    }
  }
}

test('the allowlist strips the parent environment and keeps what a generated server needs', () => {
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
    assert.notDeepEqual(env, process.env, 'the whole parent environment must not be handed over');
    // HOME is where credentials live (~/.aws, ~/.config) and the servers take an explicit --db, so it never passes.
    assert.equal(env.HOME, undefined);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('the sandbox unshares a PID namespace, keeps the network, and clears the environment', () => {
  const args = sandboxArgs({ projectDir: '/tmp/p', port: 1234, dbPath: '/tmp/d/routes.sqlite' });
  // The PID namespace is the fix: without it a same-user child can read the parent's environment out of /proc.
  assert.ok(args.includes('--unshare-pid'), 'a PID namespace is what closes the /proc/<ppid>/environ channel');
  assert.ok(args.includes('--proc'), 'the namespace needs its own /proc, or the mount would show the host');
  // The network is deliberately shared: the prober and the verifiers reach these servers over localhost.
  assert.ok(!args.includes('--unshare-net'), 'unsharing the network would make the server unreachable on localhost');
  assert.ok(args.includes('--clearenv'), 'the environment block must be built, not inherited');
  assert.ok(args.includes('--die-with-parent'));
  const json = JSON.stringify(args);
  assert.ok(!json.includes(CANARY), 'no canary-shaped value may appear in the sandbox arguments');
  // The database directory is bound so the host can read back what the server wrote, and only that directory.
  const binds = args.join(' ');
  assert.ok(binds.includes('--bind /tmp/d /tmp/d'), 'the database directory is mounted for the host to read back');
  assert.ok(!binds.includes('--bind /tmp /tmp'), 'and never all of /tmp');
});

test('a generated server cannot read the operator environment out of /proc', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap is not available here; the launch path is covered on Linux');
    return;
  }
  const saved = process.env.MWG_TRAIN_TEST_SPAWN_CANARY;
  process.env.MWG_TRAIN_TEST_SPAWN_CANARY = CANARY;
  const dir = mkdtempSync(join(tmpdir(), 'generated-sandbox-'));
  const dbDir = mkdtempSync(join(tmpdir(), 'generated-sandbox-db-'));
  const reportFile = join(dir, 'report.json');
  writeProbeServer(dir, reportFile, process.pid);
  let child = null;
  try {
    child = startGeneratedServer({ projectDir: dir, port: 0, dbPath: join(dbDir, 'x.sqlite') });
    await waitForFile(reportFile);
    assert.ok(existsSync(reportFile), 'the generated server ran inside the sandbox and reported what it saw');
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    assert.equal(report.env.MWG_TRAIN_TEST_SPAWN_CANARY, undefined, 'the canary must not be in its environment');
    assert.equal(report.env.PATH, '/node/bin:/usr/bin:/bin', 'it gets the sandbox PATH, not the host one');
    // The decisive assertion, and the reason this bead was reopened: with only the environment stripped, the
    // server found the canary in the environment blocks of the processes around it.
    assert.deepEqual(report.leaked, [], 'the generated server must not be able to read the operator environment from /proc');
    // The finding's own verification, stated literally: naming the host pid must not reach the parent's environ.
    // ENOENT is the sandbox working - the pid simply does not exist in this namespace (mwg-train-s1xp).
    assert.equal(
      report.parentEnviron,
      'ENOENT',
      `reading /proc/<host parent pid>/environ must not resolve inside the sandbox, got ${report.parentEnviron}`,
    );
    // It is in its own PID namespace, so it sees the sandbox's handful of processes and not the host's hundreds.
    // The namespace contains the sandbox's own processes and not the host's: counted, because /proc also carries
    // a few dozen non-process entries (sys, net, self, ...) that made a naive entry count look like a leak.
    assert.ok(
      report.pids.length <= 5,
      `expected only the sandbox's processes in /proc, saw ${report.pids.length}: ${report.pids.slice(0, 12).join(',')}`,
    );
    assert.doesNotThrow(() => process.kill(-child.pid, 0), 'the sandbox must be its own process group leader');
  } finally {
    killTree(child);
    if (saved === undefined) delete process.env.MWG_TRAIN_TEST_SPAWN_CANARY;
    else process.env.MWG_TRAIN_TEST_SPAWN_CANARY = saved;
    rmSync(dir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  }
});

test('the launch refuses to run generated code unsandboxed rather than quietly downgrading', async () => {
  const saved = process.env.MWG_BWRAP_PATH;
  try {
    // Point the sandbox at a path that cannot exist: the launch must throw, not fall back to the host.
    process.env.MWG_BWRAP_PATH = '/nonexistent/bwrap';
    assert.throws(
      () => startGeneratedServer({ projectDir: '/tmp', port: 1, dbPath: '/tmp/x.sqlite' }),
      /Refusing to start a generated server without a sandbox/,
      'a missing sandbox must fail closed',
    );
  } finally {
    if (saved === undefined) delete process.env.MWG_BWRAP_PATH;
    else process.env.MWG_BWRAP_PATH = saved;
  }
});

// Files that start a generated server with a deliberate exception, each with the owner and the reason. An entry
// here is a debt, not an exemption: the same test fails if the file is FIXED without removing the entry, so this
// list can only shrink by someone doing the work.
const KNOWN_UNFIXED = {
  'src/corpus/harness.mjs': 'mwg-train-i5i2.5 (owner: mwg-train-hud) - the harness sandbox bead; it starts servers itself until that lands',
};

const SCANNED_DIRS = ['scripts', 'src/eval', 'src/corpus'];

// A spawn that runs a generated project's server. Matched by the argument list rather than by the option object, so
// the scan still sees a call site written in another style.
function startsGeneratedServer(text) {
  const calls = [];
  const spawnCall = /\bspawn\s*\(/g;
  let match;
  while ((match = spawnCall.exec(text)) !== null) {
    let depth = 0;
    let index = match.index + match[0].length - 1;
    let end = -1;
    for (; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') {
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
}

test('every call site that starts a generated server goes through the sandbox', () => {
  const offenders = [];
  const files = [];
  for (const dir of SCANNED_DIRS) {
    for (const name of readdirSync(join(ROOT, dir), { recursive: true })) {
      const relative = `${dir}/${name}`;
      if (relative.endsWith('.mjs')) files.push(relative);
    }
  }
  for (const relative of files.sort()) {
    const callSites = startsGeneratedServer(readFileSync(join(ROOT, relative), 'utf8'));
    if (callSites.length === 0) continue;
    const exempt = KNOWN_UNFIXED[relative];
    if (exempt) {
      // Both directions, so the list cannot rot: a fixed exception must be removed from it, or this fails.
      assert.ok(callSites.length > 0, `${relative} is listed as a known exception (${exempt})`);
      continue;
    }
    for (const site of callSites) offenders.push(`${relative}:${site.line}`);
  }
  assert.deepEqual(
    offenders,
    [],
    'these spawn a generated server directly instead of through startGeneratedServer (src/eval/generated-server.mjs), ' +
      'so the sandbox is bypassed:\n  ' + offenders.join('\n  '),
  );
});
