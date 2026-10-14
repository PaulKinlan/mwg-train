/**
 * The separation check's own tests.
 *
 * The check exists because the corpus record called the MWG-REPAIRED artefact "baseline" while the
 * lifecycle documents called the RAW artefact "baseline" (bead mwg-train-210). A check like this only
 * earns its place if its failure paths work, so every rule is driven here with a fixture that breaks
 * exactly that rule - not only the happy path over the real records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkSetSeparation, loadRecords, separationFindings } from '../scripts/check-set-separation.mjs';
import { BASELINE_FIELDS } from '../src/eval/ruleset.mjs';
import { NO_MODEL } from '../src/eval/build-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (digit) => `sha256:${digit.repeat(64)}`;

/** The smallest record set the rules apply to, so each fixture differs from a passing one in one way. */
function fixture(overrides = {}) {
  return {
    pilot: {
      baseline_label: BASELINE_FIELDS.baseline_label,
      baseline_definition: BASELINE_FIELDS.baseline_definition,
      baseline_tool: BASELINE_FIELDS.baseline_tool,
      uplift_tool: BASELINE_FIELDS.baseline_tool,
      projects: [
        {
          project_id: 'p-1', model: NO_MODEL,
          original_sha: sha('a'), uplift_sha: sha('b'),
          uplift_applied: ['forms/required-field-feedback'], improved_rules: ['forms/required-field-feedback'],
          accepted: true,
        },
        {
          project_id: 'p-2', model: NO_MODEL,
          original_sha: sha('c'), uplift_sha: sha('c'),
          uplift_applied: [], improved_rules: [], accepted: false, category: 'no-warranted-change',
        },
      ],
    },
    trainingRun: {
      baseline_label: BASELINE_FIELDS.baseline_label,
      baseline_definition: BASELINE_FIELDS.baseline_definition,
      baseline_tool: BASELINE_FIELDS.baseline_tool,
      projects: [
        {
          project_id: 't-1', original_sha: sha('d'), uplifted_sha: sha('e'), corpus_tree_sha: sha('d'),
          decision: { accepted: true, improved_rules: ['forms/required-field-feedback'], baseline_definition: BASELINE_FIELDS.baseline_definition },
        },
      ],
    },
    trainingCorpus: {
      projects: [{ project_id: 'tr-1', tree_sha: sha('f'), model: NO_MODEL }],
    },
    ...overrides,
  };
}

const codes = (records) => separationFindings(records).map((finding) => finding.code);

test('a well-formed record set passes every rule', () => {
  assert.deepEqual(separationFindings(fixture()), []);
});

test('rules applied to an unchanged tree is a finding', () => {
  const records = fixture();
  records.pilot.projects[0].uplift_sha = records.pilot.projects[0].original_sha;
  assert.ok(codes(records).includes('UPLIFT_WITHOUT_CHANGE'));
});

test('a tree that moved with no rule applied is a finding', () => {
  const records = fixture();
  records.pilot.projects[1].uplift_sha = sha('9');
  assert.ok(codes(records).includes('CHANGE_WITHOUT_UPLIFT'));
});

test('an accepted pair with no improvement is a finding', () => {
  const records = fixture();
  records.pilot.projects[1].accepted = true;
  assert.ok(codes(records).includes('ACCEPTED_WITHOUT_IMPROVEMENT'));
  const training = fixture();
  training.trainingRun.projects[0].decision.improved_rules = [];
  assert.ok(codes(training).includes('ACCEPTED_WITHOUT_IMPROVEMENT'));
});

test('improvements recorded with no rule applied is a finding', () => {
  const records = fixture();
  records.pilot.projects[1].improved_rules = ['forms/required-field-feedback'];
  assert.ok(codes(records).includes('IMPROVEMENT_WITHOUT_UPLIFT'));
});

