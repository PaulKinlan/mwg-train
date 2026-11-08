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

import { CORPUS_SANDBOX_MECHANISM } from '../src/corpus/sandbox.mjs';
import {
  GENERATED_SERVER_ENV_ALLOWLIST,
  GENERATED_SERVER_SANDBOX_MECHANISM,
  generatedServerEnv,
  sandboxArgs,
  sandboxAvailable,
  serverArgv,
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
  assert.ok(!binds.includes('--ro-bind ' + ROOT + ' ' + ROOT), 'a project outside the repository needs no repository mount');
});

test('a harness inside the repository can walk up to its own inputs', () => {
  // A generated harness finds its inputs by walking up from its directory - the archetype board harness looks for
  // assets/archetypes/<id>/images that way - so a project inside the repository needs the repository mounted
  // read-only, with the project itself read-write on top. Without this the walk stops at the sandbox's empty root
  // and the harness returns 404 for a board it can serve on the host (mwg-train-pdsb).
  const insideRepo = sandboxArgs({ projectDir: ROOT + '/pilot/out/o3t-assets-x', port: 1 }).join(' ');
  assert.ok(insideRepo.includes(`--ro-bind ${ROOT} ${ROOT}`), 'the repository is mounted for in-repo projects');
  assert.ok(
    insideRepo.indexOf(`--ro-bind ${ROOT} ${ROOT}`) < insideRepo.indexOf(`--bind ${ROOT}/pilot/out/o3t-assets-x`),
    'and the project directory is mounted read-write on top of it, so the mount order keeps the project writable',
  );
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
    assert.deepEqual(child.sandboxPosture, { mechanism: GENERATED_SERVER_SANDBOX_MECHANISM, optIn: null },
      'the handle the real launch returns states the containment the launch enforced (mwg-train-hogz)');
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

test('the server argument list is built from what the caller actually passes', () => {
  // The eval fixtures start a server that announces its own port, so "no port" and "no database" are legitimate
  // shapes rather than omissions (mwg-train-pdsb). A caller that passes neither gets a bare server.mjs.
  assert.deepEqual(serverArgv({ port: 1234, dbPath: '/tmp/d/routes.sqlite' }), ['server.mjs', '--port', '1234', '--db', '/tmp/d/routes.sqlite']);
  assert.deepEqual(serverArgv({ port: 1234 }), ['server.mjs', '--port', '1234']);
  assert.deepEqual(serverArgv({}), ['server.mjs']);
  // The sandbox's argv names the script exactly once: serverArgv already starts with it, and spreading it after a
  // hard-coded copy ran the server as `node server.mjs server.mjs --port ...` (a stray positional argument).
  const sandboxed = sandboxArgs({ projectDir: '/tmp/project', port: 1234, dbPath: '/tmp/db/routes.sqlite' });
  assert.equal(sandboxed.filter((arg) => arg === 'server.mjs').length, 1, `the script name appears once in ${sandboxed.join(' ')}`);
  assert.deepEqual(sandboxed.slice(-7), ['--', '/node/bin/node', 'server.mjs', '--port', '1234', '--db', '/tmp/db/routes.sqlite']);
  assert.deepEqual(serverArgv(), ['server.mjs']);
});

test("the test-side 'prefer' policy warns and still strips the environment where no sandbox exists", async (t) => {
  // Unit suites have to run on hosts without bubblewrap (macOS, some CI), so 'prefer' degrades to the allowlisted
  // environment instead of failing closed - loudly, because the difference is real: no PID namespace means the
  // generated server can read this process's environment out of /proc (mwg-train-s1xp).
  const savedBwrap = process.env.MWG_BWRAP_PATH;
  const savedCanary = process.env.MWG_TRAIN_TEST_PORTABLE_CANARY;
  process.env.MWG_BWRAP_PATH = '/nonexistent/bwrap';
  process.env.MWG_TRAIN_TEST_PORTABLE_CANARY = CANARY;
  const warnings = [];
  const written = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    warnings.push(String(chunk));
    return true;
  };
  let child = null;
  try {
    // No throw: that is the whole point of the portable mode.
    child = startGeneratedServer({ projectDir: '/tmp', port: 1, dbPath: '/tmp/x.sqlite', sandbox: 'prefer', spawnImpl: () => ({ pid: 0, unref() {}, on() {} }) });
    assert.ok(child, "the portable mode starts the process instead of refusing");
    assert.ok(
      warnings.some((line) => line.includes('bubblewrap not found')),
      'the fallback must say what is being given up',
    );
    const env = generatedServerEnv();
    assert.equal(env.MWG_TRAIN_TEST_PORTABLE_CANARY, undefined, 'the fallback still strips the environment');
  } finally {
    process.stderr.write = written;
    if (savedBwrap === undefined) delete process.env.MWG_BWRAP_PATH;
    else process.env.MWG_BWRAP_PATH = savedBwrap;
    if (savedCanary === undefined) delete process.env.MWG_TRAIN_TEST_PORTABLE_CANARY;
    else process.env.MWG_TRAIN_TEST_PORTABLE_CANARY = savedCanary;
  }
});

test('an unknown sandbox mode is refused rather than guessed', () => {
  assert.throws(
    () => startGeneratedServer({ projectDir: '/tmp', port: 1, dbPath: '/tmp/x.sqlite', sandbox: 'maybe' }),
    /sandbox must be 'require' or 'prefer'/,
  );
});

// mwg-train-hogz. The opt-in used to be a warning on stderr and nothing else, so a verifier that records its own
// output could not say whether generated code ran behind a PID namespace or beside the operator's processes. Each
// test below drives one branch and asserts the receipt on the handle AGAINST the launch that happened - the binary
// spawned and the environment it was given - because a receipt that is a constant would pass every one of them.
function capturingSpawn() {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: 0, unref() {}, on() {} };
  };
  return { calls, spawnImpl };
}

