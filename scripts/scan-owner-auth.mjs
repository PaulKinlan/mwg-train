#!/usr/bin/env node
/**
 * The owner-auth corpus gate (Paul, 2026-10-08): scan every accepted pair for owner-identifying
 * material - the owner's handle, name, domain, credential names and values, and the proxy headers
 * of the viewer's gate. Fail-closed: if the identity config cannot be read, or a pair's tree
 * cannot be scanned, the pair is NOT accepted.
 *
 *   node scripts/scan-owner-auth.mjs <tree> [<tree>...] [--config <path>]
 *   node scripts/scan-owner-auth.mjs --corpus pilot [--run <runId>]
 *
 * With --corpus, every project under <corpus>/projects is scanned: the original tree, plus the
 * uplifted tree - from the run's kept copy when present, else deterministically regenerated with
 * the repo's uplift tool and verified against the recorded uplifted sha before scanning. When
 * neither is possible the pair fails (the scan cannot run).
 *
 * The TRAINING corpus is in scope too (mwg-train-9way): the projects recorded in
 * <corpus>/TRAINING_CORPUS.json are served by the viewer and are the material a model actually
 * trains on, so every one of them is scanned - its measured original, its uplifted copy where an
 * uplifted sha is recorded, and the training manifest itself as the corpus record. Training
 * projects are gated whether or not a run scored them accepted: acceptance is what admits an eval
 * pair to the corpus, while a training project is in the corpus by being in that manifest. They are
 * loaded independently of --run, so choosing an alternate eval run cannot walk past them, and a
 * missing, unreadable, empty, or malformed TRAINING_CORPUS.json is a fail-closed error rather than
 * an empty training corpus that scans nothing and passes.
 *
 * Exit code 0 only if every scanned tree is clean. A file the scan cannot read (oversized or
 * binary) is a scan error, not a skip: the tree fails.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { listRuns, loadCorpus, loadTrainingProjects } from '../src/viewer/corpus.mjs';
import { scanTree, scanPairRecords, loadScanConfig, buildMatchers } from '../src/viewer/owner-auth.mjs';
import { hashTree } from '../src/corpus/tree-hash.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const DEFAULT_CONFIG = resolve(process.cwd(), 'docs/eval/owner-identity.json');

function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG, corpus: null, run: null, trees: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') args.config = resolve(argv[++i]);
    else if (argv[i] === '--corpus') args.corpus = resolve(argv[++i]);
    else if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: scan-owner-auth.mjs <tree> [<tree>...] [--config <path>] | --corpus <dir> [--run <id>]');
      process.exit(0);
    } else args.trees.push(resolve(argv[i]));
  }
  return args;
}

function report(label, result) {
  console.log(`${result.status} ${label}`);
  for (const finding of (result.findings ?? []).slice(0, 20)) {
    // Never print the matched text: it may be a secret value.
    console.log(`    ${finding.file ?? '?'}${finding.line ? `:${finding.line}` : ''} - ${finding.patternId}`);
  }
  if ((result.findings ?? []).length > 20) console.log(`    … and ${result.findings.length - 20} more`);
}

/**
 * Deterministically regenerate the uplifted tree with the repo's uplift tool and verify it against
 * the recorded sha. Returns the directory to scan, or null when regeneration is impossible or
 * fails verification (the caller then fails closed).
 */
async function regenerateUplifted(project, originalDir, tempDirs) {
  const expected = project.decision?.uplifted_sha;
  if (!expected) return null;
  const upliftTool = resolve(repoRoot, 'src/corpus/uplift.mjs');
  if (!existsSync(upliftTool)) return null;
  // Manifest-only projects carry a placeholder spec; the spec the recorded uplift was produced
  // from lives in the materialized original tree (read it only after that tree hash-verified).
  const spec = project.spec?.routes ? project.spec : readJson(join(originalDir, 'spec.json'));
  if (!spec) return null;
  const dir = mkdtempSync(join(tmpdir(), 'owner-auth-uplift-'));
  tempDirs.push(dir);
  try {
    const { upliftProject } = await import(upliftTool);
    upliftProject(originalDir, spec, dir);
    const actual = hashTree(dir);
    if (actual !== expected) {
      console.log(`    regeneration mismatch for ${project.id}: expected ${expected}, got ${actual}`);
      return null;
    }
    return dir;
  } catch (error) {
    console.log(`    regeneration failed for ${project.id}: ${error.message}`);
    return null;
  }
}

