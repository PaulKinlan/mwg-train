import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { derivedRunMetadata, runMetadataProblems } from '../scripts/pilot-corpus.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../pilot/CORPUS.json'), 'utf8'));
const earlier = {
  run_id: '2026-10-13T06-56-34-249Z',
  generated_at: '2026-10-13T07:00:03.510Z',
  run_kind: 'measured-pilot',
};

test('the committed 35-project corpus identifies its hash derivation separately from the older pilot', () => {
  assert.equal(manifest.projects.length, 35);
  assert.deepEqual(runMetadataProblems(manifest), []);
  assert.equal(manifest.run_kind, 'tree-hash-rederivation');
  assert.equal(manifest.measured_run_id, earlier.run_id);
  assert.equal(manifest.measured_generated_at, earlier.generated_at);
  assert.notEqual(manifest.run_id, manifest.measured_run_id);
  assert.ok(Date.parse(manifest.generated_at) > Date.parse(manifest.measured_generated_at));
  assert.match(manifest.$comment, /decisions and summary are retained.*do NOT assert.*re-derived trees/);
});

test('a re-derivation stamps the actual start and finish while retaining historical decisions', () => {
  const startedAt = '2026-10-15T01:00:00.000Z';
  const finishedAt = '2026-10-15T01:00:01.000Z';
  const metadata = derivedRunMetadata(earlier, startedAt, finishedAt);
  assert.equal(metadata.run_id, '2026-10-15T01-00-00-000Z-rederived');
  assert.equal(metadata.generated_at, finishedAt);
  assert.equal(metadata.measured_run_id, earlier.run_id);
  assert.equal(metadata.measured_generated_at, earlier.generated_at);
  assert.deepEqual(runMetadataProblems(metadata), []);
  assert.throws(() => derivedRunMetadata(earlier, finishedAt, startedAt), /invalid re-derivation/);
  assert.throws(() => derivedRunMetadata(earlier, earlier.generated_at, finishedAt), /historical measurement run/);
});

test('--record refuses a run with invented or missing generation time before touching the manifest', () => {
  const temp = mkdtempSync(join(tmpdir(), 'pilot-corpus-bad-stamp-'));
  try {
    writeFileSync(join(temp, 'yield.json'), JSON.stringify({ run_id: 'not-a-run', generated_at: 'later', decisions: [] }));
    const before = readFileSync(join(import.meta.dirname, '../pilot/CORPUS.json'));
    const result = spawnSync(process.execPath, ['scripts/pilot-corpus.mjs', '--record', temp], {
      cwd: join(import.meta.dirname, '..'), encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to record - the measured run has no valid run_id or generated_at/);
    assert.deepEqual(readFileSync(join(import.meta.dirname, '../pilot/CORPUS.json')), before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('mislabelled or missing run lineage fails closed rather than treating re-derived hashes as a measured run', () => {
  assert.match(runMetadataProblems({ ...earlier, run_kind: undefined }).join(' '), /unrecognized run_kind/);
  assert.deepEqual(runMetadataProblems({ ...earlier, run_kind: undefined }, { allowLegacy: true }), [],
    'only the one-time legacy re-derivation path can read a pre-marker manifest');
  const derived = derivedRunMetadata(earlier, '2026-10-15T01:00:00.000Z', '2026-10-15T01:00:01.000Z');
  for (const changed of [
    { ...derived, run_id: earlier.run_id },
    { ...derived, generated_at: earlier.generated_at },
    { ...derived, measured_run_id: undefined },
    { ...derived, run_id: '2027-01-01T00-00-00-000Z-rederived' },
    { ...derived, measured_generated_at: derived.generated_at },
    { ...earlier, run_kind: 'measured-pilot', measured_run_id: earlier.run_id },
  ]) assert.ok(runMetadataProblems(changed).length > 0, JSON.stringify(changed));
});
