import test from 'node:test';
import assert from 'node:assert/strict';

import { ProvenanceError } from '../src/provenance/arms.mjs';
import { makeRecord, parseManifest, sourceLineOf, validateManifest, validateRecord } from '../src/provenance/record.mjs';

/** Retention fields for an asset: the ref is named for the asset id, which is what makes it canonical. */
const retained = (id) => ({
  original_ref: `refs/tags/original/${id}`,
  original_sha: 'a'.repeat(40),
  original_tree: 'b'.repeat(40),
});

const approvedSelfGenerated = {
  id: 'proj-0001',
  arm: 'A1_self_generated',
  kind: 'original',
  storage_path: 'data/A1_self_generated/projects/proj-0001',
  generator: { type: 'open-weight', provider: 'local', model: 'Qwen2.5-Coder-7B-Instruct' },
  rights_ref: 'docs/provenance/assets/proj-0001.md',
  created_at: '2026-10-08',
  excluded_from_training: false,
  approved_for_training: true,
  approved_by: 'mwg-train-coord',
  approved_at: '2026-10-08',
  parents: [],
  ...retained('proj-0001'),
};

const codes = (findings) => findings.map((finding) => finding.code);

test('makeRecord fills the safe defaults', () => {
  const teacher = makeRecord({ id: 'x', arm: 'A3_teacher_generated', kind: 'original' });
  assert.equal(teacher.excluded_from_training, true);
  assert.equal(teacher.approved_for_training, false);
  assert.deepEqual(teacher.parents, []);

  const self = makeRecord({ id: 'y', arm: 'A1_self_generated', kind: 'original' });
  assert.equal(self.excluded_from_training, false);
  assert.equal(self.approved_for_training, false, 'approval is never a default');
});

test('a complete approved record passes', () => {
  assert.deepEqual(validateRecord(approvedSelfGenerated), []);
});

test('structural problems are reported with their field', () => {
  assert.deepEqual(codes(validateRecord(null)), ['NOT_AN_OBJECT']);
  assert.ok(codes(validateRecord({ ...approvedSelfGenerated, id: 'Not A Slug' })).includes('BAD_ID'));
  assert.ok(codes(validateRecord({ ...approvedSelfGenerated, arm: 'A9_nope' })).includes('UNKNOWN_ARM'));
  assert.ok(codes(validateRecord({ ...approvedSelfGenerated, kind: 'screenshot' })).includes('BAD_KIND'));
  assert.ok(codes(validateRecord({ ...approvedSelfGenerated, rights_ref: '' })).includes('MISSING_RIGHTS_REF'));
  assert.ok(
    codes(validateRecord({ ...approvedSelfGenerated, generator: undefined })).includes('MISSING_GENERATOR'),
  );
  assert.ok(
    codes(validateRecord({ ...approvedSelfGenerated, generator: { type: 'telepathy' } })).includes('BAD_GENERATOR_TYPE'),
  );
  assert.ok(
    codes(validateRecord({ ...approvedSelfGenerated, storage_path: 'data/A3_teacher_generated/projects/proj-0001' })).includes(
      'CROSS_ARM_PATH',
    ),
  );
  assert.ok(codes(validateRecord({ ...approvedSelfGenerated, parents: ['proj-0001'] })).includes('SELF_PARENT'));
});

test('material from a hosted teacher model can only sit in the quarantined arm', () => {
  const hostedGenerator = {
    type: 'hosted-api',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    account_ref: 'docs/provenance/accounts/anthropic-claude-max.md',
    terms_ref: 'docs/provenance/assets/anthropic-anthropic-consumer-terms.md',
  };
  const mislabelled = { ...approvedSelfGenerated, generator: hostedGenerator };
  assert.ok(codes(validateRecord(mislabelled)).includes('HOSTED_GENERATOR_OUTSIDE_QUARANTINE'));

  const quarantined = {
    ...approvedSelfGenerated,
    id: 'proj-0002',
    ...retained('proj-0002'),
    arm: 'A3_teacher_generated',
    storage_path: 'data/A3_teacher_generated/projects/proj-0002',
    generator: hostedGenerator,
    excluded_from_training: true,
    approved_for_training: false,
    approved_by: undefined,
    approved_at: undefined,
  };
  assert.deepEqual(validateRecord(quarantined), []);

  const incomplete = { ...quarantined, generator: { ...hostedGenerator, terms_ref: '' } };
  assert.ok(codes(validateRecord(incomplete)).includes('INCOMPLETE_HOSTED_GENERATOR'));
});

