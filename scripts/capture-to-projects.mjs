#!/usr/bin/env node
/**
 * Clean-room project generator from captured site and flow evidence.
 *
 *   node scripts/capture-to-projects.mjs --capture <capture.json> --flow <flow.json> [--framework <name>] [--out <dir>]
 *
 * Clean-room reproductions belong to public, non-trainable arm A4_clean_room_reproduction
 * and are written under the public repo's data/A4_clean_room_reproduction by default.
 * Explicit --out paths remain contained in a verified store or a test temp directory.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { translateCapture, buildCapturedProjects } from '../src/capture/translate.mjs';

function parseArgs(argv) {
  const args = { capture: null, flow: null, framework: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--capture') args.capture = argv[++i];
    else if (argv[i] === '--flow') args.flow = argv[++i];
    else if (argv[i] === '--framework') args.framework = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`capture-to-projects: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

function printUsage() {
  console.log('Usage: node scripts/capture-to-projects.mjs --capture <capture.json> --flow <flow.json> [--framework <name>] [--out <dir>]');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }
  if (!args.capture || !args.flow) {
    console.error('capture-to-projects: --capture <capture.json> and --flow <flow.json> are required');
    printUsage();
    process.exit(2);
  }

  let capture;
  try {
    capture = JSON.parse(readFileSync(resolve(args.capture), 'utf8'));
  } catch (err) {
    console.error(`capture-to-projects: cannot read capture file '${args.capture}': ${err.message}`);
    process.exit(1);
  }

  let flow;
  try {
    flow = JSON.parse(readFileSync(resolve(args.flow), 'utf8'));
  } catch (err) {
    console.error(`capture-to-projects: cannot read flow file '${args.flow}': ${err.message}`);
    process.exit(1);
  }

  const spec = translateCapture({ capture, flow });
  console.log(`capture-to-projects: translated ${spec.family_id} (${spec.title})`);

  const { specPath, projects } = buildCapturedProjects({
    spec,
    outDir: args.out,
    framework: args.framework,
  });

  console.log(`capture-to-projects: spec written to ${specPath}`);
  for (const [framework, dir] of Object.entries(projects)) {
    console.log(`capture-to-projects: built ${framework} -> ${dir}`);
  }
}

main();
