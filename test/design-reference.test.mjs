import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => readFileSync(new URL(path, root));

const DIR = 'docs/design/archetypes/booking/';
const STEPS = ['step1-browse.jpg', 'step2-form.jpg', 'step3-confirmation.jpg', 'step4-error.jpg', 'step5-empty.jpg'];

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

test('the reference boards are not the sealed evaluation target', () => {
  const record = text('docs/provenance/assets/design-reference-booking.md');
  assert.match(record, /not approved as training data, not a conformance\s+target/);
  assert.match(record, /not\*\* the\s+sealed A6 evaluation target/);
  // The origin gap is recorded, not papered over: this lane did not generate the images and the repo does not
  // state the model id or prompts.
  assert.match(record, /not stated anywhere in this repository/);
});
