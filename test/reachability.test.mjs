/**
 * Evidence-integrity checks for the reachability table.
 *
 * Written after an independent review found a cost-estimator digest whose first 16 hex characters were
 * real and whose other 48 were invented, a serving-fees digest truncated to 16 characters, rounded
 * parameter counts, and cluster rows that cited nothing at all. These tests hold the record shape that
 * makes each of those impossible to repeat, and they fail if a row stops being supported by the quote
 * printed next to it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLUSTER_TRAINABLE,
  EVIDENCE,
  FIREWORKS_TRAINABLE,
  bandFor,
  reachability,
  resolveBackendModel,
  sharedCheckpoints,
} from '../src/train/reachability.mjs';
import { validateTrainEvidence } from '../scripts/check-train-evidence.mjs';

test('the evidence records are complete and every row is quoted from the document it cites', () => {
  assert.deepEqual(validateTrainEvidence(), []);
});

test('a digest is a full 64-character sha256, never truncated or invented', () => {
  for (const [key, record] of Object.entries(EVIDENCE)) {
    assert.match(String(record.sha256), /^sha256:[a-f0-9]{64}$/, `${key} must carry a full digest`);
  }
  // The two records this check was written for: a fabricated suffix and a truncation.
  assert.equal(EVIDENCE['fireworks.cost-estimator'].sha256, 'sha256:ff6f3b30919fe51a8017bbb0314d8a309fe1d1a1c597a13134e35427355e0a22');
  assert.notEqual(EVIDENCE['fireworks.cost-estimator'].sha256, 'sha256:ff6f3b30919fe51a6c4c1b1b1a5c1a1b8f5a3b6c1a2d3e4f5a6b7c8d9e0f1a2b');
  assert.equal(EVIDENCE['fireworks.serving-fees'].sha256, 'sha256:589d38640de8545d9f65ae36067a5633ea68ad0bce1e0423874a976668b8ee88');
  assert.equal(EVIDENCE['fireworks.serving-fees'].bytes, 1493);
});

test('Fireworks rows quote their exact parameter count and flags from the estimator', () => {
  for (const model of FIREWORKS_TRAINABLE) {
    const quote = EVIDENCE[model.source].model_quotes[model.id];
    assert.ok(quote, `${model.id} has quoted evidence`);
    assert.ok(quote.includes(`"paramCount": ${model.params}`), `${model.id} quote carries the exact count`);
  }
  // The document reports exact counts, so the table does too: a rounded count is a different number.
  assert.equal(FIREWORKS_TRAINABLE.find((model) => model.id === 'qwen3-8b').params, 8_190_735_360);
  assert.equal(FIREWORKS_TRAINABLE.find((model) => model.id === 'qwen3-14b').params, 14_768_307_200);
});

test('every trainable row cites the licence it claims, from the model it names', () => {
  for (const model of FIREWORKS_TRAINABLE) {
    assert.ok(model.licence.length > 0, `${model.id} has a licence`);
    assert.match(model.licence_source.url, /^https:\/\/huggingface\.co\/api\/models\//);
    assert.equal(model.licence_source.field, 'cardData.license');
    assert.match(model.licence_source.revision, /^[a-f0-9]{40}$/);
  }
});

test('cluster rows pin a revision and the field their parameter count came from', () => {
  for (const model of CLUSTER_TRAINABLE) {
    assert.match(model.revision, /^[a-f0-9]{40}$/);
    assert.equal(model.source.field, 'safetensors.total');
    assert.match(model.source.url, /^https:\/\/huggingface\.co\/api\/models\//);
  }
  assert.equal(CLUSTER_TRAINABLE.find((model) => model.id === 'Qwen/Qwen2.5-Coder-7B-Instruct').params, 7_615_616_512);
});

test('the reachability map and shared-checkpoint resolution still agree across the two id schemes', () => {
  assert.equal(reachability('qwen3-8b').fireworks, true);
  assert.equal(reachability('qwen3-8b').cluster, false, 'the cluster names owner/repo ids, so a bare Fireworks id is not a cluster id');
  assert.equal(reachability('qwen3-14b').params, 14_768_307_200);
  assert.equal(resolveBackendModel('fireworks', 'qwen3-8b'), 'qwen3-8b');
  assert.equal(resolveBackendModel('cluster', 'qwen3-8b'), 'Qwen/Qwen3-8B');
  assert.equal(resolveBackendModel('cluster', 'qwen3p5-9b'), null, 'a checkpoint only Fireworks can train is not shared');
  assert.ok(sharedCheckpoints().length >= 2);
  assert.equal(bandFor(8_190_735_360).lora_sft, 0.5);
  assert.equal(bandFor(26_000_000_000).lora_sft, 3.0);
  assert.equal(bandFor(552_000_000_000).lora_sft, 10.0, 'the teacher-class model is twenty times the price per token');
});
