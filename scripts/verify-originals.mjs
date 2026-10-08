#!/usr/bin/env node
/**
 * The corpus retention gate: prove every original named in a manifest is still reachable.
 *
 *   node scripts/verify-originals.mjs --manifest <manifest.jsonl> --repo <originals-repo> [--remote origin]
 *
 * For every row that carries an original ref, this resolves the recorded REF (not a branch name
 * that may have been deleted), checks the object exists, and checks the ref still points at the
 * recorded SHA. With --remote it also checks the ref is present on the remote at the same sha, so a
 * tag that was only ever created locally fails the gate - a ref that was never pushed dies with the
 * machine that made it.
 *
 * It fails closed: any error exits non-zero, so a corpus that cannot be re-transformed does not
 * pass an acceptance gate. Run it next to scripts/validate-provenance.mjs:
 *
 *   node scripts/validate-provenance.mjs docs/provenance/manifest.jsonl \
 *     && node scripts/verify-originals.mjs --manifest docs/provenance/manifest.jsonl --repo <dir> --remote origin
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { checkOriginal } from '../src/provenance/originals.mjs';
import { parseManifest } from '../src/provenance/record.mjs';

function parseArgs(argv) {
  const args = { repo: process.cwd(), remote: null, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) {
        console.error(`verify-originals: ${arg} needs a value`);
        process.exit(2);
      }
      i += 1;
      return value;
    };
    if (arg === '--manifest') args.manifest = next();
    else if (arg === '--repo') args.repo = next();
    else if (arg === '--remote') args.remote = next();
    else if (arg === '--help' || arg === '-h') args.help = true;
    else {
      console.error(`verify-originals: unknown argument '${arg}'`);
      process.exit(2);
    }
  }
  return args;
}

function git(repo, argv, { check = false } = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...argv], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (check) return null;
    throw error;
  }
}

/** Real probe. Each call is bounded; a repository that cannot answer is a failure, not a crash. */
function makeProbe(repo, remote) {
  const probe = {
    resolveRef(ref) {
      return git(repo, ['rev-parse', '--verify', `${ref}^{commit}`], { check: true }) || null;
    },
    objectExists(sha) {
      return git(repo, ['cat-file', '-e', `${sha}^{commit}`], { check: true }) !== null;
    },
    treeOf(sha) {
      return git(repo, ['rev-parse', '--verify', `${sha}^{tree}`], { check: true }) || null;
    },
  };
  if (remote) {
    probe.remoteRef = (ref) => {
      // `git ls-remote <remote> <ref>` prints the tag OBJECT sha for an annotated tag, and git only
      // emits the peeled `<sha> <ref>^{}` line when the pattern is a glob - so ask with a trailing
      // `*` and then filter to the exact ref. Project ids cannot contain glob metacharacters, so
      // the extra matches the glob may return are ignored by the exact-name comparison below.
      const out = git(repo, ['ls-remote', '--tags', remote, `${ref}*`], { check: true });
      if (!out) return null;
      const lines = out.split('\n').map((line) => line.trim().split(/\s+/));
      const peeled = lines.find(([, name]) => name === `${ref}^{}`);
      const direct = lines.find(([, name]) => name === ref);
      const row = peeled ?? direct;
      return row ? row[0] : null;
    };
  }
  return probe;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.manifest) {
    console.error('usage: node scripts/verify-originals.mjs --manifest <manifest.jsonl> [--repo <dir>] [--remote origin]');
    process.exit(args.help ? 0 : 2);
  }

  const rows = parseManifest(readFileSync(args.manifest, 'utf8'));
  const probe = makeProbe(args.repo, args.remote);
  const findings = [];
  let withRef = 0;
  let reachable = 0;

  // Every row is checked, including the ones that should NOT carry a ref: a kind that requires one
  // and does not have it is a finding (MISSING_ORIGINAL_REF), and a brief that has none is clean.
  for (const row of rows) {
    const rowFindings = checkOriginal(row, probe);
    const hasRef = typeof row?.original_ref === 'string' && row.original_ref !== '';
    if (hasRef) withRef += 1;
    if (hasRef && rowFindings.length === 0) reachable += 1;
    findings.push(...rowFindings);
  }

  console.log(
    `verify-originals: ${rows.length} records, ${reachable}/${withRef} retained refs resolve to their recorded sha and object, ${findings.length} finding(s) in ${args.manifest}`,
  );
  for (const f of findings) {
    console.log(`${f.severity.toUpperCase()} ${f.code} ${f.id} [${f.field}] ${f.message}`);
  }
  if (findings.some((f) => f.severity === 'error')) {
    console.error('verify-originals: FAIL - the corpus cannot be re-transformed from these refs');
    process.exit(1);
  }
  console.log(`verify-originals: PASS${args.remote ? ` (including ${args.remote})` : ' (local refs only; pass --remote to check the pushed refs)'}`);
}

main();
