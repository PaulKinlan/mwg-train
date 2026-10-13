/**
 * Launching a GENERATED project's server, inside a sandbox.
 *
 * mwg-train-6wpn, and the reason this file is not just an environment allowlist:
 *
 * Stripping the child's environment is necessary and NOT sufficient. On Linux /proc/<pid>/environ exposes the
 * environment block a process was started with, and it is world-readable to the same user, so a generated server
 * can walk /proc and read the operator's exported API keys out of any process it can see - the prober's own
 * parent, the lane's shell, the agent that started the run. Measured: with the environment stripped and no
 * sandbox, a generated server found the canary in 2 of the 272 processes visible to it (mwg-train-s1xp, found by
 * rev-1). This module therefore runs the server under bubblewrap with its own PID namespace, where /proc shows
 * only the sandbox: measured 0 of 56, and the canary is unreachable.
 *
 * What this does cover: the environment (an allowlist, and a clean environment block via --clearenv), and process
 * isolation - the generated code cannot see or signal the operator's processes, and /proc cannot be used as a
 * side channel to their environments. /tmp has a bounded tmpfs. V8 old-space has a configured heap mitigation,
 * but this launcher does not attach a memory cgroup even if host delegation becomes available. It always reports
 * 'heap-only' and warns that RSS is NOT contained; a separate host-owner implementation is required for that.
 *
 * What it does NOT cover, deliberately and visibly: network isolation. The prober and the verifier scripts reach
 * these servers over localhost HTTP, so the network namespace stays shared. There is also no attempt to confine
 * the filesystem beyond /proc, /dev and /tmp: only the project, its database and the node runtime are mounted,
 * but a server that can reach the network can still exfiltrate what it can read. The full sandbox - no network,
 * no host filesystem, Linux and macOS, fail closed - is mwg-train-i5i2.5 (owner: mwg-train-hud), which names
 * src/corpus/harness.mjs as its entry point. That bead is the authority for the stronger guarantee; this module
 * is the enforcement for the launch sites that bead does not cover, and it does not claim its guarantees.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedDeviceArgs } from '../sandbox/devices.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const TMPFS_BYTES = 64 * 1024 * 1024;
const DEFAULT_MEMORY_MB = 512;

/** Mitigation only: V8 old-space does NOT bound RSS, Buffers/native allocations or child processes. */
export function generatedServerMemoryMb(value = process.env.MWG_GENERATED_SERVER_MEMORY_MB) {
  if (value === undefined) return DEFAULT_MEMORY_MB;
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 64 || Number(value) > 4096) {
    throw new Error('MWG_GENERATED_SERVER_MEMORY_MB must be an integer from 64 to 4096');
  }
  return Number(value);
}
const heapOption = (memoryMb) => `--max-old-space-size=${memoryMb}`;

function memoryStatus(child, memoryMb, hasPrivateTmp) {
  // Host cgroup modification is explicitly prohibited on this deployment VM. No access checks or writes to
  // /sys/fs/cgroup here; an operator must provide a separately delegated/atomic mechanism for RSS limits.
  child.memoryContainment = { mode: 'heap-only', rssContained: false, nodeHeapMb: memoryMb,
    tmpfsBytes: hasPrivateTmp ? TMPFS_BYTES : null,
    reason: 'no host cgroup attachment: V8 old-space and private /tmp limits are mitigations only' };
  process.stderr.write(`WARNING: generated-server RSS is NOT contained: V8 old-space configured to ${memoryMb}MB` +
    `${hasPrivateTmp ? ', private /tmp at 64MB' : ', no private /tmp'}; native Buffers and subprocesses remain unbounded.\n`);
  return child;
}

/** Set MWG_BWRAP_PATH to test against a different bubblewrap build. */
export const bwrapPath = () => process.env.MWG_BWRAP_PATH ?? '/usr/bin/bwrap';

/**
 * A sandbox requires bubblewrap and Linux. macOS has no bubblewrap, which is one of the reasons the full
 * sandboxing bead spans both platforms with its own mechanism.
 */
export const sandboxAvailable = () => process.platform === 'linux' && existsSync(bwrapPath());

/**
 * An allowlist, never a denylist. A denylist has to be kept current to work, and the failure mode when it is not
 * is a secret leaving the machine rather than a test going red, so the default has to be "do not pass it".
 * PATH is set separately inside the sandbox (to the mounted runtime), so it is not in this list. HOME is
 * deliberately absent: the servers take an explicit --db path, and a home directory is where credentials live.
 */
