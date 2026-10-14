import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeConfig, decodeConfigSha256, pinnedEvaluationBuildKey } from '../src/eval/decode-config.mjs';
import { evaluationBuildKey } from '../src/eval/build-key.mjs';

test('stream transport does not fork the pinned build key, but decoding knobs still do', () => {
  const pinned = decodeConfig.request;
  const transport = { ...pinned, stream: true, stream_options: { include_usage: true } };
  const before = structuredClone(transport);
  const expected = pinnedEvaluationBuildKey({ projectId: 'tr-01-hono' });
  const generated = evaluationBuildKey({ projectId: 'tr-01-hono', model: decodeConfig.build_model,
    decodeConfigSha256: decodeConfigSha256(transport) });
  assert.equal(generated, expected, 'streaming and non-streaming transport must name one build');
  assert.equal(decodeConfigSha256({ ...pinned, stream: true }), decodeConfigSha256(pinned));
  assert.equal(decodeConfigSha256({ ...pinned, stream: false, stream_options: { include_usage: false } }), decodeConfigSha256(pinned));
  const { stream: _stream, ...withoutTransport } = pinned;
  assert.equal(decodeConfigSha256(withoutTransport), decodeConfigSha256(pinned));
  assert.deepEqual(transport, before, 'normalization must not mutate the provider request');
  for (const knobs of [{ max_tokens: 16384 }, { reasoning_effort: 'low' }, { top_p: 0.95 }, { stop: ['END'] }]) {
    assert.notEqual(decodeConfigSha256({ ...transport, ...knobs }), decodeConfigSha256(pinned), JSON.stringify(knobs));
  }
});

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
