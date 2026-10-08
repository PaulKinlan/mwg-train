/**
 * Check that every tr-* brief declares a schema that can actually be built.
 *
 * The corpus advertises that each project's form and journey come from its brief. That
 * is only true for a family whose brief carries `fields` and `journey`, so this check
 * reports which families are still riding the archetype's form and refuses any authored
 * schema that would not build.
 *
 * Usage:
 *   node scripts/check-brief-schema.mjs [--manifest <path>] [--expect-all]
 *
 * `--expect-all` turns "a family has no authored schema" into a failure. It is the gate
 * to use once the whole corpus is authored, so a later regression that quietly reverts a
 * family to the archetype's form cannot pass.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { validateBriefSchema } from '../src/train/brief-schema.mjs';

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--manifest');
const manifestPath = flagIndex === -1 ? 'docs/train/briefs/manifest.jsonl' : args[flagIndex + 1];
const expectAll = args.includes('--expect-all');

const rows = readFileSync(manifestPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const families = [...new Set(rows.map((row) => row.family_id))].sort();

const findings = [];
const unauthored = [];
for (const family of families) {
  const familyRows = rows.filter((row) => row.family_id === family);
  const authored = familyRows.filter((row) => row.fields || row.journey);
  if (authored.length === 0) {
    unauthored.push(family);
    continue;
  }
  if (authored.length !== familyRows.length) {
    findings.push({ brief_id: family, at: 'fields', problem: `declared by only ${authored.length} of ${familyRows.length} variants; both must carry it` });
  }
  // Variants are the same brief at two frameworks: a form that differed between them
  // would make the pair comparison meaningless.
  const shapes = new Set(authored.map((row) => JSON.stringify({ fields: row.fields, journey: row.journey })));
  if (shapes.size > 1) findings.push({ brief_id: family, at: 'fields', problem: 'variants disagree on the authored schema' });
  // The variants are identical by the check above, so validating one of them validates them all.
  findings.push(...validateBriefSchema(authored[0]));
}

const authoredCount = families.length - unauthored.length;

for (const finding of findings) console.log(`FINDING ${finding.brief_id} ${finding.at}: ${finding.problem}`);
if (unauthored.length > 0) {
  console.log(`check-brief-schema: ${unauthored.length} of ${families.length} family(s) still declared by the archetype, not authored: ${unauthored.join(', ')}`);
}

if (findings.length > 0) {
  console.error(`check-brief-schema: FAIL - ${findings.length} authored schema(s) would not build`);
  process.exit(1);
}
if (expectAll && unauthored.length > 0) {
  console.error(`check-brief-schema: FAIL - --expect-all but ${unauthored.length} family(s) have no authored schema: ${unauthored.join(', ')}`);
  process.exit(1);
}
console.log(
  `check-brief-schema: PASS - ${authoredCount}/${families.length} family(s) declare their own fields and journey${expectAll ? ' (all required)' : ''}`,
);
