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
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { listRuns, loadCorpus } from '../src/viewer/corpus.mjs';
import { scanTree, scanRecordFiles, loadScanConfig, buildMatchers } from '../src/viewer/owner-auth.mjs';
import { hashTree } from '../src/viewer/hashtree.mjs';

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
async function regenerateUplifted(project, corpusRoot) {
  const expected = project.decision?.uplifted_sha;
  if (!expected || !project.spec) return null;
  const upliftTool = resolve(corpusRoot, '..', 'src/corpus/uplift.mjs');
  if (!existsSync(upliftTool)) return null;
  const dir = mkdtempSync(join(tmpdir(), 'owner-auth-uplift-'));
  try {
    const { upliftProject } = await import(upliftTool);
    upliftProject(project.originalTreeDir, project.spec, dir);
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
    const runId = args.run ?? listRuns(args.corpus)[0] ?? null;
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
      scanOne(`${project.id} (original)`, project.originalTreeDir);
      // The rule covers the corpus RECORD as well as the site source: decision.json, the two run
      // records and the evidence JSON are scanned too, and findings fail the pair.
      const recordFiles = [
        join(project.runDir, 'decision.json'),
        join(project.runDir, 'original.json'),
        join(project.runDir, 'uplifted.json'),
        ...(project.evidenceDir
          ? readdirSync(project.evidenceDir)
              .filter((file) => file.endsWith('.json'))
              .map((file) => join(project.evidenceDir, file))
          : []),
      ];
      scanned += 1;
      const recordResult = scanRecordFiles(recordFiles, matchers, scanOptions);
      if (recordResult.status !== 'PASS') failed += 1;
      report(`${project.id} (corpus records)`, recordResult);
      if (project.upliftedTreeDir) {
        scanOne(`${project.id} (uplifted)`, project.upliftedTreeDir);
      } else {
        const regenerated = await regenerateUplifted(project, args.corpus);
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
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`ERROR (fail-closed): ${error.message}`);
  process.exit(3);
});
