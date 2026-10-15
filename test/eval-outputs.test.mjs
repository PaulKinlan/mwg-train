import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { test, describe, before, after } from 'node:test';

import { outputRelativePath, outputPath, storeOutput, loadOutput } from '../src/eval/outputs.mjs';

describe('outputs store', () => {
  let TEST_DIR;
  let PUBLIC_REPO;
  let QUARANTINE_REPO;

  before(() => {
    TEST_DIR = mkdtempSync(join(realpathSync(tmpdir()), 'mwg-train-outputs-test-'));
    PUBLIC_REPO = join(TEST_DIR, 'public');
    QUARANTINE_REPO = join(TEST_DIR, 'quarantine');

    mkdirSync(PUBLIC_REPO, { recursive: true });
    mkdirSync(QUARANTINE_REPO, { recursive: true });

    // Make the quarantine store appear as a git worktree root
    execSync('git init', { cwd: PUBLIC_REPO });
    execSync('git remote add origin https://example.com/Public/repo.git', { cwd: PUBLIC_REPO });
    execSync('git init', { cwd: QUARANTINE_REPO });
    execSync('git remote add origin https://example.com/PaulKinlan/mwg-quarantine.git', { cwd: QUARANTINE_REPO });
  });

  after(() => {
    if (TEST_DIR && existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('outputRelativePath constructs well-formed paths', () => {
    assert.equal(
      outputRelativePath({ projectId: 'booking-react', model: 'deepseek/deepseek-flash' }),
      'outputs/models/deepseek/deepseek-flash/booking-react'
    );
    assert.equal(
      outputRelativePath({ projectId: 'contact-lead-vue', model: 'deterministic:no-model' }),
      'outputs/models/deterministic/no-model/contact-lead-vue'
    );
  });

  test('outputRelativePath rejects invalid inputs', () => {
    assert.throws(() => outputRelativePath({ projectId: 'booking/react', model: 'deepseek/flash' }), /not a valid project id/);
    assert.throws(() => outputRelativePath({ projectId: 'booking-react', model: 'invalid_model' }), /not a model identity/);
  });

  test('storeOutput and loadOutput roundtrip an output tree into A1 (public)', () => {
    const options = { repoRoot: PUBLIC_REPO, quarantineRoot: QUARANTINE_REPO };
    const sourceDir = join(TEST_DIR, 'source-a1');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'test.txt'), 'hello A1');

    const key = { projectId: 'test-project', model: 'deterministic:no-model' };
    const stored = storeOutput(key, 'A1_self_generated', sourceDir, options);
    
    // A1 is public, so it should be in the public repo
    assert.ok(stored.startsWith(PUBLIC_REPO));
    assert.ok(existsSync(join(stored, 'test.txt')));

    const loaded = loadOutput(key, 'A1_self_generated', options);
    assert.equal(loaded, stored);
  });

  test('storeOutput and loadOutput roundtrip an output tree into A3 (quarantine)', () => {
    const options = { repoRoot: PUBLIC_REPO, quarantineRoot: QUARANTINE_REPO };
    const sourceDir = join(TEST_DIR, 'source-a3');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'test.txt'), 'hello A3');

    const key = { projectId: 'test-project', model: 'deepseek/deepseek-flash' };
    const stored = storeOutput(key, 'A3_teacher_generated', sourceDir, options);
    
    // A3 is quarantine, so it should be in the quarantine repo
    assert.ok(stored.startsWith(QUARANTINE_REPO));
    assert.ok(existsSync(join(stored, 'test.txt')));

    const loaded = loadOutput(key, 'A3_teacher_generated', options);
    assert.equal(loaded, stored);
  });

  test('loadOutput returns null for non-existent outputs', () => {
    const options = { repoRoot: PUBLIC_REPO, quarantineRoot: QUARANTINE_REPO };
    const loaded = loadOutput({ projectId: 'missing-project', model: 'deepseek/deepseek-flash' }, 'A1_self_generated', options);
    assert.equal(loaded, null);
  });
});

