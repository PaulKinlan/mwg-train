/**
 * Doc-integrity checks: the records under docs/provenance/ have to stay true as the repository
 * changes. These tests fail when a documented example manifest stops validating, when a rights
 * record referenced from a manifest row disappears, or when the arms table in the README drifts
 * from the arms the code actually enforces.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARMS, ARM_IDS } from '../src/provenance/arms.mjs';
import { parseManifest, validateManifest } from '../src/provenance/record.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVENANCE = resolve(ROOT, 'docs/provenance');

test('the example manifest validates and is a mix of trainable and quarantined rows', () => {
  const path = resolve(PROVENANCE, 'manifest.example.jsonl');
  const { ok, findings, counts } = validateManifest(parseManifest(readFileSync(path, 'utf8')));
  assert.equal(ok, true, `example manifest should validate:\n${findings.map((f) => `${f.code} ${f.id}`).join('\n')}`);
  assert.ok(counts.trainable > 0, 'the example should show at least one trainable row');
  assert.ok(counts.quarantined > 0, 'the example should show at least one quarantined row');
});

test('the validate-provenance CLI passes the example manifest', () => {
  const output = execFileSync(
    process.execPath,
    [resolve(ROOT, 'scripts/validate-provenance.mjs'), resolve(PROVENANCE, 'manifest.example.jsonl')],
    { encoding: 'utf8' },
  );
  assert.match(output, /PASS/);
});

test('every rights/terms reference in the example manifest points at a file that exists', () => {
  const rows = parseManifest(readFileSync(resolve(PROVENANCE, 'manifest.example.jsonl'), 'utf8'));
  for (const row of rows) {
    const refs = [row.rights_ref, row.generator?.account_ref, row.generator?.terms_ref].filter(Boolean);
    assert.ok(refs.length > 0, `${row.id} has no rights reference`);
    for (const ref of refs) {
      assert.equal(existsSync(resolve(ROOT, ref)), true, `${row.id} references missing file ${ref}`);
    }
  }
});

test('each quarantined arm has a record page that says so', () => {
  const recordDir = resolve(PROVENANCE);
  const pages = [
    ['assets/mwg-modern-web-guidance.md', 'CC-BY-4.0'],
    ['assets/student-base-models.md', 'Apache-2.0'],
    ['assets/reproduction-studies.md', 'QUARANTINED'],
    ['accounts/anthropic-claude-max.md', 'PROHIBITED'],
    ['accounts/google-antigravity-consumer.md', 'PROHIBITED'],
    ['accounts/openai-codex.md', 'PROHIBITED'],
    ['accounts/zai-api.md', 'PROHIBITED'],
    ['accounts/deepseek-api.md', 'PERMITTED'],
  ];
  for (const [relative, expected] of pages) {
    const path = resolve(recordDir, relative);
    assert.equal(existsSync(path), true, `missing provenance record ${relative}`);
    assert.match(readFileSync(path, 'utf8'), new RegExp(expected), `${relative} should mention ${expected}`);
  }
});

test('the README arms table lists every arm the code enforces', () => {
  const readme = readFileSync(resolve(PROVENANCE, 'README.md'), 'utf8');
  for (const id of ARM_IDS) {
    assert.ok(readme.includes(id), `README does not mention arm ${id}`);
  }
  const quarantined = ARM_IDS.filter((id) => ARMS[id].quarantined);
  assert.equal(quarantined.length, 4, 'four arms are quarantined');
  for (const id of quarantined) {
    assert.ok(ARMS[id].description.length > 0, `${id} needs a description`);
  }
  assert.match(readme, /Clean-room reproduction study.*public output, prohibited from training/);
  assert.match(readFileSync(resolve(ROOT, 'docs/quarantine.md'), 'utf8'), /Only A3 and A5 route here/);
});
