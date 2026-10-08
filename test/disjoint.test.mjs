/**
 * The disjointness gate is what keeps the evaluation honest: if a training family ever leaks into
 * the sealed held-out set (or the other way round), the preregistered comparison measures memory,
 * not generalisation. These tests pin the fail-closed contract: unreadable input is a finding,
 * never a pass and never a throw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBriefs, sealHash } from '../src/eval/prereg.mjs';
import { EVAL_MANIFEST, EVAL_SEAL, EVAL_TARGETS_MANIFEST, EVAL_TARGETS_SEAL, assertDisjointTrainingCorpus } from '../src/train/disjoint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRAIN_MANIFEST = resolve(ROOT, 'docs/train/briefs/manifest.jsonl');
const COMMITTED_TARGETS = resolve(ROOT, EVAL_TARGETS_MANIFEST);

const TARGET_HASH = 'aa'.repeat(32);

// The booking target's real image_sha256 from the committed targets manifest. The reviewer's bypass
// used exactly this: a training row carrying the REAL hash, plus a substituted manifest naming a fake
// hash for booking, so the collision vanished. The pin (EVAL_TARGETS_SEAL) is what defeats it.
const BOOKING_TARGET_HASH = '00b96c509d7c555cafd07073e5761a189a5702d5ea7b1846a03654f3846e47e5';

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
  // The pin applies to whatever targets manifest is supplied, so a clean synthetic corpus must be
  // checked against the committed (pinned) targets manifest to pass.
  const result = run(fixture, { targetsManifestPath: COMMITTED_TARGETS });
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
  assert.equal(result.findings.filter((f) => f.code === 'TARGET_FAMILY_IN_TRAINING' || f.code === 'TARGET_HASH_MIRRORED').length, 2, 'exactly one finding per side, no duplicates');
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
  assert.equal(EVAL_TARGETS_SEAL, 'sha256:4ba07d58873525d57a043cb6b9d76664fc9d8c2952d16aea819b28cfa290d7c4');
  // And the committed eval manifest must actually seal to that value, else every default fails.
  const evalRows = parseBriefs(readFileSync(resolve(ROOT, EVAL_MANIFEST), 'utf8'));
  assert.equal(sealHash(evalRows), EVAL_SEAL);
  // The targets seal is over the FILE BYTES, not the parsed rows, so a substituted manifest cannot match it.
  const targetsBytes = readFileSync(COMMITTED_TARGETS);
  assert.equal(`sha256:${createHash('sha256').update(targetsBytes).digest('hex')}`, EVAL_TARGETS_SEAL);
});

test('the reviewer bypass fails: a substituted targets manifest cannot conceal a real target hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'disjoint-bypass-'));
  try {
    // A training row carrying the REAL booking target hash. Against the committed manifest this is a
    // TARGET_HASH_MIRRORED collision.
    const trainPath = join(dir, 'train.jsonl');
    writeFileSync(trainPath, toJsonl([{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train', image_sha256: BOOKING_TARGET_HASH }]));
    // A substituted targets manifest whose booking row carries a FAKE 64-hex hash, so the real hash
    // no longer appears in targetByHash. This used to return ok:true.
    const fakeTargetsPath = join(dir, 'targets.jsonl');
    writeFileSync(fakeTargetsPath, toJsonl([{ id: 'target-booking', arm: 'A6_evaluation', kind: 'asset', family_id: 'booking', excluded_from_training: true, image_sha256: 'f'.repeat(64) }]));

    const result = assertDisjointTrainingCorpus({ trainManifestPath: trainPath, targetsManifestPath: fakeTargetsPath });
    assert.equal(result.ok, false, 'the substituted manifest must fail the gate');
    assert.ok(result.findings.some((f) => f.code === 'TARGETS_MANIFEST_UNPINNED'), `expected TARGETS_MANIFEST_UNPINNED, got ${result.findings.map((f) => f.code).join(', ')}`);

    // The same row against the committed manifest IS a collision, so the pin is what stops the bypass,
    // not a coincidental absence of collision.
    const committedResult = assertDisjointTrainingCorpus({ trainManifestPath: trainPath, targetsManifestPath: COMMITTED_TARGETS });
    assert.ok(committedResult.findings.some((f) => f.code === 'TARGET_HASH_MIRRORED'), 'the committed manifest reports the real-hash collision');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a substituted or edited targets manifest is refused as UNPINNED even when the corpus is clean', () => {
  const dir = mkdtempSync(join(tmpdir(), 'disjoint-unpin-'));
  try {
    const trainPath = join(dir, 'train.jsonl');
    writeFileSync(trainPath, toJsonl([{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train' }]));

    // A structurally-clean but substituted manifest (a different booking hash, no collision with the
    // clean corpus) would have read as ok:true before the pin.
    const substituted = join(dir, 'targets-substituted.jsonl');
    writeFileSync(substituted, toJsonl([{ id: 'target-booking', arm: 'A6_evaluation', kind: 'asset', family_id: 'booking', excluded_from_training: true, image_sha256: 'e'.repeat(64) }]));
    // An edited copy of the committed manifest: same rows, one extra byte, so the FILE seal changes.
    const edited = join(dir, 'targets-edited.jsonl');
    writeFileSync(edited, Buffer.concat([readFileSync(COMMITTED_TARGETS), Buffer.from('\n')]));

    for (const [label, targetsManifestPath] of [
      ['substituted', substituted],
      ['edited', edited],
      ['unreadable', join(dir, 'no-such-targets.jsonl')],
    ]) {
      const result = assertDisjointTrainingCorpus({ trainManifestPath: trainPath, targetsManifestPath });
      assert.equal(result.ok, false, `${label} targets must fail the gate`);
      assert.ok(result.findings.some((f) => f.code === 'TARGETS_MANIFEST_UNPINNED'), `${label} targets should report TARGETS_MANIFEST_UNPINNED`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed targets manifest still passes (pinned)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'disjoint-pinned-'));
  try {
    const trainPath = join(dir, 'train.jsonl');
    writeFileSync(trainPath, toJsonl([{ brief_id: 'corpus-1', family_id: 'corpus-1', split: 'train' }]));
    const result = assertDisjointTrainingCorpus({ trainManifestPath: trainPath, targetsManifestPath: COMMITTED_TARGETS });
    assert.equal(result.ok, true, result.findings.map((f) => `${f.code}: ${f.message}`).join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a training row that is null, a number, a string or an array is refused, not silently dropped', () => {
  for (const bad of ['null', '42', '"hello"', '[1,2,3]']) {
    const fixture = makeFixture({ trainText: `${JSON.stringify({ brief_id: 'x', family_id: 'tr-x', split: 'train' })}\n${bad}\n` });
    const result = run(fixture);
    assert.equal(result.ok, false, `line ${bad} must fail the corpus`);
    assert.equal(result.trainRows, 1, `line ${bad} must not count as a row`);
    assert.ok(result.findings.some((f) => f.code === 'TRAINING_ROW_NOT_OBJECT'), `line ${bad} should report TRAINING_ROW_NOT_OBJECT`);
  }
});

test('a truncated or invalid JSON training line is refused as TRAINING_ROW_UNPARSEABLE', () => {
  for (const bad of ['{"brief_id":', 'not json at all', '{"a":1} trailing']) {
    const fixture = makeFixture({ trainText: `${JSON.stringify({ brief_id: 'x', family_id: 'tr-x', split: 'train' })}\n${bad}\n` });
    const result = run(fixture);
    assert.equal(result.ok, false, `line ${JSON.stringify(bad)} must fail the corpus`);
    assert.equal(result.trainRows, 1);
    assert.ok(result.findings.some((f) => f.code === 'TRAINING_ROW_UNPARSEABLE'), `line ${JSON.stringify(bad)} should report TRAINING_ROW_UNPARSEABLE`);
  }
});
