#!/usr/bin/env node
/**
 * Run live browser journeys on a stratified sample of the tr-* training corpus, and measure the
 * empirical acceptance yield of the original -> uplifted pairs.
 *
 *   node scripts/train-corpus-run.mjs [--out /tmp/bsv-run] [--records docs/train/corpus/records.json]
 *     [--limit N] [--only <id>] [--framework <name>] [--port N]
 *
 * The training corpus is PAIRS: an original (scaffolded by scripts/scaffold-training-corpus.mjs,
 * recorded with its tree hash in pilot/TRAINING_CORPUS.json) and a deterministically uplifted copy
 * (the same MWG rule bundle the pilot applies via src/corpus/uplift.mjs). This script adds the RUN
 * step, not a second scaffolder: it reads the already-scaffolded originals, re-verifies each
 * original's tree hash against the recorded one, applies the uplift tool to a copy, and drives the
 * archetype's journeys against BOTH sides in a real browser through src/corpus/cdp.mjs - exactly the
 * harness and acceptance logic scripts/pilot.mjs uses.
 *
 * Chrome is launched once and closed in a finally block (never spawned directly here); the browser
 * and its profile directory are torn down by src/corpus/cdp.mjs on close and on our own signals.
 *
 * Records are written to --records (default docs/train/corpus/records.json) with a companion
 * YIELD.md next to it, and the per-project evidence (original.json/uplifted.json/decision.json plus
 * screenshots and traces) under --out.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { runProjectVersion, hashTree } from '../src/corpus/harness.mjs';
import { decidePair, summarizeYield, validationObservation } from '../src/corpus/accept.mjs';

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CORPUS_PATH = 'pilot/TRAINING_CORPUS.json';
const PROJECTS_ROOT = 'pilot/training-projects';
const UPLIFT_ROOT = '.train-uplifted';

// The canonical framework order (matches the insertion order of pilot/frameworks.mjs FRAMEWORKS).
const FRAMEWORK_ORDER = ['hono', 'raw', 'react', 'preact', 'vue', 'webcomponents', 'svelte'];

function parseArgs(argv) {
  const args = {
    out: '/tmp/bsv-run',
    records: 'docs/train/corpus/records.json',
    limit: null,
    only: null,
    framework: null,
    port: 4300,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--records') args.records = argv[++i];
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--only') args.only = argv[++i];
    else if (argv[i] === '--framework') args.framework = argv[++i];
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error(
        'usage: node scripts/train-corpus-run.mjs [--out <dir>] [--records <file>] [--limit N] [--only <id>] [--framework <name>] [--port N]',
      );
      process.exit(0);
    } else {
      console.error(`train-corpus-run: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * The deterministic sample rule (see the "selection" block in the written records for the same text):
 *
 *   For every archetype pick its canonical GENERATE family - the generate task family with the lowest
 *   tr-id - plus every REPAIR family (tr-26..tr-30). Build an ordered slot list of
 *   [repair families x2] followed by [canonical generate families x2, in ascending tr-id order], then
 *   assign a framework to each slot by round-robin over FRAMEWORK_ORDER. This yields exactly 40
 *   projects: every one of the 15 archetypes at least twice, every one of the 7 frameworks at least
 *   four times (6/6/6/6/6/5/5), and all five repair families present (twice each) so the injected
 *   defects are browser-verified.
 */
function selectSample(corpusProjects) {
  const byId = new Map(corpusProjects.map((project) => [project.project_id, project]));

  const families = new Map();
  for (const project of corpusProjects) {
    if (!families.has(project.family_id)) {
      families.set(project.family_id, {
        family_id: project.family_id,
        task: project.task,
        archetype: project.archetype,
        brief_id: project.brief_id,
      });
    }
  }

  const repairFamilies = [...families.values()].filter((family) => family.task === 'repair').sort((a, b) => a.family_id.localeCompare(b.family_id));
  const generateFamilies = [...families.values()].filter((family) => family.task === 'generate');

  // Canonical generate family per archetype: the lowest tr-id among that archetype's generate families.
  const canonicalGenerateFamily = new Map();
  for (const family of generateFamilies.sort((a, b) => a.family_id.localeCompare(b.family_id))) {
    if (!canonicalGenerateFamily.has(family.archetype)) canonicalGenerateFamily.set(family.archetype, family);
  }
  const archetypeOrder = [...canonicalGenerateFamily.entries()]
    .sort((a, b) => a[1].family_id.localeCompare(b[1].family_id))
    .map(([archetype]) => archetype);

  // Ordered slots: repair families (2 frameworks each), then canonical generate families (2 each).
  const slots = [];
  for (const family of repairFamilies) slots.push(family, family);
  for (const archetype of archetypeOrder) {
    const family = canonicalGenerateFamily.get(archetype);
    slots.push(family, family);
  }

  const selected = slots.map((family, index) => {
    const framework = FRAMEWORK_ORDER[index % FRAMEWORK_ORDER.length];
    const projectId = `${family.family_id}-${framework}`;
    const project = byId.get(projectId);
    if (!project) throw new Error(`selection produced an unknown project id ${projectId}`);
    return project;
  });

  assertConstraints(selected, repairFamilies.map((family) => family.family_id));
  return selected;
}

