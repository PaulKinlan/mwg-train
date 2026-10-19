import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { step4InstrumentDigest, step4InstrumentFiles, writeStep4Receipt } from '../src/eval/step4-instrument.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'step4-instrument-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = (name, source) => {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source, { flag: 'wx' });
  };
  file('scripts/default-step4-score.mjs', "import './default-step4-smoke.mjs';\nimport '../src/corpus/harness.mjs';\nimport '../src/corpus/rules.mjs';\n");
  file('scripts/default-step4-smoke.mjs', "import '../src/corpus/cdp.mjs';\n");
  file('src/corpus/harness.mjs', "import './state-persistence.mjs';\n");
  file('src/corpus/state-persistence.mjs', 'export const state = true;\n');
  file('src/corpus/rules.mjs', "export { rules } from './modern-rules.mjs';\n");
  file('src/corpus/modern-rules.mjs', 'export const rules = [];\n');
  file('src/corpus/cdp.mjs', "import { readFileSync } from 'node:fs';\n");
  return root;
}

test('digest pins transitive local imports rather than only the entry points', (t) => {
  const root = fixture(t);
  const files = step4InstrumentFiles(root);
  assert.deepEqual(files, [
    'scripts/default-step4-score.mjs', 'scripts/default-step4-smoke.mjs',
    'src/corpus/cdp.mjs', 'src/corpus/harness.mjs', 'src/corpus/modern-rules.mjs',
    'src/corpus/rules.mjs', 'src/corpus/state-persistence.mjs',
  ]);
  const original = step4InstrumentDigest(root);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(step4InstrumentDigest(root), original);
  for (const name of ['src/corpus/state-persistence.mjs', 'src/corpus/modern-rules.mjs']) {
    const path = join(root, name);
    writeFileSync(path, `${readFileSync(path)}changed\n`);
    assert.notEqual(step4InstrumentDigest(root), original, `${name} must alter the digest`);
    writeFileSync(path, name.includes('state-') ? 'export const state = true;\n' : 'export const rules = [];\n');
  }
  assert.equal(step4InstrumentDigest(root), original);
  writeFileSync(join(root, 'src/corpus/new-check.mjs'), 'export const added = true;\n');
  writeFileSync(join(root, 'src/corpus/harness.mjs'), "import './state-persistence.mjs';\nimport './new-check.mjs';\n");
  assert.ok(step4InstrumentFiles(root).includes('src/corpus/new-check.mjs'));
  assert.notEqual(step4InstrumentDigest(root), original);
});

test('real Step 4 import closure includes persistence and modern rules', () => {
  const root = new URL('..', import.meta.url).pathname;
  const files = step4InstrumentFiles(root);
  assert.ok(files.length >= 23);
  assert.ok(files.includes('src/corpus/state-persistence.mjs'));
  assert.ok(files.includes('src/corpus/modern-rules.mjs'));
});

test('digest fails closed on missing or symlinked sources, unpinned packages and unknown dynamic imports', (t) => {
  const root = fixture(t);
  const state = join(root, 'src/corpus/state-persistence.mjs');
  rmSync(state);
  assert.throws(() => step4InstrumentDigest(root), /ENOENT/);
  symlinkSync(join(root, 'src/corpus/cdp.mjs'), state);
  assert.throws(() => step4InstrumentDigest(root), /INSTRUMENT_UNSAFE_SOURCE/);
  rmSync(state);
  writeFileSync(state, 'export const state = true;\n');
  writeFileSync(state, "import 'untracked-package';\n");
  assert.throws(() => step4InstrumentDigest(root), /INSTRUMENT_UNPINNED_DEPENDENCY/);
  writeFileSync(state, 'await import(maybeModule);\n');
  assert.throws(() => step4InstrumentDigest(root), /INSTRUMENT_DYNAMIC_IMPORT/);
});

test('receipt writer refuses a changed imported source and leaves no misleading receipt', (t) => {
  const root = fixture(t);
  const first = step4InstrumentDigest(root);
  const destination = join(root, 'receipts/first');
  mkdirSync(destination, { recursive: true });
  writeStep4Receipt({ root, instrumentSha256: first, destination, receipt: { kind: 'smoke' } });
  assert.equal(JSON.parse(readFileSync(join(destination, 'receipt.json'))).instrument_sha256, first);
  const next = join(root, 'receipts/second');
  mkdirSync(next);
  writeFileSync(join(root, 'src/corpus/modern-rules.mjs'), 'export const rules = [1];\n');
  assert.throws(() => writeStep4Receipt({ root, instrumentSha256: first, destination: next,
    receipt: { kind: 'score', instrument_sha256: first } }), /INSTRUMENT_MUTATED_DURING_RUN/);
  assert.equal(existsSync(join(next, 'receipt.json')), false);
});

test('both production writers use the guarded receipt writer, not a direct receipt write', () => {
  for (const script of ['default-step4-score.mjs', 'default-step4-smoke.mjs']) {
    const source = readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
    assert.match(source, /writeStep4Receipt\(\{ root, instrumentSha256, destination, receipt \}\)/);
    assert.doesNotMatch(source, /writeFileSync\(join\(destination, 'receipt.json'/);
  }
});