describe('outputs store overwriting', () => {
  let TEST_DIR;
  let PUBLIC_REPO;
  let QUARANTINE_REPO;

  before(() => {
    TEST_DIR = mkdtempSync(join(realpathSync(tmpdir()), 'mwg-train-outputs-overwrite-'));
    PUBLIC_REPO = join(TEST_DIR, 'public');
    QUARANTINE_REPO = join(TEST_DIR, 'quarantine');

    mkdirSync(PUBLIC_REPO, { recursive: true });
    mkdirSync(QUARANTINE_REPO, { recursive: true });

    execSync('git init', { cwd: PUBLIC_REPO });
    execSync('git remote add origin https://example.com/Public/repo.git', { cwd: PUBLIC_REPO });
    execSync('git init', { cwd: QUARANTINE_REPO });
    execSync('git remote add origin https://example.com/PaulKinlan/mwg-quarantine.git', { cwd: QUARANTINE_REPO });
  });

  after(() => {
    if (TEST_DIR && existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('storeOutput overwrites existing directory', () => {
    const options = { repoRoot: PUBLIC_REPO, quarantineRoot: QUARANTINE_REPO };
    const sourceDir1 = join(TEST_DIR, 'source-1');
    const sourceDir2 = join(TEST_DIR, 'source-2');
    mkdirSync(sourceDir1, { recursive: true });
    mkdirSync(sourceDir2, { recursive: true });
    writeFileSync(join(sourceDir1, 'file1.txt'), '1');
    writeFileSync(join(sourceDir2, 'file2.txt'), '2');

    const key = { projectId: 'test-overwrite', model: 'deterministic:no-model' };
    
    storeOutput(key, 'A1_self_generated', sourceDir1, options);
    const loaded1 = loadOutput(key, 'A1_self_generated', options);
    assert.ok(existsSync(join(loaded1, 'file1.txt')));
    assert.ok(!existsSync(join(loaded1, 'file2.txt')));

    storeOutput(key, 'A1_self_generated', sourceDir2, options);
    const loaded2 = loadOutput(key, 'A1_self_generated', options);
    assert.ok(!existsSync(join(loaded2, 'file1.txt'))); // Should be removed
    assert.ok(existsSync(join(loaded2, 'file2.txt')));
  });
});

/**
 * An intra-repository symlink must not redirect the destructive write.
 *
 * storeOutput removes the target tree recursively and then copies a generated tree into its place. Until
 * mwg-train-vqb7 that guard asserted containment in the REPOSITORY root for public arms, and a repo-root test
 * cannot contain that removal: a symlink pointing anywhere inside the repository resolves to a path that passes
 * it, so the rmSync followed the link and deleted committed files which cpSync then replaced with generated
 * output. The escape OUT of the repository was already refused; this is the same escape performed within it.
 *
 * These tests are self-contained - their own temporary tree, no shared fixture - because they delete files, and
 * a destructive test that depends on another test's state is how a suite becomes order-dependent.
 */
describe('storeOutput symlink containment', () => {
  function makeRepo(tag) {
    const base = mkdtempSync(join(realpathSync(tmpdir()), `mwg-outputs-symlink-${tag}-`));
    const repoRoot = join(base, 'repo');
    mkdirSync(repoRoot, { recursive: true });
    const source = join(base, 'source');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'generated.txt'), 'generated');
    return { base, repoRoot, source };
  }

  test('a symlink inside the repository does not redirect the recursive removal', () => {
    const { base, repoRoot, source } = makeRepo('inrepo');
    try {
      // A committed file, in a subtree the arm root does not own.
      const victimDir = join(repoRoot, 'docs', 'models', 'deepseek', 'deepseek-flash', 'proj');
      mkdirSync(victimDir, { recursive: true });
      const marker = join(victimDir, 'IMPORTANT.md');
      writeFileSync(marker, 'committed doc');

      // The arm's outputs directory is a link into that subtree, which resolves INSIDE the repository.
      const armRoot = join(repoRoot, 'data', 'A1_self_generated');
      mkdirSync(armRoot, { recursive: true });
      symlinkSync(join(repoRoot, 'docs'), join(armRoot, 'outputs'), 'dir');

      assert.throws(
        () => storeOutput({ projectId: 'proj', model: 'deepseek/deepseek-flash' }, 'A1_self_generated', source, { repoRoot }),
        /SYMLINK_ESCAPE/,
        'storeOutput followed an intra-repo symlink instead of refusing it',
      );

      // The refusal must happen BEFORE the removal, so the committed file is untouched and nothing was copied.
      assert.ok(existsSync(marker), 'the committed file was deleted by the recursive removal');
      assert.ok(!existsSync(join(victimDir, 'generated.txt')), 'generated output was copied into the docs subtree');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('a symlinked ARM ROOT is refused before the recursive removal', () => {
    // rev-1's case, mwg-train-0ult. With data/A1_self_generated itself a symlink to <repo>/docs, realpath(root)
    // is docs/ while the candidate keeps the link's own segments. Those share no prefix, so the old slice
    // produced unrelated components, every one of them "did not exist yet", the guard returned, and the removal
    // and copy ran through the link - deleting the committed file and rewriting the subtree. Root absence from
    // the guard is why this is a distinct case from the intra-repo symlink above: there the root is real and a
    // component escapes, here the root IS the escape.
    const { base, repoRoot, source } = makeRepo('rootsymlink');
    try {
      // The victim is placed at exactly where the write would land once the root is linked into docs/.
      const victimDir = join(repoRoot, 'docs', outputRelativePath({ projectId: 'proj', model: 'deepseek/deepseek-flash' }));
      mkdirSync(victimDir, { recursive: true });
      const marker = join(victimDir, 'IMPORTANT.md');
      writeFileSync(marker, 'committed doc');

      const dataDir = join(repoRoot, 'data');
      mkdirSync(dataDir, { recursive: true });
      symlinkSync(join(repoRoot, 'docs'), join(dataDir, 'A1_self_generated'), 'dir');

      assert.throws(
        () => storeOutput({ projectId: 'proj', model: 'deepseek/deepseek-flash' }, 'A1_self_generated', source, { repoRoot }),
        /SYMLINK_ESCAPE/,
        'a symlinked arm root was not refused',
      );
      assert.ok(existsSync(marker), 'the committed file was deleted through the symlinked arm root');
      assert.ok(!existsSync(join(victimDir, 'generated.txt')), 'generated output was written through the symlinked arm root');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('a symlinked ANCESTOR of the arm root is refused', () => {
    // mwg-train-j15h, the third variant of the same defect. Here `repo/data` is the symlink, so
    // `data/A1_self_generated` is a REAL directory and a check that only lstat's the root sees nothing wrong.
    // realpath(root) is then <repo>/docs/A1_self_generated while resolve(root) is <repo>/data/A1_self_generated,
    // so every path under the root was compared against the wrong directory and the removal ran through the
    // ancestor link. The general condition is that the root must be reached without traversing a symlink at any
    // depth - the walk below starts at realpath(root) and can never see the segments leading to it.
    const { base, repoRoot, source } = makeRepo('ancestorsymlink');
    try {
      const victimDir = join(repoRoot, 'docs', 'A1_self_generated', outputRelativePath({ projectId: 'proj', model: 'deepseek/deepseek-flash' }));
      mkdirSync(victimDir, { recursive: true });
      const marker = join(victimDir, 'IMPORTANT.md');
      writeFileSync(marker, 'committed doc');

      // The ANCESTOR is the link; the arm root beneath it is real.
      symlinkSync(join(repoRoot, 'docs'), join(repoRoot, 'data'), 'dir');

      assert.throws(
        () => storeOutput({ projectId: 'proj', model: 'deepseek/deepseek-flash' }, 'A1_self_generated', source, { repoRoot }),
        /SYMLINK_ESCAPE/,
        'a symlinked ancestor of the arm root was not refused',
      );
      assert.ok(existsSync(marker), 'the committed file was deleted through the symlinked ancestor');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('a symlink pointing outside the repository is still refused', () => {
    // The regression guard for the half that already worked before mwg-train-vqb7.
    const { base, repoRoot, source } = makeRepo('outside');
    const outside = mkdtempSync(join(realpathSync(tmpdir()), 'mwg-outputs-outside-'));
    try {
      writeFileSync(join(outside, 'keep.txt'), 'outside');
      const armRoot = join(repoRoot, 'data', 'A1_self_generated');
      mkdirSync(armRoot, { recursive: true });
      symlinkSync(outside, join(armRoot, 'outputs'), 'dir');

      assert.throws(
        () => storeOutput({ projectId: 'proj', model: 'deepseek/deepseek-flash' }, 'A1_self_generated', source, { repoRoot }),
        /SYMLINK_ESCAPE/,
      );
      assert.ok(existsSync(join(outside, 'keep.txt')), 'the removal ran despite the refusal');
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