export const GENERATED_SERVER_ENV_ALLOWLIST = Object.freeze(['TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ']);

/** The variables a generated server is allowed to inherit from the parent, as name/value pairs. */
export const generatedServerEnv = (parent = process.env) =>
  Object.fromEntries(
    GENERATED_SERVER_ENV_ALLOWLIST.filter((name) => parent[name] !== undefined).map((name) => [name, parent[name]]),
  );

// The node runtime, mounted read-only at /node inside the sandbox. Only the version directory is mounted, never
// the home directory that contains it.
const nodeRuntimeDir = () => dirname(dirname(process.execPath));

function systemBinds() {
  const binds = [];
  for (const dir of ['/usr', '/bin', '/lib', '/lib64']) {
    if (existsSync(dir)) binds.push('--ro-bind', dir, dir);
  }
  // /etc/alternatives backs some /usr/bin entries on debian-alike systems.
  if (existsSync('/etc/alternatives')) binds.push('--ro-bind', '/etc/alternatives', '/etc/alternatives');
  return binds;
}

/**
 * The generated server's own argument list. A caller that passes no port or no database gets a server that chooses
 * its own: the eval fixtures announce the port they picked on stdout, and their server needs no database path.
 */
export function serverArgv({ port, dbPath } = {}) {
  return [
    'server.mjs',
    ...(port === undefined || port === null ? [] : ['--port', String(port)]),
    ...(dbPath === undefined || dbPath === null ? [] : ['--db', dbPath]),
  ];
}

/**
 * Build the bubblewrap argument list. Exported so a test can assert the sandbox flags without starting anything.
 *
 * --unshare-pid is the fix for the /proc channel: inside a new PID namespace with a fresh --proc mount, the
 * operator's processes are not in the table at all.
 * The network is deliberately NOT unshared - see the module comment.
 */
export function sandboxArgs({ projectDir, port, dbPath, memoryMb = generatedServerMemoryMb() }) {
  const env = generatedServerEnv();
  // A caller that passes no database - the eval fixtures and the board harness start a server that keeps its own -
  // has no directory to bind, and dirname(undefined) is a crash rather than an absent argument (mwg-train-pdsb).
  const dbDir = dbPath ? dirname(dbPath) : null;
  const args = [
    '--die-with-parent',
    '--clearenv',
    ...Object.entries(env).flatMap(([name, value]) => ['--setenv', name, String(value)]),
    '--setenv', 'PATH', '/node/bin:/usr/bin:/bin',
    '--setenv', 'HOME', '/tmp',
    '--setenv', 'NODE_OPTIONS', heapOption(memoryMb),
    '--unshare-pid',
    '--unshare-uts',
    '--unshare-ipc',
    '--unshare-cgroup',
    '--ro-bind', nodeRuntimeDir(), '/node',
    ...systemBinds(),
  ];
  // The generated projects import their framework packages from the repo's node_modules, and the verifier scripts
  // symlink it into their temporary project directory. Read-only: a generated server has no reason to write it.
  const nodeModules = join(REPO_ROOT, 'node_modules');
  if (existsSync(nodeModules)) args.push('--ro-bind', nodeModules, nodeModules);
  // A private, empty /tmp: HOME points here, and it keeps the host's temporary files out of the sandbox. Mounted
  // before the binds below so that a project or database that lives under /tmp still mounts on top of it.
  args.push('--size', String(TMPFS_BYTES), '--tmpfs', '/tmp');
  // A generated harness that lives inside the repository can look for its inputs by walking up from its own
  // directory - the archetype board harness finds assets/archetypes/<id>/images that way, and the test projects are
  // created under pilot/out precisely so that walk keeps working. With only the project directory mounted that walk
  // stops at the sandbox's empty root and the harness 404s, so the repository is mounted read-only first and the
  // project directory is mounted read-write on top of it. Outside the repository - the capability suites build
  // their projects in the temporary directory - there is nothing to mount and nothing to walk to.
  if (projectDir.startsWith(REPO_ROOT + '/')) args.push('--ro-bind', REPO_ROOT, REPO_ROOT);
  args.push('--bind', projectDir, projectDir);
  // The database has to be visible to the host, which reads it back after the run, so its directory is bound
  // read-write at the same path. Only that directory, never all of /tmp: a per-run directory is what makes that
  // possible, since the host has to see the same file the server wrote.
  if (dbDir && dbDir !== projectDir) args.push('--bind', dbDir, dbDir);
  args.push(...boundedDeviceArgs(), '--proc', '/proc', '--chdir', projectDir);
  // serverArgv already begins with the script name, so it is spread once: prepending it again would run the
  // server with a stray positional argument (`node server.mjs server.mjs --port ...`), which is invisible until a
  // generated server reads its arguments by position (mwg-train-pdsb follow-up).
  args.push('--', '/node/bin/node', ...serverArgv({ port, dbPath }));
  return args;
}