/** The plan-materialized measured originals, generated once per invocation. */
let materializedDir = null;
async function materializeMeasuredOriginals(tempDirs) {
  if (materializedDir !== null) return materializedDir || null;
  const generatePath = resolve(repoRoot, 'pilot/generate.mjs');
  if (!existsSync(generatePath)) {
    materializedDir = '';
    return null;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'owner-auth-originals-'));
  tempDirs.push(outDir);
  const { generateCorpus } = await import(generatePath);
  generateCorpus({ outDir, planPath: resolve(repoRoot, 'pilot/plan.json') });
  materializedDir = outDir;
  return outDir;
}

/** The scaffolded training-corpus trees, generated once per invocation. */
let materializedTrainingDir = null;
async function materializeTrainingOriginals(tempDirs) {
  if (materializedTrainingDir !== null) return materializedTrainingDir || null;
  const scaffoldPath = resolve(repoRoot, 'scripts/scaffold-training-corpus.mjs');
  if (!existsSync(scaffoldPath)) {
    materializedTrainingDir = '';
    return null;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'owner-auth-training-'));
  tempDirs.push(outDir);
  const { scaffoldCorpus } = await import(scaffoldPath);
  scaffoldCorpus({ outDir, record: false });
  materializedTrainingDir = outDir;
  return outDir;
}

/**
 * The measured original of a training project: a kept copy under <corpus>/training-projects when it
 * still hashes to the recorded sha, otherwise the tree the scaffolder re-derives from the training
 * briefs. Returns the directory to scan, or null when neither matches (the caller fails closed).
 */
