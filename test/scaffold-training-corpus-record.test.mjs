import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  TRACKED_RECORD_PATH,
  resolveRecordTarget,
  shrinkRefusal,
  writeRecordAtomically,
} from '../scripts/scaffold-training-corpus.mjs';

// mwg-train-65v. `--out <dir>` relocated the generated trees but NOT the record, so a diagnostic or partial
// run truncated the tracked pilot/TRAINING_CORPUS.json to the scoped subset. Reproduced before the fix:
// `--out /tmp/x --families tr-01` took it from 210 projects / 530632 bytes to 7 projects / 19747 bytes and
// wrote no record beside the relocated trees. These pin the two halves of the fix - relocation and the
// fail-closed shrink guard - and the end-to-end run proves it on the real script.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'scaffold-training-corpus.mjs');
const trackedRecord = () => join(ROOT, TRACKED_RECORD_PATH);

test('--out without --record puts the record beside the relocated trees', () => {
  const target = resolveRecordTarget({ outDir: '/tmp/diagnostic', outGiven: true, record: null });
  assert.equal(target.path, '/tmp/diagnostic/TRAINING_CORPUS.json');
  assert.equal(target.kind, 'relocated');
  assert.notEqual(target.path, trackedRecord(), 'a relocated run must never aim at the tracked record');
});

test('--record names the record, including the tracked one', () => {
  const explicit = resolveRecordTarget({ outDir: '/tmp/diagnostic', outGiven: true, record: 'pilot/TRAINING_CORPUS.json' });
  assert.equal(explicit.path, trackedRecord());
  assert.equal(explicit.kind, 'explicit');
});

test('neither flag means the tracked record, which is the full-corpus path', () => {
  const target = resolveRecordTarget({ outDir: join(ROOT, 'pilot/training-projects'), outGiven: false, record: null });
  assert.equal(target.path, trackedRecord());
  assert.equal(target.kind, 'tracked');
});

test('a write that would drop projects is refused, and says how to proceed', () => {
  const previous = { projects: Array.from({ length: 210 }, (_, i) => ({ project_id: `p-${i}` })) };
  const next = { projects: Array.from({ length: 7 }, (_, i) => ({ project_id: `p-${i}` })) };
  const refusal = shrinkRefusal({ previous, next, recordPath: '/repo/pilot/TRAINING_CORPUS.json' });
  assert.match(refusal, /REFUSING to write/);
  assert.match(refusal, /210 project\(s\) and this run produced 7/);
  assert.match(refusal, /--allow-shrink/);
  assert.match(refusal, /--record <file>/);
});

test('an equal or larger write is allowed, and so is a deliberate shrink', () => {
  const previous = { projects: [{ project_id: 'a' }, { project_id: 'b' }] };
  assert.equal(shrinkRefusal({ previous, next: { projects: previous.projects }, recordPath: '/repo/r.json' }), null, 'same count');
  assert.equal(shrinkRefusal({ previous, next: { projects: [...previous.projects, { project_id: 'c' }] }, recordPath: '/repo/r.json' }), null, 'grew');
  assert.equal(shrinkRefusal({ previous, next: { projects: [{ project_id: 'a' }] }, recordPath: '/repo/r.json', allowShrink: true }), null, 'explicit');
  assert.equal(shrinkRefusal({ previous: null, next: { projects: [{ project_id: 'a' }] }, recordPath: '/repo/r.json' }), null, 'no existing record');
  assert.equal(shrinkRefusal({ previous: { projects: [] }, next: { projects: [] }, recordPath: '/repo/r.json' }), null, 'both empty');
});

test('the record is written atomically and leaves no temp file behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hud-65v-atomic-'));
  try {
    const target = join(dir, 'RECORD.json');
    const record = { generated_at: 'x', projects: [{ project_id: 'a' }, { project_id: 'b' }] };
    writeRecordAtomically(target, record);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')).projects.length, 2);
    assert.deepEqual(readdirSync(dir).filter((name) => name.includes('.tmp-')), [], 'no temp file may be left behind');
    // A second write over the same path replaces it in place and is still litter-free.
    writeRecordAtomically(target, { ...record, projects: [...record.projects, { project_id: 'c' }] });
    assert.equal(JSON.parse(readFileSync(target, 'utf8')).projects.length, 3);
    assert.deepEqual(readdirSync(dir).filter((name) => name.includes('.tmp-')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a write that cannot complete fails loudly, leaves no temp file, and keeps the old record', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hud-65v-atomicfail-'));
  try {
    const target = join(dir, 'RECORD.json');
    writeRecordAtomically(target, { projects: [{ project_id: 'keep' }] });
    const before = readFileSync(target);
    const missingParent = join(dir, 'no-such-dir', 'RECORD.json');
    assert.throws(() => writeRecordAtomically(missingParent, { projects: [{ project_id: 'a' }] }), /ENOENT|no such file/i);
    assert.deepEqual(readFileSync(target), before, 'a failed write must not disturb an existing record');
    assert.deepEqual(readdirSync(dir).filter((name) => name.includes('.tmp-')), [], 'no temp file may survive a failure');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a relocated scoped run does not touch the tracked record, and leaves its record beside the trees', () => {
  // End-to-end, on the real script. The tracked file is snapshotted and restored in a finally block so this
  // test cannot itself damage the repository if it runs against a regressed script.
  const before = readFileSync(trackedRecord());
  const beforeCount = JSON.parse(before.toString('utf8')).projects.length;
  const out = mkdtempSync(join(tmpdir(), 'hud-65v-relocated-'));
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--out', out, '--families', 'tr-01'], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
    assert.match(stdout, /was NOT touched/, 'the run must say the tracked record was left alone');
    const beside = join(out, 'TRAINING_CORPUS.json');
    assert.ok(existsSync(beside), `expected a record beside the relocated trees at ${beside}`);
    assert.equal(JSON.parse(readFileSync(beside, 'utf8')).projects.length, 7);
    assert.deepEqual(readFileSync(trackedRecord()), before, 'the tracked record must be byte-identical after a relocated run');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  assert.equal(JSON.parse(readFileSync(trackedRecord(), 'utf8')).projects.length, beforeCount);
});

test('an explicitly named fuller record is not truncated by a scoped run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hud-65v-shrink-'));
  try {
    const copy = join(dir, 'TRAINING_CORPUS.json');
    copyFileSync(trackedRecord(), copy);
    const before = readFileSync(copy);
    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [SCRIPT, '--out', dir, '--record', copy, '--families', 'tr-01'], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
    } catch (error) {
      status = error.status ?? 1;
      stderr = `${error.stderr ?? ''}`;
    }
    assert.notEqual(status, 0, 'writing 7 projects over a 210-project record must fail closed');
    assert.match(stderr, /REFUSING to write/);
    assert.deepEqual(readFileSync(copy), before, 'the refused write must leave the record exactly as it was');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
