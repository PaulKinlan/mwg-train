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