test('a REJECTED pair that still improved some rules is legitimate, not a finding', () => {
  // decidePair records improved_rules before it discovers a rule regression or a new security finding,
  // so this is a real outcome of a real run (mwg-train-210 review, finding 1). Failing it here would
  // make the gate fire on a correct record.
  for (const category of ['rule-regression', 'security-regression']) {
    const records = fixture();
    const row = records.trainingRun.projects[0];
    row.decision.accepted = false;
    row.decision.category = category;
    row.decision.improved_rules = ['forms/required-field-feedback'];
    row.decision.regressed_rules = ['forms/labels-associated'];
    assert.deepEqual(codes(records), [], `${category} must not be a finding`);
  }
  const pilot = fixture();
  const row = pilot.pilot.projects[0];
  row.accepted = false;
  row.category = 'security-regression';
  assert.deepEqual(codes(pilot), [], 'a rejected pilot pair with applied rules must not be a finding');
});

test('one project default being another project ideal is a finding', () => {
  const records = fixture();
  records.pilot.projects[1].original_sha = sha('b'); // p-1's ideal
  records.pilot.projects[1].uplift_sha = sha('b');
  assert.ok(codes(records).includes('SIDE_COLLISION'));
});

test('a training tree that collides with a pilot tree is a finding', () => {
  const records = fixture();
  records.trainingCorpus.projects[0].tree_sha = sha('a');
  assert.ok(codes(records).includes('TRAINING_CORPUS_COLLISION'));
});

test('a training row recording anything but the default as its corpus tree is a finding', () => {
  const records = fixture();
  records.trainingRun.projects[0].corpus_tree_sha = records.trainingRun.projects[0].uplifted_sha;
  assert.ok(codes(records).includes('CORPUS_TREE_NOT_DEFAULT'));
});

test('a missing or malformed hash on either side is a finding', () => {
  const records = fixture();
  delete records.pilot.projects[0].original_sha;
  delete records.trainingRun.projects[0].uplifted_sha;
  const found = codes(records).filter((code) => code === 'DEFAULT_HASH' || code === 'IDEAL_HASH');
  assert.ok(found.length >= 2, `expected both side-hash findings, got ${found}`);
});

test('a model recorded on a deterministic corpus row is a finding', () => {
  const records = fixture();
  records.pilot.projects[0].model = 'deepseek/v4.1-flash';
  records.trainingCorpus.projects[0].model = 'deepseek/v4.1-flash';
  assert.equal(codes(records).filter((code) => code === 'MODEL_RECORDED').length, 2);
});

test('a record still carrying the old ambiguous wording is a finding', () => {
  const records = fixture();
  // The exact string the records carried before mwg-train-210: accurate about the artefact's provenance
  // but silent on which side of the pair it is. A record keeping it has drifted from the constant.
  records.pilot.baseline_definition =
    'deterministic repair of the project by our own Modern Web Guidance rule specifications; no model and no teacher in the loop';
  assert.ok(codes(records).includes('DEFINITION_DRIFT'), 'the old wording must not pass');
});

test('the shared definition names both sides explicitly', () => {
  // This is the assertion that keeps the wording from drifting back into ambiguity: the definition a
  // reader meets in every record has to say which artefact it is and which one it is not.
  assert.match(BASELINE_FIELDS.baseline_definition, /default/i);
  assert.match(BASELINE_FIELDS.baseline_definition, /ideal/i);
});

test('the committed records pass, and the counts cover all three', () => {
  const result = checkSetSeparation({ repoRoot: ROOT });
  assert.deepEqual(result.findings, [], `committed records should be separated: ${JSON.stringify(result.findings, null, 2)}`);
  assert.equal(result.counts.pilot, 35);
  assert.equal(result.counts.trainingRun, 40);
  assert.equal(result.counts.trainingCorpus, 273);
});

test('the check reads the files it claims to', () => {
  const records = loadRecords(ROOT);
  assert.ok(records.pilot.projects.length > 0);
  // The two sides are separately named in the record, which is the property a reader needs.
  const row = records.pilot.projects[0];
  assert.notEqual(row.original_sha, undefined);
  assert.notEqual(row.uplift_sha, undefined);
  const raw = readFileSync(resolve(ROOT, 'docs/vocabulary.md'), 'utf8');
  assert.match(raw, /\bDEFAULT\b/);
  assert.match(raw, /\bIDEAL\b/);
});
