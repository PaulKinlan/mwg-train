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
import { BASELINE_FIELDS, BASELINE_LABEL, baselineAttributionLine } from '../src/eval/ruleset.mjs';

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
    else if (argv[i] === '--report-only') args.reportOnly = true;
    else if (argv[i] === '--relabel-record') args.relabelRecord = true;
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
  const search = record.journeys?.find((journey) => journey.name === 'search');
  const update = record.journeys?.find((journey) => journey.name === 'update-existing');

  journeys.push({
    name: 'server-persistence',
    passed: persistenceOk(record, spec),
    // What the journey actually DID, not only that it passed. Without this the committed record
    // cannot show that a select was moved off its default (`SELECT_NOT_APPLIED` would have failed
    // the run, but a reader should not have to take that on trust), and the evidence would live only
    // in the run's output directory.
    steps: (persistence?.steps ?? [])
      .filter((step) => ['fill', 'select', 'submit', 'reload', 'step', 'step-fill', 'step-select', 'step-submit', 'step-expect'].includes(step.step))
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
    // A multi-step flow's carry verdict: the intermediate pages showed the values earlier steps
    // supplied, and those values reached the final record. Absent for a single-page journey.
    ...(persistence?.carry ? { carry: persistence.carry } : {}),
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
  if (search) {
    journeys.push({ name: 'search', passed: search.verdict?.passed === true, path: search.path ?? null, detail: search.verdict?.detail ?? null });
  }
  if (update) {
    journeys.push({ name: 'update-existing', passed: update.verdict?.passed === true, ref: update.ref ?? null, detail: update.verdict?.detail ?? null });
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

/**
 * Rewrite YIELD.md from a committed records.json. No browser, no measurement.
 *
 * The report is a view of the record, so it can be regenerated without re-driving anything: the sample
 * took 332 seconds of browser time and produced numbers that must not shift because a report gained a
 * line. Re-rendering from the record keeps the measurement and the presentation separable.
 */
function reportFromRecords(recordsPath) {
  const output = JSON.parse(readFileSync(recordsPath, 'utf8'));
  const yieldPath = join(dirname(recordsPath), 'YIELD.md');
  writeFileSync(
    yieldPath,
    renderYieldMd({
      runId: output.run_id,
      generatedAt: output.generated_at,
      selection: output.selection,
      records: output.projects ?? [],
      summary: output.summary,
      coverage: output.coverage,
    }),
  );
  console.log(`train-corpus-run: re-rendered ${yieldPath} from ${recordsPath} (no measurement)`);
}

/**
 * Add the attribution to a record produced before the label existed.
 *
 * Deliberately its own mode rather than part of `--report-only`: rewriting a committed measurement
 * record should never be something an operator triggers by accident while regenerating a report. It adds
 * only the label, from a constant - every measured field is copied through untouched - and it says how
 * many decisions it touched so the change is auditable rather than silent. A record produced by the
 * current generator already carries these fields and is left alone.
 */
export function relabelRecord(recordsPath) {
  const output = JSON.parse(readFileSync(recordsPath, 'utf8'));
  let touched = 0;
  // EVERY field, from the shared constant. This wrote baseline_label and baseline_tool by hand at the top
  // level and omitted baseline_definition, so a record repaired by this very command still failed
  // `label:baseline --check` - which is how docs/train/corpus/records.json sat red on main carrying two
  // of the three fields (mwg-train-jjl). Adding the fields individually also means a record missing only
  // the definition is repaired rather than being skipped for having a correct label.
  const applyBaselineFields = (target) => {
    let added = 0;
    for (const [key, value] of Object.entries(BASELINE_FIELDS)) {
      if (target[key] !== value) {
        target[key] = value;
        added += 1;
      }
    }
    return added;
  };
  if (applyBaselineFields(output) > 0) touched += 1;
  for (const project of output.projects ?? []) {
    if (!project.decision) continue;
    if (applyBaselineFields(project.decision) > 0) touched += 1;
  }
  if (touched === 0) {
    console.log(`train-corpus-run: ${recordsPath} already carries the baseline label; nothing to do`);
    return;
  }
  writeFileSync(recordsPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`train-corpus-run: added the baseline label to ${recordsPath} (${touched} place(s)); no measured field touched`);
}

function renderYieldMd({ runId, generatedAt, selection, records, summary, coverage }) {
  const percent = (value) => `${((value ?? 0) * 100).toFixed(1)}%`;
  const lines = [];
  lines.push(`# Training-corpus acceptance yield (${runId})`);
  lines.push('');
  lines.push(baselineAttributionLine());
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
  if (args.reportOnly) {
    reportFromRecords(resolve(process.cwd(), args.records));
    return;
  }
  if (args.relabelRecord) {
    relabelRecord(resolve(process.cwd(), args.records));
    return;
  }
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
          // Copied explicitly, like every other field here - which is exactly why the attribution had to
          // be added by hand: a projection drops what it does not name.
          baseline_label: decision.baseline_label,
          baseline_definition: decision.baseline_definition,
          baseline_tool: decision.baseline_tool,
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

  // The declared search / update / carried-step flows, counted alongside journeys_run/_passed.
  // These are ADDITIVE counters: existing fields keep their names and meanings so committed
  // records.json files and their re-rendered reports keep working unchanged.
  const versions = records.flatMap((record) => [record.original, record.uplifted]);
  const flowCount = (name) => versions.filter((version) => version.journeys.some((journey) => journey.name === name)).length;
  const flowPass = (name) => versions.filter((version) => version.journeys.some((journey) => journey.name === name && journey.passed === true)).length;
  const carried = versions.map((version) => version.journeys.find((journey) => journey.name === 'server-persistence')?.carry).filter(Boolean);
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
    searches_run: flowCount('search'),
    searches_passed: flowPass('search'),
    updates_run: flowCount('update-existing'),
    updates_passed: flowPass('update-existing'),
    carries_run: carried.length,
    carries_passed: carried.filter((carry) => carry.passed === true).length,
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

  // One timestamp for the record and the report it generates. Two `new Date()` calls 2ms apart made the
  // committed YIELD.md disagree with the records.json it was generated from, which is exactly the kind
  // of silent drift that makes a regenerated report untrustworthy.
  const generatedAt = new Date().toISOString();
  const output = {
    run_id: runId,
    // The record is a floor artifact, so it attributes itself. Added after review found the label
    // reached decision.json but not the summary record that is actually committed (bead mwg-train-6ek).
    // ALL THREE fields, from the shared constant: the hand-written pair that used to be here omitted
    // baseline_definition, so a freshly generated record still failed `label:baseline --check`
    // (mwg-train-jjl).
    ...BASELINE_FIELDS,
    generated_at: generatedAt,
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
    renderYieldMd({ runId, generatedAt, selection, records, summary, coverage }),
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
