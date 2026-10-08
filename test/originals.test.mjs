import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ALT_RETAINED_REF_PREFIX,
  COMMIT_SHA_PATTERN,
  RETAINED_REF_PREFIX,
  checkOriginal,
  isRetainedRef,
  retainedRef,
  validateOriginalFields,
} from '../src/provenance/originals.mjs';
import { validateRecord } from '../src/provenance/record.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const TREE = 'c'.repeat(40);

const record = {
  id: 'proj-0001',
  arm: 'A1_self_generated',
  kind: 'original',
  storage_path: 'data/A1_self_generated/projects/proj-0001',
  generator: { type: 'open-weight' },
  rights_ref: 'docs/provenance/assets/student-base-models.md',
  original_ref: retainedRef('proj-0001'),
  original_sha: SHA_A,
  original_tree: TREE,
};

const codes = (findings) => findings.map((f) => f.code);

test('retained refs use the tag namespace and reject bad ids', () => {
  assert.equal(retainedRef('proj-0001'), `${RETAINED_REF_PREFIX}proj-0001`);
  assert.equal(isRetainedRef(retainedRef('x')), true);
  assert.equal(isRetainedRef(`${ALT_RETAINED_REF_PREFIX}x`), true);
  assert.equal(isRetainedRef('refs/heads/main'), false);
  assert.equal(isRetainedRef('refs/tags/v1'), false);
  assert.throws(() => retainedRef('Proj 0001'), { code: 'BAD_PROJECT_ID' });
  assert.throws(() => retainedRef(''), { code: 'BAD_PROJECT_ID' });
});

test('shape validation requires a retained ref for originals, reproductions and evaluations', () => {
  assert.deepEqual(validateOriginalFields(record), []);

  for (const kind of ['original', 'reproduction', 'evaluation']) {
    const missing = validateOriginalFields({ id: 'x', kind });
    assert.ok(codes(missing).includes('MISSING_ORIGINAL_REF'), kind);
    assert.ok(codes(missing).includes('MISSING_ORIGINAL_SHA'), kind);
  }

  // briefs and plain assets do not carry a commit, and must not be forced to invent one
  assert.deepEqual(validateOriginalFields({ id: 'x', kind: 'brief' }), []);
  assert.deepEqual(validateOriginalFields({ id: 'x', kind: 'asset' }), []);
  assert.deepEqual(validateOriginalFields({ id: 'x', kind: 'uplift', parents: ['p'] }), []);
});

test('a branch is not a retained ref, and a short sha is not a commit sha', () => {
  const branch = validateOriginalFields({ ...record, original_ref: 'refs/heads/originals/proj-0001' });
  assert.ok(codes(branch).includes('REF_NOT_RETAINED'));

  const short = validateOriginalFields({ ...record, original_sha: 'abc1234' });
  assert.ok(codes(short).includes('BAD_ORIGINAL_SHA'));

  const wrongName = validateOriginalFields({ ...record, original_ref: `${RETAINED_REF_PREFIX}something-else` });
  assert.ok(codes(wrongName).includes('REF_NOT_CANONICAL'));

  const altNamespace = validateOriginalFields({ ...record, original_ref: `${ALT_RETAINED_REF_PREFIX}proj-0001` });
  assert.deepEqual(altNamespace, [], 'the documented alternative namespace is accepted');
});

test('validateRecord includes the retention findings', () => {
  assert.deepEqual(validateRecord({ ...record, excluded_from_training: false }), []);
  assert.ok(codes(validateRecord({ ...record, original_ref: undefined, excluded_from_training: false })).includes('MISSING_ORIGINAL_REF'));
  assert.ok(
    codes(validateRecord({ ...record, excluded_from_training: false, retention: { repo: '/srv/originals', protections: [] } })).includes(
      'BAD_RETENTION',
    ),
  );
  assert.deepEqual(
    validateRecord({
      ...record,
      excluded_from_training: false,
      retention: { repo: '/srv/originals', url: 'git@x:y', protections: ['refs/tags/original/* protected'] },
    }),
    [],
  );
});

test('a commit sha pattern is full length, and the tree pattern is the same shape', () => {
  assert.equal(COMMIT_SHA_PATTERN.test(SHA_A), true);
  assert.equal(COMMIT_SHA_PATTERN.test('A'.repeat(40)), false);
});

test('checkOriginal fails closed on an unresolved ref, a moved ref or a missing object', () => {
  const okProbe = {
    resolveRef: () => SHA_A,
    objectExists: () => true,
    treeOf: () => TREE,
  };
  assert.deepEqual(checkOriginal(record, okProbe), []);

  assert.ok(codes(checkOriginal(record, { ...okProbe, resolveRef: () => null })).includes('REF_UNRESOLVED'));
  assert.ok(codes(checkOriginal(record, { ...okProbe, resolveRef: () => SHA_B })).includes('REF_SHA_MISMATCH'));
  assert.ok(codes(checkOriginal(record, { ...okProbe, objectExists: () => false })).includes('OBJECT_MISSING'));
  assert.ok(codes(checkOriginal(record, { ...okProbe, treeOf: () => SHA_B })).includes('TREE_MISMATCH'));

  // an unresolved ref short-circuits: there is no point reporting the object of a tag that is gone
  const gone = checkOriginal(record, { ...okProbe, resolveRef: () => null });
  assert.deepEqual(codes(gone), ['REF_UNRESOLVED']);
});

test('checkOriginal requires the ref on the remote when a remote probe is supplied', () => {
  const base = { resolveRef: () => SHA_A, objectExists: () => true, treeOf: () => TREE };
  assert.ok(codes(checkOriginal(record, { ...base, remoteRef: () => null })).includes('REF_NOT_ON_REMOTE'));
  assert.ok(codes(checkOriginal(record, { ...base, remoteRef: () => SHA_B })).includes('REF_MOVED_ON_REMOTE'));
  assert.deepEqual(checkOriginal(record, { ...base, remoteRef: () => SHA_A }), []);
});

