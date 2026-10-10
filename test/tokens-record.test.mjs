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

/**
 * Compare one quoted scope table against the record it restates.
 *
 * The table is located by the '## ' heading above it, not by "the first row named app_sources". This file
 * quotes TWO tables with the same scope names - the tr-* corpus and the pilot corpus - and the first version
 * of this gate validated whichever happened to come first, which is a coin flip dressed as a check.
 */
function assertQuotedScopeTable({ markdown, sectionTitle, scopes, label }) {
  const lines = markdown.split('\n');
  const heading = lines.findIndex((line) => line.startsWith('## ') && line.includes(sectionTitle));
  assert.ok(heading >= 0, `expected a '## ' section mentioning "${sectionTitle}" in docs/train/corpus/README.md`);
  const after = lines.slice(heading + 1);
  const next = after.findIndex((line) => line.startsWith('## '));
  const section = next === -1 ? after : after.slice(0, next);

  const rows = section
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.replace(/[`*]/g, '').trim()))
    .filter((cells) => cells.length >= 6 && cells[0] !== 'Scope' && !/^[-:]+$/.test(cells[1] || ''))
    .map((cells) => [cells[0].replace(/\s*\(all\)$/, ''), ...cells.slice(1)]);

  // Compared as a SET, so a dropped row, an extra row naming a scope that does not exist, and a duplicated
  // row all fail here. Row order is deliberately not checked: the numbers are attached to their scope name,
  // so reordering the rows does not make the prose wrong, and an earlier commit message wrongly claimed it did.
  assert.deepEqual(
    rows.map((cells) => cells[0]).sort(),
    Object.keys(scopes).sort(),
    `${label}: the quoted table must have exactly one row per recorded scope`,
  );

  // Each cell is read on its own and must hold the exact number of figures it is supposed to. Flattening all
  // five numeric cells together was the earlier version, and it accepted a row whose figures had been shifted
  // across columns - the numbers were all present, so a count of them was satisfied by the wrong cells.
  const numbers = (cell, count, where, scope) => {
    const found = [...(cell || '').matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replace(/,/g, '')));
    assert.equal(found.length, count, `${label}: the ${where} cell of the ${scope} row must hold ${count} number(s), found ${found.length} in "${cell}"`);
    return found;
  };

  for (const [scope, values] of Object.entries(scopes)) {
    const cells = rows.find((row) => row[0] === scope);
    // The `prompt` scope records its characters as a plain zero where the others record an object. Read that
    // one shape, and refuse any other: accepting any scalar as "the same figure three times" would let a
    // corrupt record through, since only a zero reads the same when split into original, uplifted and total.
    const scalar = typeof values.characters === 'number';
    if (scalar) {
      assert.ok(scope === 'prompt' && values.characters === 0, `${label}: only the prompt scope may state its characters as a plain zero, and only as zero`);
    }
    const charValue = (key) => (scalar ? values.characters : values.characters[key]);
    const quoted = [
      numbers(cells[1], 1, 'original', scope)[0],
      numbers(cells[2], 1, 'uplifted', scope)[0],
      numbers(cells[3], 1, 'total', scope)[0],
      numbers(cells[4], 1, 'derived', scope)[0],
    ];
    const recorded = [charValue('original'), charValue('uplifted'), charValue('total'), values.tokens.derived];
    assert.deepEqual(quoted, recorded, `${label}: the quoted ${scope} row must match the record it restates`);
    assert.deepEqual(numbers(cells[5], 2, 'band', scope), values.tokens.band, `${label}: the quoted ${scope} band must match the record`);
  }
}

test('the tr-* scope table quoted in the docs matches the committed record', () => {
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  assertQuotedScopeTable({
    markdown: readFileSync(join(ROOT, 'docs/train/corpus/README.md'), 'utf8'),
    sectionTitle: 'Training Corpus',
    scopes: record.training.scopes,
    label: 'docs/train/corpus/README.md',
  });
});

test('the pilot scope table quoted in the docs matches a fresh measurement', () => {
  // The pilot table quotes a DIFFERENT record and sits under the same scope names, so it is checked too
  // rather than left as the table this gate happens not to be looking at. The pilot measurement is a pure
  // function of the generator and plan.json - nothing is scaffolded - and it writes only to the temp path.
  const dir = mkdtempSync(join(tmpdir(), 't0d-pilot-'));
  try {
    const out = join(dir, 'pilot.json');
    execFileSync(process.execPath, [join(ROOT, 'scripts/train-corpus-tokens.mjs'), '--corpus', 'pilot', '--out', out, '--no-timestamp'], { cwd: ROOT, stdio: 'pipe' });
    const measured = JSON.parse(readFileSync(out, 'utf8'));
    assertQuotedScopeTable({
      markdown: readFileSync(join(ROOT, 'docs/train/corpus/README.md'), 'utf8'),
      sectionTitle: 'Pilot Corpus',
      scopes: measured.scopes,
      label: 'docs/train/corpus/README.md (pilot table)',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the headline figure the docs quote is the one the record states', () => {
  // The prose sites are not tables, so this asserts the current headline and band are quoted rather than
  // that every number on the page is right - a stale headline is the failure this catches, which is the
  // failure that actually happened. A review found this checked the band bounds in the corpus README only,
  // while README.md quotes them too.
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  const tokens = record.training.total_training_tokens.toLocaleString('en-US');
  const band = record.training.tokens.band.map((n) => n.toLocaleString('en-US'));
  for (const file of ['README.md', 'docs/train/READINESS-EPIC.md']) {
    assert.ok(readFileSync(join(ROOT, file), 'utf8').includes(tokens), `${file} must quote the headline ${tokens}`);
  }
  for (const end of band) {
    for (const file of ['README.md', 'docs/train/corpus/README.md']) {
      assert.ok(readFileSync(join(ROOT, file), 'utf8').includes(end), `${file} must quote the band bound ${end}`);
    }
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
