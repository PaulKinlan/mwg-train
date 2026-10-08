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
 * Exit code 0 only if every scanned tree is clean.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { listRuns, loadCorpus } from '../src/viewer/corpus.mjs';
import { scanTree, scanPairRecords, loadScanConfig, buildMatchers } from '../src/viewer/owner-auth.mjs';
import { hashTree } from '../src/viewer/hashtree.mjs';

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
async function regenerateUplifted(project, originalDir, corpusRoot) {
  const expected = project.decision?.uplifted_sha;
  if (!expected) return null;
  const upliftTool = resolve(corpusRoot, '..', 'src/corpus/uplift.mjs');
  if (!existsSync(upliftTool)) return null;
  // Manifest-only projects carry a placeholder spec; the spec the recorded uplift was produced
  // from lives in the materialized original tree (read it only after that tree hash-verified).
  const spec = project.spec?.routes ? project.spec : readJson(join(originalDir, 'spec.json'));
  if (!spec) return null;
  const dir = mkdtempSync(join(tmpdir(), 'owner-auth-uplift-'));
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
async function materializeMeasuredOriginals() {
  if (materializedDir !== null) return materializedDir || null;
  const generatePath = resolve(repoRoot, 'pilot/generate.mjs');
  if (!existsSync(generatePath)) {
    materializedDir = '';
    return null;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'owner-auth-originals-'));
  const { generateCorpus } = await import(generatePath);
  generateCorpus({ outDir, planPath: resolve(repoRoot, 'pilot/plan.json') });
  materializedDir = outDir;
  return outDir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let matchers;
  let scanOptions = {};
  try {
    const config = loadScanConfig(args.config);
    matchers = buildMatchers(config);
    scanOptions = config.scan ?? {};
  } catch (error) {
    // Fail-closed: an unreadable config means nothing is accepted.
    console.error(`ERROR (fail-closed): ${error.message}`);
    process.exit(3);
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
    const corpus = loadCorpus(args.corpus, runId);
    if (corpus.projects.length === 0) {
      console.error('ERROR (fail-closed): no projects found - nothing to accept');
      process.exit(3);
    }
    for (const project of corpus.projects) {
      // The gate is over ACCEPTED pairs (Paul's rule). A project without an accepted decision is
      // reported for visibility but is not gated - there is no accepted pair to contaminate yet.
      if (project.decision?.accepted !== true) {
        console.log(`SKIP ${project.id} - no accepted pair recorded (state: ${project.decision?.category ?? 'no run'})`);
        continue;
      }
      // The original of record is the MEASURED tree: the committed tree when it still hashes to
      // the recorded original sha, otherwise the plan-regenerated one. A drifted committed tree
      // cannot smuggle a clean scan over a tree the record never measured.
      const expectedOriginal = project.decision?.original_sha ?? null;
      if (!expectedOriginal) {
        failed += 1;
        console.log(`FAIL ${project.id} - the accepted decision records no original sha`);
        continue;
      }
      let originalDir = project.originalTreeDir;
      if (hashTree(originalDir) !== expectedOriginal) {
        const materialized = await materializeMeasuredOriginals();
        const candidate = materialized ? join(materialized, project.id) : null;
        if (candidate && existsSync(candidate) && hashTree(candidate) === expectedOriginal) {
          originalDir = candidate;
        } else {
          failed += 1;
          console.log(`FAIL ${project.id} - the measured original cannot be reproduced to its recorded sha`);
          continue;
        }
      }
      scanOne(`${project.id} (original)`, originalDir);
      // The rule covers the corpus RECORD as well as the site source, and BOTH records are in
      // scope: the committed manifest whenever it exists, plus the local run records (mandatory
      // once a run covers the project). Owner material in either fails the pair.
      scanned += 1;
      const recordResult = (() => {
        const manifestPath = join(args.corpus, 'CORPUS.json');
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
        failed += 1;
        console.log(`FAIL ${project.id} - the accepted decision records no uplift sha`);
        continue;
      }
      if (project.upliftedTreeDir && existsSync(project.upliftedTreeDir)) {
        // A kept TARGET is scanned only when it still IS the recorded tree.
        if (hashTree(project.upliftedTreeDir) === expectedUplift) {
          scanOne(`${project.id} (uplifted)`, project.upliftedTreeDir);
        } else {
          const regenerated = await regenerateUplifted(project, originalDir, args.corpus);
          if (regenerated) scanOne(`${project.id} (uplifted, regenerated+verified)`, regenerated);
          else {
            failed += 1;
            console.log(
              `FAIL ${project.id} - kept uplifted tree drifted from the recorded sha and regeneration could not reproduce it`,
            );
          }
        }
      } else {
        const regenerated = await regenerateUplifted(project, originalDir, args.corpus);
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
    process.exit(2);
  }

  console.log(`owner-auth scan: ${scanned} tree(s), ${failed} failed`);
  // Fail-closed on vacuity: a gate that scanned nothing approved nothing, and must not exit 0.
  if (scanned === 0) {
    console.error('ERROR (fail-closed): zero trees scanned - nothing was verified, so nothing passes');
    process.exit(3);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`ERROR (fail-closed): ${error.message}`);
  process.exit(3);
});
