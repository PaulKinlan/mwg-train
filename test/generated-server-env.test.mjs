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

// The launch sites this guard is answerable for, measured from the tree (2026-10-13) rather than inferred: the route
// prober, the nine verifiers, and the test-side wrapper. The guard asserts this set EXACTLY, so a site that is
// deleted, renamed, or has its import dropped fails here instead of quietly leaving the scan (mwg-train-zamd).
//
// This is the difference between a guard that reports what it saw and one that treats the absence of findings as
// coverage: the scan below can only ever find what it recognises, so the inventory is pinned separately and the
// count of files it walked is asserted too. A launch whose script name is computed into a variable, or that happens
// in a directory outside SCANNED_DIRS, is still out of a text scan's reach - the pin is what makes that loss of
// coverage loud rather than silent.
const LAUNCHER_MODULE = 'src/eval/generated-server.mjs';
const GUARD_FILE = 'test/generated-server-env.test.mjs';
const PROTECTED_LAUNCH_SITES = [
  'scripts/check-served-routes.mjs',
  'scripts/verify-checkout.mjs',
  'scripts/verify-demo.mjs',
  'scripts/verify-explainer.mjs',
  'scripts/verify-game.mjs',
  'scripts/verify-pricing-tiers.mjs',
  'scripts/verify-storefront-cart.mjs',
  'scripts/verify-survey.mjs',
  'scripts/verify-wiki.mjs',
  'scripts/verify-workspace.mjs',
  'test/helpers/arm-server.mjs',
];
const MIN_SCANNED_FILES = 190;

// The test tree is scanned too (mwg-train-pdsb): every unit suite used to launch arms with its own inline spawn, so
// the scan is what keeps a new one from quietly doing it again. The two tests that spawn a CLI with their own
// environment - test/served-routes.test.mjs driving the prober, test/capture-site.test.mjs driving a script - are
// not generated-server launches and do not match.
const SCANNED_DIRS = ['scripts', 'src/eval', 'src/corpus', 'test'];

// A spawn that runs a generated project's server. Matched by the argument list rather than by the option object, so
// the scan still sees a call site written in another style.
/**
 * Two views of a source file, because a text scan has to be careful about what it is looking at (mwg-train-c7rs).
 *
 * `code` keeps string literals and drops comments: the spawn detector needs to read the literal 'server.mjs' out of
 * an argument list. `bare` drops comments AND the contents of string and template literals, so a mention of the
 * launcher that is not a call - a commented-out line, a string handed to assert.match - cannot stand in for the call
 * itself. Newlines survive both views, so a line number stays meaningful.
 */
function scanViews(text) {
  const blank = (chunk) => chunk.replace(/[^\n]/g, ' ');
  let code = '';
  let bare = '';
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '//' || two === '/*') {
      const end = two === '//' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : two === '//' ? end : end + 2;
      code += blank(text.slice(i, stop));
      bare += blank(text.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = text[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      let j = i + 1;
      let literal = quote;
      while (j < text.length) {
        if (text[j] === '\\') {
          literal += text[j] + (text[j + 1] ?? '');
          j += 2;
          continue;
        }
        literal += text[j];
        j += 1;
        if (text[j - 1] === quote) break;
      }
      code += literal;
      bare += blank(literal);
      i = j;
      continue;
    }
    code += text[i];
    bare += text[i];
    i += 1;
  }
  return { code, bare };
}

// Spawning a generated project's server directly, however it is written: spawn, and the exec family that the first
// version of this scan did not look at. A method call such as a regular expression's .exec() is not a spawn, hence
// the lookbehind (mwg-train-c7rs).
const DIRECT_SPAWN = /(?<![.\w$])(spawn|spawnSync|execFile|execFileSync|exec)\s*\(/g;

function startsGeneratedServer(text) {
  const calls = [];
  const spawnCall = new RegExp(DIRECT_SPAWN.source, 'g');
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
    // The viewer's own CLI happens to share the filename but is not generated code - it lives at src/viewer/server.mjs
    // and two suites spawn it to check its exit codes - so a call whose path names the viewer is not a generated
    // launch. Widening the scan to the exec family made this class visible.
    if (/'viewer'/.test(call)) continue;
    calls.push({ call, line: text.slice(0, match.index).split('\n').length });
  }
  return calls;
}

