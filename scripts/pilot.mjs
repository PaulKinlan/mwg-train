#!/usr/bin/env node
/**
 * Run the pilot: every project as an original and as an uplift, measured in a real browser.
 *
 *   node scripts/pilot.mjs [--out pilot/out] [--limit N] [--only <id>] [--framework <name>] [--port N]
 *
 * By default the corpus is generated fresh from pilot/plan.json for the run, so what is measured is what
 * the generator produces now. --projects <dir> measures an existing tree instead, for debugging only.
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
import { generateCorpus } from '../pilot/generate.mjs';
import { decidePair, renderYieldReport, summarizeYield } from '../src/corpus/accept.mjs';

function parseArgs(argv) {
  // null means "generate the corpus from the plan"; a value means "measure exactly this directory".
  const args = { projects: null, out: 'pilot/out', limit: null, only: null, framework: null, keep: false, port: 4300, reportOnly: false, yield: null, docs: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--projects') args.projects = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--only') args.only = argv[++i];
    else if (argv[i] === '--framework') args.framework = argv[++i];
    else if (argv[i] === '--keep') args.keep = true;
    else if (argv[i] === '--report-only') args.reportOnly = true;
    else if (argv[i] === '--yield') args.yield = argv[++i];
    else if (argv[i] === '--docs') args.docs = argv[++i];
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/pilot.mjs [--projects <dir>] [--out <dir>] [--limit N] [--only <id>] [--framework <name>] [--port N]');
      process.exit(0);
    } else {
      console.error(`pilot: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Rewrite the pilot YIELD report from a committed yield.json. No browser, no measurement.
 *
 * The report is a view of the decisions the run recorded, so relabelling it must not require
 * re-measuring 35 pilot projects in a browser - which would also risk moving committed numbers while
 * claiming only to add a line. The renderer is the same function the run uses, so the two cannot drift.
 */
function reportFromYield(yieldPath, docsPath) {
  if (!yieldPath || !docsPath) {
    console.error('pilot: --report-only needs --yield <yield.json> --docs <YIELD.md>');
    process.exit(2);
  }
  const record = JSON.parse(readFileSync(resolve(yieldPath), 'utf8'));
  writeFileSync(
    resolve(docsPath),
    renderYieldReport({ summary: record.summary, decisions: record.decisions, runId: record.run_id, generatedAt: record.generated_at, notes: [] }),
  );
  console.log(`pilot: re-rendered ${docsPath} from ${yieldPath} (no measurement)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.reportOnly) {
    reportFromYield(args.yield, args.docs);
    return;
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = resolve(args.out, runId);
  mkdirSync(runDir, { recursive: true });

  // The corpus is generated for this run unless a directory was named explicitly. Reading a directory
  // that was scaffolded at some earlier point is how a stale corpus gets measured and then reported as
  // a corpus that cannot be reproduced: the measured tree and the verified tree have to be the same tree.
  let projectsRoot;
  if (args.projects) {
    projectsRoot = resolve(args.projects);
    console.log(`pilot: measuring the existing corpus at ${projectsRoot}`);
  } else {
    projectsRoot = resolve('.pilot-corpus', runId);
    const { projects } = generateCorpus({ outDir: projectsRoot });
    console.log(`pilot: generated ${projects.length} projects into ${projectsRoot}`);
  }

  const projectIds = readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .filter((id) => (args.only ? id === args.only : true))
    // One arm at a time: 25 projects x 2 versions x (2 journeys + 5 checks) is more than a single bound
    // should carry on a two-core box, and re-running one arm should not re-measure the others.
    .filter((id) => (args.framework ? id.endsWith(`-${args.framework}`) : true))
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

      // The uplifted copy must live inside the repository: away from the repo root, Node cannot resolve
      // `htm/react`, `preact` or `vue`, and every framework arm tied with "server did not become ready"
      // instead of being measured. Only the raw arm survived, because its page imports nothing.
      const upliftDir = join(resolve('.pilot-uplifted', runId), projectId);
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
    // One timestamp for the record and the report generated from it. Two `new Date()` calls 1ms apart
    // made the committed docs/pilot/YIELD.md disagree with the committed docs/pilot/yield.json it was
    // generated from, so a re-render looked like it had changed the evidence.
    const generatedAt = new Date().toISOString();
    writeFileSync(join(runDir, 'yield.json'), `${JSON.stringify({ run_id: runId, generated_at: generatedAt, summary, decisions }, null, 2)}\n`);
    writeFileSync(
      join(runDir, 'YIELD.md'),
      renderYieldReport({ summary, decisions, runId, generatedAt, notes }),
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