test('quarantine cannot be switched off by hand', () => {
  const teacher = {
    ...approvedSelfGenerated,
    id: 'proj-0002',
    ...retained('proj-0002'),
    arm: 'A3_teacher_generated',
    storage_path: 'data/A3_teacher_generated/projects/proj-0002',
    excluded_from_training: false,
    approved_for_training: false,
    approved_by: undefined,
    approved_at: undefined,
  };
  assert.ok(codes(validateRecord(teacher)).includes('QUARANTINE_NOT_ENFORCED'));
});

test('approval needs the arm, the flag and named evidence', () => {
  const onQuarantinedArm = {
    ...approvedSelfGenerated,
    arm: 'A3_teacher_generated',
    storage_path: 'data/A3_teacher_generated/projects/proj-0001',
  };
  assert.ok(codes(validateRecord(onQuarantinedArm)).includes('APPROVAL_ON_QUARANTINED_ARM'));

  const { approved_by, approved_at, ...withoutEvidence } = approvedSelfGenerated;
  const approvalFindings = validateRecord(withoutEvidence).filter((finding) => finding.code === 'INCOMPLETE_APPROVAL');
  assert.deepEqual(approvalFindings.map((finding) => finding.field).sort(), ['approved_at', 'approved_by']);

  const excluded = { ...approvedSelfGenerated, excluded_from_training: true };
  assert.ok(codes(validateRecord(excluded)).includes('APPROVAL_WHILE_EXCLUDED'));
});

test('parseManifest reads JSONL, ignores comments and rejects broken lines', () => {
  const rows = parseManifest(['# a comment', '', '{"id":"a"}', '  {"id":"b"}  '].join('\n'));
  assert.deepEqual(rows, [{ id: 'a' }, { id: 'b' }]);
  assert.throws(() => parseManifest('{"id":"a"}\nnot json'), { code: 'BAD_MANIFEST_LINE' });
  assert.throws(() => parseManifest('{'), ProvenanceError);
});

test('manifest validation catches duplicate ids and dangling parents', () => {
  const duplicate = validateManifest([approvedSelfGenerated, { ...approvedSelfGenerated }]);
  assert.equal(duplicate.ok, false);
  assert.ok(codes(duplicate.findings).includes('DUPLICATE_ID'));

  const dangling = validateManifest([{ ...approvedSelfGenerated, parents: ['ghost'] }]);
  assert.ok(codes(dangling.findings).includes('UNKNOWN_PARENT'));
});

test('a trainable asset may not descend from quarantined material', () => {
  const teacherOriginal = {
    ...approvedSelfGenerated,
    id: 'proj-teacher',
    ...retained('proj-teacher'),
    arm: 'A3_teacher_generated',
    storage_path: 'data/A3_teacher_generated/projects/proj-teacher',
    generator: {
      type: 'hosted-api',
      provider: 'openai',
      model: 'gpt-6-sol',
      account_ref: 'docs/provenance/accounts/openai-codex.md',
      terms_ref: 'docs/provenance/assets/openai-openai-terms-of-use.md',
    },
    excluded_from_training: true,
    approved_for_training: false,
    approved_by: undefined,
    approved_at: undefined,
    parents: [],
  };
  // A2 uplift of a teacher original: the uplift itself looks clean, but its lineage is not.
  const launderAttempt = {
    ...approvedSelfGenerated,
    id: 'proj-uplift',
    ...retained('proj-uplift'),
    arm: 'A2_mwg_uplift_deterministic',
    kind: 'uplift',
    storage_path: 'data/A2_mwg_uplift_deterministic/projects/proj-uplift',
    parents: ['proj-teacher'],
  };
  const result = validateManifest([teacherOriginal, launderAttempt]);
  assert.equal(result.ok, false);
  assert.ok(codes(result.findings).includes('QUARANTINED_ANCESTOR'));
  assert.equal(result.counts.trainable, 1, 'still counted, but blocked by the finding');

  // The same uplift parented by a self-generated original is fine.
  const clean = validateManifest([
    { ...approvedSelfGenerated, id: 'proj-0001' },
    { ...launderAttempt, parents: ['proj-0001'] },
  ]);
  assert.equal(clean.ok, true, JSON.stringify(clean.findings));
  assert.equal(clean.counts.trainable, 2);
  assert.equal(clean.counts.quarantined, 0);
});

