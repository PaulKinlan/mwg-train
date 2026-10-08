#!/usr/bin/env node
/**
 * Run the pilot: every project as an original and as an uplift, measured in a real browser.
 *
 *   node scripts/pilot.mjs [--projects pilot/projects] [--out pilot/out] [--limit N] [--only <id>] [--keep]
 *
 * For each project:
 *   1. run the original and record what the browser observed,
 *   2. apply the deterministic uplift tool to a copy,
 *   3. run the uplifted copy the same way,
 *   4. decide acceptance and write both records, the screenshots and the traces,
 * and finally write the yield report.
 *
 * One Chrome for the whole run, one project at a time: the fleet's browser rule is one at a time, and
 * the box has two cores. Everything is closed in a finally block, including on failure.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { runProjectVersion, hashTree } from '../src/corpus/harness.mjs';
import { decidePair, renderYieldReport, summarizeYield } from '../src/corpus/accept.mjs';

function parseArgs(argv) {
  const args = { projects: 'pilot/projects', out: 'pilot/out', limit: null, only: null, keep: false, port: 4300 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--projects') args.projects = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--only') args.only = argv[++i];
    else if (argv[i] === '--keep') args.keep = true;
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/pilot.mjs [--projects <dir>] [--out <dir>] [--limit N] [--only <id>] [--port N]');
      process.exit(0);
    } else {
      console.error(`pilot: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectsRoot = resolve(args.projects);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = resolve(args.out, runId);
  mkdirSync(runDir, { recursive: true });

  const projectIds = readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .filter((id) => (args.only ? id === args.only : true))
    .slice(0, args.limit ?? undefined);

  console.log(`pilot: ${projectIds.length} project(s) -> ${runDir}`);
  const chrome = await launchChrome();
  const decisions = [];
  const notes = [];
  let port = args.port;
  try {
    for (const projectId of projectIds) {
      const projectDir = join(projectsRoot, projectId);
      const spec = JSON.parse(readFileSync(join(projectDir, 'spec.json'), 'utf8'));
      const projectRunDir = join(runDir, projectId);
      mkdirSync(projectRunDir, { recursive: true });
      console.log(`pilot: ${projectId} (${spec.framework.name}) …`);

      const original = await runProjectVersion({
        chrome,
        projectDir,
        spec,
        label: 'original',
        port,
        runDir: projectRunDir,
        dbPath: join(projectRunDir, 'original.sqlite'),
      });
      port += 1;

      const upliftDir = join(runDir, 'uplifted', projectId);
      const uplift = upliftProject(projectDir, spec, upliftDir);
      const uplifted = await runProjectVersion({
        chrome,
        projectDir: upliftDir,
        spec,
        label: 'uplifted',
        port,
        runDir: projectRunDir,
        dbPath: join(projectRunDir, 'uplifted.sqlite'),
      });
      port += 1;

      const decision = decidePair({ original, uplifted, spec, uplift });
      decision.original_sha = hashTree(projectDir);
      decision.uplifted_sha = hashTree(upliftDir);
      decision.uplift_edits = uplift.edits;
      decisions.push(decision);
      writeFileSync(join(projectRunDir, 'original.json'), `${JSON.stringify(original, null, 2)}\n`);
      writeFileSync(join(projectRunDir, 'uplifted.json'), `${JSON.stringify(uplifted, null, 2)}\n`);
      writeFileSync(join(projectRunDir, 'decision.json'), `${JSON.stringify(decision, null, 2)}\n`);
      console.log(`pilot:   ${decision.accepted ? 'ACCEPTED' : `rejected (${decision.category})`}${decision.improved_rules.length ? ` improved ${decision.improved_rules.length} rule(s)` : ''}`);
    }

    const summary = summarizeYield(decisions);
    writeFileSync(join(runDir, 'yield.json'), `${JSON.stringify({ run_id: runId, generated_at: new Date().toISOString(), summary, decisions }, null, 2)}\n`);
    writeFileSync(
      join(runDir, 'YIELD.md'),
      renderYieldReport({ summary, decisions, runId, generatedAt: new Date().toISOString(), notes }),
    );
    console.log(`pilot: yield ${summary.accepted}/${summary.attempted} (${((summary.yield ?? 0) * 100).toFixed(1)}%)`);
    console.log(`pilot: report ${join(runDir, 'YIELD.md')}`);
    if (!args.keep) rmSync(join(runDir, 'uplifted'), { recursive: true, force: true });
  } finally {
    await chrome.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`pilot: FAILED - ${error.message}`);
    process.exit(1);
  });
}
