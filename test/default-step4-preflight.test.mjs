import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertStep4Ratification, prepareDefaultStep4, step4RatificationRow } from '../src/eval/default-step4-preflight.mjs';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const tranche = JSON.parse(readFileSync(path('../docs/eval/default-set-hono-tranche-2026-10-19.json'), 'utf8'));
const briefs = readFileSync(path('../docs/train/briefs/manifest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const ratificationRow = step4RatificationRow(readFileSync(path('../docs/eval/PREREGISTRATION.md'), 'utf8'));
const copy = (value) => structuredClone(value);

test('Step 4 collects only against the exact owner-ratified §14 row', () => {
  assert.doesNotThrow(() => assertStep4Ratification(ratificationRow));
  assert.throws(() => assertStep4Ratification(ratificationRow.replace('>=90%', '>=80%')), /RATIFICATION_MISSING/);
  assert.throws(() => assertStep4Ratification('a plausible 90% row'), /RATIFICATION_MISSING/);
  assert.throws(() => step4RatificationRow('no §14 table'), /RATIFICATION_MISSING/);
  assert.equal(prepareDefaultStep4({ tranche, briefs, ratificationRow }).ratification, 'RATIFIED');
});

test('the public first tranche yields an offline-only canonical brief and rule plan', () => {
  const result = prepareDefaultStep4({ tranche, briefs });
  assert.equal(result.kind, 'step4-preflight-only');
  assert.equal(result.ratification, 'MISSING');
  assert.equal(result.families.length, 30);
  const of = (status) => result.families.filter((row) => row.eligibility === status);
  assert.equal(of('ELIGIBLE').length, 22);
  assert.deepEqual(of('MODEL_LENGTH_NO_PROJECT').map((row) => row.family), ['tr-14', 'tr-16', 'tr-21', 'tr-23', 'tr-28']);
  assert.deepEqual(of('TRANSPORT_UNEVALUABLE').map((row) => row.family), ['tr-03', 'tr-08', 'tr-27']);
  const required = of('ELIGIBLE').flatMap((row) => row.required_rules);
  assert.equal(required.length, 44);
  assert.equal(required.filter((rule) => rule.checkability === 'CHECKABLE').length, 0);
  const diagnostics = of('ELIGIBLE').flatMap((row) => row.applicable_diagnostics);
  assert.equal(diagnostics.length, 105);
  assert.equal(diagnostics.filter((rule) => rule.checkability === 'CHECKABLE').length, 30);
  assert.equal(of('ELIGIBLE').every((row) => row.adapter.echoedField && row.adapter.primaryField), true);
  const volunteer = result.families.find((row) => row.family === 'tr-05');
  assert.equal(volunteer.adapter.echoedSelector, 'input[name=name]');
  assert.equal(volunteer.adapter.framework, 'hono');
  assert.equal(volunteer.adapter.journey.expectText, 'Morgan Reed');
  assert.equal(volunteer.required_rules.every((rule) => rule.checkability === 'NOT_CHECKABLE'), true);
  assert.equal(result.families.find((row) => row.family === 'tr-03').adapter, undefined,
    'transport-unevaluable families must not supply an executable adapter');
});

test('preflight fails closed on changed identity, missing brief and ambiguous echo without executing a project', () => {
  const tampered = copy(tranche);
  tampered.run_records[1].request_id = tampered.run_records[0].request_id;
  assert.throws(() => prepareDefaultStep4({ tranche: tampered, briefs }), /TRANCHE_IDENTITY_MISMATCH/);
  const missing = briefs.filter((row) => row.brief_id !== 'tr-05-v1');
  assert.throws(() => prepareDefaultStep4({ tranche, briefs: missing }), /BRIEF_IDENTITY_MISMATCH/);
  const changed = copy(briefs);
  const volunteer = changed.find((row) => row.brief_id === 'tr-05-v1');
  volunteer.fields.find((field) => field.echoed).echoed = false;
  assert.throws(() => prepareDefaultStep4({ tranche, briefs: changed }), /ADAPTER_AMBIGUOUS/);
  const paraphrased = copy(briefs);
  paraphrased.find((row) => row.brief_id === 'tr-05-v1').journey.fill['input[name=name]'] = 'Another person';
  assert.throws(() => prepareDefaultStep4({ tranche, briefs: paraphrased }), /ADAPTER_AMBIGUOUS/);
});
