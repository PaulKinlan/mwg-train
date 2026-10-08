#!/usr/bin/env node
/**
 * Gate the training/eval split: the training corpus must share no family and no target design
 * with the sealed held-out evaluation.
 *
 *   node scripts/check-disjoint.mjs [--train docs/train/briefs/manifest.jsonl]
 *     [--eval docs/eval/briefs/manifest.jsonl] [--targets data/A6_evaluation/targets/manifest.jsonl]
 *     [--expect-seal sha256:...]
 *
 * Fails closed: any finding - a shared family, a seal mismatch, an unreadable manifest - prints
 * one line per finding and exits non-zero. Exit 0 only means the assertion passed. It never
 * throws: a missing file is a FAIL, not a stack trace.
 */
import process from 'node:process';

import { EVAL_MANIFEST, EVAL_SEAL, EVAL_TARGETS_MANIFEST, assertDisjointTrainingCorpus } from '../src/train/disjoint.mjs';

function parseArgs(argv) {
  const args = { train: 'docs/train/briefs/manifest.jsonl', eval: EVAL_MANIFEST, targets: EVAL_TARGETS_MANIFEST, expectSeal: EVAL_SEAL };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--train') args.train = argv[++i];
    else if (argv[i] === '--eval') args.eval = argv[++i];
    else if (argv[i] === '--targets') args.targets = argv[++i];
    else if (argv[i] === '--expect-seal') args.expectSeal = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`check-disjoint: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error('usage: node scripts/check-disjoint.mjs [--train <path>] [--eval <path>] [--targets <path>] [--expect-seal sha256:...]');
    process.exit(0);
  }

  let result;
  try {
    result = assertDisjointTrainingCorpus({
      trainManifestPath: args.train,
      evalManifestPath: args.eval,
      targetsManifestPath: args.targets,
      expectedSeal: args.expectSeal,
    });
  } catch (error) {
    // The assertion is contracted not to throw; if it ever does, that is itself a failure.
    console.log(`FINDING DISJOINTNESS_CHECK_ERROR the disjointness check itself failed: ${error.message}`);
    console.error('check-disjoint: FAIL - the check could not run');
    process.exit(1);
  }

  for (const finding of result.findings) {
    console.log(`FINDING ${finding.code} ${finding.message}`);
  }
  if (!result.ok) {
    console.error(`check-disjoint: FAIL - ${result.findings.length} finding(s); the training corpus is not proven disjoint from the sealed evaluation`);
    process.exit(1);
  }
  console.log(
    `check-disjoint: PASS - ${result.trainRows} training row(s) share no family and no target design with the sealed evaluation; eval seal ${result.evalSeal} (expected ${args.expectSeal})`,
  );
}

main();
