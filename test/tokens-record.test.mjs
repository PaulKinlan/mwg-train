// mwg-train-t0d. The training corpus token volume drifted 1,550,364 -> 2,615,747 without anyone
// noticing, because `train:tokens` exists in package.json but was wired into NO gate: nothing ever
// recomputed the number. The corpus tree hash has a hard-requirement test that re-derives it from the
// code and fails on any disagreement; the token measurement had nothing. This is that guard.
//
// It re-measures the training corpus for real and compares the result to the committed record, so a
// generator change that moves the corpus can no longer land while the quoted size stays behind.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const RECORD = join(ROOT, 'docs/train/corpus/tokens.json');
const CORPUS_RECORD = join(ROOT, 'pilot', 'TRAINING_CORPUS.json');

/** The first place two JSON values disagree, as a key path, or null if they are equal. */
function firstDifference(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return `${path || '<root>'}: committed ${JSON.stringify(a)} != measured ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: committed ${Array.isArray(a) ? 'array' : 'object'} != measured ${Array.isArray(b) ? 'array' : 'object'}`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length: committed ${a.length} != measured ${b.length}`;
    for (let i = 0; i < a.length; i += 1) {
      const found = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    if (!(key in a)) return `${path}.${key}: committed <absent> != measured ${JSON.stringify(b[key])}`;
    if (!(key in b)) return `${path}.${key}: committed ${JSON.stringify(a[key])} != measured <absent>`;
    const found = firstDifference(a[key], b[key], path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return null;
}

test('HARD REQUIREMENT: the committed training token record matches a fresh measurement of the corpus', () => {
  const dir = mkdtempSync(join(tmpdir(), 't0d-tokens-'));
  const out = join(dir, 'tokens.json');
  try {
    // The committed record is copied to a scratch path first so the script takes its STRUCTURED branch
    // (a file carrying `pilot` and `training` sections), which is the shape the committed record has and
    // the shape this test is therefore able to compare. Writing to the default --out would rewrite the
    // committed record from a test, which is the side effect that destroyed it during this bead's own
    // investigation. The trees are built under the temp dir for the same reason: nothing here touches the
    // repository, and the generated projects are gitignored anyway.
    copyFileSync(RECORD, out);
    // The corpus record is copied too, and passed with --record, because the measurement regenerates the
    // trees from it and the scaffolder it invokes would otherwise write its default record path - a TRACKED
    // file - while this test was only trying to read. A gate that dirties the tree it runs in is not a gate
    // the merger can run.
    const recordCopy = join(dir, 'TRAINING_CORPUS.json');
    copyFileSync(CORPUS_RECORD, recordCopy);
    execFileSync(
      process.execPath,
      [
        join(ROOT, 'scripts', 'train-corpus-tokens.mjs'),
        '--corpus', 'training',
        '--record', recordCopy,
        '--trees', join(dir, 'trees'),
        '--out', out,
        '--no-timestamp',
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 },
    );

    const measured = JSON.parse(readFileSync(out, 'utf8'));
    const committed = JSON.parse(readFileSync(RECORD, 'utf8'));

    // TWO fields record the INPUTS this test deliberately redirects - the trees directory it builds into and
    // the corpus record it reads - so their values necessarily differ and they are not measurements.
    // Everything else must agree exactly, per project and per scope, so a generator change that moves any
    // figure fails here rather than drifting in silence. The committed values are asserted first, so
    // deleting them cannot be a place for a real change to hide.
    assert.equal(committed.training.trees, 'pilot/training-projects', 'the record must measure the corpus trees');
    assert.equal(committed.training.record, 'pilot/TRAINING_CORPUS.json', 'the record must measure the corpus record');
    assert.ok(measured.training.trees, 'the measurement must still report the trees it read, or the deletion below hides its removal');
    assert.ok(measured.training.record, 'the measurement must still report the record it read, or the deletion below hides its removal');
    delete measured.training.trees;
    delete committed.training.trees;
    delete measured.training.record;
    delete committed.training.record;
    // A timestamp is not a measurement either, and the committed record was written with --no-timestamp, so
    // normalising it keeps the gate from going red purely because someone regenerated without that flag.
    delete measured.training.generated_at;
    delete committed.training.generated_at;

    const difference = firstDifference(committed.training, measured.training);
    assert.equal(
      difference,
      null,
      `the committed training token record disagrees with a fresh measurement: ${difference}\n` +
        'Re-measure and commit it: node scripts/train-corpus-tokens.mjs --corpus training',
    );

    // Non-vacuity: the comparison above is only meaningful if the measurement produced a corpus.
    assert.equal(measured.training.projects.length, 210, 'the measurement must cover the 210 training pairs');
    assert.ok(measured.training.total_training_tokens > 0, 'the measurement must produce a token total');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the scope table quoted in the docs matches the committed record', () => {
  // Added because a review caught a transcription error in exactly this table within minutes of it being
  // written: the full_tree band read 3,922,223 where the record says 3,879,223. The numbers in the docs are
  // restated by hand, which is the same hazard as any other restated list, so the restatement is checked
  // against the thing it restates rather than trusted. Parsed from the table rather than grepped for
  // strings, so a row that is reformatted, reordered or dropped fails here instead of quietly passing.
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  const lines = readFileSync(join(ROOT, 'docs/train/corpus/README.md'), 'utf8').split('\n');
  const numberGroups = (cell) => [...cell.matchAll(/[\d][\d,]*/g)].map((m) => Number(m[0].replace(/,/g, '')));

  for (const [name, scope] of Object.entries(record.training.scopes)) {
    const row = lines.find((line) => {
      if (!line.startsWith('|')) return false;
      const first = line.split('|')[1].replace(/[`*]/g, '').trim();
      return first === name || first.startsWith(`${name} `) || first.startsWith(`${name}(`);
    });
    assert.ok(row, `docs/train/corpus/README.md must have a table row for the ${name} scope`);
    const cells = row.split('|').slice(2, 7);
    const found = cells.flatMap(numberGroups);
    // The `prompt` scope states its characters as a plain zero rather than the {original, uplifted, total}
    // object the others use, and the table writes that as three zeros. Read the shape rather than assume it,
    // but do not SKIP the row: a scope whose row is missing or reformatted has to fail this test, not
    // quietly drop out of it.
    const charValue = (key) => (typeof scope.characters === 'number' ? scope.characters : scope.characters[key]);
    const expected = [
      charValue('original'),
      charValue('uplifted'),
      charValue('total'),
      scope.tokens.derived,
      ...scope.tokens.band,
    ];
    assert.deepEqual(found, expected, `the quoted ${name} row must match the record it restates`);
  }
});