test('a malformed row is not probed', () => {
  let probed = false;
  const probe = {
    resolveRef: () => {
      probed = true;
      return SHA_A;
    },
    objectExists: () => true,
  };
  const findings = checkOriginal({ ...record, original_sha: 'nope' }, probe);
  assert.equal(probed, false);
  assert.ok(codes(findings).includes('BAD_ORIGINAL_SHA'));
});

// ---------------------------------------------------------------------------------------------
// End-to-end: a real repository, the real CLIs, and the failure the gate exists to catch.
// ---------------------------------------------------------------------------------------------

function git(cwd, args, env = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'index.html'), '<h1>original</h1>\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'original project']);
  return git(dir, ['rev-parse', 'HEAD']);
}

function runCli(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? '' };
  }
}

const RETAIN = new URL('../scripts/retain-original.mjs', import.meta.url).pathname;
const VERIFY = new URL('../scripts/verify-originals.mjs', import.meta.url).pathname;

test('retain-original + verify-originals: the whole retention loop on a real repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'mwg-retain-'));
  const repo = join(root, 'originals');
  const bare = join(root, 'origin.git');
  try {
    const sha = makeRepo(repo);
    git(root, ['init', '-q', '--bare', bare]);
    git(repo, ['remote', 'add', 'origin', bare]);

    const retained = runCli(RETAIN, ['--repo', repo, '--project', 'proj-0001', '--push']);
    assert.equal(retained.code, 0, retained.stderr);
    const fields = JSON.parse(retained.stdout);
    assert.equal(fields.original_ref, `${RETAINED_REF_PREFIX}proj-0001`);
    assert.equal(fields.original_sha, sha);
    assert.match(fields.original_tree, COMMIT_SHA_PATTERN);
    assert.ok(Array.isArray(fields.retention.protections) && fields.retention.protections.length > 0);

    const manifest = join(root, 'manifest.jsonl');
    const row = {
      id: 'proj-0001',
      arm: 'A1_self_generated',
      kind: 'original',
      storage_path: 'data/A1_self_generated/projects/proj-0001',
      generator: { type: 'open-weight' },
      rights_ref: 'docs/provenance/assets/student-base-models.md',
      excluded_from_training: false,
      ...fields,
    };
    writeFileSync(manifest, `${JSON.stringify(row)}\n`);

    // the gate passes, including the pushed ref
    const pass = runCli(VERIFY, ['--manifest', manifest, '--repo', repo, '--remote', 'origin']);
    assert.equal(pass.code, 0, `${pass.stdout}${pass.stderr}`);
    assert.match(pass.stdout, /PASS/);

    // rerunning retention is idempotent
    const again = runCli(RETAIN, ['--repo', repo, '--project', 'proj-0001']);
    assert.equal(again.code, 0, again.stderr);

    // a moved tag is caught
    writeFileSync(join(repo, 'index.html'), '<h1>changed</h1>\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-q', '-m', 'second commit']);
    git(repo, ['tag', '-f', '-a', 'original/proj-0001', '-m', 'moved', 'HEAD']);
    const moved = runCli(VERIFY, ['--manifest', manifest, '--repo', repo]);
    assert.equal(moved.code, 1);
    assert.match(moved.stdout, /REF_SHA_MISMATCH/);

    // a deleted tag is caught
    git(repo, ['tag', '-d', 'original/proj-0001']);
    const deleted = runCli(VERIFY, ['--manifest', manifest, '--repo', repo]);
    assert.equal(deleted.code, 1);
    assert.match(deleted.stdout, /REF_UNRESOLVED/);

    // a ref that exists locally but not on the remote is caught when --remote is used: this is the
    // "created here, never pushed" case, which is what a ref that dies with the machine looks like
    git(repo, ['tag', '-a', 'original/proj-0001', '-m', 'local only', sha]);
    git(repo, ['push', 'origin', ':refs/tags/original/proj-0001']);
    const localOnly = runCli(VERIFY, ['--manifest', manifest, '--repo', repo]);
    assert.equal(localOnly.code, 0, localOnly.stdout);
    const notPushed = runCli(VERIFY, ['--manifest', manifest, '--repo', repo, '--remote', 'origin']);
    assert.equal(notPushed.code, 1);
    assert.match(notPushed.stdout, /REF_NOT_ON_REMOTE/);

    // pushing it makes the gate pass again, and rerunning retention for the recorded commit is a no-op
    git(repo, ['push', 'origin', 'refs/tags/original/proj-0001:refs/tags/original/proj-0001']);
    const pushed = runCli(VERIFY, ['--manifest', manifest, '--repo', repo, '--remote', 'origin']);
    assert.equal(pushed.code, 0, pushed.stdout);
    const rerun = runCli(RETAIN, ['--repo', repo, '--project', 'proj-0001', '--commit', sha]);
    assert.equal(rerun.code, 0, rerun.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('retain-original refuses to repoint a retained tag at a different commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'mwg-retain2-'));
  const repo = join(root, 'originals');
  try {
    makeRepo(repo);
    assert.equal(runCli(RETAIN, ['--repo', repo, '--project', 'p1']).code, 0);
    writeFileSync(join(repo, 'a.txt'), 'x\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-q', '-m', 'second']);
    const conflict = runCli(RETAIN, ['--repo', repo, '--project', 'p1', '--commit', 'HEAD']);
    assert.equal(conflict.code, 1, 'moving a retained ref must fail');
    assert.match(conflict.stderr, /immutable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
