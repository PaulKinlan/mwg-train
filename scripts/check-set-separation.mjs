#!/usr/bin/env node
/**
 * Assert that the DEFAULT and the IDEAL are recorded as two distinct artefacts.
 *
 *   node scripts/check-set-separation.mjs [--json]
 *
 * Why this exists (bead mwg-train-210, Paul 2026-10-11): "we need to have the default generated set of
 * data, and then the ideal version after an uplift and generating the best version and have them
 * distinct. Remember the default version created by the llm should not have moderweb guidance or uplift
 * applied to it." Two things were true at once in this repository, and they are opposites: the corpus
 * record called the MWG-REPAIRED artefact "baseline", while the lifecycle documents called the RAW
 * artefact "baseline". A lane looking for the default could therefore take the ideal, and a measurement
 * could be made from the repaired artefact while believing it was made from the raw one.
 *
 * docs/vocabulary.md settles the words. This check is the half that fails when the RECORDS stop
 * agreeing with them, because a vocabulary document cannot stop a script from writing the wrong side
 * into a field. It reads the committed records only - no regeneration, no browser - so it is cheap
 * enough to run on every gate.
 *
 * What it does NOT claim: that a tree on disk is really the untouched output of a model. It asserts
 * properties of what the records say, plus the one thing the records can prove about the trees - that
 * the default side and the ideal side never collapse into the same hash within a pair, and that no
 * project's default is another project's ideal.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { NO_MODEL } from '../src/eval/build-key.mjs';
import { BASELINE_FIELDS } from '../src/eval/ruleset.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^sha256:[a-f0-9]{64}$/;

export const RECORDS = Object.freeze({
  // The deterministic pilot: every plan project, both sides, with the rules that moved it.
  pilot: 'pilot/CORPUS.json',
  // The sampled training run: both sides of the pairs it drove, and the decision for each.
  trainingRun: 'docs/train/corpus/records.json',
  // The training corpus itself: the DEFAULT tree of every family x framework, before any uplift.
  trainingCorpus: 'pilot/TRAINING_CORPUS.json',
});

const readJson = (repoRoot, relative) => JSON.parse(readFileSync(join(repoRoot, relative), 'utf8'));

/**
 * The separation rules, as functions over the parsed records.
 *
 * Each rule returns findings; an empty array is a pass. They are exported so the test can drive them
 * with fixtures - a check whose failure path is never exercised is a check nobody has seen work.
 */