/** The sample must satisfy every coord requirement, or the run refuses to start. */
function assertConstraints(selected, repairFamilyIds) {
  const errors = [];
  if (selected.length < 35 || selected.length > 42) errors.push(`sample size ${selected.length} is outside 35..42`);

  const byArchetype = {};
  const byFramework = {};
  for (const project of selected) {
    byArchetype[project.archetype] = (byArchetype[project.archetype] ?? 0) + 1;
    byFramework[project.framework] = (byFramework[project.framework] ?? 0) + 1;
  }
  for (const [archetype, count] of Object.entries(byArchetype)) {
    if (count < 2) errors.push(`archetype ${archetype} appears ${count} time(s), needs >= 2`);
  }
  for (const [framework, count] of Object.entries(byFramework)) {
    if (count < 4) errors.push(`framework ${framework} appears ${count} time(s), needs >= 4`);
  }
  const selectedFamilies = new Set(selected.map((project) => project.family_id));
  for (const familyId of repairFamilyIds) {
    if (!selectedFamilies.has(familyId)) errors.push(`repair family ${familyId} is missing from the sample`);
  }
  if (errors.length > 0) {
    throw new Error(`sample constraints violated:\n  - ${errors.join('\n  - ')}`);
  }
}

/** Did the server-persistence journey actually persist: the reload page echoes the expected value. */
function persistenceOk(record, spec) {
  const persistence = record.journeys?.find((journey) => journey.name === 'server-persistence');
  if (!persistence) return false;
  const expected = spec.echo_expect;
  if (typeof expected !== 'string' || expected === '') return false;
  return (persistence.echoedText ?? persistence.persistedText ?? '').includes(expected);
}

/** A condensed, self-contained view of one version's journeys and their pass/fail. */
function journeyResults(record, spec) {
  const journeys = [];
  const persistence = record.journeys?.find((journey) => journey.name === 'server-persistence');
  const validation = record.journeys?.find((journey) => journey.name === 'validation-failure');
  const write = record.journeys?.find((journey) => journey.name === 'write-journey');
  const content = record.journeys?.find((journey) => journey.name === 'content');

  journeys.push({
    name: 'server-persistence',
    passed: persistenceOk(record, spec),
    // What the journey actually DID, not only that it passed. Without this the committed record
    // cannot show that a select was moved off its default (`SELECT_NOT_APPLIED` would have failed
    // the run, but a reader should not have to take that on trust), and the evidence would live only
    // in the run's output directory.
    steps: (persistence?.steps ?? [])
      .filter((step) => ['fill', 'select', 'submit', 'reload', 'step', 'step-fill', 'step-select', 'step-submit'].includes(step.step))
      .map((step) => ({
        step: step.step,
        ...(step.options ? { options: step.options } : {}),
        ...(step.fields ? { fields: step.fields } : {}),
        ...(step.status !== undefined ? { status: step.status } : {}),
      })),
    detail: persistence
      ? {
          submit_status: persistence.steps?.find((step) => step.step === 'submit')?.status ?? null,
          reload_url: persistence.steps?.find((step) => step.step === 'reload')?.url ?? null,
          echoed: (persistence.echoedText ?? '').slice(0, 120),
        }
      : null,
  });

  const observation = validationObservation(record);
  journeys.push({
    name: 'validation-failure',
    passed: observation === 'refused-observed' || observation === 'blocked-without-evidence',
    observation,
  });

  if (write) {
    journeys.push({ name: 'write-journey', passed: write.posted === true && write.persisted === true, posted: write.posted, persisted: write.persisted });
  }
  if (content) {
    journeys.push({ name: 'content', passed: true, url: content.url ?? null });
  }
  return journeys;
}

