#!/usr/bin/env node
/**
 * Record a measured pilot run, or separately date a re-derivation of its tree hashes.
 *
 * The corpus is *generated*: 35 project trees come out of one plan and one generator, and each uplift
 * comes out of one deterministic tool. Byte-for-byte retention is unnecessary when the originals
 * reproduce from the plan and each uplift reproduces from its original. A post-run hash derivation
 * is not a replay of the historical browser decisions or a new measured pilot run.
 *
 *   node scripts/pilot-corpus.mjs --record <runDir>   write pilot/CORPUS.json from a completed measured run
 *   node scripts/pilot-corpus.mjs --rederive           recheck a legacy hash record and stamp a distinct derivation run
 *   node scripts/pilot-corpus.mjs --verify             re-derive everything and compare
 *
 * A run that did not attempt every project in the plan cannot be recorded: a partial corpus is not the
 * corpus, and recording it would let a half-finished run stand in as the measured artefact.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { generateCorpus } from '../pilot/generate.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { hashTree } from '../src/corpus/harness.mjs';
import { BASELINE_FIELDS } from '../src/eval/ruleset.mjs';
import { KEY_FIELD, MODEL_FIELD, NO_MODEL, assertModelIdentity, buildKey, buildKeyDefinition, duplicateBuildKeys } from '../src/eval/build-key.mjs';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const corpusPath = join(repoRoot, 'pilot/CORPUS.json');

function parseArgs(argv) {
  const args = { record: null, verify: false, rederive: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--record') args.record = argv[++i];
    else if (argv[i] === '--verify') args.verify = true;
    else if (argv[i] === '--rederive') args.rederive = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/pilot-corpus.mjs [--record <runDir> | --rederive | --verify]');
      process.exit(0);
    } else {
      console.error(`pilot-corpus: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  if (Number(!!args.record) + Number(args.verify) + Number(args.rederive) !== 1) {
    console.error('pilot-corpus: select exactly one of --record <runDir>, --rederive or --verify');
    process.exit(2);
  }
  return args;
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const validStamp = (value) => typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value));
const validId = (value) => typeof value === 'string' && value.length > 0;
const measuredComment = 'The tree hashes and decisions were checked against the same completed pilot run. `--verify` re-derives the trees from the current plan and uplift tool; a mismatch means that run no longer describes this checkout.';
const rederivedComment = 'Tree hashes were re-derived from the current plan and uplift tool during the distinct run_id/generated_at below. measured_run_id/measured_generated_at identify the older pilot whose decisions and summary are retained; they do NOT assert those historical decisions were measured against the re-derived trees. No pilot browser journeys were rerun.';

/** The original run can prove decisions; only a new complete derivation can date later tree hashes. */
export function derivedRunMetadata(previous, startedAt, generatedAt) {
  if (!validStamp(startedAt) || !validStamp(generatedAt) || Date.parse(startedAt) > Date.parse(generatedAt)) {
    throw new Error('pilot-corpus: invalid re-derivation start or completion timestamp');
  }
  const measuredRunId = previous.run_kind === 'tree-hash-rederivation' ? previous.measured_run_id : previous.run_id;
  const measuredGeneratedAt = previous.run_kind === 'tree-hash-rederivation' ? previous.measured_generated_at : previous.generated_at;
  if (!validId(measuredRunId) || !validStamp(measuredGeneratedAt) || Date.parse(startedAt) <= Date.parse(measuredGeneratedAt)) {
    throw new Error('pilot-corpus: missing or later historical measurement run');
  }
  return {
    $comment: rederivedComment,
    run_id: `${startedAt.replace(/[:.]/g, '-')}-rederived`,
    generated_at: generatedAt,
    run_kind: 'tree-hash-rederivation',
    measured_run_id: measuredRunId,
    measured_generated_at: measuredGeneratedAt,
  };
}

/** Check that the manifest distinguishes historical measurement from a later hash re-derivation. */
export function runMetadataProblems(recorded, { allowLegacy = false } = {}) {
  const problems = [];
  if (!validId(recorded.run_id) || !validStamp(recorded.generated_at)) {
    problems.push('run_id or generated_at is missing or malformed');
  }
  if (recorded.run_kind === 'measured-pilot') {
    if (recorded.measured_run_id !== undefined || recorded.measured_generated_at !== undefined) {
      problems.push('a measured pilot must not inherit an earlier measurement run');
    }
  } else if (recorded.run_kind === 'tree-hash-rederivation') {
    const start = typeof recorded.run_id === 'string' ? recorded.run_id.match(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z-rederived$/) : null;
    const startedAt = start ? `${start[1]}:${start[2]}:${start[3]}.${start[4]}Z` : null;
    if (!validStamp(startedAt) || Date.parse(startedAt) > Date.parse(recorded.generated_at)) {
      problems.push('a hash re-derivation needs its own timestamped run_id no later than completion');
    }
    if (!validId(recorded.measured_run_id) || !validStamp(recorded.measured_generated_at)
      || Date.parse(recorded.generated_at) <= Date.parse(recorded.measured_generated_at)
      || Date.parse(startedAt) <= Date.parse(recorded.measured_generated_at)
      || recorded.run_id === recorded.measured_run_id) {
      problems.push('a hash re-derivation must retain a distinct, earlier measured pilot run');
    }
  } else if (!(allowLegacy && recorded.run_kind === undefined)) {
    problems.push(`unrecognized run_kind ${JSON.stringify(recorded.run_kind)}; cannot attribute tree hashes`);
  }
  return problems;
}