test('a mention of the launcher is not a call to it, and a spawn is a spawn however it is written', () => {
  // mwg-train-c7rs: the pin asked whether the file's TEXT contains the launcher, so `// startGeneratedServer(` in a
  // comment - or inside a string handed to assert.match - stood in for a real call, and a launch rewritten as
  // execFile was invisible to a scan that only knew about spawn(). Both halves are asserted here so the bypass
  // cannot return without this test failing.
  assert.ok(!scanViews('// startGeneratedServer({ projectDir });\n').bare.includes('startGeneratedServer('), 'a commented-out call is not a call');
  assert.ok(!scanViews('assert.match(source, \'startGeneratedServer(\');\n').bare.includes('startGeneratedServer('), 'a mention inside a string is not a call');
  assert.ok(scanViews('startGeneratedServer({ projectDir });\n').bare.includes('startGeneratedServer('), 'a real call still counts');
  assert.ok(scanViews('/* startGeneratedServer({ */\nstartGeneratedServer({ projectDir });\n').bare.includes('startGeneratedServer('), 'a call after a block comment still counts');
  // The exec family launches a server just as spawn does.
  assert.equal(startsGeneratedServer("execFile(process.execPath, [join(projectDir, 'server.mjs')])").length, 1);
  assert.equal(startsGeneratedServer("spawnSync(node, [join(projectDir, 'server.mjs')])").length, 1);
  assert.equal(startsGeneratedServer("await exec(`node ${join(projectDir, 'server.mjs')}`)").length, 1);
  // A regular expression's .exec() is not a spawn, and the viewer's CLI is not generated code.
  assert.equal(startsGeneratedServer('const match = pattern.exec(text);').length, 0);
  assert.equal(startsGeneratedServer("spawnSync(node, [join(ROOT, 'src', 'viewer', 'server.mjs')])").length, 0);
});

test('every call site that starts a generated server goes through the sandbox', () => {
  const offenders = [];
  const files = [];
  for (const dir of SCANNED_DIRS) {
    for (const name of readdirSync(join(ROOT, dir), { recursive: true })) {
      const relative = `${dir}/${name}`;
      if (relative.endsWith('.mjs')) files.push(relative);
    }
  }
  const callers = [];
  for (const relative of files.sort()) {
    const { code, bare } = scanViews(readFileSync(join(ROOT, relative), 'utf8'));
    if (relative !== LAUNCHER_MODULE && relative !== GUARD_FILE && bare.includes('startGeneratedServer(')) callers.push(relative);
    // The guard's own fixtures QUOTE launch snippets in order to assert about them, so it is not scanned for real
    // launches - the same reason it is not in the caller inventory. Nothing here starts a generated server.
    const callSites = relative === GUARD_FILE ? [] : startsGeneratedServer(code);
    if (callSites.length === 0) continue;
    const exempt = KNOWN_UNFIXED[relative];
    if (exempt) {
      // Both directions, so the list cannot rot: a fixed exception must be removed from it, or this fails.
      assert.ok(callSites.length > 0, `${relative} is listed as a known exception (${exempt})`);
      continue;
    }
    for (const site of callSites) offenders.push(`${relative}:${site.line}`);
  }

  // The walk itself is asserted first: an empty or short walk would make every check below pass for the wrong reason.
  assert.ok(files.length >= MIN_SCANNED_FILES, `the scan walked only ${files.length} files, so it cannot be trusted to have seen the launch sites`);

  // The inventory, in both directions. A protected site that stops calling the launcher - or stops existing, or loses
  // the import - shows up as a missing entry; a new caller shows up as an unexpected one, which is the moment to
  // decide whether it belongs in this list.
  assert.deepEqual(callers, PROTECTED_LAUNCH_SITES, 'the set of files that launch a generated server through the sandbox changed');
  for (const site of PROTECTED_LAUNCH_SITES) {
    assert.ok(existsSync(join(ROOT, site)), `${site} is pinned as a protected launch site but no longer exists`);
    assert.match(
      scanViews(readFileSync(join(ROOT, site), 'utf8')).code,
      /from '[^']*src\/eval\/generated-server\.mjs'/,
      `${site} calls startGeneratedServer without importing it from the launcher module`,
    );
  }
  assert.deepEqual(Object.keys(KNOWN_UNFIXED), ['src/corpus/harness.mjs'], 'the exemption list is pinned too: a new bypass needs its own bead, not a new key');
  assert.deepEqual(
    offenders,
    [],
    'these spawn a generated server directly instead of through startGeneratedServer (src/eval/generated-server.mjs), ' +
      'so the sandbox is bypassed:\n  ' + offenders.join('\n  '),
  );
});
