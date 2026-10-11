#!/usr/bin/env node
/**
 * Gate the third key: every build record must say which model produced the build, and the key it records
 * must be the key its own fields derive.
 *
 *   node scripts/check-build-key.mjs [--record <path>]... [--root <dir>] [--help]
 *
 * The property being protected is attribution. The sealed evaluation compares C1/C2/C3/T on the same task,
 * and those arms differ by model and only by model: if a record carries no model, or carries one that does
 * not agree with the key beside it, then two arms collide on one identity, one silently wins, and the
 * comparison is of whatever happened to be in the directory rather than of the models. This gate is
 * therefore about a MISSING or DRIFTED field, not about the values being interesting.
 *
 * Fails closed: a malformed or absent record is a FAIL (never a stack trace), a missing field is a FAIL
 * rather than a default, and the key is RE-DERIVED from each row's own project id and model rather than
 * trusted as stored, so a record that has drifted from the module cannot pass by agreeing with itself.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import {
  KEY_FIELD,
  MODEL_FIELD,
  NO_MODEL,
  assertModelIdentity,
  buildKey,
  buildKeyDefinition,
  isProviderModelIdentity,
} from '../src/eval/build-key.mjs';

const DEFAULT_RECORDS = ['pilot/CORPUS.json', 'pilot/TRAINING_CORPUS.json'];

function parseArgs(argv) {
  const args = { root: '.', records: [], help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--record') args.records.push(argv[++i]);
    else if (argv[i] === '--root') args.root = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`check-build-key: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  if (args.help) {
    console.log('usage: node scripts/check-build-key.mjs [--record <path>]... [--root <dir>]');
    process.exit(0);
  }
  if (args.records.length === 0) args.records = DEFAULT_RECORDS;
  return args;
}

/**
 * The declaration each record carries must agree with the module that wrote it, field name for field name,
 * or a rename in one place leaves the artifact describing a convention nothing implements.
 */
function declarationFindings(path, record) {
  const findings = [];
  const declared = record.build_key_definition;
  if (declared === null || typeof declared !== 'object') {
    findings.push(`${path}: the record carries no build_key_definition, so a reader cannot tell what its ${MODEL_FIELD} field means`);
    return findings;
  }
  const expected = buildKeyDefinition(path);
  for (const field of ['model_field', 'key_field', 'no_model']) {
    if (declared[field] !== expected[field]) {
      findings.push(`${path}: build_key_definition.${field} is ${JSON.stringify(declared[field])}, but this module records ${JSON.stringify(expected[field])}`);
    }
  }
  return findings;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);
  const findings = [];
  const allRows = [];

  for (const recordPath of args.records) {
    const path = join(root, recordPath);
    if (!existsSync(path)) {
      findings.push(`${recordPath}: the record does not exist, so no build in it can be attributed to a model`);
      continue;
    }
    let record;
    try {
      record = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      findings.push(`${recordPath}: the record is not readable JSON (${error.message})`);
      continue;
    }
    findings.push(...declarationFindings(recordPath, record));
    const rows = Array.isArray(record.projects) ? record.projects : null;
    if (rows === null) {
      findings.push(`${recordPath}: the record has no projects array`);
      continue;
    }
    let missing = 0;
    // Collisions are computed on keys this gate DERIVES itself, and only for rows that have a key: a row
    // whose model is missing is already a finding, and feeding it to a key function would turn a reportable
    // defect into a stack trace, which is the one thing this gate promises never to do.
    const keyed = new Map();
    for (const row of rows) {
      const id = row?.project_id ?? '(a row with no project_id)';
      try {
        assertModelIdentity(row?.[MODEL_FIELD], { context: `${recordPath} ${id}` });
      } catch (error) {
        findings.push(error.message);
        missing += 1;
        continue;
      }
      // The stored key must be the key the row's own fields derive: a record whose key and fields disagree
      // is two records, and whichever a reader believes is a coin toss.
      let derived;
      try {
        derived = buildKey({ projectId: row.project_id, model: row[MODEL_FIELD] });
      } catch (error) {
        findings.push(`${recordPath} ${id}: ${error.message}`);
        continue;
      }
      if (row[KEY_FIELD] !== derived) {
        findings.push(`${recordPath} ${id}: the recorded ${KEY_FIELD} is ${JSON.stringify(row[KEY_FIELD])}, but its own project id and model derive ${derived}`);
      }
      const holders = keyed.get(derived) ?? [];
      holders.push(id);
      keyed.set(derived, holders);
      allRows.push({ record: recordPath, row });
    }
    for (const [key, holders] of keyed) {
      if (holders.length > 1) {
        findings.push(`${recordPath}: build key ${key} is carried by more than one project (${holders.join(', ')})`);
      }
    }
    const models = new Set(rows.filter((row) => typeof row?.[MODEL_FIELD] === 'string').map((row) => row[MODEL_FIELD]));
    console.log(
      `check-build-key: ${recordPath} - ${rows.length} row(s), ${rows.length - missing} with a model, ${models.size} distinct model value(s)`,
    );
  }

  // A key identifies one build across every record: the two corpora are disjoint, so a shared key would
  // mean two builds with one identity.
  const byKey = new Map();
  for (const { record, row } of allRows) {
    let key;
    try {
      key = buildKey({ projectId: row.project_id, model: row[MODEL_FIELD] });
    } catch {
      continue;
    }
    if (byKey.has(key) && byKey.get(key).record !== record) {
      findings.push(`build key ${key} names a build in both ${byKey.get(key).record} and ${record}`);
    }
    byKey.set(key, { record, row });
  }

  // The sentinel must stay distinguishable from a model, or "no model was in the loop" becomes a claim
  // about a model that does not exist.
  if (isProviderModelIdentity(NO_MODEL)) {
    findings.push(`the no-model sentinel ${JSON.stringify(NO_MODEL)} parses as a provider/id model identity, so the two cannot be told apart`);
  }

  for (const finding of findings) console.log(`FINDING BUILD_KEY ${finding}`);
  if (findings.length > 0) {
    console.error(`check-build-key: FAIL - ${findings.length} finding(s); the build records are not proven to attribute each build to the model that produced it`);
    process.exit(1);
  }
  const distinct = new Set(allRows.map(({ row }) => row[MODEL_FIELD]));
  console.log(
    `check-build-key: PASS - ${allRows.length} build(s) across ${args.records.length} record(s), every one with a model identity and a re-derived key; ${distinct.size} distinct model value(s) (${[...distinct].join(', ')})`,
  );
}

main();