/** Generate the plan into a scratch directory and return project id -> {dir, spec}. */
function generate(plan, outDir) {
  const { projects } = generateCorpus({ plan, outDir });
  return Object.fromEntries(projects.map((project) => [project.projectId, { dir: project.dir, spec: project.spec }]));
}

function record(runDir) {
  const plan = JSON.parse(readFileSync(join(repoRoot, 'pilot/plan.json'), 'utf8'));
  const run = JSON.parse(readFileSync(join(runDir, 'yield.json'), 'utf8'));
  const plannedIds = new Set(plan.projects.map((entry) => `${entry.archetype}-${entry.framework}`));
  const decisionIds = new Set(run.decisions.map((decision) => decision.project_id));
  const refuse = (reason) => {
    console.error(`pilot-corpus: refusing to record - ${reason}`);
    process.exit(1);
  };
  if (!validId(run.run_id) || !validStamp(run.generated_at)) refuse('the measured run has no valid run_id or generated_at');
  if (run.decisions.length !== plan.projects.length) {
    refuse(`the run measured ${run.decisions.length} of ${plan.projects.length} projects, and a partial corpus is not the corpus`);
  }
  if (decisionIds.size !== run.decisions.length) refuse('the run contains duplicate project ids');
  // Count equality is not identity: twenty-five decisions for twenty-five different wrong projects would
  // satisfy a count. The recorded ids must be exactly the planned ones.
  for (const id of decisionIds) if (!plannedIds.has(id)) refuse(`${id} is not a project the plan generates`);
  for (const id of plannedIds) if (!decisionIds.has(id)) refuse(`${id} is planned but the run recorded no decision for it`);
  const HASH = /^sha256:[a-f0-9]{64}$/;
  for (const decision of run.decisions) {
    // Without the run's own hashes there is no evidence of which trees were measured, and recording the
    // hashes this script regenerates would attest to a different tree than the one that ran.
    if (!HASH.test(decision.original_sha ?? '')) refuse(`${decision.project_id} recorded no original tree hash`);
    if (!HASH.test(decision.uplifted_sha ?? '')) refuse(`${decision.project_id} recorded no uplift tree hash`);
    const staged = join(repoRoot, '.pilot-uplifted', run.run_id, decision.project_id);
    if (!existsSync(staged)) refuse(`${decision.project_id} has no staged uplifted copy, so its recorded hash cannot be checked`);
    const derived = hashTree(staged);
    if (derived !== decision.uplifted_sha) {
      refuse(`${decision.project_id} staged uplift hashes to ${derived} but the run recorded ${decision.uplifted_sha}`);
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), 'pilot-record-'));
  try {
    const generated = generate(plan, scratch);
    const projects = run.decisions
      .map((decision) => {
        const entry = generated[decision.project_id];
        if (!entry) throw new Error(`pilot-corpus: the plan has no project ${decision.project_id}`);
        const original = hashTree(entry.dir);
        if (decision.original_sha && decision.original_sha !== original) {
          throw new Error(
            `pilot-corpus: ${decision.project_id} recorded original ${decision.original_sha} but the plan generates ${original} - the corpus changed under the run, so its numbers describe a tree that no longer exists`,
          );
        }
        return {
          project_id: decision.project_id,
          archetype: decision.archetype,
          framework: decision.framework,
          defects: decision.seeded_defects,
          original_sha: original,
          uplift_sha: decision.uplifted_sha,
          uplift_applied: decision.uplift_applied,
          improved_rules: decision.improved_rules,
          accepted: decision.accepted,
          category: decision.category,
          // The third key (mwg-train-gzi). The pilot is deterministic - no model and no teacher are in
          // the loop - so it records the explicit sentinel rather than leaving the field out, and the
          // derived key beside it so the record shows the key it is measured under.
          [MODEL_FIELD]: NO_MODEL,
          [KEY_FIELD]: buildKey({ projectId: decision.project_id, model: NO_MODEL }),
        };
      })
      .sort((a, b) => a.project_id.localeCompare(b.project_id));

    // A duplicate key is the failure the third key exists to prevent, so recording one is refused here
    // rather than left for a reader to notice.
    const collisions = duplicateBuildKeys(projects);
    if (collisions.length > 0) {
      refuse(`${collisions.length} build key(s) are carried by more than one project: ${collisions.map((entry) => entry.key).join(', ')}`);
    }

    writeFileSync(
      corpusPath,
      `${JSON.stringify(
        {
          $comment: measuredComment,
          run_id: run.run_id,
          generated_at: run.generated_at,
          run_kind: 'measured-pilot',
          generator: 'scripts/scaffold-pilot.mjs',
          uplift_tool: 'src/corpus/uplift.mjs',
          // The floor this record measures is ours, not an official uplift product's. Added after review
          // found the label reached the individual decisions but not the committed record (bead mwg-train-6ek).
          ...BASELINE_FIELDS,
          build_key_definition: buildKeyDefinition('pilot/CORPUS.json'),
          summary: run.summary,
          projects,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`pilot-corpus: recorded ${projects.length} projects to pilot/CORPUS.json`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function verify({ rederive = false } = {}) {
  if (!existsSync(corpusPath)) {
    console.error('pilot-corpus: pilot/CORPUS.json is missing; run --record first');
    process.exit(1);
  }
  const startedAt = rederive ? new Date().toISOString() : null;
  const recorded = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const plan = JSON.parse(readFileSync(join(repoRoot, 'pilot/plan.json'), 'utf8'));
  const scratch = mkdtempSync(join(tmpdir(), 'pilot-verify-'));
  const upliftScratch = mkdtempSync(join(tmpdir(), 'pilot-verify-uplift-'));
  const problems = runMetadataProblems(recorded, { allowLegacy: rederive });
  if (rederive && recorded.run_kind === 'tree-hash-rederivation') {
    problems.push('this record already identifies a re-derivation; do not restamp unchanged hashes as another run');
  }
  try {
    const generated = generate(plan, scratch);
    const byId = new Map(recorded.projects.map((project) => [project.project_id, project]));

    // The model key is part of every row's identity, so a record that has lost it - or whose derived key
    // no longer agrees with its own project id and model - is a failed verification and not a cosmetic
    // difference: the builds in it can no longer be told apart from another model's builds (mwg-train-gzi).
    const keyable = [];
    for (const project of recorded.projects) {
      let derived;
      try {
        assertModelIdentity(project[MODEL_FIELD], { context: `${project.project_id} in pilot/CORPUS.json` });
        derived = buildKey({ projectId: project.project_id, model: project[MODEL_FIELD] });
      } catch (error) {
        // A row with no usable model or project id is a problem, not a crash: this script reports findings
        // and exits non-zero, and a stack trace from it would hide every other row's verdict.
        problems.push(error.message);
        continue;
      }
      keyable.push(project);
      if (project[KEY_FIELD] !== derived) {
        problems.push(
          `${project.project_id}: the recorded ${KEY_FIELD} is ${JSON.stringify(project[KEY_FIELD])}, but its own project id and model derive ${derived}`,
        );
      }
    }
    for (const collision of duplicateBuildKeys(keyable)) {
      problems.push(`${collision.key} is the key of more than one project (${collision.projectIds.join(', ')})`);
    }

    if (byId.size !== plan.projects.length) {
      problems.push(`the plan has ${plan.projects.length} projects but the record has ${byId.size}`);
    }
    for (const [projectId, entry] of Object.entries(generated)) {
      const expected = byId.get(projectId);
      if (!expected) {
        problems.push(`${projectId} is generated by the plan but absent from the record`);
        continue;
      }
      const original = hashTree(entry.dir);
      if (original !== expected.original_sha) {
        problems.push(`${projectId}: original tree is ${original}, recorded ${expected.original_sha}`);
        continue;
      }
      // Re-derive the uplift from the original and compare: this is what "the original is always
      // accessible, and can be transformed again" means for a generated corpus.
      const out = join(upliftScratch, projectId);
      const result = upliftProject(entry.dir, entry.spec, out);
      const uplift = hashTree(out);
      if (uplift !== expected.uplift_sha) {
        problems.push(`${projectId}: uplift tree is ${uplift}, recorded ${expected.uplift_sha}`);
      }
      const applied = [...result.applied].sort().join(' ');
      const recordedApplied = [...(expected.uplift_applied ?? [])].sort().join(' ');
      if (applied !== recordedApplied) {
        problems.push(`${projectId}: the tool now applies [${applied}], the record says [${recordedApplied}]`);
      }
      if ((result.failed ?? []).length > 0) {
        problems.push(`${projectId}: the tool now fails ${result.failed.length} transform(s)`);
      }
    }
    for (const id of byId.keys()) {
      if (!generated[id]) problems.push(`${id} is recorded but the plan no longer generates it`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(upliftScratch, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    console.error(`pilot-corpus: FAIL - ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  if (rederive) {
    const metadata = derivedRunMetadata(recorded, startedAt, new Date().toISOString());
    const content = { ...recorded };
    for (const key of Object.keys(metadata)) delete content[key];
    writeFileSync(corpusPath, `${JSON.stringify({ ...metadata, ...content }, null, 2)}\n`);
    console.log(`pilot-corpus: re-derived ${recorded.projects.length} project pairs under ${metadata.run_id}; historical pilot decisions remain from ${metadata.measured_run_id}`);
  } else {
    console.log(
      `pilot-corpus: PASS - ${recorded.projects.length} projects reproduce exactly (originals from the plan, uplifts from the tool)`,
    );
  }
}

// Imports by tests inspect metadata logic without kicking off a 35-project re-derivation.
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = parseArgs(process.argv.slice(2));
  if (args.record) record(resolve(args.record));
  else verify({ rederive: args.rederive });
}
