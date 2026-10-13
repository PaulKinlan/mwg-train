#!/usr/bin/env node
/** Offline by default. --live remains fail-closed until owner authorisation, exact SKU quote and
 * conservative token bound exist; generated source is only written as data, never executed here.
 */
import { readFile } from 'node:fs/promises';
import { generateProject } from '../src/eval/generator.mjs';

function options(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!/^--[a-z-]+$/.test(key) || index + 1 >= argv.length) throw new Error(`expected --name value, got ${key}`);
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = options(argv);
  const backend = args.live === 'true' ? 'live' : 'stub';
  const canned = args['stub-file'] ? JSON.parse(await readFile(args['stub-file'], 'utf8')) : undefined;
  const batches = args.batch ? JSON.parse(await readFile(args.batch, 'utf8')) : [{ family: args.family, framework: args.framework }];
  if (!Array.isArray(batches) || batches.length === 0 || batches.length > 210) throw new Error('batch must contain 1-210 project identities');
  const records = [];
  for (const row of batches) {
    const result = await generateProject({ family: row.family, framework: row.framework, model: args.model,
      revision: args.revision, arm: args.arm ?? 'default', backend, dryRun: args['dry-run'] === 'true',
      outRoot: args.out ?? '.generated-runs', sourceRoot: args.source ?? '.', canned,
      retry: args.retry === 'true' });
    records.push({ project_id: row.family && row.framework ? `${row.family}-${row.framework}` : 'INVALID',
      status: result.status, build_key: result.build_key, output_dir: result.output_dir, error: result.error ?? null });
    // A failed batch is resumable by reusing the same command; never silently retry a paid call.
    if (result.status === 'FAILED') break;
  }
  process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
  if (records.some((record) => record.status === 'FAILED')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { console.error(`generate: ${error.code ?? 'ERROR'}: ${error.message}`); process.exitCode = 1; });
}