async function trainingMeasuredOriginal(project, expected, corpusRoot, tempDirs) {
  const keptDir = join(corpusRoot, 'training-projects', project.id);
  if (existsSync(keptDir) && hashTree(keptDir) === expected) return keptDir;
  const materialized = await materializeTrainingOriginals(tempDirs);
  const candidate = materialized ? join(materialized, project.id) : null;
  if (candidate && existsSync(candidate) && hashTree(candidate) === expected) return candidate;
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tempDirs = [];

  try {
    let matchers;
    let scanOptions = {};
    try {
      const config = loadScanConfig(args.config);
      matchers = buildMatchers(config);
      scanOptions = config.scan ?? {};
    } catch (error) {
      // Fail-closed: an unreadable config means nothing is accepted.
      console.error(`ERROR (fail-closed): ${error.message}`);
      return 3;
    }

    let failed = 0;
    let scanned = 0;
    const scanOne = (label, dir) => {
      scanned += 1;
      if (!dir || !existsSync(dir)) {
        failed += 1;
        console.log(`FAIL ${label} - tree missing (${dir ?? 'none'})`);
        return;
      }
      const result = scanTree(dir, matchers, scanOptions);
      if (result.status !== 'PASS') failed += 1;
      report(label, result);
    };

    if (args.corpus) {
      // Default to the MANIFEST's recorded run, not the newest local run dir: a fresh local run
      // with no decisions yet must not leave the gate scanning zero accepted pairs and passing.
      const manifestRun = readJson(join(args.corpus, 'CORPUS.json'))?.run_id ?? null;
      const runId = args.run ?? manifestRun ?? listRuns(args.corpus)[0] ?? null;
      // includeTraining: false - the training corpus is loaded on its own below, so it is scanned
      // for every --run rather than only for the run the eval manifest records.
      const corpus = loadCorpus(args.corpus, runId, { includeTraining: false });
      // Training projects are bound to TRAINING_CORPUS.json, never to the selected run's decisions:
      // an alternate --run selects the eval view, and must not select away the material a model
      // trains on. Strict: a manifest that cannot supply training projects fails the gate here
      // instead of reading as an empty training corpus that scans nothing.
      let trainingProjects;
      try {
        trainingProjects = loadTrainingProjects(args.corpus, { strict: true }).projects;
      } catch (error) {
        console.error(`ERROR (fail-closed): ${error.message}`);
        return 3;
      }
      const work = [
        ...corpus.projects.map((project) => ({ project, training: false })),
        ...trainingProjects.map((project) => ({ project, training: true })),
      ];
      if (work.length === 0) {
        console.error('ERROR (fail-closed): no projects found - nothing to accept');
        return 3;
      }
      for (const { project, training } of work) {
        // The eval gate is over ACCEPTED pairs (Paul's rule): a project with no accepted decision has
        // no accepted pair to contaminate yet. A training project is not gated on acceptance - it is
        // corpus by being in TRAINING_CORPUS.json, so every one of them is scanned.
        if (!training && project.decision?.accepted !== true) {
          console.log(`SKIP ${project.id} - no accepted pair recorded (state: ${project.decision?.category ?? 'no run'})`);
          continue;
        }
        // The original of record is the MEASURED tree: the committed tree when it still hashes to
        // the recorded original sha, otherwise the regenerated one - plan-generated for an eval pair,
        // scaffolded from the training briefs for a tr-* project. A drifted committed tree cannot
        // smuggle a clean scan over a tree the record never measured.
        const expectedOriginal = project.decision?.original_sha ?? null;
        if (!expectedOriginal) {
          failed += 1;
          console.log(`FAIL ${project.id} - the ${training ? 'training record' : 'accepted decision'} records no original sha`);
          continue;
        }
        let originalDir = project.originalTreeDir;
        if (hashTree(originalDir) !== expectedOriginal) {
          if (training) {
            originalDir = await trainingMeasuredOriginal(project, expectedOriginal, args.corpus, tempDirs);
          } else {
            const materialized = await materializeMeasuredOriginals(tempDirs);
            const candidate = materialized ? join(materialized, project.id) : null;
            originalDir = candidate && existsSync(candidate) && hashTree(candidate) === expectedOriginal ? candidate : null;
          }
          if (!originalDir) {
            failed += 1;
            console.log(`FAIL ${project.id} - the measured original cannot be reproduced to its recorded sha`);
            continue;
          }
        }
        scanOne(`${project.id} (original)`, originalDir);
        // The rule covers the corpus RECORD as well as the site source, and BOTH records are in
        // scope: the committed manifest whenever it exists, plus the local run records (mandatory
        // once a run covers the project). Owner material in either fails the pair. A training
        // project's record of record is TRAINING_CORPUS.json - the eval manifest says nothing about
        // it, and scanning the wrong manifest is a PASS over a file that never described the tree.
        scanned += 1;
        const recordResult = (() => {
          const manifestPath = join(args.corpus, training ? 'TRAINING_CORPUS.json' : 'CORPUS.json');
          const manifestResult = existsSync(manifestPath) ? scanTree(manifestPath, matchers, scanOptions) : null;
          const runResult = project.runDir ? scanPairRecords(project, matchers, scanOptions) : null;
          if (!manifestResult && !runResult) {
            return { status: 'FAIL', findings: [{ file: manifestPath, line: null, patternId: 'record-missing', kind: 'scan-error' }] };
          }
          const findings = [...(manifestResult?.findings ?? []), ...(runResult?.findings ?? [])];
          return { status: findings.length === 0 ? 'PASS' : 'FAIL', findings };
        })();
        if (recordResult.status !== 'PASS') failed += 1;
        report(`${project.id} (corpus records)`, recordResult);
        const expectedUplift = project.decision?.uplifted_sha ?? null;
        if (!expectedUplift) {
          if (training) {
            // An unscored training original is original-only: no uplifted pair is recorded, so there
            // is no uplifted tree that could carry owner material. Said out loud, never silently cut.
            console.log(`NO-UPLIFT ${project.id} - no uplifted pair recorded; the original was scanned, there is no uplifted tree to scan`);
            continue;
          }
          failed += 1;
          console.log(`FAIL ${project.id} - the accepted decision records no uplift sha`);
          continue;
        }
        if (project.upliftedTreeDir && existsSync(project.upliftedTreeDir)) {
          // A kept TARGET is scanned only when it still IS the recorded tree.
          if (hashTree(project.upliftedTreeDir) === expectedUplift) {
            scanOne(`${project.id} (uplifted)`, project.upliftedTreeDir);
          } else {
            const regenerated = await regenerateUplifted(project, originalDir, tempDirs);
            if (regenerated) scanOne(`${project.id} (uplifted, regenerated+verified)`, regenerated);
            else {
              failed += 1;
              console.log(
                `FAIL ${project.id} - kept uplifted tree drifted from the recorded sha and regeneration could not reproduce it`,
              );
            }
          }
        } else {
          const regenerated = await regenerateUplifted(project, originalDir, tempDirs);
          if (regenerated) scanOne(`${project.id} (uplifted, regenerated+verified)`, regenerated);
          else {
            failed += 1;
            console.log(
              `FAIL ${project.id} (uplifted) - tree not kept and not reproducibly regenerable; the scan cannot run, so the pair is not accepted`,
            );
          }
        }
      }
    } else if (args.trees.length > 0) {
      for (const tree of args.trees) scanOne(tree, tree);
    } else {
      console.error('nothing to scan: pass trees or --corpus');
      return 2;
    }

    console.log(`owner-auth scan: ${scanned} tree(s), ${failed} failed`);
    // Fail-closed on vacuity: a gate that scanned nothing approved nothing, and must not exit 0.
    if (scanned === 0) {
      console.error('ERROR (fail-closed): zero trees scanned - nothing was verified, so nothing passes');
      return 3;
    }
    return failed === 0 ? 0 : 1;
  } finally {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        console.error(`ERROR cleaning up temp dir ${dir}: ${e.message}`);
      }
    }
  }
}

main().then(code => process.exit(code)).catch((error) => {
  console.error(`ERROR (fail-closed): ${error.message}`);
  process.exit(3);
});
