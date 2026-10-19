import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareDefaultStep4, RATIFIED_STEP4_ROW_SHA256, step4RatificationRow } from '../src/eval/default-step4-preflight.mjs';
import { buildPublicStep4Report, publicJourneyPart } from '../src/eval/default-step4-report.mjs';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const tranche = JSON.parse(readFileSync(path('../docs/eval/default-set-hono-tranche-2026-10-19.json'), 'utf8'));
const briefs = readFileSync(path('../docs/train/briefs/manifest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const ratificationRow = step4RatificationRow(readFileSync(path('../docs/eval/PREREGISTRATION.md'), 'utf8'));
const prepared = prepareDefaultStep4({ tranche, briefs, ratificationRow });
const privateMarker = 'SECRET_FIXTURE_PASSWORD_PRIVATE';
function fixture() {
  const scoreReceipts = {}, smokeReceipts = {}, scoreHashes = {}, smokeHashes = {}, visualVerdicts = {}, visualHashes = {};
  for (const family of prepared.families.filter((row) => row.eligibility === 'ELIGIBLE')) {
    const publicRow = tranche.run_records.find((row) => row.family === family.family);
    scoreReceipts[family.family] = { family: family.family, request_id: family.request_id,
      archive_manifest_sha256: publicRow.manifest_sha256, ratification_row_sha256: RATIFIED_STEP4_ROW_SHA256,
      brief_sha256: family.brief_sha256, journey_sha256: family.journey_sha256, sandbox: 'bubblewrap', excluded_from_training: true,
      required_rules: family.required_rules.map((row) => ({ name: row.rule_id, status: 'NOT_CHECKABLE', detail: privateMarker })),
      applicable_diagnostics: family.applicable_diagnostics.map((row) => ({ name: row.rule_id, status: 'NOT_CHECKABLE', detail: privateMarker })),
      journey_parts: [{ name: 'server-persistence', status: 'PASS', detail: { submitStatus: 200, reloadObserved: true,
        expectedVisible: true, serverRecordPresent: true, apiStatus: 200, pageText: privateMarker, file: '/home/exedev/.fleet/private' } }],
      headroom: { passed: 1, failed: 0, not_checkable: family.required_rules.length,
        coverage_incomplete: true, rate: 1, ceiling: true } };
    smokeReceipts[family.family] = { family: family.family, request_id: family.request_id,
      archive_manifest_sha256: publicRow.manifest_sha256, ratification_row_sha256: RATIFIED_STEP4_ROW_SHA256,
      brief_sha256: family.brief_sha256, journey_sha256: family.journey_sha256, sandbox: 'bubblewrap', excluded_from_training: true,
      visual_target_sha256: 'a'.repeat(64), screenshots: [
        { viewport: { width: 1376, height: 768 }, documentStatus: 200, documentUrl: 'http://127.0.0.1:3001/', sha256: 'b'.repeat(64), file: '/home/exedev/.fleet/private.png' },
        { viewport: { width: 390, height: 844 }, documentStatus: 200, documentUrl: 'http://127.0.0.1:3001/', sha256: 'c'.repeat(64), file: '/home/exedev/.fleet/private-mobile.png' },
      ] };
    scoreHashes[family.family] = 'e'.repeat(64);
    smokeHashes[family.family] = 'f'.repeat(64);
    visualVerdicts[family.family] = 'PARTIALLY_SIMILAR';
    visualHashes[family.family] = 'd'.repeat(64);
  }
  return { scoreReceipts, smokeReceipts, scoreHashes, smokeHashes, visualVerdicts, visualHashes };
}

test('public report keeps all thirty identities, quarantines failures and never copies raw fixture or private paths', () => {
  const report = buildPublicStep4Report({ tranche, prepared, ...fixture() });
  assert.equal(report.counts.identities, 30);
  assert.equal(report.counts.success, 22);
  assert.equal(report.counts.model_length, 5);
  assert.equal(report.counts.transport_unevaluable, 3);
  assert.equal(report.counts.required_rule_pairs, 44);
  assert.equal(report.counts.required_not_checkable, 44);
  assert.equal(report.counts.applicable_diagnostic_pairs, 105);
  assert.equal(report.counts.ceiling_families, 22);
  assert.equal(report.families.find((row) => row.family === 'tr-03').generation, 'TRANSPORT_UNEVALUABLE');
  const text = JSON.stringify(report);
  assert.equal(text.includes(privateMarker), false);
  assert.equal(text.includes('/home/exedev/.fleet'), false);
  assert.equal(text.includes('pageText'), false);
  assert.equal(report.families.find((row) => row.family === 'tr-05').visual.numeric_score, null);
});

test('published Step 4 report stays sanitized and agrees with its readable summary', () => {
  const reportText = readFileSync(path('../docs/eval/default-set-step4-hono-2026-10-19.json'), 'utf8');
  const summary = readFileSync(path('../docs/eval/default-set-step4-2026-10-19.md'), 'utf8');
  const report = JSON.parse(reportText);
  assert.equal(report.counts.identities, 30);
  assert.equal(report.counts.success, 22);
  assert.equal(report.counts.ceiling_families, 19);
  assert.equal(report.counts.required_not_checkable, 44);
  assert.equal(report.counts.journey_pass + report.counts.journey_fail + report.counts.journey_not_checkable, 109);
  assert.equal(report.families.filter((row) => row.visual?.verdict === 'DISSIMILAR').length, 4);
  assert.equal(report.families.filter((row) => row.generation === 'SUCCESS').every((row) =>
    /^[a-f0-9]{64}$/.test(row.functional_receipt_sha256) && /^[a-f0-9]{64}$/.test(row.screenshot_receipt_sha256)), true);
  assert.equal(reportText.includes('/home/exedev/'), false);
  assert.equal(summary.includes('19 of 22 runnable families'), true);
  assert.equal(summary.includes('mwg-train deterministic baseline'), true);
});

test('public report refuses mismatched run, ratification and headroom rather than publishing invented rates', () => {
  const inputs = fixture();
  inputs.scoreReceipts['tr-05'].request_id = 'x'.repeat(64);
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...inputs }), /REPORT_IDENTITY_MISMATCH/);
  inputs.scoreReceipts['tr-05'].request_id = prepared.families.find((row) => row.family === 'tr-05').request_id;
  inputs.scoreReceipts['tr-05'].headroom.passed = 0;
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...inputs }), /REPORT_HEADROOM_MISMATCH/);
  assert.throws(() => publicJourneyPart({ name: 'other', status: 'PASS', detail: privateMarker }), /REPORT_INVALID_PART/);
});
