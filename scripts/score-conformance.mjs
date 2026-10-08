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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { startServer, stopServer } from '../src/corpus/harness.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { SIGNATURE_SCRIPT, scoreArm } from '../src/eval/conformance.mjs';
import { TARGETS_STORAGE, TARGET_VIEWPORT } from '../src/eval/targets.mjs';
import { generateCorpus, readPlan } from '../pilot/generate.mjs';

const ROOT = resolve(process.cwd());

function parseArgs(argv) {
  const args = { family: 'booking', framework: null, out: 'docs/eval/conformance', port: 4711 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--family') args.family = argv[++i];
    else if (argv[i] === '--framework') args.framework = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
  }
  return args;
}

function resolveTarget(family) {
  const relativePath = `${TARGETS_STORAGE}/${family}/signature.json`;
  const absolutePath = join(ROOT, relativePath);
  return { relativePath, absolutePath, signature: JSON.parse(readFileSync(absolutePath, 'utf8')) };
}

async function capture({ chrome, projectDir, port, runDir }) {
  const server = await startServer(projectDir, { port, dbPath: join(runDir, `${port}.sqlite`) });
  const page = await chrome.newPage({ viewport: TARGET_VIEWPORT });
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSettled();
    return await page.evaluate(SIGNATURE_SCRIPT);
  } finally {
    await page.close();
    await stopServer(server);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
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
      const raw = await capture({ chrome, projectDir: project.dir, port: port++, runDir });
      const upliftedDir = resolve('.conformance-uplifted', runId, project.projectId);
      upliftProject(project.dir, project.spec, upliftedDir);
      const arm = await capture({ chrome, projectDir: upliftedDir, port: port++, runDir });
      const score = scoreArm({ target: target.signature, raw, arm });
      results.push({ framework: project.framework, ...score });
      console.log(`score-conformance: ${project.projectId} raw ${score.raw.toFixed(3)} -> target ${score.target.toFixed(3)} (delta ${score.delta >= 0 ? '+' : ''}${score.delta.toFixed(3)})`);
    }
  } finally {
    await chrome.close();
    rmSync(corpusRoot, { recursive: true, force: true });
    rmSync(resolve('.conformance-uplifted', runId), { recursive: true, force: true });
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

  const lines = [
    `# Visual conformance: ${args.family}`,
    '',
    `Target: \`${target.relativePath}\` (sha256 \`${report.target_sha256}\`)`,
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
  ];
  writeFileSync(join(outDir, `${args.family}.md`), lines.join('\n'));
  console.log(`score-conformance: wrote ${jsonPath} (mean delta ${report.mean_delta})`);
}

await main();
