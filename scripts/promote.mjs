#!/usr/bin/env node
/**
 * The explicit promote step: copy material from the quarantine store into the public tree.
 *
 * Promotion is PUBLICATION, not a rights decision: the asset keeps its arm and its
 * excluded_from_training flag (the provenance layer, src/provenance/arms.mjs, governs training).
 * What changes is that the bytes become public - which is why the step is explicit, logged, and
 * refuses quarantined arms without an acknowledgement that publication is intended.
 *
 *   node scripts/promote.mjs <path-in-store> <public-target> [--arm <arm>] [--acknowledge-boundary]
 *
 * Every promotion appends to docs/provenance/promotions.jsonl: what, where from, where to, the
 * quarantine HEAD sha at the time, and when.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';

import { ARMS, QUARANTINED_ARMS } from '../src/provenance/arms.mjs';
import { REPO_ROOT, assertQuarantineStore, quarantineRoot } from '../src/provenance/store.mjs';

// Overridable for tests; in normal use this is the repo the script lives in.
const PUBLIC_REPO = process.env.MWG_TRAIN_REPO ?? REPO_ROOT;
const LEDGER = join(PUBLIC_REPO, 'docs', 'provenance', 'promotions.jsonl');

function parseArgs(argv) {
  const args = { acknowledgeBoundary: false, arm: null, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--arm') args.arm = argv[++i];
    else if (argv[i] === '--acknowledge-boundary') args.acknowledgeBoundary = true;
    else if (argv[i].startsWith('-')) {
      console.error(`promote: unknown argument '${argv[i]}'`);
      process.exit(2);
    } else args.positional.push(argv[i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.positional.length !== 2) {
  console.error('usage: node scripts/promote.mjs <path-in-store> <public-target> [--arm <arm>] [--acknowledge-boundary]');
  process.exit(2);
}
const [from, to] = args.positional;

const store = assertQuarantineStore(quarantineRoot({ repoRoot: PUBLIC_REPO }), { repoRoot: PUBLIC_REPO });
const source = resolve(store, from);
if (!source.startsWith(`${store}${sep}`) && source !== store) {
  console.error(`promote: '${from}' escapes the quarantine store`);
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`promote: '${from}' does not exist in the quarantine store`);
  process.exit(1);
}

// Which arm is being published? The arm root prefix in the store path tells us; --arm may say it
// explicitly. A quarantined arm requires the explicit acknowledgement: publication is not
// sign-off, and the person promoting must say they know that.
const arm = args.arm ?? QUARANTINED_ARMS.find((id) => from === ARMS[id].storageRoot || from.startsWith(`${ARMS[id].storageRoot}/`)) ?? null;
if (arm && ARMS[arm].quarantined && !args.acknowledgeBoundary) {
  console.error(
    `promote: '${from}' is in quarantined arm ${arm} (${ARMS[arm].label}).\n` +
      'Publication is a PUBLICATION boundary, not a training-permission boundary: the asset keeps\n' +
      'its arm and its excluded_from_training flag. Re-run with --acknowledge-boundary to confirm.',
  );
  process.exit(1);
}

const target = resolve(PUBLIC_REPO, to);
if (!target.startsWith(`${PUBLIC_REPO}${sep}`)) {
  console.error(`promote: target '${to}' escapes the public repo`);
  process.exit(1);
}
if (existsSync(target)) {
  console.error(`promote: target '${to}' already exists - promotions are additive; rename or remove the target first`);
  process.exit(1);
}

const head = execFileSync('git', ['-C', store, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync(dirname(target), { recursive: true });
mkdirSync(dirname(LEDGER), { recursive: true });
cpSync(realpathSync(source), target, { recursive: true });

const record = {
  at: new Date().toISOString(),
  arm,
  from,
  to,
  quarantine_head: head,
  note: 'publication only; arm and excluded_from_training unchanged',
};
appendFileSync(LEDGER, `${JSON.stringify(record)}\n`);
console.log(`promoted ${from} -> ${to} (quarantine @ ${head.slice(0, 12)}); recorded in docs/provenance/promotions.jsonl`);