test('findings carry the manifest line number, not the array index', () => {
  const text = [
    '# a comment header',
    '# another comment',
    '',
    JSON.stringify(approvedSelfGenerated),
    '',
    JSON.stringify({ ...approvedSelfGenerated, id: 'proj-0002', kind: 'screenshot' }),
  ].join('\n');
  const { ok, findings } = validateManifest(parseManifest(text));
  assert.equal(ok, false);
  const badKind = findings.find((finding) => finding.code === 'BAD_KIND');
  assert.equal(badKind.id, 'proj-0002');
  assert.equal(badKind.line, 6, 'the bad record is on source line 6');
  assert.equal(badKind.index, 1, 'the array index is still reported for API consumers');
  assert.equal(sourceLineOf(parseManifest(text)[0]), 4, 'parseManifest remembers the source line');
});

test('created_at accepts ISO-8601 timestamps with a numeric offset', () => {
  for (const created_at of ['2026-10-08', '2026-10-08T12:00:00Z', '2026-10-08T12:00:00+00:00', '2026-10-08T12:00:00.500-07:00']) {
    assert.deepEqual(
      validateRecord({ ...approvedSelfGenerated, created_at }).filter((finding) => finding.code === 'BAD_CREATED_AT'),
      [],
      created_at,
    );
  }
  assert.ok(
    codes(validateRecord({ ...approvedSelfGenerated, created_at: '8 October 2026' })).includes('BAD_CREATED_AT'),
  );
});

test('the validator reports findings instead of throwing, whatever it is handed', () => {
  const hostile = [
    null,
    undefined,
    42,
    'x',
    [],
    {},
    { id: 'Not A Slug', kind: 'original', original_ref: 'refs/tags/original/x', original_sha: 'a'.repeat(40) },
    { id: 'x', kind: 'original', original_ref: 123, original_sha: {} },
    { id: 'x', kind: 'original', original_ref: 'refs/tags/original/x', original_sha: 'a'.repeat(40), original_tree: {} },
    { id: 'x', kind: 'original', original_ref: 'refs/tags/original/x', original_sha: 'a'.repeat(40), retention: 'nope' },
    { id: 'x', kind: 'original', original_ref: 'refs/tags/original/x', original_sha: 'a'.repeat(40), retention: { repo: 7, protections: 'no' } },
  ];
  for (const record of hostile) {
    const findings = validateRecord(record);
    assert.ok(Array.isArray(findings), `validateRecord(${JSON.stringify(record)}) must return findings`);
    assert.ok(findings.every((f) => typeof f.code === 'string' && typeof f.message === 'string'));
  }
});

test('a manifest with no trainable rows is valid but counts zero', () => {
  const result = validateManifest([
    makeRecord({
      id: 'b',
      arm: 'A6_evaluation',
      kind: 'evaluation',
      generator: { type: 'human' },
      rights_ref: 'docs/provenance/assets/b.md',
      storage_path: 'data/A6_evaluation/b',
      ...retained('b'),
    }),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.deepEqual(result.counts, { total: 1, uniqueIds: 1, trainable: 0, quarantined: 1 });
});
