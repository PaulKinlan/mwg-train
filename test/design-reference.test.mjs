import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => readFileSync(new URL(path, root));

const DIR = 'docs/design/archetypes/booking/';
// DERIVED from the directory, not restated. This used to be a hand-written array of five filenames, so
// adding a sixth board to the directory and the provenance table broke `npm test` for no reason other than
// a list nobody remembered to update - the same defect class that broke baseline-label.test.mjs. A floor
// replaces the hand list, so boards cannot silently disappear either.
const STEPS = readdirSync(new URL(DIR, root))
  .filter((name) => name.toLowerCase().endsWith('.jpg') && name.toLowerCase().startsWith('step'))
  .sort();
assert.ok(STEPS.length >= 5, 'the reference boards directory must contain at least 5 step JPEGs');

test('the booking reference boards are committed JPEGs whose digests match their README', () => {
  const readme = text(`${DIR}README.md`);
  for (const name of STEPS) {
    const declared = readme.match(new RegExp(`\`${name}\` \\(SHA-256: \`([0-9a-f]{64})\`\\)`));
    assert.ok(declared, `${name}: README must declare its SHA-256`);
    const buffer = bytes(`${DIR}${name}`);
    assert.deepEqual([...buffer.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: must be a real JPEG`);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), declared[1], `${name}: digest must match the file`);
  }
  // A README that promises five boards and lists four is the drift this test exists to catch.
  assert.equal([...readme.matchAll(/File: `[^`]+`/g)].length, STEPS.length);
});

test('the reference boards declare and enforce exclusion from training', () => {
  const readme = text(`${DIR}README.md`);
  assert.match(readme, /excluded_from_training: true/);
  assert.match(readme, /approved_for_training: false/);
  // The flags are prose in the README; this record and the DOCUMENTS entries are what make them structural.
  const record = text('docs/provenance/assets/design-reference-booking.md');
  assert.match(record, /excluded_from_training: true/);
  assert.match(record, /approved_for_training: false/);
  const classification = text('scripts/check-baseline-label.mjs');
  assert.match(classification, /'docs\/design\/archetypes\/booking\/README\.md': 'design'/);
  assert.match(classification, /'docs\/provenance\/assets\/design-reference-booking\.md': 'provenance'/);
  // Every board appears in the provenance table, so a board cannot be added without a rights record.
  for (const name of STEPS) assert.ok(record.includes(name), `${name}: missing from the provenance table`);
});

test('the provenance table agrees with the README and with the files', () => {
  // The reviewer's P2: the first test compared the files against the README's declared digests and only checked
  // that each board NAME appeared in the provenance table, so a digest that drifted inside that table - the copy
  // a reader actually trusts - would pass. This closes the three-way loop: README == table == file.
  const readme = text(`${DIR}README.md`);
  const record = text('docs/provenance/assets/design-reference-booking.md');
  const rows = [...record.matchAll(/\|\s*\[`(step\d-[\w-]+\.jpg)`\][^|]*\|([^|]*)\|\s*`([0-9a-f]{64})`\s*\|\s*(\d+)\s*\|/g)];
  // A count is not a set: a duplicated valid row plus a missing board keeps rows.length correct while leaving a
  // board unchecked, which an independent review found here. Compare the names, so both duplication and omission fail.
  assert.deepEqual(rows.map(([, name]) => name).sort(), [...STEPS].sort(), 'the provenance table must name every board exactly once');
  for (const [, name, , tableDigest, rowBytes] of rows) {
    const buffer = bytes(`${DIR}${name}`);
    const actual = createHash('sha256').update(buffer).digest('hex');
    const declared = readme.match(new RegExp(`\`${name}\` \\(SHA-256: \`([0-9a-f]{64})\`\\)`));
    assert.ok(declared, `${name}: README must declare its SHA-256`);
    assert.equal(tableDigest, actual, `${name}: the provenance table digest must match the file`);
    assert.equal(tableDigest, declared[1], `${name}: the provenance table and the README must agree`);
    assert.equal(Number(rowBytes), buffer.length, `${name}: the provenance byte count must match the file`);
  }
});

test('the reference boards are not the sealed evaluation target', () => {
  const record = text('docs/provenance/assets/design-reference-booking.md');
  assert.match(record, /not approved as training data, not a conformance\s+target/);
  assert.match(record, /not\*\* the\s+sealed A6 evaluation target/);
  // The model is no longer a gap. Bead mwg-train-c1c regenerated these boards with an explicitly named model and this
  // record must carry the gateway's own attestation of it, while still recording which model the superseded set used -
  // so the assertion is that BOTH appear, not that the old one has been quietly dropped.
  assert.match(record, /gemini-nano-banana-2\.1/);
  assert.match(record, /modelVersion/);
  assert.match(record, /gemini-3-pro-image/);
});
