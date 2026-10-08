/**
 * Author a brief's own form schema into the tr-* manifest.
 *
 * Usage:
 *   node scripts/set-brief-schema.mjs <patch.json> [--manifest <path>] [--check]
 *
 * `<patch.json>` maps a family id to the schema that family's brief declares:
 *
 *   {
 *     "tr-01": {
 *       "fields": [
 *         { "slug": "customer", "name": "customer", "type": "text", "label": "Full name",
 *           "autocomplete": "name", "required": true, "echoed": true }
 *       ],
 *       "journey": {
 *         "startPath": "/", "formSelector": "form#service-booking-form",
 *         "fill": { "input[name=customer]": "Ada Lovelace" }, "expectText": "Ada Lovelace"
 *       }
 *     }
 *   }
 *
 * The schema is written to BOTH variants of the family, which must never differ: the
 * two variants are the same brief at two frameworks, so a form that differed between
 * them would make the pair comparison meaningless.
 *
 * Nothing is written unless EVERY family in the patch validates, so a bad family
 * cannot leave the manifest half-authored. Validation is `src/train/brief-schema.mjs`,
 * the same code the scaffold enforces, so a patch cannot pass here and fail at build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { validateBriefSchema } from '../src/train/brief-schema.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const patchPath = args.find((arg) => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--manifest');
const manifestPath = flag('--manifest', 'docs/train/briefs/manifest.jsonl');
const checkOnly = args.includes('--check');

if (!patchPath) {
  console.error('usage: node scripts/set-brief-schema.mjs <patch.json> [--manifest <path>] [--check]');
  process.exit(2);
}

const patch = JSON.parse(readFileSync(patchPath, 'utf8'));
const lines = readFileSync(manifestPath, 'utf8').split('\n');

// Validate every family against a copy of its real row before touching the file, so the
// schema is checked in the context it will actually live in.
const rows = lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
const unknown = Object.keys(patch).filter((family) => !rows.some((row) => row.family_id === family));
if (unknown.length > 0) {
  console.error(`set-brief-schema: no such family in the manifest: ${unknown.join(', ')}`);
  process.exit(2);
}

const findings = [];
for (const [family, schema] of Object.entries(patch)) {
  for (const row of rows.filter((r) => r.family_id === family)) {
    findings.push(...validateBriefSchema({ ...row, ...schema }));
  }
}
if (findings.length > 0) {
  for (const finding of findings) console.error(`set-brief-schema: ${finding.brief_id} ${finding.at}: ${finding.problem}`);
  console.error(`set-brief-schema: refused, nothing written (${findings.length} finding(s))`);
  process.exit(1);
}

if (checkOnly) {
  console.log(`set-brief-schema: ${Object.keys(patch).length} family(s) validate; nothing written (--check)`);
  process.exit(0);
}

let rewritten = 0;
const out = lines.map((line) => {
  if (!line.trim()) return line;
  const row = JSON.parse(line);
  const schema = patch[row.family_id];
  if (!schema) return line;
  row.fields = schema.fields;
  row.journey = schema.journey;
  rewritten++;
  return JSON.stringify(row);
});
writeFileSync(manifestPath, out.join('\n'));

// Both variants must end up identical, so prove it rather than assume it.
const after = out.filter((l) => l.trim()).map((l) => JSON.parse(l));
const disagreeing = [...new Set(after.map((r) => r.family_id))].filter((family) => {
  const schemas = after.filter((r) => r.family_id === family).map((r) => JSON.stringify({ fields: r.fields, journey: r.journey }));
  return new Set(schemas).size !== 1;
});
console.log(`set-brief-schema: wrote ${rewritten} row(s) across ${Object.keys(patch).length} family(s)`);
console.log(`set-brief-schema: families whose variants disagree: ${disagreeing.length}${disagreeing.length ? ' -> ' + disagreeing.join(', ') : ''}`);
if (disagreeing.length > 0) process.exit(1);
