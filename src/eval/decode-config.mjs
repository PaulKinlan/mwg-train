import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluationBuildKey } from './build-key.mjs';

const path = new URL('../../docs/eval/decode-config.deepseek-flash.json', import.meta.url);
export const decodeConfig = JSON.parse(readFileSync(path, 'utf8'));

// Build identity hashes decoding knobs, not delivery: stream and stream_options only change
// how the response arrives (and whether usage accompanies chunks), not the requested tokens.
// Keep the full original request in the run record; this projection is only for its build key.
const TRANSPORT_ONLY = new Set(['stream', 'stream_options']);
export function decodeConfigSha256(config = decodeConfig.request) {
  const canonical = Object.fromEntries(Object.keys(config).filter((key) => !TRANSPORT_ONLY.has(key)).sort().map((key) => [key, config[key]]));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function pinnedEvaluationBuildKey({ projectId, model = decodeConfig.build_model } = {}) {
  if (model !== decodeConfig.build_model) throw new Error('decode config: model does not match the pinned provider model');
  return evaluationBuildKey({ projectId, model, decodeConfigSha256: decodeConfigSha256() });
}
