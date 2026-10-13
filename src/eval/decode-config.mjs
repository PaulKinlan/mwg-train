import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluationBuildKey } from './build-key.mjs';

const path = new URL('../../docs/eval/decode-config.deepseek-flash.json', import.meta.url);
export const decodeConfig = JSON.parse(readFileSync(path, 'utf8'));

// Hash only the effective request knobs: notes and retrieval metadata may improve without silently re-keying a run.
export function decodeConfigSha256(config = decodeConfig.request) {
  const canonical = Object.fromEntries(Object.keys(config).sort().map((key) => [key, config[key]]));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function pinnedEvaluationBuildKey({ projectId, model = decodeConfig.build_model } = {}) {
  if (model !== decodeConfig.build_model) throw new Error('decode config: model does not match the pinned provider model');
  return evaluationBuildKey({ projectId, model, decodeConfigSha256: decodeConfigSha256() });
}