export function separationFindings({ pilot, trainingRun, trainingCorpus }) {
  const findings = [];
  const find = (code, message) => findings.push({ code, message });

  // ---- the deterministic pilot: the pair, and what each side claims ------------------------------
  const pilotOriginals = [];
  const pilotUplifts = [];
  for (const project of pilot?.projects ?? []) {
    const id = project.project_id;
    if (!SHA.test(project.original_sha ?? '')) find('DEFAULT_HASH', `${id}: no valid default hash (original_sha)`);
    if (!SHA.test(project.uplift_sha ?? '')) find('IDEAL_HASH', `${id}: no valid ideal hash (uplift_sha)`);
    if (!SHA.test(project.original_sha ?? '') || !SHA.test(project.uplift_sha ?? '')) continue;
    pilotOriginals.push({ id, sha: project.original_sha });
    pilotUplifts.push({ id, sha: project.uplift_sha });

    const applied = project.uplift_applied ?? [];
    const improved = project.improved_rules ?? [];
    const same = project.original_sha === project.uplift_sha;
    if (applied.length > 0 && same) {
      find('UPLIFT_WITHOUT_CHANGE', `${id}: ${applied.length} rule(s) applied but default and ideal are the same tree`);
    }
    if (applied.length > 0 && improved.length === 0) {
      find('UPLIFT_WITHOUT_IMPROVEMENT', `${id}: rules applied but improved_rules is empty, so the ideal side claims no improvement`);
    }
    if (applied.length > 0 && project.accepted !== true) {
      find('ACCEPTED_WITHOUT_UPLIFT', `${id}: rules applied but the project is not accepted - an ideal that is not accepted cannot be a target`);
    }
    if (applied.length === 0 && !same) {
      find('CHANGE_WITHOUT_UPLIFT', `${id}: no rule applied but default and ideal differ, so something moved the tree that the record does not name`);
    }
    if (applied.length === 0 && improved.length > 0) {
      find('IMPROVEMENT_WITHOUT_UPLIFT', `${id}: improved_rules recorded with no rule applied`);
    }
    if (applied.length === 0 && project.accepted === true) {
      find('ACCEPTED_WITHOUT_UPLIFT', `${id}: accepted with no rule applied - nothing improved, so there is no ideal to train on`);
    }
    // The "no model and no teacher in the loop" claim is recorded, not assumed (mwg-train-gzi).
    if (project.model !== NO_MODEL) {
      find('MODEL_RECORDED', `${id}: expected ${JSON.stringify(NO_MODEL)} for the deterministic corpus, recorded ${JSON.stringify(project.model)}`);
    }
  }

  // ---- the ideal is not the default: within the record and across projects ----------------------
  const collisions = (left, right, label) => {
    for (const a of left) {
      for (const b of right) {
        if (a.id !== b.id && a.sha === b.sha) find('SIDE_COLLISION', `${label}: ${a.id} and ${b.id} share a tree hash, so one project's side is another's`);
      }
    }
  };
  collisions(pilotOriginals, pilotOriginals, 'pilot/default');
  collisions(pilotUplifts, pilotUplifts, 'pilot/ideal');
  collisions(pilotUplifts, pilotOriginals, 'pilot/ideal-is-a-default');
  collisions(pilotOriginals, pilotUplifts, 'pilot/default-is-an-ideal');

  // ---- the sampled training run: both sides present, decision consistent with them --------------
  const runOriginals = [];
  const runUplifts = [];
  for (const project of trainingRun?.projects ?? []) {
    const id = project.project_id;
    if (!SHA.test(project.original_sha ?? '')) find('DEFAULT_HASH', `${id}: no valid default hash (original_sha)`);
    if (!SHA.test(project.uplifted_sha ?? '')) find('IDEAL_HASH', `${id}: no valid ideal hash (uplifted_sha)`);
    if (!SHA.test(project.original_sha ?? '') || !SHA.test(project.uplifted_sha ?? '')) continue;
    runOriginals.push({ id, sha: project.original_sha });
    runUplifts.push({ id, sha: project.uplifted_sha });

    const improved = project.decision?.improved_rules ?? [];
    const accepted = project.decision?.accepted;
    if (improved.length > 0 && project.original_sha === project.uplifted_sha) {
      find('UPLIFT_WITHOUT_CHANGE', `${id}: improvements recorded but default and ideal are the same tree`);
    }
    if (improved.length > 0 && accepted !== true) {
      find('ACCEPTED_WITHOUT_UPLIFT', `${id}: improvements recorded but the pair is not accepted`);
    }
    if (accepted === false && improved.length > 0 && project.decision?.category !== 'no-warranted-change') {
      find('REJECTED_WITH_IMPROVEMENT', `${id}: rejected (${project.decision?.category}) while claiming improvements`);
    }
    // corpus_tree_sha is the corpus's default tree for this project, so it must be the default side.
    if (project.corpus_tree_sha && project.corpus_tree_sha !== project.original_sha) {
      find('CORPUS_TREE_NOT_DEFAULT', `${id}: corpus_tree_sha is not the default side, so the run measured a tree the corpus does not record as default`);
    }
    // The decision block carries the attribution too, on the ideal side. It must not drift from the constant.
    if (project.decision?.baseline_definition && project.decision.baseline_definition !== BASELINE_FIELDS.baseline_definition) {
      find('DEFINITION_DRIFT', `${id}: decision baseline_definition does not match the shared constant`);
    }
  }
  collisions(runOriginals, runUplifts, 'training-run/ideal-is-a-default');
  collisions(runUplifts, runOriginals, 'training-run/default-is-an-ideal');

  // ---- the training corpus is the DEFAULT side, and shares no tree with the pilot ---------------
  const seen = new Set();
  const pilotHashes = new Set([...pilotOriginals, ...pilotUplifts].map((entry) => entry.sha));
  for (const project of trainingCorpus?.projects ?? []) {
    const id = project.project_id;
    if (!SHA.test(project.tree_sha ?? '')) {
      find('DEFAULT_HASH', `${id}: no valid tree hash in the training corpus`);
      continue;
    }
    if (seen.has(project.tree_sha)) find('DUPLICATE_TREE', `${id}: tree hash is recorded for more than one training project`);
    seen.add(project.tree_sha);
    if (pilotHashes.has(project.tree_sha)) {
      find('TRAINING_CORPUS_COLLISION', `${id}: training tree is a pilot tree (default or ideal) - the training corpus is not disjoint from the pilot`);
    }
    if (project.model !== NO_MODEL) {
      find('MODEL_RECORDED', `${id}: expected ${JSON.stringify(NO_MODEL)} for the scaffolded training corpus, recorded ${JSON.stringify(project.model)}`);
    }
  }
  if ((trainingCorpus?.projects ?? []).length === 0) find('EMPTY_RECORD', 'the training corpus record has no projects');

  // ---- the wording itself, so the ambiguity cannot be reintroduced silently ---------------------
  const definition = BASELINE_FIELDS.baseline_definition;
  for (const [name, record] of [['pilot/CORPUS.json', pilot], ['records.json', trainingRun]]) {
    if (record?.baseline_definition !== definition) {
      find('DEFINITION_DRIFT', `${name}: baseline_definition does not match the shared constant`);
    }
    if (record?.baseline_label !== BASELINE_FIELDS.baseline_label) {
      find('LABEL_DRIFT', `${name}: baseline_label does not match the attribution label`);
    }
  }
  if (!/default/i.test(definition) || !/ideal/i.test(definition)) {
    find(
      'DEFINITION_AMBIGUOUS',
      'baseline_definition must name both sides explicitly (the default it is not, and the ideal it is) - see docs/vocabulary.md',
    );
  }
  const pilotTool = pilot?.uplift_tool ?? null;
  if (pilotTool !== BASELINE_FIELDS.baseline_tool) {
    find('TOOL_DRIFT', `pilot/CORPUS.json uplift_tool ${JSON.stringify(pilotTool)} is not the recorded uplift tool ${JSON.stringify(BASELINE_FIELDS.baseline_tool)}`);
  }

  return findings;
}

