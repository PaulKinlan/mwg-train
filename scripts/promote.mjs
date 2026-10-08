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

import { ARMS, ARM_IDS, QUARANTINED_ARMS } from '../src/provenance/arms.mjs';
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
// Containment is checked on the RESOLVED path: a symlinked source must not read outside the store.
const source = resolve(store, from);
if (!existsSync(source)) {
  console.error(`promote: '${from}' does not exist in the quarantine store`);
  process.exit(1);
}
const realSource = realpathSync(source);
if (realSource !== store && !realSource.startsWith(`${store}${sep}`)) {
  console.error(`promote: '${from}' resolves outside the quarantine store (${realSource})`);
  process.exit(1);
}

// Which arm(s) is being published? Derive the set from the RESOLVED source path inside the store
// (never from the caller's raw string). A directory above the arm roots (e.g. 'data') CONTAINS
// arms; every contained quarantined arm requires the acknowledgement, so promoting a whole
// subtree cannot launder a quarantined child through an ambiguous source.
const sourceRel = realSource.slice(store.length + 1).split(sep).join('/');
const containedArms = ARM_IDS.filter(
  (id) => sourceRel === ARMS[id].storageRoot || sourceRel.startsWith(`${ARMS[id].storageRoot}/`) || ARMS[id].storageRoot.startsWith(`${sourceRel}/`) || ARMS[id].storageRoot === sourceRel,
);
if (args.arm && containedArms.length > 0 && !containedArms.includes(args.arm)) {
  console.error(`promote: --arm ${args.arm} contradicts the source path, which is in arm(s) ${containedArms.join(', ')}`);
  process.exit(1);
}
if (containedArms.length === 0 && !args.arm) {
  console.error(`promote: cannot determine the arm of '${from}' - pass --arm explicitly (the ledger must name the arm)`);
  process.exit(1);
}
const quarantinedContained = containedArms.filter((id) => ARMS[id].quarantined);
const arm = args.arm ?? (containedArms.length === 1 ? containedArms[0] : null);
if ((quarantinedContained.length > 0 || (arm && ARMS[arm].quarantined)) && !args.acknowledgeBoundary) {
  console.error(
    `promote: '${from}' covers quarantined arm(s) ${(quarantinedContained.length > 0 ? quarantinedContained : [arm]).join(', ')}.\n` +
      'Publication is a PUBLICATION boundary, not a training-permission boundary: the asset keeps\n' +
      'its arm and its excluded_from_training flag. Re-run with --acknowledge-boundary to confirm.',
  );
  process.exit(1);
}

const target = resolve(PUBLIC_REPO, to);
// The target must stay inside the public repo on RESOLVED paths too: a symlinked parent must not
// write outside it. The target itself must not exist (promotions are additive).
if (existsSync(target)) {
  console.error(`promote: target '${to}' already exists - promotions are additive; rename or remove the target first`);
  process.exit(1);
}
let existingAncestor = target;
while (!existsSync(existingAncestor)) {
  const parent = dirname(existingAncestor);
  if (parent === existingAncestor) break;
  existingAncestor = parent;
}
const realAncestor = realpathSync(existingAncestor);
if (realAncestor !== realpathSync(PUBLIC_REPO) && !realAncestor.startsWith(`${realpathSync(PUBLIC_REPO)}${sep}`)) {
  console.error(`promote: target '${to}' resolves outside the public repo via ${existingAncestor}`);
  process.exit(1);
}

const head = execFileSync('git', ['-C', store, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync(dirname(target), { recursive: true });
mkdirSync(dirname(LEDGER), { recursive: true });
cpSync(realSource, target, { recursive: true });

const record = {
  at: new Date().toISOString(),
  arm,
  arms: containedArms.length > 0 ? containedArms : undefined,
  from,
  to,
  quarantine_head: head,
  note: 'publication only; arm and excluded_from_training unchanged',
};
appendFileSync(LEDGER, `${JSON.stringify(record)}\n`);
console.log(`promoted ${from} -> ${to} (quarantine @ ${head.slice(0, 12)}); recorded in docs/provenance/promotions.jsonl`);
