#!/usr/bin/env node
/** Local-only retention. Run separately after a paid run; never call the provider or execute the project. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cordonDefaultRun } from '../src/eval/default-cordon.mjs';

export function main(argv = process.argv.slice(2)) {
  const [runDir, archiveRoot] = argv;
  if (!runDir || !archiveRoot) throw new Error('usage: default-set-cordon.mjs <private-run-dir> <private-archive-root>');
  const { destination, manifest, resumed } = cordonDefaultRun({ runDir: resolve(runDir), archiveRoot: resolve(archiveRoot) });
  return { destination, resumed, project_id: manifest.project_id, status: manifest.status,
    request_id: manifest.request_id, files: manifest.files.length, excluded_from_training: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
