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
 * SAFE BY CONSTRUCTION, in the strong sense now. The label is added from a constant, and every write is
 * guarded TWICE: the document must round-trip through JSON byte-for-byte, and the result must equal the
 * input once the added keys are stripped back off.
 *
 * The round-trip check is not theoretical. Review found that comparing only parsed-and-reserialised
 * documents is not byte-safe: for `{"measured":9007199254740993}` JavaScript rounds the integer on
 * parse, so the tool wrote 9007199254740992, the stripped comparison still matched, and it reported
 * success - a silent edit to a measurement, which is the one thing this tool must never do. A document
 * whose bytes the tool cannot reproduce exactly is now refused instead of rewritten.
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
  'docs/train/corpus/tokens.json',
  'pilot/CORPUS.json',
];

function describe(document) {
  return JSON.stringify(document);
}

export function labelDocuments(paths, { check = false } = {}) {
  const results = [];  for (const path of paths) {
    let raw;
    let original;
    try {
      raw = readFileSync(path, 'utf8');
      original = JSON.parse(raw);
    } catch (error) {
      results.push({ path, code: 'UNREADABLE', message: `${error?.message ?? error}` });
      continue;
    }
    // GUARD 1, byte preservation. If re-serialising what we parsed does not reproduce the file exactly,
    // then this tool cannot rewrite it without risking a silent edit - a rounded large integer, say - so
    // it refuses. Fail closed rather than trust that no such number is present.
    const canonical = `${JSON.stringify(original, null, 2)}\n`;
    if (canonical !== raw) {
      results.push({
        path,
        code: 'REFUSED_NOT_BYTE_SAFE',
        message: 're-serialising this document does not reproduce its bytes (formatting, or a number that does not survive JSON round-tripping); refusing to rewrite it',
      });
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
  const failed = results.filter((result) =>
    ['UNREADABLE', 'REFUSED_NOT_ATTRIBUTION_ONLY', 'REFUSED_NOT_BYTE_SAFE'].includes(result.code),
  );
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
