#!/usr/bin/env node
/**
 * Add the floor attribution to measurement documents that predate it.
 *
 *   node scripts/label-baseline.mjs [--check] [--json]
 *
 * Review on bead mwg-train-6ek found this gap twice: the label reached the markdown reports but not the
 * measurement JSON those reports are generated from, and then not the four further JSON documents
 * (`docs/pilot/yield.json`, `docs/pilot/records.json`, `docs/eval/conformance/<family>.json` and the
 * `-identity.json` files). The label is a fact about the numbers, so it belongs on the record, not only
 * on the summary rendered from it.
 *
 * SAFE BY CONSTRUCTION. The label is added from a constant, and every write is guarded: the script
 * strips the attribution keys back off the result, deep-compares it with the document it read, and
 * refuses to write if anything else moved. A relabel that changed a measurement would be falsification,
 * so the guard is the point of this script rather than a nicety - and `--check` runs the same comparison
 * without writing, which is what a gate wants.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { labelFloorDocument } from '../src/eval/ruleset.mjs';

/** The measurement documents that state a floor. Declared, not globbed, for the same reason the label check is. */
export const FLOOR_DOCUMENTS = [
  'docs/pilot/yield.json',
  'docs/pilot/records.json',
  'docs/eval/conformance/account-recovery-identity.json',
  'docs/eval/conformance/booking-identity.json',
  'docs/eval/conformance/catalogue-identity.json',
  'docs/eval/conformance/contact-lead-identity.json',
  'docs/eval/conformance/event-registration-identity.json',
  'docs/eval/conformance/booking.json',
  'docs/train/corpus/records.json',
  'pilot/CORPUS.json',
];

function describe(document) {
  return JSON.stringify(document);
}

export function labelDocuments(paths, { check = false } = {}) {
  const results = [];
  for (const path of paths) {
    let original;
    try {
      original = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      results.push({ path, code: 'UNREADABLE', message: `${error?.message ?? error}` });
      continue;
    }
    const { document: labelled, changed, fields } = labelFloorDocument(original);
    if (!changed) {
      results.push({ path, code: 'ALREADY_LABELLED' });
      continue;
    }
    // THE GUARD: attribution must be the only difference, or nothing is written. Strip exactly the keys
    // added - stripping the whole field set would also remove attribution the document already carried,
    // and the comparison would then fail for a document that is perfectly fine.
    const withoutAdded = { ...labelled };
    for (const key of fields) delete withoutAdded[key];
    if (describe(withoutAdded) !== describe(original)) {
      results.push({ path, code: 'REFUSED_NOT_ATTRIBUTION_ONLY', message: 'stripping the label did not reproduce the input; refusing to write' });
      continue;
    }
    if (!check) writeFileSync(path, `${JSON.stringify(labelled, null, 2)}\n`);
    results.push({ path, code: check ? 'WOULD_LABEL' : 'LABELLED' });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asJson = process.argv.includes('--json');
  const check = process.argv.includes('--check');
  const results = labelDocuments(FLOOR_DOCUMENTS, { check });
  const failed = results.filter((result) => result.code === 'UNREADABLE' || result.code === 'REFUSED_NOT_ATTRIBUTION_ONLY');
  if (asJson) {
    console.log(JSON.stringify({ check, results }, null, 2));
  } else {
    for (const result of results) console.log(`${result.code} ${result.path}${result.message ? ` - ${result.message}` : ''}`);
  }
  if (failed.length) {
    console.error(`label-baseline: FAIL - ${failed.length} document(s) could not be labelled`);
    process.exit(1);
  }
  const pending = results.filter((result) => result.code === 'WOULD_LABEL');
  if (check && pending.length) {
    console.error(`label-baseline: FAIL - ${pending.length} measurement document(s) carry a floor without the attribution`);
    process.exit(1);
  }
  if (!asJson) console.log(`label-baseline: OK - ${results.filter((r) => r.code === 'ALREADY_LABELLED').length} already labelled, ${results.length - failed.length - results.filter((r) => r.code === 'ALREADY_LABELLED').length} ${check ? 'pending' : 'labelled'}`);
}
