#!/usr/bin/env node
/** Offline only: plan the one-framework default slice without a provider or project write. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProject } from '../src/eval/generator.mjs';
import { decodeConfig } from '../src/eval/decode-config.mjs';
import { RATIFIED_TR01_INTERFACE_SHA256 } from '../src/eval/interface-contract.mjs';
import familyPins from '../docs/eval/family-interface-v1.hashes.json' with { type: 'json' };

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const manifestPath = resolve(root, 'docs/eval/default-set-hono-slice.json');
export function validateSlice(manifest) {
  const first = Array.from({ length: 30 }, (_, index) => `tr-${String(index + 1).padStart(2, '0')}`);
  const extension = Array.from({ length: 9 }, (_, index) => `tr-${String(index + 31).padStart(2, '0')}`);
  if (manifest.schema_version !== 1 || manifest.arm !== 'default' || manifest.framework !== 'hono' ||
      manifest.purpose !== 'untouched-default-comparator' || manifest.excluded_from_training !== true ||
      manifest.guidance !== 'none' || manifest.uplift !== 'none' ||
      JSON.stringify(manifest.initial_families) !== JSON.stringify(first) ||
      JSON.stringify(manifest.reserved_extension_families) !== JSON.stringify(extension)) {
    throw new Error('DEFAULT_SLICE_INVALID: expected unguided, excluded-from-training Hono tr-01..tr-30 plus reserved tr-31..tr-39');
  }
  return first;
}

export async function preflight({ manifest = JSON.parse(readFileSync(manifestPath, 'utf8')),
  revision, sourceRoot = root, generate = generateProject } = {}) {
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) throw new Error('expected caller-supplied 40-character revision');
  const families = validateSlice(manifest);
  const rows = [];
  for (const family of families) {
    const result = await generate({ family, framework: manifest.framework, model: decodeConfig.build_model,
      revision, arm: 'default', backend: 'stub', dryRun: true, guidance: '', sourceRoot });
    if (result.status !== 'DRY_RUN' || result.interface_contract_sha256 !==
        (family === 'tr-01' ? RATIFIED_TR01_INTERFACE_SHA256 : familyPins.sha256[family])) {
      throw new Error(`DEFAULT_PREFLIGHT_FAILED: ${family} did not dry-run with a pinned interface`);
    }
    rows.push({ family, framework: manifest.framework, prompt_sha256: result.prompt_sha256,
      decode_config_sha256: result.decode_config_sha256, interface_contract_sha256: result.interface_contract_sha256,
      status: result.status });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const revision = process.argv[2];
  preflight({ revision }).then((rows) => process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`),
    (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
