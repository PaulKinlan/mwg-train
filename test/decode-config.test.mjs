import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeConfig, decodeConfigSha256, pinnedEvaluationBuildKey } from '../src/eval/decode-config.mjs';
import { evaluationBuildKey } from '../src/eval/build-key.mjs';

test('the pinned Fireworks decoding policy identifies itself by the effective request digest', () => {
  assert.equal(decodeConfig.request.max_tokens, 65536);
  assert.equal(decodeConfig.request.reasoning_effort, 'high');
  assert.equal(Object.hasOwn(decodeConfig.request, 'temperature'), false);
  assert.equal(decodeConfig.retrieved_at, '2026-10-13');
  assert.ok(decodeConfig.sources.every((source) => source.url.startsWith('https://')));
  const key = pinnedEvaluationBuildKey({ projectId: 'tr-01-hono' });
  assert.equal(key, `tr-01-hono@fireworks/deepseek-v4p1-flash@decode-sha256:${decodeConfigSha256()}`);
  assert.notEqual(decodeConfigSha256({ ...decodeConfig.request, max_tokens: 16384 }), decodeConfigSha256());
  assert.notEqual(evaluationBuildKey({ projectId: 'tr-01-hono', model: decodeConfig.build_model, decodeConfigSha256: 'a'.repeat(64) }), key);
  assert.throws(() => pinnedEvaluationBuildKey({ projectId: 'tr-01-hono', model: 'other/model' }), /model does not match/);
  assert.throws(() => evaluationBuildKey({ projectId: 'tr-01-hono', model: decodeConfig.build_model }), /missing exact decode-config/);
});
