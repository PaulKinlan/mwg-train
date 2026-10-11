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

test('check:route-conformance healthy, or a labelled skip when its scaffolding is absent', () => {
  // Two outcomes are legitimate here and the check documents both: with the generated projects present it
  // compares every project and passes; with them absent it prints a labelled SKIP naming the command that
  // produces them and exits 0, because a clean checkout never has them and failing there is how a gate stops
  // being read (mwg-train-xku). The test used to assert the PASS line unconditionally, so it passed only in a
  // worktree that happened to have the scaffolding and failed for everyone else for a reason that is not a
  // defect (mwg-train-bx2). Asserting only the skip would be the same mistake mirrored, since it would fail in
  // a scaffolded tree - so this branches on the same condition the check uses.
  const res = run(['scripts/check-route-conformance.mjs']);
  assert.strictEqual(res.code, 0, `a labelled skip is not a failure: ${res.out}`);
  const projects = path.join(ROOT, 'pilot', 'training-projects');
  if (fs.existsSync(projects)) {
    // Scaffolding present: this really is a conformance run, and it has to have checked something.
    assert.ok(res.out.includes('check-route-conformance: PASS - '), res.out);
    assert.ok(/[1-9]\d* project\(s\) across [1-9]\d* families/.test(res.out), res.out);
  } else {
    // Scaffolding absent: the run must say so, name the path it wanted and the command that produces it, and
    // must not be mistakable for a conformance result. The last assertion is the one that keeps this from
    // becoming the vacuous version of the test - a check that skipped has not checked anything, so it must not
    // be printing a PASS, and this test must not accept one.
    assert.ok(res.out.includes('check-route-conformance: SKIPPED - '), res.out);
    assert.ok(res.out.includes(projects), 'the skip has to name the path it looked for');
    assert.ok(res.out.includes('scaffold:train-corpus'), 'the skip has to name the command that produces them');
    assert.ok(res.out.includes('NOT a conformance result'), 'the skip must not be mistakable for a pass');
    assert.equal(res.out.includes('PASS -'), false, 'a skipped check must not print a conformance result');
  }
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
