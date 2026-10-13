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
 * side channel to their environments.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

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
 * Build the bubblewrap argument list. Exported so a test can assert the sandbox flags without starting anything.
 *
 * --unshare-pid is the fix for the /proc channel: inside a new PID namespace with a fresh --proc mount, the
 * operator's processes are not in the table at all.
 * The network is deliberately NOT unshared - see the module comment.
 */
export function sandboxArgs({ projectDir, port, dbPath }) {
  const env = generatedServerEnv();
  const dbDir = dirname(dbPath);
  const args = [
    '--die-with-parent',
    '--clearenv',
    ...Object.entries(env).flatMap(([name, value]) => ['--setenv', name, String(value)]),
    '--setenv', 'PATH', '/node/bin:/usr/bin:/bin',
    '--setenv', 'HOME', '/tmp',
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
  args.push('--tmpfs', '/tmp');
  args.push('--bind', projectDir, projectDir);
  // The database has to be visible to the host, which reads it back after the run, so its directory is bound
  // read-write at the same path. Only that directory, never all of /tmp: a per-run directory is what makes that
  // possible, since the host has to see the same file the server wrote.
  if (dbDir !== projectDir) args.push('--bind', dbDir, dbDir);
  args.push('--dev', '/dev', '--proc', '/proc', '--chdir', projectDir);
  args.push('--', '/node/bin/node', 'server.mjs', '--port', String(port), '--db', dbPath);
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
export function startGeneratedServer({
  projectDir,
  port,
  dbPath,
  stdio = ['ignore', 'pipe', 'pipe'],
  detached = true,
  spawnImpl = spawn,
}) {
  if (sandboxAvailable()) {
    // bubblewrap itself is spawned with the same allowlist, not the parent environment. It is PID 1 inside the new
    // PID namespace and therefore visible in the sandbox's /proc: with the full environment inherited, a generated
    // server read the canary straight out of /proc/1/environ (caught by test/generated-server-env.test.mjs). The
    // child's environment is built explicitly by --clearenv and --setenv, so bwrap needs almost nothing of its own.
    return spawnImpl(bwrapPath(), sandboxArgs({ projectDir, port, dbPath }), {
      cwd: projectDir,
      stdio,
      detached,
      env: generatedServerEnv(),
    });
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
  return spawnImpl(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath], {
    cwd: projectDir,
    stdio,
    detached,
    env: generatedServerEnv(),
  });
}
