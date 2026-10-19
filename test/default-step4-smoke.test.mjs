import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyArchiveFamily } from '../scripts/default-step4-smoke.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(root) {
  const requestId = 'a'.repeat(64);
  const archiveRoot = join(root, 'archive');
  const sealed = join(archiveRoot, `tr-05-hono-${requestId}`);
  const original = join(sealed, 'original');
  mkdirSync(join(original, 'project'), { recursive: true });
  const record = { project_id: 'tr-05-hono', request_id: requestId, prompt_sha256: 'b'.repeat(64), arm: 'default', backend: 'live' };
  const runBytes = Buffer.from(JSON.stringify(record));
  const serverBytes = Buffer.from('// inert fixture; never executed\n');
  writeFileSync(join(original, 'run.json'), runBytes);
  writeFileSync(join(original, 'project/server.mjs'), serverBytes);
  const manifest = { project_id: record.project_id, request_id: requestId, status: 'SUCCESS', excluded_from_training: true,
    approved_for_training: false, files: [
      { path: 'project/server.mjs', bytes: serverBytes.length, sha256: sha256(serverBytes) },
      { path: 'run.json', bytes: runBytes.length, sha256: sha256(runBytes) },
    ] };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(join(sealed, 'manifest.json'), manifestBytes);
  const row = { project_id: record.project_id, request_id: requestId, prompt_sha256: record.prompt_sha256,
    status: 'SUCCESS', outcome_kind: 'success', excluded_from_training: true, manifest_sha256: sha256(manifestBytes) };
  return { archiveRoot, original, row };
}

test('the smoke verifies a sealed success against its public hash without executing generated code', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mwg-step4-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { archiveRoot, original, row } = fixture(root);
  const result = verifyArchiveFamily({ archiveRoot, row });
  assert.equal(result.project, join(original, 'project'));
  assert.equal(result.archive_manifest_sha256, row.manifest_sha256);
  assert.equal(readFileSync(join(result.project, 'server.mjs'), 'utf8'), '// inert fixture; never executed\n');
  assert.throws(() => verifyArchiveFamily({ archiveRoot, row: { ...row, status: 'FAILED' } }), /GENERATION_QUARANTINE/);
  assert.throws(() => verifyArchiveFamily({ archiveRoot, row: { ...row, manifest_sha256: '0'.repeat(64) } }), /ARCHIVE_HASH_MISMATCH/);
  writeFileSync(join(original, 'project/server.mjs'), '// changed after sealing\n');
  assert.throws(() => verifyArchiveFamily({ archiveRoot, row }), /ARCHIVE_HASH_MISMATCH/);
});

test('the smoke refuses a symlink in a retained project, even if files look otherwise valid', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mwg-step4-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { archiveRoot, original, row } = fixture(root);
  symlinkSync(join(original, 'run.json'), join(original, 'project/alias'));
  assert.throws(() => verifyArchiveFamily({ archiveRoot, row }), /ARCHIVE_UNSAFE_FILE/);
});