/**
 * Start a generated project's server in a way a caller cannot get the sandbox wrong.
 *
 * `detached: true` is the default and is load-bearing rather than incidental: it puts the sandbox in its own
 * process group so a caller can kill the whole tree with process.kill(-pid, ...). It is not what provides the
 * isolation - the PID namespace is - but it is what keeps a run from leaking servers.
 *
 * Fails closed. If bubblewrap is missing the launch throws rather than quietly running generated code on the
 * host, because the value of this function is the guarantee, and a silent downgrade would mean the probe reported
 * a measurement it was not entitled to make. MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER=1 is the documented escape
 * hatch for a machine that genuinely cannot sandbox (macOS, some CI); it prints a warning naming what is lost.
 */
let warnedPortableFallback = false;

export function startGeneratedServer({
  projectDir,
  port,
  dbPath,
  stdio = ['ignore', 'pipe', 'pipe'],
  detached = true,
  sandbox = 'require',
  spawnImpl = spawn,
}) {
  const memoryMb = generatedServerMemoryMb();
  if (sandbox !== 'require' && sandbox !== 'prefer') {
    throw new Error(`startGeneratedServer: sandbox must be 'require' or 'prefer', got ${JSON.stringify(sandbox)}`);
  }
  if (sandboxAvailable()) {
    // bubblewrap itself is spawned with the same allowlist, not the parent environment. It is PID 1 inside the new
    // PID namespace and therefore visible in the sandbox's /proc: with the full environment inherited, a generated
    // server read the canary straight out of /proc/1/environ (caught by test/generated-server-env.test.mjs). The
    // child's environment is built explicitly by --clearenv and --setenv, so bwrap needs almost nothing of its own.
    const child = spawnImpl(bwrapPath(), sandboxArgs({ projectDir, port, dbPath, memoryMb }), {
      cwd: projectDir,
      stdio,
      detached,
      env: generatedServerEnv(),
    });
    return memoryStatus(child, memoryMb, true);
  }
  // 'prefer' is the test-side policy (mwg-train-pdsb): the unit suites have to run on a machine with no
  // bubblewrap, so the sandbox is used when it is there and the allowlisted environment is the floor when it is
  // not. That is a warning, not a refusal - but it is said out loud once, because the difference is real: without
  // a PID namespace the generated server can read the operator's environment out of /proc.
  if (sandbox === 'prefer') {
    if (!warnedPortableFallback) {
      warnedPortableFallback = true;
      process.stderr.write(
        `WARNING: bubblewrap not found at ${bwrapPath()} on ${process.platform} - starting generated servers with the ` +
          'allowlisted environment only, with no PID namespace. Correct for unit tests on a host that cannot ' +
          'sandbox; anything that executes model-authored projects for real should run where bubblewrap exists ' +
          '(mwg-train-pdsb, mwg-train-6wpn).\n',
      );
    }
    const child = spawnImpl(process.execPath, serverArgv({ port, dbPath }), {
      cwd: projectDir,
      stdio,
      detached,
      env: { ...generatedServerEnv(), NODE_OPTIONS: heapOption(memoryMb) },
    });
    return memoryStatus(child, memoryMb, false);
  }
  if (process.env.MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER !== '1') {
    throw new Error(
      `Refusing to start a generated server without a sandbox: bubblewrap not found at ${bwrapPath()} on ${process.platform} ` +
        '(mwg-train-6wpn). Stripping the environment is not sufficient - a same-user process can read the parent\'s ' +
        'environment out of /proc/<pid>/environ. Set MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER=1 to run on the host anyway, ' +
        'accepting that the generated code can read the operator\'s environment and processes.',
    );
  }
  process.stderr.write(
    'WARNING: MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER=1 - running generated server code on the host with no PID ' +
      'namespace. It can read the operator\'s environment from /proc and can see and signal their processes.\n',
  );
  const child = spawnImpl(process.execPath, serverArgv({ port, dbPath }), {
    cwd: projectDir,
    stdio,
    detached,
    env: { ...generatedServerEnv(), NODE_OPTIONS: heapOption(memoryMb) },
  });
  return memoryStatus(child, memoryMb, false);
}
