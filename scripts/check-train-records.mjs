#!/usr/bin/env node
/**
 * Assert that the training corpus's JOURNEY RECORD still describes the corpus that is on disk.
 *
 *   node scripts/check-train-records.mjs [--json]
 *
 * Why this exists (bead mwg-train-9by, found while verifying mwg-train-210): `docs/train/corpus/records.json` is
 * the only evidence that the training corpus RUNS - 40 sampled projects driven through their journeys through a
 * real browser, plus the yield figures that plan.md and the briefing quote. Every row carries the hash of the tree
 * it actually drove: `scripts/train-corpus-run.mjs` re-derives that hash from `pilot/TRAINING_CORPUS.json`,
 * re-verifies it against the tree on disk, and refuses to drive a project whose on-disk tree does not match the
 * recorded one. So a row's `corpus_tree_sha` is exactly "the corpus as it stood when this project was driven".
 *
 * Nothing compared those hashes to the corpus again. When the corpus was regenerated on 2026-10-11 the record
 * kept attesting to trees that no longer existed: all 40 rows were stale, and the quoted yield described a corpus
 * nobody had. The staleness was invisible because every check that reads this record asks about its shape.
 *
 * This check reads the committed records only - no regeneration, no browser - so it costs nothing on every gate,
 * and it goes red the moment a pass regenerates the trees. That is deliberate: a tree-changing pass must either
 * re-run the sample (`node scripts/train-corpus-run.mjs`, about seven minutes for 40 projects) or land with a red
 * gate that says its evidence is stale. The alternative is the state this check was written to end: a record that
 * quietly describes the wrong trees while every number in it still looks authoritative.
 *
 * Freshness here is about IDENTITY, not about time. A record from last week whose hashes still match the corpus is
 * valid and this check passes it; a record written this minute whose hashes do not match fails. So there is
 * deliberately no timestamp comparison anywhere below.
 *
 * What it does NOT claim: that the journeys would pass today, or that the corpus is verified beyond the sample. It
 * compares identities, not outcomes, and the 170 unsampled projects are scaffold records by design.
 *
 * How to re-record, in full, because the failure message below has to be runnable and the first attempt at it was not:
 * `pilot/training-projects/` is gitignored, so a fresh worktree has no trees for the driver to drive, and the driver
 * dies on a missing `spec.json` before it starts. Materialise them first - into the default location, because that is
 * where the driver looks, with the TRACKED record redirected so a diagnostic scaffold cannot rewrite it:
 *
 *     node scripts/scaffold-training-corpus.mjs --record /tmp/training-corpus.json
 *     node scripts/train-corpus-run.mjs
 *
 * The second command drives the 40 sampled projects in a real browser (about six minutes measured on this VM) and
 * rewrites `docs/train/corpus/records.json` with its companion `YIELD.md`. The scaffold also refuses to lie: it
 * writes `pilot/TRAINING_CORPUS.json` only when asked, and the driver re-verifies every original against the recorded
 * hash before driving it, so a corpus that does not match its own record fails loudly instead of being recorded.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDS_PATH = 'docs/train/corpus/records.json';
const CORPUS_PATH = 'pilot/TRAINING_CORPUS.json';
const SHA = /^sha256:[0-9a-f]{64}$/;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} could not be read as JSON: ${error.message}`);
  }
}

export function checkTrainRecords() {
  const records = readJson(RECORDS_PATH);
  const corpus = readJson(CORPUS_PATH);
  const findings = [];
  const rows = records.projects ?? [];
  const corpusProjects = corpus.projects ?? [];
  const byId = new Map(corpusProjects.map((project) => [project.project_id, project]));

  // A row's recorded tree must be the corpus's tree for that same project. This is the whole point of the check,
  // and it is reported per row with BOTH digests so the reader can see which run predates which corpus.
  let stale = 0;
  for (const row of rows) {
    const id = row.project_id;
    if (!id) {
      findings.push({ code: 'ROW-WITHOUT-ID', message: 'a record row carries no project_id' });
      continue;
    }
    const recorded = row.corpus_tree_sha;
    if (!SHA.test(String(recorded ?? ''))) {
      findings.push({ code: 'ROW-NO-TREE', message: `${id}: the row carries no usable corpus_tree_sha (${JSON.stringify(recorded ?? null)})` });
      continue;
    }
    const project = byId.get(id);
    if (!project) {
      findings.push({ code: 'ROW-UNKNOWN-PROJECT', message: `${id}: the row records a project the corpus does not contain` });
      continue;
    }
    if (project.tree_sha !== recorded) {
      stale += 1;
      findings.push({
        code: 'STALE-TREE',
        message: `${id}: driven tree ${recorded} != corpus tree ${project.tree_sha} - this row attests to a tree that is no longer in the corpus`,
      });
    }
  }

  // The record's own totals must agree with what it contains, or the figures quoted from it are not derived from
  // the rows a reader can count.
  const summary = records.summary ?? {};
  if (summary.sampled_projects !== undefined && summary.sampled_projects !== rows.length) {
    findings.push({
      code: 'SUMMARY-ROW-COUNT',
      message: `summary.sampled_projects says ${summary.sampled_projects} but the record carries ${rows.length} row(s)`,
    });
  }
  const coverage = records.coverage ?? {};
  if (coverage.scored !== undefined && coverage.scored !== rows.length) {
    findings.push({ code: 'COVERAGE-SCORED', message: `coverage.scored says ${coverage.scored} but the record carries ${rows.length} row(s)` });
  }
  if (coverage.total !== undefined && coverage.total !== corpusProjects.length) {
    findings.push({
      code: 'COVERAGE-TOTAL',
      message: `coverage.total says ${coverage.total} but the corpus holds ${corpusProjects.length} project(s)`,
    });
  }
  // An unscored count that does not add up means a project was regenerated without the record being told.
  if (coverage.scored !== undefined && coverage.total !== undefined && coverage.unscored !== undefined) {
    const sum = coverage.scored + coverage.unscored;
    if (sum !== coverage.total) {
      findings.push({ code: 'COVERAGE-SUM', message: `coverage says ${coverage.scored} scored + ${coverage.unscored} unscored != ${coverage.total} total` });
    }
  }

  const counts = {
    rows: rows.length,
    corpusProjects: corpusProjects.length,
    stale,
    fresh: rows.length - stale,
  };
  return { ok: findings.length === 0, findings, counts, runId: records.run_id ?? null, corpusGeneratedAt: corpus.generated_at ?? null };
}

function main() {
  const json = process.argv.includes('--json');
  let result;
  try {
    result = checkTrainRecords();
  } catch (error) {
    console.error(`check-train-records: FAIL - ${error.message}`);
    process.exit(1);
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  for (const finding of result.findings) console.log(`FINDING ${finding.code} ${finding.message}`);
  if (!result.ok) {
    const stale = result.findings.filter((finding) => finding.code === 'STALE-TREE').length;
    console.error(
      `check-train-records: FAIL - ${result.findings.length} finding(s); ${stale} of ${result.counts.rows} recorded journey row(s) ` +
        `attest to trees that are not in the corpus. The record is evidence about trees that no longer exist. ` +
        `Re-record it (about six minutes): first materialise the training trees, because pilot/training-projects/ is ` +
        `gitignored and a fresh worktree has none to drive -\n` +
        `  node scripts/scaffold-training-corpus.mjs --record /tmp/training-corpus.json\n` +
        `  node scripts/train-corpus-run.mjs\n` +
        `which rewrites ${RECORDS_PATH} and its companion YIELD.md.`,
    );
    process.exit(1);
  }
  console.log(
    `check-train-records: PASS - all ${result.counts.rows} recorded journey row(s) drove the corpus tree the corpus still holds ` +
      `(run ${result.runId}, corpus generated ${result.corpusGeneratedAt})`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
