/**
 * Launching a GENERATED project's server, with the environment it is allowed to see.
 *
 * mwg-train-6wpn. Everything under pilot/ and the capability specs is generated code, and a generated project is
 * untrusted in the sense that matters here: it did not have to pass a review to run, and it executes with the
 * prober's or the verifier's privileges. Passing it the parent environment hands it every exported API key, token
 * and cloud credential in the shell that ran the check.
 *
 * This module is the one place that decision is made, so a new call site cannot make a different one by accident.
 * It closes the ENVIRONMENT half of that risk and nothing else: there is still no network isolation and no
 * filesystem confinement. That is mwg-train-i5i2.5, which names src/corpus/harness.mjs as its entry point and is
 * owned by another lane, so harness.mjs is deliberately NOT routed through here yet - see
 * test/generated-server-env.test.mjs, which records it as a named exception rather than quietly ignoring it.
 */
import { spawn } from 'node:child_process';

/**
 * An allowlist, never a denylist. A denylist has to be kept current to work, and the failure mode when it is not
 * is a secret leaving the machine rather than a test going red, so the default has to be "do not pass it".
 * PATH is kept because these scripts launch the server as `node`, and a stripped PATH would break them in a way
 * that has nothing to do with secrets. HOME is deliberately absent: the servers take an explicit --db path, and a
 * home directory is where credentials live (~/.aws, ~/.config).
 */
export const GENERATED_SERVER_ENV_ALLOWLIST = Object.freeze(['PATH', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ']);

export const generatedServerEnv = (parent = process.env) =>
  Object.fromEntries(
    GENERATED_SERVER_ENV_ALLOWLIST.filter((name) => parent[name] !== undefined).map((name) => [name, parent[name]]),
  );

/**
 * Start a generated project's server in a way a caller cannot get the environment wrong.
 *
 * `detached: true` is load-bearing rather than incidental: it puts the server in its own process group so a caller
 * can kill the whole tree with process.kill(-pid, ...). Dropping it would leak orphaned servers, and the process
 * group is not what leaks the environment, so these two decisions are independent.
 */
export function startGeneratedServer({ projectDir, port, dbPath, stdio = ['ignore', 'pipe', 'pipe'] }) {
  return spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath], {
    cwd: projectDir,
    stdio,
    detached: true,
    env: generatedServerEnv(),
  });
}
