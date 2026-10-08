#!/usr/bin/env node
/**
 * Put an original on a retained ref, and print the fields to paste into its provenance record.
 *
 *   node scripts/retain-original.mjs --repo <dir> --project <project-id> [--commit <rev>] [--push]
 *
 * Creates the annotated tag `refs/tags/original/<project-id>` at the given commit (default HEAD),
 * with a message naming the project, and optionally pushes that one ref. It never force-moves an
 * existing tag: if the ref already exists it must already point at the same commit, otherwise the
 * command fails and says so. Moving a retained ref is a history rewrite of the control, which is
 * exactly what the retention scheme exists to prevent.
 *
 * Output on success is a JSON object with the fields the manifest row needs:
 *   { original_ref, original_sha, original_tree, retention: { repo, url, protections } }
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import process from 'node:process';

import { ALT_RETAINED_REF_PREFIX, OriginalRefError, RETAINED_REF_PREFIX, originalFields, retainedRef } from '../src/provenance/originals.mjs';

function parseArgs(argv) {
  const args = { repo: process.cwd(), commit: 'HEAD', remote: 'origin', push: false, message: '', namespace: 'tag' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) {
        console.error(`retain-original: ${arg} needs a value`);
        process.exit(2);
      }
      i += 1;
      return value;
    };
    if (arg === '--repo') args.repo = next();
    else if (arg === '--project' || arg === '--project-id') args.project = next();
    else if (arg === '--commit' || arg === '--rev') args.commit = next();
    else if (arg === '--remote') args.remote = next();
    else if (arg === '--message') args.message = next();
    else if (arg === '--ref-namespace') args.namespace = next();
    else if (arg === '--push') args.push = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else {
      console.error(`retain-original: unknown argument '${arg}'`);
      process.exit(2);
    }
  }
  return args;
}

function git(repo, argv) {
  return execFileSync('git', ['-C', repo, ...argv], {
    encoding: 'utf8',
    timeout: 60_000,
    // A lane tool must never block on a credential prompt: GIT_TERMINAL_PROMPT=0 makes git fail
    // instead of asking, and stdin is not a terminal here. stdout is captured (it carries the shas),
    // stderr is inherited so git's own diagnostics stay visible.
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.error(
      'usage: node scripts/retain-original.mjs --repo <dir> --project <project-id> [--commit <rev>] [--push] [--remote origin] [--ref-namespace tag|alt]',
    );
    process.exit(args.help ? 0 : 2);
  }
  if (!['tag', 'alt'].includes(args.namespace)) {
    console.error(`retain-original: --ref-namespace must be 'tag' or 'alt', got '${args.namespace}'`);
    process.exit(2);
  }

  let ref;
  try {
    ref = args.namespace === 'alt' ? `${ALT_RETAINED_REF_PREFIX}${args.project}` : retainedRef(args.project);
  } catch (error) {
    console.error(`retain-original: ${error.message}`);
    process.exit(2);
  }

  const repo = realpathSync(args.repo);
  const sha = git(repo, ['rev-parse', '--verify', `${args.commit}^{commit}`]);
  const tree = git(repo, ['rev-parse', '--verify', `${sha}^{tree}`]);

  const existing = (() => {
    try {
      return git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]);
    } catch {
      return null;
    }
  })();

  if (existing !== null && existing !== sha) {
    console.error(
      `retain-original: ${ref} already exists at ${existing} and ${args.commit} is ${sha}. ` +
        'A retained ref is immutable: if the original itself was wrong, fix the corpus and record the ' +
        'correction in the provenance record rather than moving the ref.',
    );
    process.exit(1);
  }

  if (existing === null) {
    if (args.namespace === 'alt') {
      // The alternative namespace is a plain ref, not a tag: annotations only exist under
      // refs/tags/. The ref is still immutable in the sense that matters - this tool never moves it.
      git(repo, ['update-ref', ref, sha]);
    } else {
      const message =
        args.message ||
        [
          `MWG-train original: ${args.project}`,
          '',
          `commit ${sha}`,
          `tree   ${tree}`,
          '',
          'Retained ref for the corpus original. Do not delete, move or rewrite: it is the control',
          'that later transforms are compared against (see docs/provenance/original-refs.md).',
        ].join('\n');
      git(repo, ['tag', '-a', ref.replace(/^refs\/tags\//, ''), '-m', message, sha]);
    }
    console.error(`retain-original: created ${ref} at ${sha}`);
  } else {
    console.error(`retain-original: ${ref} already at ${sha}; nothing to do`);
  }

  let url = '';
  try {
    url = git(repo, ['remote', 'get-url', args.remote]);
  } catch {
    url = '';
  }

  if (args.push) {
    // One ref, never --tags and never --force: a push that can move other refs is not a retention tool.
    git(repo, ['push', args.remote, `${ref}:${ref}`]);
    console.error(`retain-original: pushed ${ref} to ${args.remote}`);
  }

  const fields = originalFields(
    args.project,
    sha,
    tree,
    {
      repo,
      url,
      protections: [
        `retained ref ${ref} - not a branch, so a branch prune cannot reach it`,
        `server-side ref protection and receive.denyDeletes on ${args.namespace === 'alt' ? ALT_RETAINED_REF_PREFIX : RETAINED_REF_PREFIX}* (operator setting)`,
        'history of the originals repository is never rewritten',
      ],
    },
    args.namespace,
  );
  process.stdout.write(`${JSON.stringify(fields, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  if (error instanceof OriginalRefError) console.error(`retain-original: ${error.message}`);
  else console.error(`retain-original: ${error.stderr?.toString?.() ?? error.message}`);
  process.exit(1);
}
