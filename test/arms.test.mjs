import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMS,
  ARM_IDS,
  DATA_ROOT,
  ProvenanceError,
  armRoot,
  assertArmRootsDistinct,
  assertAssetPath,
  assertMayTrain,
  defaultExcludedFromTraining,
  isInside,
  isTrainable,
  moveToArm,
  normaliseRelativePath,
  renameWithinArm,
  resolveStoragePath,
} from '../src/provenance/arms.mjs';

test('the six documented arms exist and get their own storage root', () => {
  assert.equal(ARM_IDS.length, 6);
  for (const id of ARM_IDS) {
    assert.equal(armRoot(id), `${DATA_ROOT}/${id}`);
    assert.equal(ARMS[id].storageRoot, `${DATA_ROOT}/${id}`);
  }
});

test('training exclusion and publication are independent for A4 and A6', () => {
  for (const id of ['A4_clean_room_reproduction', 'A6_evaluation']) {
    assert.equal(ARMS[id].eligibility, 'prohibited');
    assert.equal(ARMS[id].publication, 'public');
    assert.equal(ARMS[id].trainable, false);
  }
  for (const id of ['A3_teacher_generated', 'A5_black_box_reproduction']) {
    assert.equal(ARMS[id].publication, 'quarantine');
  }
});

test('quarantine defaults follow the arm', () => {
  for (const id of ['A3_teacher_generated', 'A4_clean_room_reproduction', 'A5_black_box_reproduction', 'A6_evaluation']) {
    assert.equal(ARMS[id].quarantined, true, id);
    assert.equal(ARMS[id].trainable, false, id);
    assert.equal(defaultExcludedFromTraining(id), true, id);
  }
  for (const id of ['A1_self_generated', 'A2_mwg_uplift_deterministic']) {
    assert.equal(ARMS[id].quarantined, false, id);
    assert.equal(ARMS[id].trainable, true, id);
    assert.equal(defaultExcludedFromTraining(id), false, id);
  }
});

test('storage paths are normalised and cannot escape', () => {
  assert.equal(normaliseRelativePath('projects/abc/index.html'), 'projects/abc/index.html');
  assert.equal(resolveStoragePath('A1_self_generated', 'projects/abc'), 'data/A1_self_generated/projects/abc');

  assert.throws(() => normaliseRelativePath(''), { code: 'EMPTY_PATH' });
  assert.throws(() => normaliseRelativePath('/etc/passwd'), { code: 'ABSOLUTE_PATH' });
  assert.throws(() => normaliseRelativePath('projects/../../secret'), { code: 'PATH_TRAVERSAL' });
  assert.throws(() => normaliseRelativePath('projects//abc'), { code: 'PATH_TRAVERSAL' });
  assert.throws(() => normaliseRelativePath('projects/abc/./d'), { code: 'PATH_TRAVERSAL' });
  assert.throws(() => normaliseRelativePath('projects\\abc'), { code: 'PATH_BACKSLASH' });
});

test('an asset must live under its own arm root', () => {
  assertAssetPath({ id: 'a', arm: 'A1_self_generated', storage_path: 'data/A1_self_generated/projects/a' });
  assert.throws(
    () => assertAssetPath({ id: 'a', arm: 'A1_self_generated', storage_path: 'data/A3_teacher_generated/projects/a' }),
    { code: 'CROSS_ARM_PATH' },
  );
  assert.throws(
    () => assertAssetPath({ id: 'a', arm: 'A3_teacher_generated', storage_path: 'data/A1_self_generated/projects/a' }),
    { code: 'CROSS_ARM_PATH' },
  );
});

test('isInside compares whole path segments', () => {
  assert.equal(isInside('data/A1_self_generated', 'data/A1_self_generated/projects'), true);
  assert.equal(isInside('data/A1', 'data/A1_self_generated/projects'), false);
  assert.equal(isInside('data/A3_teacher_generated', 'data/A3_teacher_generated_extra/x'), false);
});

test('two arms may never share or nest a storage root', () => {
  assert.doesNotThrow(() => assertArmRootsDistinct());
  assert.throws(
    () => assertArmRootsDistinct({ A1_self_generated: 'data/shared', A2_mwg_uplift_deterministic: 'data/shared' }),
    { code: 'SHARED_ARM_ROOT' },
  );
  assert.throws(
    () => assertArmRootsDistinct({ A1_self_generated: 'data', A2_mwg_uplift_deterministic: 'data/A2' }),
    { code: 'SHARED_ARM_ROOT' },
  );
  assert.throws(() => assertArmRootsDistinct({ not_an_arm: 'data/x' }), { code: 'UNKNOWN_ARM' });
});

test('assets cannot be moved between arms', () => {
  const record = { id: 'a', arm: 'A3_teacher_generated', storage_path: 'data/A3_teacher_generated/projects/a' };
  assert.throws(() => moveToArm(record, 'A1_self_generated'), { code: 'CROSS_ARM_MOVEMENT_PROHIBITED' });
  assert.throws(() => moveToArm(record, 'A1_self_generated'), ProvenanceError);
});

test('renaming inside an arm keeps the arm and re-resolves the root', () => {
  const record = { id: 'a', arm: 'A2_mwg_uplift_deterministic', storage_path: 'data/A2_mwg_uplift_deterministic/old' };
  const renamed = renameWithinArm(record, 'projects/a');
  assert.equal(renamed.storage_path, 'data/A2_mwg_uplift_deterministic/projects/a');
  assert.equal(record.storage_path, 'data/A2_mwg_uplift_deterministic/old', 'input record is not mutated');
});

test('training eligibility needs the arm, the exclusion flag and an explicit approval', () => {
  const approved = {
    id: 'a',
    arm: 'A1_self_generated',
    storage_path: 'data/A1_self_generated/projects/a',
    excluded_from_training: false,
    approved_for_training: true,
  };
  assert.equal(isTrainable(approved), true);
  assert.equal(assertMayTrain(approved), true);

  assert.equal(isTrainable({ ...approved, approved_for_training: false }), false);
  assert.throws(() => assertMayTrain({ ...approved, approved_for_training: false }), { code: 'NOT_APPROVED' });

  assert.equal(isTrainable({ ...approved, excluded_from_training: true }), false);
  assert.throws(() => assertMayTrain({ ...approved, excluded_from_training: true }), { code: 'EXCLUDED_FROM_TRAINING' });

  const teacher = { ...approved, arm: 'A3_teacher_generated', storage_path: 'data/A3_teacher_generated/projects/a' };
  assert.equal(isTrainable(teacher), false);
  assert.throws(() => assertMayTrain(teacher), { code: 'ARM_QUARANTINED' });

  assert.throws(() => assertMayTrain({ ...approved, arm: 'A9_nope' }), { code: 'UNKNOWN_ARM' });
});
