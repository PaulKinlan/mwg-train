import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

// A viewer whose entire job is reading a corpus must not come up without one. It previously listened on its ports,
// served 200 on routes that looked healthy, and recorded the problem only in a log line - which is the
// reporting-success-about-something-not-examined failure these tests exist to remove. So the assertion is not that it
// starts; it is that it refuses.
test('refuses a corpus path that does not exist', () => {
  assert.throws(
    () => createViewer({ corpusRoot: join(tmpdir(), 'no-such-corpus-6h3'), stateDir: join(tmpdir(), 'state-6h3') }),
    /corpusRoot is not an existing directory/,
  );
});

test('refuses a corpus path that is a file rather than a directory', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-corpus-file-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'corpus.json');
  writeFileSync(file, '{}');
  assert.throws(() => createViewer({ corpusRoot: file, stateDir: dir }), /corpusRoot is not an existing directory/);
});

test('refuses a missing, empty or non-string corpusRoot rather than defaulting to something', () => {
  for (const value of [undefined, null, '', '   ', 42]) {
    assert.throws(() => createViewer({ corpusRoot: value, stateDir: tmpdir() }), /createViewer requires a corpusRoot path/,
      `corpusRoot ${JSON.stringify(value)} must be refused`);
  }
});

// The positive control. Without this the three assertions above would still pass if createViewer simply threw on
// everything, which would be a worse bug than the one being fixed.
test('still accepts a real corpus directory', (t) => {
  const viewer = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir: mkdtempSync(join(tmpdir(), 'viewer-corpus-ok-')) });
  t.after(() => { viewer.pool.stopAll(); viewer.server.close(); viewer.liveServer.close(); });
  assert.ok(viewer.server && viewer.liveServer, 'a real corpus must still produce a working viewer');
});

// The user-facing form of the same contract: the CLI must exit non-zero and say why, not start and serve.
test('the CLI exits non-zero and explains itself when the corpus is absent', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'src', 'viewer', 'server.mjs'), '--corpus', '/definitely/not/here', '--port', '7791', '--live-port', '7792'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 1, `expected a non-zero exit, got ${run.status}`);
  assert.match(run.stderr, /corpusRoot is not an existing directory/);
  assert.doesNotMatch(run.stdout, /reading corpus/, 'it must not claim to be reading a corpus it did not open');
});

// And a relative --corpus must resolve against the repository rather than the launcher's cwd, which is the mechanism
// behind the original bug: run from an unrelated directory, the old code resolved 'pilot' against that directory.
test('a relative corpus path resolves against the repository, not the process cwd', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'src', 'viewer', 'server.mjs'), '--corpus', 'definitely-absent-6h3'], { cwd: tmpdir(), encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, new RegExp(join(ROOT, 'definitely-absent-6h3').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the resolved path must be under the repository, not under the cwd it was launched from');
});
