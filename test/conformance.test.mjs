/**
 * The visual conformance axis and the target images it scores against.
 *
 * Two things could quietly make this axis meaningless: a metric that returns 1 for everything (so
 * every arm "conforms"), or a target whose pinned hash no longer matches the bytes on disk (so the
 * score is taken against a picture nobody reviewed). Both are asserted here, on synthetic signatures
 * for the metric and on the committed manifest for the targets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { controlSimilarity, conformanceScore, geometrySimilarity, scoreArm, structuralSimilarity, WEIGHTS } from '../src/eval/conformance.mjs';
import { validateManifest } from '../src/provenance/record.mjs';
import { parseManifest } from '../src/provenance/record.mjs';
import { TARGETS_MANIFEST, TARGETS_STORAGE, TARGET_FAMILIES } from '../src/eval/targets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const signature = ({ tags = [], boxes = {}, controls = [] } = {}) => ({
  nodes: tags.map((tag, index) => ({ tag, depth: index === 0 ? 0 : 1 })),
  boxes: Object.fromEntries(Object.entries(boxes).map(([key, value]) => [key, { x: value[0], y: value[1], w: value[2], h: value[3] }])),
  controls,
});

test('an identical signature scores 1 on every axis', () => {
  const page = signature({ tags: ['header', 'main', 'form', 'input', 'button'], boxes: { 'form:0': [0, 0, 1, 0.5] }, controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  const score = conformanceScore(page, structuredClone(page));
  assert.equal(score.structural, 1);
  assert.equal(score.geometry, 1);
  assert.equal(score.controls, 1);
  assert.equal(score.overall, 1);
});

test('structural similarity is order-sensitive, not just composition', () => {
  const a = signature({ tags: ['main', 'h1', 'form', 'input'] });
  const reordered = signature({ tags: ['main', 'form', 'h1', 'input'] });
  const same = structuralSimilarity(a, reordered);
  assert.ok(same < 1, `reordering the same elements must score below 1, got ${same}`);
  assert.ok(structuralSimilarity(a, a) > same);
});

test('geometry similarity falls when a box moves, and unmatched boxes count as zero', () => {
  const a = signature({ boxes: { 'main:0': [0, 0, 1, 1], 'form:0': [0.1, 0.2, 0.3, 0.4] } });
  const moved = signature({ boxes: { 'main:0': [0, 0, 1, 1], 'form:0': [0.6, 0.6, 0.3, 0.4] } });
  assert.ok(geometrySimilarity(a, moved) < 1);
  assert.equal(geometrySimilarity(a, signature({ boxes: { 'main:0': [0, 0, 1, 1] } })), 0.5);
});

test('controls similarity rewards the same controls and penalises a missing label', () => {
  const labelled = signature({ controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  assert.equal(controlSimilarity(labelled, labelled), 1);
  const unlabelled = signature({ controls: [{ tag: 'input', type: 'text', name: 'name', label: null }] });
  assert.ok(controlSimilarity(labelled, unlabelled) < 1);
  assert.equal(controlSimilarity(labelled, signature({ controls: [] })), 0);
});

test('scoreArm reports the raw baseline, the arm target and the delta', () => {
  const target = signature({ tags: ['main', 'h1', 'form', 'input', 'button'], boxes: { 'form:0': [0, 0, 1, 0.6] }, controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  const raw = signature({ tags: ['div', 'div'], boxes: { 'form:0': [0.5, 0.5, 0.1, 0.1] }, controls: [{ tag: 'input', type: 'text', name: 'name', label: null }] });
  const arm = structuredClone(target);
  const score = scoreArm({ target, raw, arm });
  assert.equal(score.target, 1);
  assert.ok(score.raw < 1);
  assert.equal(score.delta, Math.round((score.target - score.raw) * 10000) / 10000);
  assert.ok(score.delta > 0);
  assert.equal(WEIGHTS.structural + WEIGHTS.geometry + WEIGHTS.controls, 1);
});

test('a target with no controls scores control similarity as a pass by vacuity, so targets are checked separately', () => {
  // This is the reason the renderer refuses a page with no controls: the metric itself cannot tell an
  // empty target from a perfectly matched one.
  assert.equal(controlSimilarity(signature({}), signature({})), 1);
});

test('every target in the manifest is hash-pinned, rights-cleared and never trainable', () => {
  const manifestPath = join(ROOT, TARGETS_MANIFEST);
  assert.ok(existsSync(manifestPath), `${TARGETS_MANIFEST} is missing`);
  const rows = parseManifest(readFileSync(manifestPath, 'utf8'));
  assert.equal(rows.length, TARGET_FAMILIES.length);
  const { findings } = validateManifest(rows);
  assert.deepEqual(findings.filter((finding) => finding.severity === 'error'), [], 'the target manifest must pass provenance validation');

  for (const family of TARGET_FAMILIES) {
    const row = rows.find((candidate) => candidate.family_id === family.family_id);
    assert.ok(row, `${family.family_id} has no target`);
    assert.equal(row.arm, 'A6_evaluation');
    assert.equal(row.excluded_from_training, true);
    assert.equal(row.approved_for_training, false);
    assert.ok(row.license && row.origin && row.created_at && row.rights_ref, `${family.family_id} is missing provenance metadata`);
    assert.equal(row.contains_third_party_material, false);
    assert.equal(row.contains_owner_identifying_material, false);
    assert.ok(existsSync(join(ROOT, row.rights_ref)), `${family.family_id}: rights record is missing`);

    for (const [pathField, hashField, byteField] of [
      ['image_path', 'image_sha256', 'image_bytes'],
      ['signature_path', 'signature_sha256', null],
    ]) {
      const path = join(ROOT, row[pathField]);
      assert.ok(row[pathField].startsWith(`${TARGETS_STORAGE}/`), `${family.family_id}: ${pathField} must live in the evaluation arm`);
      assert.ok(existsSync(path), `${family.family_id}: ${row[pathField]} is missing`);
      const bytes = readFileSync(path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row[hashField], `${family.family_id}: ${pathField} sha256 does not match`);
      if (byteField) assert.equal(statSync(path).size, row[byteField], `${family.family_id}: image byte count does not match`);
    }

    const signatureData = JSON.parse(readFileSync(join(ROOT, row.signature_path), 'utf8'));
    assert.ok(signatureData.controls.length > 0, `${family.family_id}: the target renders with no controls`);
    assert.ok(signatureData.nodes.length > 0, `${family.family_id}: the target renders with no elements`);
  }
});