test('the headline figure the docs quote is the one the record states', () => {
  // The prose sites (README.md, docs/train/READINESS-EPIC.md) are not tables, so this asserts the current
  // headline and band are quoted rather than that every number on the page is right - a stale headline is
  // the failure this catches, which is the failure that actually happened.
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  const tokens = record.training.total_training_tokens.toLocaleString('en-US');
  const band = record.training.tokens.band.map((n) => n.toLocaleString('en-US'));
  for (const file of ['README.md', 'docs/train/READINESS-EPIC.md']) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(text.includes(tokens), `${file} must quote the headline ${tokens}`);
  }
  const corpusReadme = readFileSync(join(ROOT, 'docs/train/corpus/README.md'), 'utf8');
  for (const end of band) {
    assert.ok(corpusReadme.includes(end), `docs/train/corpus/README.md must quote the band bound ${end}`);
  }
});

test('the committed record is internally consistent with its own arithmetic', () => {
  // Cheap, and independent of the re-measurement: the record states a token figure as characters/4 and a
  // band of ±25% around it, so a hand-edited number is caught even without running the corpus.
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  const training = record.training;
  assert.equal(training.tokens.source, 'derived');
  assert.equal(
    training.total_training_tokens,
    training.tokens.derived,
    'the stated total must equal the derived token figure it summarises',
  );
  assert.equal(
    training.tokens.derived,
    Math.round(training.characters.total / 4),
    'the derived figure must be the headline character count divided by four',
  );
  // The band is ±25% of the UNROUNDED characters/4, not of the rounded figure it sits beside:
  // 10,462,986 / 4 = 2,615,746.5 gives [1,961,810, 3,269,683], whereas rounding first gives 3,269,684.
  // Reading it as "±25% of the stated total" is off by one at the top, so this asserts the real derivation.
  const unrounded = training.characters.total / 4;
  assert.deepEqual(
    training.tokens.band,
    [Math.round(unrounded * 0.75), Math.round(unrounded * 1.25)],
    'the band must be ±25% around the unrounded characters/4',
  );
});
