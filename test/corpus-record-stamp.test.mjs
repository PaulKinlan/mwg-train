import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveGeneratedAt } from '../scripts/scaffold-training-corpus.mjs';

// mwg-train-697. The record carried a generated_at stamped on every run, so re-scaffolding an unchanged corpus
// always dirtied pilot/TRAINING_CORPUS.json. `git status` on that file could then not tell "the generator
// changed and the committed record is stale" - the condition the hard-requirement test guards - from "somebody
// re-ran the scaffolder". These pin the decision that restores the signal.

const base = (stamp, sha) => ({
  generated_at: stamp,
  generator: 'scripts/scaffold-training-corpus.mjs',
  summary: { families: 30, projects: 210 },
  projects: [{ id: 'tr-01-raw', tree_sha: sha }],
});

test('an unchanged corpus keeps its previous stamp, so the file stays byte-identical', () => {
  const previous = base('2026-10-10T00:00:00.000Z', 'sha256:aaa');
  const next = base('2026-10-10T09:99:99.000Z'.replace('99', '59'), 'sha256:aaa');
  assert.equal(
    resolveGeneratedAt(previous, next),
    previous.generated_at,
    're-scaffolding an unchanged corpus must not change the recorded stamp',
  );
});

test('a corpus that actually changed gets the fresh stamp', () => {
  const previous = base('2026-10-10T00:00:00.000Z', 'sha256:aaa');
  const next = base('2026-10-10T12:00:00.000Z', 'sha256:bbb');
  assert.equal(
    resolveGeneratedAt(previous, next),
    next.generated_at,
    'a real change must be stamped, or the record would look untouched',
  );
});

test('a changed summary alone is a change', () => {
  const previous = base('2026-10-10T00:00:00.000Z', 'sha256:aaa');
  const next = { ...base('2026-10-10T12:00:00.000Z', 'sha256:aaa'), summary: { families: 31, projects: 217 } };
  assert.equal(resolveGeneratedAt(previous, next), next.generated_at);
});

test('no previous record, or a malformed one, gets the fresh stamp', () => {
  const next = base('2026-10-10T12:00:00.000Z', 'sha256:aaa');
  assert.equal(resolveGeneratedAt(null, next), next.generated_at);
  assert.equal(resolveGeneratedAt(undefined, next), next.generated_at);
  assert.equal(resolveGeneratedAt('not-an-object', next), next.generated_at);
});

test('the stamp itself is the ONLY field ignored', () => {
  const previous = base('2026-10-10T00:00:00.000Z', 'sha256:aaa');
  const next = { ...base('2026-10-10T12:00:00.000Z', 'sha256:aaa'), generator: 'someone-else.mjs' };
  assert.equal(resolveGeneratedAt(previous, next), next.generated_at, 'a changed generator must be stamped');
});
