import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { STEP4_INSTRUMENT_FILES, step4InstrumentDigest } from '../src/eval/step4-instrument.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'step4-instrument-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of STEP4_INSTRUMENT_FILES) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${path}\n`, { flag: 'wx' });
  }
  return root;
}

test('instrument digest pins source bytes, not HEAD or runtime machine state', (t) => {
  const root = fixture(t);
  const first = step4InstrumentDigest(root);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(step4InstrumentDigest(root), first);
  assert.equal(first.includes(root), false);
  const changed = join(root, 'src/corpus/harness.mjs');
  writeFileSync(changed, `${readFileSync(changed)}changed\n`);
  assert.notEqual(step4InstrumentDigest(root), first);
  assert.notEqual(step4InstrumentDigest(root), first, 'a mid-run mutation must stay detectable');
});

test('instrument digest refuses a missing source or symlinked measurement file', (t) => {
  const root = fixture(t);
  const file = join(root, 'src/corpus/harness.mjs');
  rmSync(file);
  assert.throws(() => step4InstrumentDigest(root), /ENOENT/);
  symlinkSync(join(root, 'src/corpus/cdp.mjs'), file);
  assert.throws(() => step4InstrumentDigest(root), /INSTRUMENT_UNSAFE_SOURCE/);
});

test('future smoke and functional writers each pin and recheck the same instrument before receipt creation', () => {
  for (const script of ['default-step4-score.mjs', 'default-step4-smoke.mjs']) {
    const source = readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
    assert.equal((source.match(/step4InstrumentDigest\(root\)/g) ?? []).length, 2, `${script}: start and end digest`);
    assert.match(source, /instrument_sha256: instrumentSha256/);
    assert.match(source, /INSTRUMENT_MUTATED_DURING_RUN/);
  }
});
