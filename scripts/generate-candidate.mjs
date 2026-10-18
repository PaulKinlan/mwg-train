#!/usr/bin/env node
/** Offline-only preview of the ratified tr-01 contract. No provider, ledger, app files or paid retry path. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildOfflineCandidatePrompt, candidateInterfaceSha256 } from '../src/eval/interface-candidate.mjs';
import { decodeConfig, decodeConfigSha256 } from '../src/eval/decode-config.mjs';
import { evaluationBuildKey } from '../src/eval/build-key.mjs';

const hash = (input) => createHash('sha256').update(input).digest('hex');
const FRAMEWORKS = new Set(['hono', 'raw', 'react', 'preact', 'vue', 'webcomponents', 'svelte']);

export async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!/^--[a-z-]+$/.test(key) || index + 1 >= argv.length ||
        !['family', 'framework', 'revision', 'arm', 'source', 'guidance-file', 'dry-run'].includes(key.slice(2)) ||
        key.slice(2) in args) throw new Error('CANDIDATE_OFFLINE_ONLY: unsupported or duplicate flag; --live is forbidden');
    args[key.slice(2)] = argv[index + 1];
  }
  if (args['dry-run'] !== 'true' || args.family !== 'tr-01' || !FRAMEWORKS.has(args.framework) ||
      !/^[a-f0-9]{40}$/.test(args.revision ?? '')) {
    throw new Error('CANDIDATE_OFFLINE_ONLY: --dry-run true, tr-01, supported framework and 40-hex revision required');
  }
  const source = resolve(args.source ?? '.');
  const plan = await readFile(join(source, 'docs/train/design/tr-01/plan.md'), 'utf8');
  const design = await readFile(join(source, 'docs/train/design/tr-01/design.md'), 'utf8');
  const guidance = args['guidance-file'] ? await readFile(args['guidance-file'], 'utf8') : '';
  const arm = args.arm ?? 'default';
  const prompt = buildOfflineCandidatePrompt({ plan, design, arm, guidance });
  const decode_config_sha256 = decodeConfigSha256(decodeConfig.request);
  const build_key = evaluationBuildKey({ projectId: `tr-01-${args.framework}`,
    model: decodeConfig.build_model, decodeConfigSha256: decode_config_sha256 });
  const result = { status: 'RATIFIED_OFFLINE_PREVIEW', ratified: true, provider_requests: 0,
    family: 'tr-01', framework: args.framework, arm, model: decodeConfig.build_model,
    caller_supplied_revision: args.revision, build_key, decode_config_sha256,
    interface_contract_sha256: candidateInterfaceSha256, prompt_sha256: hash(prompt), prompt };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { console.error(`candidate: ${error.code ?? 'OFFLINE_ONLY'}: ${error.message}`); process.exitCode = 1; });
}
