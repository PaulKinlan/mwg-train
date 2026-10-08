#!/usr/bin/env node
/**
 * Score a brief family's arms against its target design.
 *
 *   node scripts/score-conformance.mjs [--family booking] [--framework raw] [--out docs/eval/conformance]
 *
 * For every framework in the family the pilot generates, this renders the project twice - the raw
 * build and the MWG-uplifted build - captures the browser signature of each, and scores both against
 * the family's target. The report is the three numbers the endpoint asks for per arm:
 *
 *   raw      the raw build's conformance to the target (the baseline)
 *   target   the arm's conformance to the target
 *   delta    target - raw
 *
 * Deltas are what framework comparisons use: the raw absolute depends on how hard the family is, and
 * the delta does not.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { scoreArm } from '../src/eval/conformance.mjs';
import { baselineAttributionLine } from '../src/eval/ruleset.mjs';
import { captureSignature } from '../src/eval/render.mjs';
import { TARGETS_STORAGE } from '../src/eval/targets.mjs';
import { generateCorpus, readPlan } from '../pilot/generate.mjs';

const ROOT = resolve(process.cwd());

function parseArgs(argv) {
  const args = { family: 'booking', framework: null, out: 'docs/eval/conformance', port: 4711, rerender: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--family') args.family = argv[++i];
    else if (argv[i] === '--framework') args.framework = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--rerender') args.rerender = true;
  }
  return args;
}

function resolveTarget(family) {
  const relativePath = `${TARGETS_STORAGE}/${family}/signature.json`;
  const absolutePath = join(ROOT, relativePath);
  return { relativePath, absolutePath, signature: JSON.parse(readFileSync(absolutePath, 'utf8')) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.rerender) {
    rerender(args.out);
    return;
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const target = resolveTarget(args.family);
  const runDir = mkdtempSync(join(tmpdir(), `conformance-${args.family}-`));
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const plan = readPlan();
  const projects = plan.projects.filter((project) => project.archetype === args.family && (args.framework ? project.framework === args.framework : true));
  if (projects.length === 0) throw new Error(`score-conformance: no pilot project for family '${args.family}'${args.framework ? ` and framework '${args.framework}'` : ''}`);

  const corpusRoot = resolve('.conformance-corpus', runId);
  const { projects: generated } = generateCorpus({ plan: { ...plan, projects }, outDir: corpusRoot });
  const chrome = await launchChrome();
  const results = [];
  let port = args.port;
  try {
    for (const project of generated) {
      const raw = await captureSignature({ chrome, projectDir: project.dir, port: port++, runDir });
      const upliftedDir = resolve('.conformance-uplifted', runId, project.projectId);
      upliftProject(project.dir, project.spec, upliftedDir);
      const arm = await captureSignature({ chrome, projectDir: upliftedDir, port: port++, runDir });
      const score = scoreArm({ target: target.signature, raw, arm });
      results.push({ framework: project.framework, ...score });
      console.log(`score-conformance: ${project.projectId} raw ${score.raw.toFixed(3)} -> target ${score.target.toFixed(3)} (delta ${score.delta >= 0 ? '+' : ''}${score.delta.toFixed(3)})`);
    }
  } finally {
    await chrome.close();
    rmSync(corpusRoot, { recursive: true, force: true });
    rmSync(resolve('.conformance-uplifted', runId), { recursive: true, force: true });
    rmSync(runDir, { recursive: true, force: true });
  }

  const meanDelta = results.reduce((sum, row) => sum + row.delta, 0) / results.length;
  const report = {
    family: args.family,
    target_signature: target.relativePath,
    target_sha256: createHash('sha256').update(readFileSync(target.absolutePath)).digest('hex'),
    generated_at: new Date().toISOString(),
    arms: results,
    mean_delta: Math.round(meanDelta * 10000) / 10000,
  };
  const jsonPath = join(outDir, `${args.family}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, `${args.family}.md`), renderConformanceMarkdown(report));
  console.log(`score-conformance: wrote ${jsonPath} (mean delta ${report.mean_delta})`);
}

/**
 * The conformance report as markdown, from the record alone.
 *
 * Pure so the same function renders it during a measurement run and re-renders it in `--rerender` mode
 * from the committed JSON. A generated report is a view of a measurement, and relabelling a view must
 * not be an occasion to re-measure it - re-scoring these families would re-run browser measurements and
 * could shift committed evaluation numbers while claiming only to add a line.
 */
export function renderConformanceMarkdown(report) {
  const results = report.arms;
  return [
    `# Visual conformance: ${report.family}`,
    '',
    baselineAttributionLine(),
    '',
    `Target: \`${report.target_signature}\` (sha256 \`${report.target_sha256}\`)`,
    '',
    '| framework | raw baseline | target conformance | delta | structural | geometry | controls |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (row) =>
        `| ${row.framework} | ${row.raw.toFixed(3)} | ${row.target.toFixed(3)} | ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(3)} | ` +
        `${row.axes.arm.structural.toFixed(3)} | ${row.axes.arm.geometry.toFixed(3)} | ${row.axes.arm.controls.toFixed(3)} |`,
    ),
    '',
    `Mean delta across ${results.length} framework(s): ${report.mean_delta >= 0 ? '+' : ''}${report.mean_delta.toFixed(3)}`,
    '',
  ].join('\n');
}

/** Rewrite each committed `<family>.md` from its `<family>.json`. No browser, no measurement. */
function rerender(outDir) {
  const records = readdirSync(outDir).filter((name) => name.endsWith('.json') && !name.endsWith('-identity.json'));
  if (records.length === 0) {
    console.error(`score-conformance: no <family>.json under ${outDir}; nothing to re-render`);
    process.exit(1);
  }
  for (const name of records.sort()) {
    const report = JSON.parse(readFileSync(join(outDir, name), 'utf8'));
    writeFileSync(join(outDir, name.replace(/\.json$/, '.md')), renderConformanceMarkdown(report));
    console.log(`score-conformance: re-rendered ${name.replace(/\.json$/, '.md')} from ${name} (no measurement)`);
  }
}

await main();
