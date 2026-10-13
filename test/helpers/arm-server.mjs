/**
 * Starting a generated arm's server from a unit test (mwg-train-pdsb).
 *
 * The capability suites execute generated projects, so they have the same problem the prober and the verifier
 * scripts had (mwg-train-6wpn, mwg-train-s1xp): the served code inherits the test process's environment unless
 * something strips it, and stripping is not enough on its own because a same-user process can read the parent's
 * environment out of /proc/<pid>/environ.
 *
 * One deliberate difference from the production launchers: unit tests have to run wherever the suite runs, including
 * a host with no bubblewrap, so this asks for the sandbox to be preferred rather than required. Where bubblewrap
 * exists the arm runs in its own PID namespace and cannot see the host; where it does not, the arm still gets the
 * allowlisted environment and the launcher says so once in the test output. A unit test that cannot start at all on
 * a developer's laptop would be a worse outcome than the one it currently is, and the fail-closed policy still
 * applies to every launcher that executes generated projects for real.
 *
 * Tests kill this child directly (`child.kill('SIGKILL')`), which is why it is not detached: the kernel tears a PID
 * namespace down with its init, so the arm's whole process tree goes with it, and a detached group that a test
 * forgot to kill would be the leak instead.
 */
import { startGeneratedServer } from '../../src/eval/generated-server.mjs';

export function startArmServer({ projectDir, port, dbPath, stdio = ['ignore', 'ignore', 'pipe'] }) {
  return startGeneratedServer({ projectDir, port, dbPath, stdio, detached: false, sandbox: 'prefer' });
}
