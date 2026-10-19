import test from 'node:test';
import assert from 'node:assert/strict';
import { headroom, journeyComponentVerdicts, requiredRuleVerdicts } from '../src/eval/default-step4-verdict.mjs';
import { scoreDefaultFamily } from '../scripts/default-step4-score.mjs';

const journey = { expectText: 'Ada', steps: [{ path: '/intake' }], search: { path: '/search' } };
const persistence = { steps: [{ step: 'submit', status: 302 }, { step: 'reload' }], persistedText: 'Ada saved',
  serverWitness: { status: 200, shape: 'records', expectedRecordPresent: true },
  state: { passed: false }, carry: { passed: true } }; // draft retention is diagnostic, not a declared carry requirement.

test('the scoring entry point quarantines failed and unknown paid identities before touching the archive', async () => {
  for (const family of ['tr-03', 'tr-14', 'tr-31']) {
    await assert.rejects(scoreDefaultFamily({ family, archiveRoot: '/nonexistent', evidenceRoot: '/nonexistent' }),
      /GENERATION_QUARANTINE/);
  }
});

test('a driven journey counts each observable component once; umbrella rules stay uncheckable', () => {
  const parts = journeyComponentVerdicts({ journey, persistence,
    validation: { invalidCount: 1 }, search: { containerFound: true, verdict: { passed: false,
      detail: { controlMissing: [], includesMissing: ['Ada'] } } } });
  assert.deepEqual(parts.map(({ name, status }) => [name, status]), [
    ['server-persistence', 'PASS'], ['multi-step-carry', 'PASS'], ['empty-form-validation', 'PASS'], ['search', 'FAIL'],
  ]);
  const rules = requiredRuleVerdicts([{ rule_id: 'forms/forms', checkability: 'NOT_CHECKABLE', reason: 'no exact checker' }]);
  assert.deepEqual(rules.map(({ name, status }) => [name, status]), [['forms/forms', 'NOT_CHECKABLE']]);
  assert.deepEqual(headroom(parts, rules), { passed: 3, failed: 1, not_checkable: 1, coverage_incomplete: true, rate: 0.75, ceiling: false });
});

test('absent observations, unestablished controls and errors do not become failures or a zero rate', () => {
  const parts = journeyComponentVerdicts({ journey, validation: { urlUnchanged: true, stillOnForm: true },
    search: { containerFound: false, verdict: { passed: false, detail: { controlMissing: ['decoy'] } } } });
  assert.equal(parts.every((entry) => entry.status === 'NOT_CHECKABLE'), true);
  const rules = requiredRuleVerdicts([{ rule_id: 'forms/required-field-feedback', checkability: 'CHECKABLE' }],
    [{ rule: 'forms/required-field-feedback', status: 'ERROR', detail: 'instrument timeout' }]);
  assert.deepEqual(headroom(parts, rules), { passed: 0, failed: 0, not_checkable: 5, coverage_incomplete: true, rate: null, ceiling: null });
  assert.equal(headroom([{ status: 'PASS' }, { status: 'PASS' }, { status: 'PASS' }, { status: 'PASS' },
    { status: 'PASS' }, { status: 'PASS' }, { status: 'PASS' }, { status: 'PASS' }, { status: 'PASS' }, { status: 'FAIL' }], []).ceiling, true);
});

test('a same-context reload without server witness never proves server persistence', () => {
  const incomplete = journeyComponentVerdicts({ journey: { expectText: 'Ada' }, persistence: {
    steps: [{ step: 'submit', status: 200 }, { step: 'reload' }], persistedText: 'Ada from browser storage',
  } });
  assert.equal(incomplete[0].status, 'NOT_CHECKABLE');
  const absentRecord = journeyComponentVerdicts({ journey: { expectText: 'Ada' }, persistence: {
    steps: [{ step: 'submit', status: 200 }, { step: 'reload' }], persistedText: 'Ada from browser storage',
    serverWitness: { status: 200, shape: 'records', expectedRecordPresent: false },
  } });
  assert.equal(absentRecord[0].status, 'FAIL');
  const unknownSubmit = journeyComponentVerdicts({ journey: { expectText: 'Ada' }, persistence: {
    steps: [{ step: 'submit', status: null }, { step: 'reload' }], persistedText: 'Ada',
    serverWitness: { status: 200, shape: 'records', expectedRecordPresent: true },
  } });
  assert.equal(unknownSubmit[0].status, 'NOT_CHECKABLE');
  const noUpdateControl = journeyComponentVerdicts({ journey: { expectText: 'Ada', update: { field: 'name' } },
    update: { verdict: { passed: false, detail: { ref: 'abc', apiStatus: 404, rowsBefore: null, rowsAfter: null } } } });
  assert.equal(noUpdateControl.find((entry) => entry.name === 'update-existing').status, 'NOT_CHECKABLE');
});

test('accepted empty forms are a measured failure, while a 5xx write is not a pass', () => {
  const parts = journeyComponentVerdicts({ journey: { expectText: 'Ada' },
    persistence: { steps: [{ step: 'submit', status: 500 }, { step: 'reload' }], persistedText: 'Ada',
      serverWitness: { status: 200, shape: 'records', expectedRecordPresent: true } },
    validation: { urlUnchanged: false, stillOnForm: false } });
  assert.deepEqual(parts.map((entry) => entry.status), ['FAIL', 'FAIL']);
});
