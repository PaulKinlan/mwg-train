#!/usr/bin/env node
/**
 * Gate the corpus manifest before anything can be trained on it.
 *
 *   node scripts/validate-provenance.mjs docs/provenance/manifest.jsonl
 *
 * Exit 0 only when every record passes, ids are unique, parents exist and no row approved for
 * training descends from a quarantined asset. Safe to run in CI and by hand; it reads only.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { assertArmRootsDistinct } from '../src/provenance/arms.mjs';
import { parseManifest, validateManifest } from '../src/provenance/record.mjs';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/validate-provenance.mjs <manifest.jsonl>');
  process.exit(2);
}

let rows;
try {
  rows = parseManifest(readFileSync(target, 'utf8'));
} catch (error) {
  console.error(`validate-provenance: cannot read '${target}': ${error.message}`);
  process.exit(2);
}

try {
  assertArmRootsDistinct();
} catch (error) {
  console.error(`validate-provenance: storage layout is unsafe: ${error.message}`);
  process.exit(1);
}

const { ok, findings, counts } = validateManifest(rows);
console.log(
  `validate-provenance: ${counts.total} records, ${counts.uniqueIds} unique ids, ` +
    `${counts.trainable} trainable, ${counts.quarantined} quarantined in ${target}`,
);

for (const finding of findings) {
  const where = finding.index === undefined ? finding.id : `line ${finding.index + 1} (${finding.id})`;
  console.log(`${finding.severity.toUpperCase()} ${finding.code} ${where} ${finding.field ? `[${finding.field}] ` : ''}${finding.message}`);
}

if (!ok) {
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  console.error(`validate-provenance: FAIL (${errors} error${errors === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log('validate-provenance: PASS');
