#!/usr/bin/env node
/**
 * Gate the held-out brief manifest: the preregistration's invariants, checked as code.
 *
 *   node scripts/validate-briefs.mjs docs/eval/briefs/manifest.jsonl \
 *     [--rules docs/eval/rules.json] [--corpus <corpus manifest with family_ids>] [--seal]
 *
 * Fails closed. `--seal` additionally prints the seal hash (sha256 over the canonical brief
 * content), which is the value recorded in the preregistration before any training run: results may
 * only be reported against a sealed hash, so the test set cannot be edited after seeing outcomes.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import {
  BriefError,
  SEAL_FORM,
  canonicalJson,
  familyOverlap,
  parseBriefs,
  ruleIndex,
  sealHash,
  summarizeBriefs,
  validateBriefs,
} from '../src/eval/prereg.mjs';

function parseArgs(argv) {
  const args = { rules: 'docs/eval/rules.json', corpus: null, seal: false, sealOut: null, expectSeal: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rules') args.rules = argv[++i];
    else if (argv[i] === '--corpus') args.corpus = argv[++i];
    else if (argv[i] === '--seal') args.seal = true;
    else if (argv[i] === '--seal-out') args.sealOut = argv[++i];
    else if (argv[i] === '--expect-seal') {
      args.seal = true;
      args.expectSeal = argv[++i];
    }
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else if (argv[i].startsWith('--')) {
      console.error(`validate-briefs: unknown argument '${argv[i]}'`);
      process.exit(2);
    } else if (!args.manifest) args.manifest = argv[i];
    else {
      console.error(`validate-briefs: unexpected argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

/** Re-exported so callers and tests have one canonical-form implementation to import. */
export { canonicalJson, sealHash, SEAL_FORM };

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.manifest) {
    console.error('usage: node scripts/validate-briefs.mjs <manifest.jsonl> [--rules rules.json] [--corpus <path>] [--seal] [--expect-seal sha256:…]');
    process.exit(args.help ? 0 : 2);
  }

  // Hostile or truncated input is a finding, not a stack trace: this validator is pointed at files
  // it did not write (a corpus manifest, a corpus someone edited by hand).
  let rows;
  let index;
  try {
    rows = parseBriefs(readFileSync(args.manifest, 'utf8'));
    index = ruleIndex(JSON.parse(readFileSync(args.rules, 'utf8')));
  } catch (error) {
    console.log(`ERROR ${error instanceof BriefError ? error.code : 'UNREADABLE_INPUT'} manifest ${error.message}`);
    console.error('validate-briefs: FAIL - the manifest could not be read');
    process.exit(1);
  }

  const { ok, findings, counts } = validateBriefs(rows, index);

  console.log(
    `validate-briefs: ${counts.briefs} briefs, ${counts.families} families (dev ${counts.familiesBySplit.dev ?? 0}, test ${counts.familiesBySplit.test ?? 0}), rules pinned at ${index.hash}`,
  );
  console.log(
    `validate-briefs: strata ${JSON.stringify(counts.byStratum)} tasks ${JSON.stringify(counts.byTask)} already-modern ${counts.alreadyModern}`,
  );

  let overlap = [];
  if (args.corpus) {
    overlap = familyOverlap(rows, parseBriefs(readFileSync(args.corpus, 'utf8')));
    for (const family of overlap) {
      console.log(`ERROR FAMILY_IN_BOTH_MANIFESTS ${family} appears in ${args.manifest} and ${args.corpus}`);
    }
  }

  for (const f of findings) {
    console.log(`${f.severity.toUpperCase()} ${f.code} ${f.id}${f.field ? ` [${f.field}]` : ''} ${f.message}`);
  }

  let sealMismatch = false;
  if (args.seal) {
    const hash = sealHash(rows);
    console.log(`validate-briefs: seal ${hash}`);
    console.log(`validate-briefs: seal form ${SEAL_FORM}`);
    // --expect-seal turns printing into asserting, so CI can hold a commit to the preregistered hash
    // rather than to whatever the file currently contains.
    if (args.expectSeal && args.expectSeal !== hash) {
      console.log(`ERROR SEAL_MISMATCH manifest hashes to ${hash}, expected ${args.expectSeal}`);
      sealMismatch = true;
    }
    if (args.sealOut) {
      writeFileSync(args.sealOut, `${hash}\n`);
      console.log(`validate-briefs: wrote ${args.sealOut}`);
    }
  }

  if (!ok || overlap.length > 0 || sealMismatch) {
    console.error('validate-briefs: FAIL - the brief manifest does not satisfy the preregistration');
    process.exit(1);
  }
  console.log('validate-briefs: PASS');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
