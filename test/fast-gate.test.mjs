import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAST_GATE = path.join(ROOT, 'scripts', 'fast-gate.mjs');

test('fast-gate runs mapped test suites for a changed source file', () => {
  const env = { ...process.env, GIT_CHANGED: 'src/eval/cost.mjs' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('test/cost.test.mjs'));
});

test('fast-gate runs a changed test file directly', () => {
  const env = { ...process.env, GIT_CHANGED: 'test/compare.test.mjs' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('fast-gate: passed: test/compare.test.mjs'));
});

test('fast-gate includes transitive dependents', () => {
  // src/design/yaml.mjs is imported by src/design/contract.mjs, which is imported by test/design-contract.test.mjs
  const env = { ...process.env, GIT_CHANGED: 'src/design/yaml.mjs' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('test/design-contract.test.mjs'), 'must run test/design-contract.test.mjs');
  assert.ok(res.stdout.includes('test/design-yaml.test.mjs'), 'must run test/design-yaml.test.mjs');
});

test('fast-gate routes training design markdown to checks', () => {
  const env = { ...process.env, GIT_CHANGED: 'docs/train/design/booking/plan.md' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('check:train-design'));
});

test('fast-gate routes eval design markdown to check:design-schema', () => {
  const env = { ...process.env, GIT_CHANGED: 'docs/eval/design/booking/plan.md' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('check:design-schema'));
});

test('fast-gate routes training briefs manifest to check:brief-schema and check:disjoint', () => {
  const env = { ...process.env, GIT_CHANGED: 'docs/train/briefs/manifest.jsonl' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('check:brief-schema'));
  assert.ok(res.stdout.includes('check:disjoint'));
});

test('fast-gate fails on unmapped source files', () => {
  const env = { ...process.env, GIT_CHANGED: 'src/nonexistent-module-without-tests.mjs' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.notStrictEqual(res.status, 0);
  assert.ok(res.stderr.includes('unmapped changed files'));
});

test('fast-gate fails closed on invalid git base', () => {
  const env = { ...process.env, GIT_CHANGED: '', GIT_BASE: 'nonexistent-ref-xyz' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.notStrictEqual(res.status, 0);
  assert.ok(res.stderr.includes('FAIL: base \'nonexistent-ref-xyz\' is not a resolvable commit'));
});

test('fast-gate routes evaluation fixture files to check:eval-projects', () => {
  // Fixtures under docs/eval/projects/ have no unit test of their own; check:eval-projects re-derives
  // each one byte-for-byte, which is the coverage the gate should select. Before the prefix mapping
  // existed, any change here made the gate exit 1 with "unmapped changed files".
  const env = { ...process.env, GIT_CHANGED: 'docs/eval/projects/already-modern/cf-06/server.mjs' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  assert.ok(res.stdout.includes('check:eval-projects'), 'must select check:eval-projects');
});

test('fast-gate routes a changed fixture tree hash to check:eval-projects', () => {
  // tree.json is derived from the whole project directory, so an added or removed file there changes
  // it - the same prefix rule therefore covers the case that is easiest to forget.
  const env = { ...process.env, GIT_CHANGED: 'docs/eval/projects/already-modern/cf-06/tree.json' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  assert.ok(res.stdout.includes('check:eval-projects'), 'must select check:eval-projects');
});

test('fast-gate does not fail on other files inside an evaluation fixture project', () => {
  // The prefix rule deliberately runs before isExempt, so a binary inside a fixture project still
  // routes to check:eval-projects rather than being waved through: the project's tree hash covers
  // every file in it, images included.
  const env = { ...process.env, GIT_CHANGED: 'docs/eval/projects/already-modern/cf-06/reference.jpg' };
  const res = spawnSync('node', [FAST_GATE], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  assert.ok(!res.stderr.includes('unmapped changed files'), 'must not report an unmapped file');
});
