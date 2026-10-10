#!/usr/bin/env node
/**
 * The corpus retention gate: prove every original named in a manifest is still reachable.
 *
 *   node scripts/verify-originals.mjs <manifest.jsonl> [--repo <originals-repo>] [--remote origin]
 *   node scripts/verify-originals.mjs --manifest <manifest.jsonl> [--repo <originals-repo>] [--remote origin]
 *
 * With --if-present a manifest that is not there is a labelled skip and exit 0, for the package.json
 * check wrapper; without it, naming a path that does not exist is a hard error.
 *
 * NOTE that the package.json wrapper is a checkout convenience, not the acceptance invocation: it
 * checks whatever manifest is named against the LOCAL refs of the current repository. Accepting a
 * corpus requires the documented form in docs/provenance/original-refs.md, which names the originals
 * repository and passes --remote origin so a ref that was only ever created locally fails the gate.
 * A skip is not evidence that anything is retained.
 *
 * The manifest may be given positionally or with --manifest. The positional form is the convention
 * scripts/validate-provenance.mjs already uses, and the two must not disagree: package.json's
 * check:originals passed it positionally while this parser only accepted the flag, so the retention
 * gate exited 2 with "unknown argument" and had never run (mwg-train-vkw).
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
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

import { checkOriginal } from '../src/provenance/originals.mjs';
import { parseManifest } from '../src/provenance/record.mjs';

function parseArgs(argv) {
  const args = { repo: process.cwd(), remote: null, all: false, manifest: null };
  const positional = [];
  // EVERY option that takes a value is refused when it is repeated, not just the positional/--manifest
  // pair. A repeated option silently replaces the earlier value, so the gate can end up reading a
  // different path than the caller named - and with --if-present it can SKIP a manifest that exists
  // because a later, misspelled one does not:
  //   --if-present --manifest real.jsonl --manifest typo.jsonl   used to exit 0 without checking
  //   real.jsonl at all. The gate must never silently ignore a path the caller named.
  const givenValueOption = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) {
        console.error(`verify-originals: ${arg} needs a value`);
        process.exit(2);
      }
      // A missing value must not swallow the next option: `--manifest --repo x` would otherwise record
      // '--repo' as the manifest path and leave `x` as a stray positional.
      if (value.startsWith('-') && value !== '-') {
        console.error(`verify-originals: ${arg} needs a value, but the next argument is the option '${value}'`);
        process.exit(2);
      }
      i += 1;
      return value;
    };
    if (arg === '--manifest' || arg === '--repo' || arg === '--remote') {
      if (givenValueOption.has(arg)) {
        console.error(`verify-originals: ${arg} was given more than once; refusing rather than using the last one`);
        process.exit(2);
      }
      givenValueOption.add(arg);
      if (arg === '--manifest') args.manifest = next();
      else if (arg === '--repo') args.repo = next();
      else args.remote = next();
    }
    else if (arg === '--if-present') args.ifPresent = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('-') && arg !== '-') {
      console.error(`verify-originals: unknown argument '${arg}'`);
      process.exit(2);
    } else positional.push(arg);
  }
  // A positional argument is the manifest, so that the form the sibling validate-provenance.mjs uses
  // works here too. Naming it twice is ambiguous rather than last-one-wins: one of the two paths would
  // be silently ignored, and a gate that reads a different file than the caller named is worse than one
  // that refuses.
  if (positional.length > 1) {
    console.error(`verify-originals: expected at most one manifest path, got ${positional.length}: ${positional.join(' ')}`);
    process.exit(2);
  }
  if (positional.length === 1) {
    if (args.manifest !== null) {
      console.error(`verify-originals: the manifest was given twice - positionally as '${positional[0]}' and with --manifest as '${args.manifest}'`);
      process.exit(2);
    }
    args.manifest = positional[0];
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
      // No --tags here: it would restrict ls-remote to refs/tags/* and silently return nothing for
      // the alternative refs/mwg-train/originals/* namespace, which reported a pushed ref as
      // REF_NOT_ON_REMOTE. With a glob pattern and no --tags, git still emits the peeled
      // `<sha> <ref>^{}` line for an annotated tag, which is what the comparison below wants.
      const out = git(repo, ['ls-remote', remote, `${ref}*`], { check: true });
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
  // The corpus manifest is a deployment artifact: it is not committed, so a checkout normally has
  // none. Rather than crash - or worse, be red on every clean checkout, which is how a gate stops
  // being read - a caller that names a manifest which is not there can ask to be skipped, exactly as
  // scripts/check-provenance-quotes.mjs does when its local captures are absent. This is OPT-IN: a
  // path the caller named that does not exist is still a hard error by default, because a typo must
  // not look like a clean result.
  if (!args.help && args.ifPresent && args.manifest && !existsSync(args.manifest)) {
    console.log(`verify-originals: no corpus manifest at '${args.manifest}' (the retention gate runs against the deployed corpus); skipped`);
    process.exit(0);
  }
  if (args.help || !args.manifest) {
    console.error('usage: node scripts/verify-originals.mjs <manifest.jsonl> [--repo <dir>] [--remote origin]');
    console.error('       node scripts/verify-originals.mjs --manifest <manifest.jsonl> [--repo <dir>] [--remote origin]');
    process.exit(args.help ? 0 : 2);
  }

  let source;
  try {
    source = readFileSync(args.manifest, 'utf8');
  } catch (error) {
    console.error(`verify-originals: cannot read '${args.manifest}': ${error.message}`);
    process.exit(2);
  }
  const rows = parseManifest(source);
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