/** One version's observation, reduced to the facts the yield report reasons about. */
function versionRecord(record, spec) {
  return {
    persistence_ok: persistenceOk(record, spec),
    validation_observation: validationObservation(record),
    journeys: journeyResults(record, spec),
    console_errors: record.console_errors ?? 0,
    errors: record.errors ?? [],
  };
}

function renderYieldMd({ runId, generatedAt, selection, records, summary, coverage }) {
  const percent = (value) => `${((value ?? 0) * 100).toFixed(1)}%`;
  const lines = [];
  lines.push(`# Training-corpus acceptance yield (${runId})`);
  lines.push('');
  lines.push(`Generated ${generatedAt} by \`scripts/train-corpus-run.mjs\`. ${summary.sampled_projects} sampled pairs, ${summary.journeys_run} journeys driven, ${summary.journeys_passed} passed.`);
  lines.push('');
  lines.push('The SAMPLED projects\' numbers come from records produced by driving the project in a real');
  lines.push('browser; the per-project records, screenshots and traces are under the run output directory.');
  lines.push('The unscored and total counts are scaffold records, not browser records - they say what was');
  lines.push('built, not that it was driven. No project has been shown to build or serve beyond the sample.');
  lines.push('');
  lines.push('## Selection rule');
  lines.push('');
  lines.push('For every archetype pick its canonical GENERATE family (the generate-task family with the lowest');
  lines.push('tr-id) plus every REPAIR family (tr-26..tr-30). Build the ordered slot list of `[repair x2]`');
  lines.push('then `[canonical generate x2, ascending tr-id]`, and assign a framework to each slot by round-robin');
  lines.push(`over \`${FRAMEWORK_ORDER.join(', ')}\`. The resulting sample: 40 projects, every archetype at least`);
  lines.push('twice, every framework at least four times (6/6/6/6/6/5/5), all five repair families twice each.');
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  lines.push(`| status | projects |`);
  lines.push('| --- | --- |');
  lines.push(`| scored (browser journey run) | ${coverage.scored} |`);
  lines.push(`| \`scaffolded / unverified journey\` | ${coverage.unscored} |`);
  lines.push(`| **total** | **${coverage.total}** |`);
  lines.push('');
  lines.push(`Reason: ${coverage.reason}`);
  lines.push('');
  lines.push('## Acceptance');
  lines.push('');
  lines.push(`| attempted | accepted | yield |`);
  lines.push('| --- | --- | --- |');
  lines.push(`| ${summary.acceptance.attempted} | ${summary.acceptance.accepted} | ${percent(summary.acceptance.yield)} |`);
  lines.push('');
  lines.push('## Why pairs were rejected');
  lines.push('');
  lines.push('| category | count |');
  lines.push('| --- | --- |');
  for (const [category, count] of Object.entries(summary.by_category)) {
    lines.push(`| \`${category}\` | ${count} |`);
  }
  lines.push('');
  lines.push('## Failures and their reasons');
  lines.push('');
  if (records.every((record) => record.decision.accepted)) {
    lines.push('_No failures._');
  } else {
    lines.push('| project | archetype | framework | task | category | reason |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const record of records) {
      if (record.decision.accepted) continue;
      const reason = (record.decision.detail ?? []).join('; ').replace(/\|/g, '\\|');
      lines.push(`| \`${record.project_id}\` | ${record.archetype} | ${record.framework} | ${record.task} | \`${record.decision.category}\` | ${reason} |`);
    }
  }
  lines.push('');
  lines.push('## Yield by framework');
  lines.push('');
  lines.push('| framework | accepted | attempted |');
  lines.push('| --- | --- | --- |');
  for (const [framework, counts] of Object.entries(summary.by_framework)) {
    lines.push(`| ${framework} | ${counts.accepted} | ${counts.total} |`);
  }
  lines.push('');
  lines.push('## Yield by archetype');
  lines.push('');
  lines.push('| archetype | accepted | attempted |');
  lines.push('| --- | --- | --- |');
  for (const [archetype, counts] of Object.entries(summary.by_archetype)) {
    lines.push(`| ${archetype} | ${counts.accepted} | ${counts.total} |`);
  }
  lines.push('');
  lines.push('## Every sampled project');
  lines.push('');
  lines.push('| project | family | archetype | framework | task | persistence (orig/uplift) | validation (orig/uplift) | outcome |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const record of records) {
    const p = `${record.original.persistence_ok}/${record.uplifted.persistence_ok}`;
    const v = `${record.original.validation_observation}/${record.uplifted.validation_observation}`;
    const outcome = record.decision.accepted ? '**accepted**' : `\`${record.decision.category}\``;
    lines.push(`| \`${record.project_id}\` | ${record.family_id} | ${record.archetype} | ${record.framework} | ${record.task} | ${p} | ${v} | ${outcome} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = resolve(process.cwd(), args.out, runId);
  const recordsPath = resolve(process.cwd(), args.records);
  const upliftRoot = join(REPO_ROOT, UPLIFT_ROOT, runId);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(dirname(recordsPath), { recursive: true });
  mkdirSync(upliftRoot, { recursive: true });

  const corpus = JSON.parse(readFileSync(resolve(REPO_ROOT, CORPUS_PATH), 'utf8'));
  const allProjects = corpus.projects;
  const byId = new Map(allProjects.map((project) => [project.project_id, project]));

  const selected = selectSample(allProjects);
  const selectedIds = selected
    .map((project) => project.project_id)
    .filter((id) => (args.only ? id === args.only : true))
    .filter((id) => (args.framework ? id.endsWith(`-${args.framework}`) : true))
    .slice(0, args.limit ?? undefined);

  console.log(`train-corpus-run: corpus ${allProjects.length} projects, sample ${selected.length}, running ${selectedIds.length}`);
  console.log(`train-corpus-run: originals ${resolve(REPO_ROOT, PROJECTS_ROOT)}, run dir ${runDir}`);

  // A fresh browser per project, not one for the whole run. Forty projects take about an hour, and a
  // browser that old is killed by the reaper mid-measurement (its limit is 45 minutes), so the run
  // could never finish - it died at ~30/40 twice with no result. One browser per project keeps every
  // browser well inside the limit; the startup cost is seconds against ~90 seconds of measurement.
  let chrome = null;
  const decisions = [];
  // A hard kill must not orphan a browser. Without this, a run stopped by its bound leaves Chrome
  // behind for the reaper to find minutes later, holding memory and a profile directory.
  for (const [signal, code] of [
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ]) {
    process.on(signal, () => {
      const closing = chrome ? chrome.close().catch(() => {}) : Promise.resolve();
      const leave = setTimeout(() => process.exit(code), 5000);
      leave.unref();
      closing.finally(() => process.exit(code));
    });
  }
  const records = [];
  let port = args.port;
  try {
    for (const projectId of selectedIds) {
      chrome = await launchChrome();
      const corpusEntry = byId.get(projectId);
      const projectDir = join(resolve(REPO_ROOT, PROJECTS_ROOT), projectId);
      const spec = JSON.parse(readFileSync(join(projectDir, 'spec.json'), 'utf8'));

      // The measured tree must be the recorded tree: re-derive and compare before measuring.
      const originalSha = hashTree(projectDir);
      if (originalSha !== corpusEntry.tree_sha) {
        throw new Error(`stale original ${projectId}: hash ${originalSha} != recorded ${corpusEntry.tree_sha} (re-run scripts/scaffold-training-corpus.mjs)`);
      }

      const projectRunDir = join(runDir, projectId);
      mkdirSync(projectRunDir, { recursive: true });
      console.log(`train-corpus-run: ${projectId} (${spec.archetype}/${spec.framework.name}) …`);

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

      // The uplifted copy must live inside the repository so Node can resolve the framework modules.
      const upliftDir = join(upliftRoot, projectId);
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
      decision.original_sha = originalSha;
      decision.uplifted_sha = hashTree(upliftDir);
      decision.uplift_edits = uplift.edits;
      decisions.push(decision);

      records.push({
        project_id: projectId,
        family_id: corpusEntry.family_id,
        brief_id: corpusEntry.brief_id,
        archetype: spec.archetype,
        framework: spec.framework.name,
        task: corpusEntry.task,
        original_sha: originalSha,
        corpus_tree_sha: corpusEntry.tree_sha,
        uplifted_sha: decision.uplifted_sha,
        seeded_defects: spec.seeded_defects ?? [],
        original: versionRecord(original, spec),
        uplifted: versionRecord(uplifted, spec),
        uplift: { applied: uplift.applied, skipped: uplift.skipped, failed: uplift.failed },
        decision: {
          accepted: decision.accepted,
          category: decision.category,
          detail: decision.detail,
          improved_rules: decision.improved_rules,
          regressed_rules: decision.regressed_rules,
          new_security_findings: decision.new_security_findings,
        },
      });

      writeFileSync(join(projectRunDir, 'original.json'), `${JSON.stringify(original, null, 2)}\n`);
      writeFileSync(join(projectRunDir, 'uplifted.json'), `${JSON.stringify(uplifted, null, 2)}\n`);
      writeFileSync(join(projectRunDir, 'decision.json'), `${JSON.stringify(decision, null, 2)}\n`);
      console.log(`train-corpus-run:   ${decision.accepted ? 'ACCEPTED' : `rejected (${decision.category})`}`);
      await chrome.close();
      chrome = null;
    }
  } finally {
    if (chrome) await chrome.close().catch(() => {});
  }

  // Journeys driven / passed across both versions of every sampled project.
  const journeysRun = records.reduce((sum, record) => sum + record.original.journeys.length + record.uplifted.journeys.length, 0);
  const journeysPassed = records.reduce(
    (sum, record) =>
      sum +
      record.original.journeys.filter((journey) => journey.passed).length +
      record.uplifted.journeys.filter((journey) => journey.passed).length,
    0,
  );

  const acceptance = summarizeYield(decisions);
  const scoredIds = new Set(records.map((record) => record.project_id));
  const unscored = allProjects.filter((project) => !scoredIds.has(project.project_id));
  const coverage = {
    scored: records.length,
    unscored: unscored.length,
    total: allProjects.length,
    reason: `${selected.length} projects were selected by the deterministic rule; ${records.length} were driven in the browser. The remaining ${unscored.length} are scaffolded and hash-recorded in pilot/TRAINING_CORPUS.json but their journeys were NOT run in this pass, so they carry the status "scaffolded / unverified journey".`,
    unscored_projects: unscored.map((project) => ({
      project_id: project.project_id,
      family_id: project.family_id,
      archetype: project.archetype,
      framework: project.framework,
      status: 'scaffolded / unverified journey',
      tree_sha: project.tree_sha,
    })),
  };

  const summary = {
    sampled_projects: selected.length,
    scored_projects: records.length,
    versions_driven: records.length * 2,
    journeys_run: journeysRun,
    journeys_passed: journeysPassed,
    acceptance: { attempted: acceptance.attempted, accepted: acceptance.accepted, yield: acceptance.yield },
    by_category: acceptance.by_category,
    by_framework: acceptance.by_framework,
    by_archetype: acceptance.by_archetype,
  };

  const selection = {
    rule: 'For every archetype pick its canonical GENERATE family (lowest tr-id) plus every REPAIR family (tr-26..tr-30). Build the ordered slot list of [repair x2] then [canonical generate x2, ascending tr-id], and assign a framework to each slot by round-robin over the framework order.',
    framework_order: FRAMEWORK_ORDER,
    sample: selected.map((project) => ({
      project_id: project.project_id,
      family_id: project.family_id,
      archetype: project.archetype,
      framework: project.framework,
      task: project.task,
    })),
  };

  const output = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    generator: 'scripts/train-corpus-run.mjs',
    corpus: CORPUS_PATH,
    selection,
    coverage,
    summary,
    projects: records,
  };

  writeFileSync(recordsPath, `${JSON.stringify(output, null, 2)}\n`);
  const yieldPath = join(dirname(recordsPath), 'YIELD.md');
  writeFileSync(
    yieldPath,
    renderYieldMd({ runId, generatedAt: new Date().toISOString(), selection, records, summary, coverage }),
  );

  console.log(`train-corpus-run: sampled ${selected.length}, scored ${records.length}, journeys ${journeysRun} run / ${journeysPassed} passed`);
  console.log(`train-corpus-run: acceptance ${acceptance.accepted}/${acceptance.attempted} (${((acceptance.yield ?? 0) * 100).toFixed(1)}%)`);
  console.log(`train-corpus-run: coverage scored=${coverage.scored} unscored=${coverage.unscored} total=${coverage.total}`);
  console.log(`train-corpus-run: records ${recordsPath}`);
  console.log(`train-corpus-run: report ${yieldPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`train-corpus-run: FAILED - ${error.message}`);
    process.exit(1);
  });
}