export function loadRecords(repoRoot = REPO_ROOT) {
  return {
    pilot: readJson(repoRoot, RECORDS.pilot),
    trainingRun: readJson(repoRoot, RECORDS.trainingRun),
    trainingCorpus: readJson(repoRoot, RECORDS.trainingCorpus),
  };
}

export function checkSetSeparation({ repoRoot = REPO_ROOT } = {}) {
  const records = loadRecords(repoRoot);
  const findings = separationFindings(records);
  return {
    ok: findings.length === 0,
    findings,
    counts: {
      pilot: records.pilot.projects?.length ?? 0,
      trainingRun: records.trainingRun.projects?.length ?? 0,
      trainingCorpus: records.trainingCorpus.projects?.length ?? 0,
    },
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = checkSetSeparation();
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  for (const finding of result.findings) console.log(`FINDING ${finding.code} ${finding.message}`);
  if (!result.ok) {
    console.error(`check-set-separation: FAIL - ${result.findings.length} finding(s); the default and the ideal are not recorded as distinct artefacts`);
    process.exit(1);
  }
  console.log(
    `check-set-separation: PASS - ${result.counts.pilot} pilot pair(s) keep a distinct default and ideal, ` +
      `${result.counts.trainingRun} sampled pair(s) recorded both sides, and ${result.counts.trainingCorpus} training tree(s) ` +
      `share no hash with any pilot tree on either side`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