const withEnv = (t, values) => {
  const saved = {};
  for (const [name, value] of Object.entries(values)) {
    saved[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
};

test('a sandboxed launch reports the shared-network bubblewrap tier on the handle it returns',
  { skip: process.platform !== 'linux' ? "the sandbox branch needs Linux's bubblewrap" : false }, (t) => {
    // MWG_BWRAP_PATH only has to exist for sandboxAvailable() to pick the branch; the spawn is stubbed, so no
    // generated code runs and the assertion is about the receipt, not about a server that happened to start.
    const dir = mkdtempSync(join(tmpdir(), 'generated-receipt-bwrap-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const fakeBwrap = join(dir, 'bwrap');
    writeFileSync(fakeBwrap, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    withEnv(t, { MWG_BWRAP_PATH: fakeBwrap });
    const { calls, spawnImpl } = capturingSpawn();
    const child = startGeneratedServer({ projectDir: dir, port: 1, dbPath: join(dir, 'x.sqlite'), spawnImpl });
    assert.deepEqual(child.sandboxPosture, { mechanism: GENERATED_SERVER_SANDBOX_MECHANISM, optIn: null });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, fakeBwrap, 'the disclosed mechanism must be the process that was launched');
    assert.ok(calls[0].args.includes('--unshare-pid'), 'and it must be the namespace that contains the server');
  });

test('the eval launch and the corpus launch name distinct containment tiers (mwg-train-7nji)',
  { skip: process.platform !== 'linux' ? "the sandbox branch needs Linux's bubblewrap" : false }, (t) => {
    // Both launchers run bubblewrap, and stamping plain 'bubblewrap' for both made a verification report, a step-4
    // receipt and a corpus row unable to say which containment they described: the corpus launcher unshares every
    // namespace and mounts no repository, while this one keeps the host network namespace - the prober reaches the
    // server over loopback - and mounts the repository read-only for in-repo projects.
    const dir = mkdtempSync(join(tmpdir(), 'generated-receipt-tier-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const fakeBwrap = join(dir, 'bwrap');
    writeFileSync(fakeBwrap, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    withEnv(t, { MWG_BWRAP_PATH: fakeBwrap });
    const { calls, spawnImpl } = capturingSpawn();
    const child = startGeneratedServer({ projectDir: dir, port: 1, dbPath: join(dir, 'x.sqlite'), spawnImpl });

    // The two receipts a run can carry, pinned literally: renaming either tier has to be a reviewed decision, not a
    // quiet drift that puts the two postures back under one label.
    assert.equal(child.sandboxPosture.mechanism, 'bubblewrap-shared-net');
    assert.equal(CORPUS_SANDBOX_MECHANISM, 'bubblewrap');
    assert.notEqual(
      child.sandboxPosture.mechanism,
      CORPUS_SANDBOX_MECHANISM,
      'a report that reads the same string for both tiers cannot distinguish a fully isolated run from an eval run',
    );

    // And the name has to describe the launch rather than decorate it: the network namespace is NOT unshared here,
    // which is exactly what the corpus tier does unshare.
    assert.ok(!calls[0].args.includes('--unshare-net'), 'the shared-network tier must not unshare the network');
    assert.ok(!calls[0].args.includes('--unshare-all'), "and must not claim the corpus tier's namespace set");
  });

test('an opted-in host launch names the variable that allowed it, not just an unsandboxed process', (t) => {
  withEnv(t, { MWG_BWRAP_PATH: '/nonexistent/bwrap', MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER: '1' });
  const { calls, spawnImpl } = capturingSpawn();
  const child = startGeneratedServer({ projectDir: '/tmp', port: 1, dbPath: '/tmp/x.sqlite', spawnImpl });
  assert.deepEqual(child.sandboxPosture, { mechanism: 'host-opt-in', optIn: 'MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER=1' });
  assert.equal(calls[0].command, process.execPath, 'the disclosed mechanism must be the process that was launched');
  assert.equal(
    calls[0].options.env.MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER,
    undefined,
    'the opt-in stays on the receipt, not in the generated server it describes',
  );
  assert.ok(
    calls[0].args.includes('server.mjs') && !calls[0].args.includes('--unshare-pid'),
    'and no namespace flag was passed to the process that was launched',
  );
});

test("the test-side 'prefer' fallback is a host launch with no opt-in on the receipt", (t) => {
  withEnv(t, { MWG_BWRAP_PATH: '/nonexistent/bwrap', MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER: undefined });
  const { calls, spawnImpl } = capturingSpawn();
  const child = startGeneratedServer({ projectDir: '/tmp', port: 1, dbPath: '/tmp/x.sqlite', sandbox: 'prefer', spawnImpl });
  assert.deepEqual(
    child.sandboxPosture,
    { mechanism: 'host-prefer', optIn: null },
    'a fallback that needs no variable must not claim one, and a host run must never read as bubblewrap',
  );
  assert.equal(calls[0].command, process.execPath, 'the disclosed mechanism must be the process that was launched');
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
// here is a debt, not an exemption: the test below fails when a listed file stops starting a server directly, so an
// entry cannot outlive the defect it was filed for and the list can only shrink by someone doing the work. Empty
// today (src/corpus/harness.mjs went through startCorpusSandbox); a new entry needs an owner and a reason.
const KNOWN_UNFIXED = {};

// Not debt, and not expiring by doing the work: the one launch that has to stay unsandboxed.
// test/corpus-sandbox.test.mjs runs the same generated project twice - once through the launcher, once through a
// hand-rolled spawn - and the second is the positive control. A control routed through the sandbox could not show
// that the sandbox denials mean anything, so it is exempt by path. It still has to keep matching a call site, the
// same as KNOWN_UNFIXED, because a control with no unsandboxed launch is no longer a control.
const DELIBERATE_UNSANDBOXED = {
  'test/corpus-sandbox.test.mjs':
    'the positive control for the sandbox denials: an unsandboxed launch of the same project is what it measures against',
};

// The test tree is scanned too (mwg-train-pdsb): every unit suite used to launch arms with its own inline spawn, so
// the scan is what keeps a new one from quietly doing it again. The two tests that spawn a CLI with their own
// environment - test/served-routes.test.mjs driving the prober, test/capture-site.test.mjs driving a script - are
// not generated-server launches and do not match.
const SCANNED_DIRS = ['scripts', 'src/eval', 'src/corpus', 'test'];

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
  const waived = new Set();
  for (const relative of files.sort()) {
    const callSites = startsGeneratedServer(readFileSync(join(ROOT, relative), 'utf8'));
    if (callSites.length === 0) continue;
    if (KNOWN_UNFIXED[relative] || DELIBERATE_UNSANDBOXED[relative]) {
      waived.add(relative);
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

  // The other direction, which a file with zero matching calls could never report: a waiver whose file no longer
  // starts a generated server directly has outlived its reason. Left in place it would let that same file start one
  // again without anyone re-opening the decision, so a stale waiver fails here instead of waiting to be noticed.
  const stale = [...Object.keys(KNOWN_UNFIXED), ...Object.keys(DELIBERATE_UNSANDBOXED)].filter(
    (relative) => !waived.has(relative),
  );
  assert.deepEqual(
    stale,
    [],
    'these are waived from the sandbox scan but no longer start a generated server directly, so the waiver has ' +
      'outlived its reason and must be removed:\n  ' + stale.join('\n  '),
  );
});
