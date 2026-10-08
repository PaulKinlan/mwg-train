/**
 * The disjointness gate is what keeps the evaluation honest: if a training family ever leaks into
 * the sealed held-out set (or the other way round), the preregistered comparison measures memory,
 * not generalisation. These tests pin the fail-closed contract: unreadable input is a finding,
 * never a pass and never a throw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBriefs, sealHash } from '../src/eval/prereg.mjs';
import { EVAL_MANIFEST, EVAL_SEAL, EVAL_TARGETS_MANIFEST, assertDisjointTrainingCorpus } from '../src/train/disjoint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRAIN_MANIFEST = resolve(ROOT, 'docs/train/briefs/manifest.jsonl');

const TARGET_HASH = 'aa'.repeat(32);

const EVAL_ROWS = [
  { brief_id: 'eval-01', family_id: 'held-out-a', split: 'test' },
  { brief_id: 'eval-02', family_id: 'held-out-b', split: 'dev' },
];

const TARGET_ROWS = [
  { id: 'target-booking', arm: 'A6_evaluation', kind: 'asset', family_id: 'booking', excluded_from_training: true, approved_for_training: false, image_sha256: TARGET_HASH },
];

const toJsonl = (rows) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

/** A fixture directory with a sealed eval manifest, eval targets, and room for a training manifest. */
function makeFixture({ evalRows = EVAL_ROWS, targetRows = TARGET_ROWS, trainRows = null, trainText = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'disjoint-'));
  const evalPath = join(dir, 'eval.jsonl');
  const targetsPath = join(dir, 'targets.jsonl');
  writeFileSync(evalPath, toJsonl(evalRows));
  writeFileSync(targetsPath, toJsonl(targetRows));
  const trainPath = join(dir, 'train.jsonl');
  if (trainText !== null) writeFileSync(trainPath, trainText);
  else if (trainRows !== null) writeFileSync(trainPath, toJsonl(trainRows));
  const seal = sealHash(parseBriefs(toJsonl(evalRows)));
  return { dir, evalPath, targetsPath, trainPath, seal };
}

const run = (fixture, overrides = {}) =>
  assertDisjointTrainingCorpus({
    trainManifestPath: fixture.trainPath,
    evalManifestPath: fixture.evalPath,
    targetsManifestPath: fixture.targetsPath,
    expectedSeal: fixture.seal,
    ...overrides,
  });

test('a disjoint synthetic pair passes and reports the recomputed seal', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train' }] });
  const result = run(fixture);
  assert.equal(result.ok, true, result.findings.map((f) => `${f.code}: ${f.message}`).join('\n'));
  assert.deepEqual(result.findings, []);
  assert.equal(result.evalSeal, fixture.seal);
  assert.equal(result.trainRows, 1);
});

test('the committed training manifest is disjoint from the sealed eval manifest', (t) => {
  if (!existsSync(TRAIN_MANIFEST)) {
    t.skip('docs/train/briefs/manifest.jsonl does not exist yet; the committed-pair check runs once the corpus lands');
    return;
  }
  const result = assertDisjointTrainingCorpus({ trainManifestPath: TRAIN_MANIFEST });
  assert.equal(result.ok, true, result.findings.map((f) => `${f.code}: ${f.message}`).join('\n'));
  assert.equal(result.evalSeal, EVAL_SEAL);
});

test('a family shared between the manifests fails with FAMILY_IN_BOTH_MANIFESTS naming the family', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'held-out-a', split: 'train' }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'FAMILY_IN_BOTH_MANIFESTS');
  assert.ok(finding, `expected FAMILY_IN_BOTH_MANIFESTS, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes("'held-out-a'"), `the message must name the shared family: ${finding.message}`);
  assert.equal(finding.family_id, 'held-out-a');
});

test('the eval manifest checked against itself shares every family (the negative control)', () => {
  const result = assertDisjointTrainingCorpus({ trainManifestPath: resolve(ROOT, EVAL_MANIFEST) });
  assert.equal(result.ok, false);
  const shared = result.findings.filter((f) => f.code === 'FAMILY_IN_BOTH_MANIFESTS');
  assert.ok(shared.length > 0, 'the eval manifest must collide with itself');
});

test('a wrong expected seal fails with SEAL_MISMATCH naming both hashes', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train' }] });
  const result = run(fixture, { expectedSeal: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' });
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'SEAL_MISMATCH');
  assert.ok(finding, `expected SEAL_MISMATCH, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes(fixture.seal), 'the message must name the recomputed seal');
  assert.ok(finding.message.includes('sha256:0000'), 'the message must name the expected seal');
});

test('a missing training manifest fails closed and does not throw', () => {
  const fixture = makeFixture();
  const result = run(fixture, { trainManifestPath: join(fixture.dir, 'does-not-exist.jsonl') });
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'TRAINING_MANIFEST_EMPTY_OR_UNREADABLE');
  assert.ok(finding, `expected TRAINING_MANIFEST_EMPTY_OR_UNREADABLE, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes('does-not-exist.jsonl'));
});

test('a missing eval manifest fails closed and does not throw', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train' }] });
  const result = run(fixture, { evalManifestPath: join(fixture.dir, 'does-not-exist.jsonl') });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'EVAL_MANIFEST_EMPTY_OR_UNREADABLE'));
  assert.equal(result.evalSeal, null);
});

test('a malformed training manifest fails closed and does not throw', () => {
  const fixture = makeFixture({ trainText: '{"brief_id":"x"\nnot json at all\n' });
  const result = run(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'TRAINING_MANIFEST_EMPTY_OR_UNREADABLE'));
});

test('an empty training manifest fails closed', () => {
  const fixture = makeFixture({ trainRows: [] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'TRAINING_MANIFEST_EMPTY_OR_UNREADABLE'));
});

test('a training row whose split is not train is refused', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'dev' }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'TRAINING_ROW_NOT_TRAIN_SPLIT');
  assert.ok(finding, `expected TRAINING_ROW_NOT_TRAIN_SPLIT, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes("'corpus-1'"));
});

