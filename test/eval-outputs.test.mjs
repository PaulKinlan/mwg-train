import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe, before, after } from 'node:test';

import { outputRelativePath, outputPath, storeOutput, loadOutput } from '../src/eval/outputs.mjs';

describe('outputs store', () => {
  const TEST_DIR = join(process.cwd(), '.test-outputs-store');
  const PUBLIC_REPO = join(TEST_DIR, 'public');
  const QUARANTINE_REPO = join(TEST_DIR, 'quarantine');

  before(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(PUBLIC_REPO, { recursive: true });
    mkdirSync(QUARANTINE_REPO, { recursive: true });
    // Make the quarantine store appear as a git worktree root
    import('node:child_process').then(({ execSync }) => {
      execSync('git init', { cwd: PUBLIC_REPO });
      execSync('git remote add origin https://example.com/Public/repo.git', { cwd: PUBLIC_REPO });
      execSync('git init', { cwd: QUARANTINE_REPO });
      execSync('git remote add origin https://example.com/PaulKinlan/mwg-quarantine.git', { cwd: QUARANTINE_REPO });
    });
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  const options = { repoRoot: PUBLIC_REPO, quarantineRoot: QUARANTINE_REPO };

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
    const loaded = loadOutput({ projectId: 'missing-project', model: 'deepseek/deepseek-flash' }, 'A1_self_generated', options);
    assert.equal(loaded, null);
  });
});

describe('outputs store overwriting', () => {
  const TEST_DIR = join(process.cwd(), '.test-outputs-store-overwrite');
  const PUBLIC_REPO = join(TEST_DIR, 'public');
  const QUARANTINE_REPO = join(TEST_DIR, 'quarantine');

  before(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(PUBLIC_REPO, { recursive: true });
    mkdirSync(QUARANTINE_REPO, { recursive: true });
    import('node:child_process').then(({ execSync }) => {
      execSync('git init', { cwd: PUBLIC_REPO });
      execSync('git remote add origin https://example.com/Public/repo.git', { cwd: PUBLIC_REPO });
    });
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
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
