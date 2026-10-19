import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tranche = JSON.parse(readFileSync(fileURLToPath(new URL('../docs/eval/default-set-hono-tranche-2026-10-19.json', import.meta.url)), 'utf8'));
const sha256 = /^[a-f0-9]{64}$/;

test('untouched first tranche pins thirty distinct metadata-only Hono identities', () => {
  assert.equal(tranche.kind, 'untouched-default-tranche-metadata');
  assert.equal(tranche.arm, 'default');
  assert.equal(tranche.framework, 'hono');
  assert.equal(tranche.resolved_revision, 'UNVERIFIED');
  assert.equal(tranche.archive_storage, 'private local read-only; not WORM/off-VM');
  assert.equal(tranche.excluded_from_training, true);
  assert.equal(tranche.approved_for_training, false);
  assert.match(tranche.manifest_index_sha256, sha256);
  assert.equal(tranche.run_records.length, 30);
  assert.equal(tranche.manifest_index_sha256, createHash('sha256').update(tranche.run_records.map(row => `${row.family} ${row.manifest_sha256}\n`).join('')).digest('hex'));
  assert.deepEqual(tranche.run_records.map(row => row.family), Array.from({ length: 30 }, (_, index) => `tr-${String(index + 1).padStart(2, '0')}`));
  assert.equal(new Set(tranche.run_records.map(row => row.request_id)).size, 30);
  for (const row of tranche.run_records) {
    assert.equal(row.project_id, `${row.family}-hono`);
    assert.equal(row.excluded_from_training, true);
    for (const key of ['request_id', 'prompt_sha256', 'decode_config_sha256', 'interface_contract_sha256', 'plan_sha256', 'design_sha256', 'run_record_sha256', 'manifest_sha256']) assert.match(row[key], sha256, `${row.family} ${key}`);
    assert.ok(row.retained_file_count >= 1);
    assert.equal(Object.hasOwn(row, 'prompt'), false, 'never publish full prompts');
    assert.equal(Object.hasOwn(row, 'files'), false, 'never publish generated files');
  }
});

test('outcome classification separates token exhaustion from transport failures', () => {
  const ofKind = kind => tranche.run_records.filter(row => row.outcome_kind === kind);
  assert.deepEqual(tranche.counts, { success: 22, model_length: 5, transport_unevaluable: 3 });
  assert.equal(ofKind('success').length, tranche.counts.success);
  assert.deepEqual(ofKind('model-length').map(row => row.family), ['tr-14', 'tr-16', 'tr-21', 'tr-23', 'tr-28']);
  assert.deepEqual(ofKind('transport-unevaluable').map(row => row.family), ['tr-03', 'tr-08', 'tr-27']);
  for (const row of ofKind('success')) {
    assert.equal(row.status, 'SUCCESS');
    assert.equal(row.finish_reason, 'stop');
    assert.match(row.raw_response_sha256, sha256);
  }
  for (const row of ofKind('model-length')) {
    assert.equal(row.status, 'FAILED');
    assert.equal(row.finish_reason, 'length');
    assert.match(row.raw_response_sha256, sha256);
  }
  for (const row of ofKind('transport-unevaluable')) {
    assert.equal(row.status, 'FAILED');
    assert.equal(row.finish_reason, 'UNVERIFIED');
    assert.equal(row.raw_response_sha256, null);
  }
});