test('a training row with no family_id is refused', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', split: 'train' }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'TRAINING_ROW_MISSING_FAMILY'));
});

test('a training row declaring an eval target design hash fails with TARGET_HASH_SHARED', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train', target_sha256: TARGET_HASH }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'TARGET_HASH_SHARED');
  assert.ok(finding, `expected TARGET_HASH_SHARED, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes(TARGET_HASH), 'the message must name the shared hash');
});

test('an eval target with excluded_from_training:false fails with EVAL_TARGET_NOT_EXCLUDED', () => {
  const fixture = makeFixture({
    trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train' }],
    targetRows: [{ id: 'target-leaky', arm: 'A6_evaluation', kind: 'asset', excluded_from_training: false, image_sha256: TARGET_HASH }],
  });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'EVAL_TARGET_NOT_EXCLUDED');
  assert.ok(finding, `expected EVAL_TARGET_NOT_EXCLUDED, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes("'target-leaky'"), 'the message must name the target');
});

test('a training row in an eval target family fails with TARGET_FAMILY_IN_TRAINING naming the family and target', () => {
  // 'booking' is not a held-out brief family, so familyOverlap stays silent; the collision is
  // with the A6 target design authored FOR the 'booking' family.
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'booking', split: 'train' }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'TARGET_FAMILY_IN_TRAINING');
  assert.ok(finding, `expected TARGET_FAMILY_IN_TRAINING, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes("'booking'"), 'the message must name the family');
  assert.ok(finding.message.includes("'target-booking'"), 'the message must name the target it collides with');
  assert.ok(finding.message.includes(TARGET_HASH), 'the message must name the target hash');
  assert.equal(finding.family_id, 'booking');
  assert.equal(finding.target_id, 'target-booking');
  assert.ok(!result.findings.some((f) => f.code === 'TARGET_HASH_SHARED' || f.code === 'TARGET_HASH_MIRRORED'), 'no hash side fired, so none should be reported');
});

test('a training row carrying a target image_sha256 in its own image_sha256 field fails with TARGET_HASH_MIRRORED', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train', image_sha256: TARGET_HASH }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const finding = result.findings.find((f) => f.code === 'TARGET_HASH_MIRRORED');
  assert.ok(finding, `expected TARGET_HASH_MIRRORED, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.ok(finding.message.includes(TARGET_HASH), 'the message must name the shared hash');
  assert.ok(finding.message.includes("'target-booking'"), 'the message must name the target');
  assert.ok(!result.findings.some((f) => f.code === 'TARGET_HASH_SHARED'), 'one hash collision must produce exactly one finding');
});

test('a row colliding on both sides gets one finding per side, each naming the other view', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'booking', split: 'train', image_sha256: TARGET_HASH }] });
  const result = run(fixture);
  assert.equal(result.ok, false);
  const family = result.findings.find((f) => f.code === 'TARGET_FAMILY_IN_TRAINING');
  const hash = result.findings.find((f) => f.code === 'TARGET_HASH_MIRRORED');
  assert.ok(family && hash, `expected both sides, got ${result.findings.map((f) => f.code).join(', ')}`);
  assert.equal(result.findings.length, 2, 'exactly one finding per side, no duplicates');
  assert.ok(family.message.includes('the same collision is also seen from the hash side'));
  assert.ok(hash.message.includes('the same collision is also seen from the family side'));
});

test('TARGET_FAMILY_IN_TRAINING still fires when the targets manifest is unreadable (fail closed)', () => {
  const fixture = makeFixture({ trainRows: [{ brief_id: 'corpus-1', family_id: 'catalogue', split: 'train' }] });
  const result = run(fixture, { targetsManifestPath: join(fixture.dir, 'no-targets.jsonl') });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'EVAL_TARGETS_MANIFEST_EMPTY_OR_UNREADABLE'));
  const finding = result.findings.find((f) => f.code === 'TARGET_FAMILY_IN_TRAINING');
  assert.ok(finding, 'the family check must not depend on the targets manifest being readable');
  assert.ok(finding.message.includes("'catalogue'"));
});

test('the real sealed eval manifest and targets manifest satisfy the exported constants', () => {
  // The defaults the CLI ships with must be the preregistered ones, not placeholders.
  assert.equal(EVAL_MANIFEST, 'docs/eval/briefs/manifest.jsonl');
  assert.equal(EVAL_TARGETS_MANIFEST, 'data/A6_evaluation/targets/manifest.jsonl');
  assert.equal(EVAL_SEAL, 'sha256:89a1f47d638c5eab733074d87bc19d6615401aeb9a77ecbd86cf10b443e272b1');
  // And the committed eval manifest must actually seal to that value, else every default fails.
  const evalRows = parseBriefs(readFileSync(resolve(ROOT, EVAL_MANIFEST), 'utf8'));
  assert.equal(sealHash(evalRows), EVAL_SEAL);
});
