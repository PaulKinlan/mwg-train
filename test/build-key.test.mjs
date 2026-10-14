import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  KEY_FIELD,
  MODEL_FIELD,
  NO_MODEL,
  assertModelIdentity,
  buildKey,
  buildKeyDefinition,
  buildKeyForRow,
  duplicateBuildKeys,
  isModelIdentity,
  isProviderModelIdentity,
} from '../src/eval/build-key.mjs';

// mwg-train-gzi. The build key is use case x framework x model, and the model half is the one no record
// carried. The three things these tests protect:
//   1. a build with no model identity is REFUSED rather than recorded as an absence,
//   2. two builds that differ only by model are two keys, not one,
//   3. the records actually carry it, and the gate can fail when they stop.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const row = (projectId, model) => ({ project_id: projectId, model, build_key: buildKey({ projectId, model }) });

test('a model identity is the provider/id form the lane rotation uses', () => {
  for (const id of ['deepseek/deepseek-flash', 'antigravity/gemini-3.8-flash', 'qwen-token-plan-individual/qwen3.8-max']) {
    assert.equal(isProviderModelIdentity(id), true, `${id} must be a model identity`);
  }
  // A display name, a bare model name, a version, and half an id are all not identities: none of them can
  // be resolved back to a provider, which is the whole reason the record stores the rotation's form.
  for (const notAnId of ['deepseek', 'DeepSeek/deepseek-flash', 'deepseek/', '/flash', 'gemini-3.8-flash', '', null, 42, {}]) {
    assert.equal(isProviderModelIdentity(notAnId), false, `${JSON.stringify(notAnId)} must not be a model identity`);
  }
});

test('the no-model sentinel is not a model identity, so an absence cannot be read as a model', () => {
  assert.equal(isModelIdentity(NO_MODEL), true, 'the sentinel is an accepted model identity');
  assert.equal(
    isProviderModelIdentity(NO_MODEL),
    false,
    'the sentinel must not parse as provider/id, or "no model was in the loop" becomes a claim about a model that does not exist',
  );
});

test('a missing, blank or display-name model is refused, and the message says what to record instead', () => {
  for (const absent of [undefined, null, '', '   ', 'deepseek-flash']) {
    assert.throws(
      () => assertModelIdentity(absent, { context: 'booking-react' }),
      /booking-react/,
      `${JSON.stringify(absent)} must be refused`,
    );
  }
  assert.throws(() => assertModelIdentity(undefined), new RegExp(NO_MODEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(assertModelIdentity('deepseek/deepseek-flash'), 'deepseek/deepseek-flash');
  assert.equal(assertModelIdentity(NO_MODEL), NO_MODEL);
});

test('two builds differing only by model are two keys, and one model is one key', () => {
  const a = buildKey({ projectId: 'booking-react', model: 'deepseek/deepseek-flash' });
  const b = buildKey({ projectId: 'booking-react', model: 'antigravity/gemini-3.8-flash' });
  const c = buildKey({ projectId: 'booking-react', model: 'deepseek/deepseek-flash' });
  assert.notEqual(a, b, 'the same use case and framework built by two models must not share a key');
  assert.equal(a, c, 'the same build must derive the same key');
  assert.equal(a, 'booking-react@deepseek/deepseek-flash');
});

test('a key refuses a project id that is not a token, and a model that is not an identity', () => {
  assert.throws(() => buildKey({ projectId: 'Booking React', model: 'deepseek/deepseek-flash' }), /project id/);
  assert.throws(() => buildKey({ projectId: 'booking-react', model: 'deepseek' }), /not a model identity/);
  assert.throws(() => buildKeyForRow({ project_id: 'booking-react' }), /no model recorded/);
});

test('the collision the third key exists to prevent is reported, and a model difference is not one', () => {
  const differing = [row('booking-react', 'deepseek/deepseek-flash'), row('booking-react', 'antigravity/gemini-3.8-flash')];
  assert.deepEqual(duplicateBuildKeys(differing), [], 'two models on one build are two keys, not a collision');

  const same = [row('booking-react', 'deepseek/deepseek-flash'), row('booking-react', 'deepseek/deepseek-flash')];
  const collisions = duplicateBuildKeys(same);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].key, 'booking-react@deepseek/deepseek-flash');
});

