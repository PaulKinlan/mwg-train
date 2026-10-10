import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');

function run(scriptArgs, tempDir = null) {
  try {
    const out = execFileSync('node', scriptArgs, { cwd: tempDir || ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.trim() };
  } catch (err) {
    return { code: err.status, out: (err.stdout + err.stderr).trim() };
  }
}

test('check:brief-schema negative (empty manifest)', () => {
  const tmp = path.join(os.tmpdir(), 'empty_briefs.jsonl');
  fs.writeFileSync(tmp, '');
  const res = run(['scripts/check-brief-schema.mjs', '--manifest', tmp]);
  assert.strictEqual(res.code, 1);
  assert.ok(res.out.includes(`FAIL - empty manifest '${tmp}'`));
});

test('check:route-conformance negative (empty corpus)', () => {
  const tmp = path.join(os.tmpdir(), 'empty_corpus.json');
  fs.writeFileSync(tmp, '{"projects": []}');
  const res = run(['scripts/check-route-conformance.mjs', '--corpus', tmp]);
  assert.strictEqual(res.code, 1);
  assert.ok(res.out.includes(`FAIL - no projects found in corpus '${tmp}'`));
});

test('lint:provenance negative (empty manifest)', () => {
  const tmp = path.join(os.tmpdir(), 'empty_provenance.jsonl');
  fs.writeFileSync(tmp, '');
  const res = run(['scripts/validate-provenance.mjs', tmp]);
  assert.strictEqual(res.code, 1);
  assert.ok(res.out.includes(`FAIL - no records found in ${tmp}`));
});

test('check:originals negative (empty manifest)', () => {
  const tmp = path.join(os.tmpdir(), 'empty_originals.jsonl');
  fs.writeFileSync(tmp, '');
  const res = run(['scripts/verify-originals.mjs', tmp, '--if-present']);
  assert.strictEqual(res.code, 1);
  assert.ok(res.out.includes(`FAIL - no records found in '${tmp}'`));
});

test('check:quotes negative (empty dir)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty_captures_'));
  try {
    const res = run(['scripts/check-provenance-quotes.mjs', tmpDir]);
    assert.strictEqual(res.code, 1);
    assert.ok(res.out.includes(`FAIL - local captures directory '${tmpDir}' exists but contains no .txt files`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('check:brief-schema healthy', () => {
  const res = run(['scripts/check-brief-schema.mjs']);
  assert.strictEqual(res.code, 0);
  assert.ok(res.out.includes('PASS -'));
});

test('check:route-conformance healthy', () => {
  const res = run(['scripts/check-route-conformance.mjs']);
  assert.strictEqual(res.code, 0);
  assert.ok(res.out.includes('PASS -'));
});

test('lint:provenance healthy', () => {
  const res = run(['scripts/validate-provenance.mjs', 'docs/provenance/manifest.example.jsonl']);
  assert.strictEqual(res.code, 0);
  assert.ok(res.out.includes('PASS'));
});

test('check:originals healthy/skipped', () => {
  const res = run(['scripts/verify-originals.mjs', 'docs/provenance/manifest.jsonl', '--if-present']);
  assert.strictEqual(res.code, 0);
  assert.ok(res.out.includes('; skipped - this is NOT a retention result.'));
});

test('check:quotes healthy/skipped', () => {
  const res = run(['scripts/check-provenance-quotes.mjs']);
  assert.strictEqual(res.code, 0);
  assert.ok(res.out.includes('; skipped - local captures absent'));
});
