#!/usr/bin/env node
/**
 * Write the pilot's projects from the archetype x framework plan.
 *
 *   node scripts/scaffold-pilot.mjs [--out pilot/projects] [--plan pilot/plan.json]
 *
 * The plan is data, so the corpus's composition (which archetype in which framework, with which
 * seeded defects) is reviewable in one file rather than implied by twenty directories. Every project
 * is generated from the same builder, which is what makes the measured difference attributable to the
 * uplift rule and not to project-to-project drift.
 */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { generateCorpus } from '../pilot/generate.mjs';

function main() {
  const argv = process.argv.slice(2);
  let out = 'pilot/projects';
  let planPath = 'pilot/plan.json';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--plan') planPath = argv[++i];
    else if (argv[i] === '--clean') rmSync(resolve(out), { recursive: true, force: true });
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/scaffold-pilot.mjs [--out <dir>] [--plan <file>] [--clean]');
      process.exit(0);
    }
  }

  const { projects, byFramework } = generateCorpus({ planPath, outDir: out });
  console.log(`scaffold-pilot: wrote ${projects.length} projects to ${out}`);
  console.log(`scaffold-pilot: frameworks ${JSON.stringify(byFramework)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