test('both committed records carry the model and a key that re-derives from their own fields', () => {
  for (const recordPath of ['pilot/CORPUS.json', 'pilot/TRAINING_CORPUS.json']) {
    const record = JSON.parse(readFileSync(join(ROOT, recordPath), 'utf8'));
    assert.deepEqual(record.build_key_definition, buildKeyDefinition(recordPath), `${recordPath} must declare the convention this module implements`);
    assert.ok(record.projects.length > 0, `${recordPath} must have rows`);
    for (const project of record.projects) {
      assert.equal(
        project[MODEL_FIELD],
        NO_MODEL,
        `${recordPath} ${project.project_id} is a deterministic build, so it must record the explicit sentinel`,
      );
      assert.equal(
        project[KEY_FIELD],
        buildKey({ projectId: project.project_id, model: project[MODEL_FIELD] }),
        `${recordPath} ${project.project_id} records a key that disagrees with its own fields`,
      );
    }
    assert.deepEqual(duplicateBuildKeys(record.projects), [], `${recordPath} must not carry one key twice`);
  }
});

test('the training record is why the key is project_id-based: the archetype alone collides', () => {
  const record = JSON.parse(readFileSync(join(ROOT, 'pilot/TRAINING_CORPUS.json'), 'utf8'));
  const byArchetypeFramework = new Map();
  for (const project of record.projects) {
    const pair = `${project.archetype}/${project.framework}`;
    byArchetypeFramework.set(pair, (byArchetypeFramework.get(pair) ?? 0) + 1);
  }
  const colliding = [...byArchetypeFramework.entries()].filter(([, count]) => count > 1);
  assert.ok(
    colliding.length > 0,
    'if archetype+framework ever becomes unique here, this test is no longer proving anything and the key can be revisited',
  );
  assert.equal(
    new Set(record.projects.map((project) => project[KEY_FIELD])).size,
    record.projects.length,
    'every training build must still have its own key',
  );
});

test('the gate passes on the committed records and FAILS when a record loses or drifts its model', () => {
  const run = (args) => execFileSync(process.execPath, [join(ROOT, 'scripts/check-build-key.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  const pass = run([]);
  assert.match(pass, /check-build-key: PASS/);
  assert.match(pass, /308 build\(s\)/);

  const dir = mkdtempSync(join(tmpdir(), 'build-key-gate-'));
  try {
    const tampered = join(dir, 'CORPUS.json');
    const record = JSON.parse(readFileSync(join(ROOT, 'pilot/CORPUS.json'), 'utf8'));
    delete record.projects[0][MODEL_FIELD];
    record.projects[1][KEY_FIELD] = 'account-recovery-preact@deepseek/deepseek-flash';
    writeFileSync(tampered, `${JSON.stringify(record, null, 2)}\n`);

    let failed = null;
    try {
      run(['--record', 'CORPUS.json', '--root', dir]);
    } catch (error) {
      failed = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    assert.ok(failed !== null, 'the gate must exit non-zero on a record that lost a model');
    assert.match(failed, /FINDING BUILD_KEY/, 'the failure must be a finding, not a stack trace');
    assert.match(failed, /account-recovery-hono: no model recorded/);
    assert.match(failed, /account-recovery-preact: the recorded build_key is/);

    // The same record with no model field at all: still a finding, still not a crash.
    const stripped = JSON.parse(readFileSync(join(ROOT, 'pilot/CORPUS.json'), 'utf8'));
    delete stripped.build_key_definition;
    copyFileSync(join(ROOT, 'pilot/CORPUS.json'), join(dir, 'stripped.json'));
    writeFileSync(join(dir, 'stripped.json'), `${JSON.stringify(stripped, null, 2)}\n`);
    let missing = null;
    try {
      run(['--record', 'stripped.json', '--root', dir]);
    } catch (error) {
      missing = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    assert.match(String(missing), /carries no build_key_definition/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
