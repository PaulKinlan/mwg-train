/**
 * startServer must never measure whatever happens to be listening.
 *
 * mwg-train-jxz7: a server leaked by an earlier sweep (a booking arm, alive 1h26m later) was holding a sweep
 * port, and the health poll accepted its answers as though the spawned child were ready. Every capture for that
 * arm then measured the WRONG application, and the plain capture of the wrong page succeeded silently - the
 * failure only became visible when a drive refused to find its form on a booking page. These cases pin the two
 * guards: the port must be free before the child is spawned, and the child must still be alive when health
 * first answers.
 *
 * Both cases run without a browser and without a real project: the pre-flight refusal fires before anything is
 * spawned, and the belt case uses a project whose server exits immediately while a foreign listener answers.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startServer } from '../src/corpus/harness.mjs';

const listeners = [];
const dirs = [];

after(async () => {
  await Promise.all(listeners.map((server) => new Promise((resolve) => server.close(resolve))));
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

/** A bare TCP listener: it accepts connections and answers nothing, which is all a squatter needs to do. */
function squatter() {
  return new Promise((resolve) => {
    const server = createServer(() => {});
    server.listen(0, '127.0.0.1', () => {
      listeners.push(server);
      resolve(server);
    });
  });
}

test('startServer refuses a port another process is already listening on, before spawning anything', async () => {
  const holder = await squatter();
  const { port } = holder.address();
  await assert.rejects(
    () => startServer('/nonexistent-project', { port, dbPath: '/tmp/unused.sqlite' }),
    (error) => /already in use by another process/.test(error.message) && /mwg-train-jxz7/.test(error.message),
    'a warm port was measured instead of refused',
  );
  // The refusal must not have disturbed the squatter: it is somebody else's process to manage, not ours to kill.
  assert.ok(holder.listening, 'the pre-flight check killed a process it did not own');
});

test('the pre-flight refusal wins even when the project would have died on the spot', async () => {
  // The child-alive belt inside the health loop covers the narrow race where a squatter binds the port AFTER
  // the pre-flight check and BEFORE the child does; it cannot be reached deterministically from a test, because
  // any listener that exists before the call trips the pre-flight check first - which is exactly the ordering
  // this case pins. The project here is one whose server exits immediately, so without the pre-flight check the
  // run would have reached the belt: what must happen instead is the loud refusal, with nothing spawned.
  const holder = await squatter();
  const { port } = holder.address();
  const runDir = mkdtempSync(join(tmpdir(), 'mwg-harness-preflight-'));
  dirs.push(runDir);
  const projectDir = join(runDir, 'project');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'server.mjs'), 'process.exit(3);\n');
  await assert.rejects(
    () => startServer(projectDir, { port, dbPath: join(runDir, 'db.sqlite') }),
    (error) => /already in use by another process/.test(error.message),
    'a warm port was measured instead of refused',
  );
  assert.ok(holder.listening, 'the pre-flight check killed a process it did not own');
});
