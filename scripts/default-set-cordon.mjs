#!/usr/bin/env node
/** Local-only retention. Run separately after a paid run; never call the provider or execute the project. */
import { resolve } from 'node:path';
import { cordonDefaultRun } from '../src/eval/default-cordon.mjs';

const [runDir, archiveRoot] = process.argv.slice(2);
if (!runDir || !archiveRoot) throw new Error('usage: default-set-cordon.mjs <private-run-dir> <private-archive-root>');
const { destination, manifest, resumed } = cordonDefaultRun({ runDir: resolve(runDir), archiveRoot: resolve(archiveRoot) });
process.stdout.write(`${JSON.stringify({ destination, resumed, project_id: manifest.project_id, status: manifest.status,
  request_id: manifest.request_id, files: manifest.files.length, excluded_from_training: true })}\n`);
