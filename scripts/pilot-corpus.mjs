#!/usr/bin/env node
/**
 * Record, and then verify, the corpus the pilot actually measured.
 *
 * The corpus is *generated*: 25 project trees come out of one plan and one generator, and each uplift
 * comes out of one deterministic tool. That makes byte-for-byte retention unnecessary and a hash-based
 * guarantee stronger - what has to stay true is that the originals recorded here are exactly what the
 * plan produces, and that each uplift is exactly what the tool produces from its original.
 *
 *   node scripts/pilot-corpus.mjs --record <runDir>   write pilot/CORPUS.json from a completed run
 *   node scripts/pilot-corpus.mjs --verify            re-derive everything and compare
 *
 * A run that did not attempt every project in the plan cannot be recorded: a partial corpus is not the
 * corpus, and recording it would let a half-finished run stand in as the measured artefact.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { buildProject, writeProject } from '../pilot/frameworks.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { hashTree } from '../src/corpus/harness.mjs';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const corpusPath = join(repoRoot, 'pilot/CORPUS.json');

function parseArgs(argv) {
  const args = { record: null, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--record') args.record = argv[++i];
    else if (argv[i] === '--verify') args.verify = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/pilot-corpus.mjs [--record <runDir> | --verify]');
      process.exit(0);
    } else {
      console.error(`pilot-corpus: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

/** Generate the plan into a scratch directory and return project id -> {dir, spec}. */
function generate(plan, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  const projects = {};
  for (const entry of plan.projects) {
    const built = buildProject({
      archetypeId: entry.archetype,
      frameworkName: entry.framework,
      defects: entry.defects ?? [],
      flags: entry.flags ?? {},
    });
    // The same writer the scaffolder uses: two implementations of "a project on disk" disagreed about
    // package.json, and the recorder then reported the plan as generating a tree nobody had measured.
    projects[built.projectId] = { dir: writeProject(join(outDir, built.projectId), built), spec: built.spec };
  }
  return projects;
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
        };
      })
      .sort((a, b) => a.project_id.localeCompare(b.project_id));

    writeFileSync(
      corpusPath,
      `${JSON.stringify(
        {
          $comment:
            'The corpus the pilot measured: generated projects, their tree hashes, and the hash of the uplift the tool produced from each. `node scripts/pilot-corpus.mjs --verify` re-derives all of it; a mismatch means the measured artefact can no longer be reproduced.',
          run_id: run.run_id,
          generated_at: run.generated_at,
          generator: 'scripts/scaffold-pilot.mjs',
          uplift_tool: 'src/corpus/uplift.mjs',
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

function verify() {
  if (!existsSync(corpusPath)) {
    console.error('pilot-corpus: pilot/CORPUS.json is missing; run --record first');
    process.exit(1);
  }
  const recorded = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const plan = JSON.parse(readFileSync(join(repoRoot, 'pilot/plan.json'), 'utf8'));
  const scratch = mkdtempSync(join(tmpdir(), 'pilot-verify-'));
  const upliftScratch = mkdtempSync(join(tmpdir(), 'pilot-verify-uplift-'));
  const problems = [];
  try {
    const generated = generate(plan, scratch);
    const byId = new Map(recorded.projects.map((project) => [project.project_id, project]));

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
  console.log(
    `pilot-corpus: PASS - ${recorded.projects.length} projects reproduce exactly (originals from the plan, uplifts from the tool)`,
  );
}

const args = parseArgs(process.argv.slice(2));
if (args.record) record(resolve(args.record));
else if (args.verify) verify();
else {
  console.error('usage: node scripts/pilot-corpus.mjs [--record <runDir> | --verify]');
  process.exit(2);
}
