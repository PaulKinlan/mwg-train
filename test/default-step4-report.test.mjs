import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareDefaultStep4, RATIFIED_STEP4_ROW_SHA256, step4RatificationRow } from '../src/eval/default-step4-preflight.mjs';
import { buildPublicStep4Report, publicJourneyPart, REQUIRED_SUPERSEDED } from '../src/eval/default-step4-report.mjs';
import { classifyDocument } from '../scripts/check-baseline-label.mjs';
import { BASELINE_FIELDS } from '../src/eval/ruleset.mjs';

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
  const historical = (family, statuses, change, sha256, pins) => {
    const receipt = structuredClone(scoreReceipts[family]);
    receipt.kind = 'step4-functional-pilot';
    receipt.project_id = tranche.run_records.find((row) => row.family === family).project_id;
    receipt.journey_parts = statuses.map(([name, status]) => ({ name, status, detail: privateMarker }));
    receipt.headroom = { passed: statuses.filter(([, status]) => status === 'PASS').length,
      failed: statuses.filter(([, status]) => status === 'FAIL').length,
      not_checkable: statuses.filter(([, status]) => status === 'NOT_CHECKABLE').length + receipt.required_rules.length };
    const denominator = receipt.headroom.passed + receipt.headroom.failed;
    receipt.headroom.rate = denominator ? receipt.headroom.passed / denominator : null;
    receipt.headroom.ceiling = denominator ? receipt.headroom.rate >= 0.9 : null;
    receipt.attempts = { 'secret-private-value': privateMarker, file: '/home/exedev/.fleet/receipt' };
    if (!pins) { delete receipt.brief_sha256; delete receipt.journey_sha256; }
    return { receipt, sha256, change };
  };
  const part = (name, status = 'PASS') => [name, status];
  scoreReceipts['tr-05'].journey_parts = [part('server-persistence'), part('multi-step-carry'),
    part('empty-form-validation'), part('search')].map(([name, status]) => ({ name, status, detail: {} }));
  scoreReceipts['tr-05'].headroom = { passed: 4, failed: 0, not_checkable: 2, coverage_incomplete: true, rate: 1, ceiling: true };
  scoreReceipts['tr-07'].journey_parts = [...scoreReceipts['tr-05'].journey_parts, { name: 'update-existing', status: 'PASS', detail: {} }];
  scoreReceipts['tr-07'].headroom = { passed: 5, failed: 0, not_checkable: 2, coverage_incomplete: true, rate: 1, ceiling: true };
  const supersededReceipts = {
    'tr-05': [
      historical('tr-05', [part('server-persistence'), part('multi-step-carry', 'FAIL'),
        part('empty-form-validation'), part('search', 'NOT_CHECKABLE')], 'measurement_revised', REQUIRED_SUPERSEDED['tr-05'][0], false),
      historical('tr-05', [part('server-persistence'), part('multi-step-carry'),
        part('empty-form-validation'), part('search')], 'identity_pins_added', REQUIRED_SUPERSEDED['tr-05'][1], false),
    ],
    'tr-07': [historical('tr-07', [part('server-persistence'), part('multi-step-carry'),
      part('empty-form-validation'), part('search', 'NOT_CHECKABLE'), part('update-existing')],
    'search_control_corrected', REQUIRED_SUPERSEDED['tr-07'][0], true)],
  };
  return { scoreReceipts, smokeReceipts, scoreHashes, smokeHashes, visualVerdicts, visualHashes, supersededReceipts };
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
  const tr05 = report.families.find((row) => row.family === 'tr-05');
  assert.equal(tr05.visual.numeric_score, null);
  assert.equal(tr05.instrument_revision, 'UNRECORDED_AT_RUN');
  assert.deepEqual(tr05.superseded_functional_receipts.map((row) => row.headroom.ceiling), [false, true]);
  assert.deepEqual(tr05.superseded_functional_receipts.map((row) => row.functional_receipt_sha256), REQUIRED_SUPERSEDED['tr-05']);
  assert.equal(tr05.superseded_functional_receipts[0].headroom.rate, 2 / 3);
  assert.equal(tr05.superseded_functional_receipts[0].identity_pins, 'ABSENT_AT_RUN');
  assert.equal(tr05.superseded_functional_receipts[0].instrument_revision, 'UNRECORDED_AT_RUN');
  assert.deepEqual(report.families.find((row) => row.family === 'tr-07').superseded_functional_receipts.map((row) => row.functional_receipt_sha256), REQUIRED_SUPERSEDED['tr-07']);
});

test('published Step 4 report stays sanitized and agrees with its readable summary', () => {
  const reportText = readFileSync(path('../docs/eval/default-set-step4-hono-2026-10-19.json'), 'utf8');
  const summary = readFileSync(path('../docs/eval/default-set-step4-2026-10-19.md'), 'utf8');
  const report = JSON.parse(reportText);
  for (const [key, value] of Object.entries(BASELINE_FIELDS)) assert.equal(report[key], value);
  assert.equal(report.counts.identities, 30);
  assert.equal(report.counts.success, 22);
  assert.equal(report.counts.ceiling_families, 19);
  assert.equal(report.counts.required_not_checkable, 44);
  assert.equal(report.counts.journey_pass + report.counts.journey_fail + report.counts.journey_not_checkable, 109);
  assert.equal(report.families.filter((row) => row.visual?.verdict === 'DISSIMILAR').length, 4);
  const tr05 = report.families.find((row) => row.family === 'tr-05');
  const tr07 = report.families.find((row) => row.family === 'tr-07');
  assert.deepEqual(tr05.superseded_functional_receipts.map((row) => row.functional_receipt_sha256), REQUIRED_SUPERSEDED['tr-05']);
  assert.deepEqual(tr05.superseded_functional_receipts[0].headroom, {
    passed: 2, failed: 1, not_checkable: 3, rate: 2 / 3, ceiling: false,
  });
  assert.deepEqual(tr05.superseded_functional_receipts[0].changed_parts, ['multi-step-carry', 'search']);
  assert.equal(tr05.superseded_functional_receipts[1].identity_pins, 'ABSENT_AT_RUN');
  assert.deepEqual(tr07.superseded_functional_receipts.map((row) => row.functional_receipt_sha256), REQUIRED_SUPERSEDED['tr-07']);
  assert.deepEqual(tr07.superseded_functional_receipts[0].changed_parts, ['search']);
  assert.equal(report.families.filter((row) => row.generation === 'SUCCESS').every((row) => row.instrument_revision === 'UNRECORDED_AT_RUN'), true);
  assert.match(summary, /Historical Step 4 receipts.*UNRECORDED_AT_RUN/);
  assert.equal(report.families.filter((row) => row.generation === 'SUCCESS').every((row) =>
    /^[a-f0-9]{64}$/.test(row.functional_receipt_sha256) && /^[a-f0-9]{64}$/.test(row.screenshot_receipt_sha256)), true);
  assert.equal(reportText.includes('/home/exedev/'), false);
  assert.equal(summary.includes('19 of 22 runnable families'), true);
  assert.equal(summary.includes('mwg-train deterministic baseline'), true);
  assert.equal(classifyDocument('docs/eval/default-set-step4-2026-10-19.md'), 'floor-report');
  assert.equal(classifyDocument('docs/eval/default-set-step4-hono-2026-10-19.json'), 'floor-report');
});

test('public report refuses mismatched run, ratification and headroom rather than publishing invented rates', () => {
  const inputs = fixture();
  inputs.scoreReceipts['tr-05'].request_id = 'x'.repeat(64);
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...inputs }), /REPORT_IDENTITY_MISMATCH/);
  inputs.scoreReceipts['tr-05'].request_id = prepared.families.find((row) => row.family === 'tr-05').request_id;
  inputs.scoreReceipts['tr-05'].headroom.passed = 0;
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...inputs }), /REPORT_HEADROOM_MISMATCH/);
  assert.throws(() => publicJourneyPart({ name: 'other', status: 'PASS', detail: privateMarker }), /REPORT_INVALID_PART/);
  const missingLineage = fixture();
  delete missingLineage.supersededReceipts['tr-05'];
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...missingLineage }), /REPORT_SUPERSESSION_MISSING/);
  const forged = fixture();
  forged.supersededReceipts['tr-05'][0].receipt.headroom.ceiling = true;
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...forged }), /REPORT_SUPERSESSION_MISMATCH/);
  const mismatched = fixture();
  mismatched.scoreReceipts['tr-05'].instrument_sha256 = 'a'.repeat(64);
  assert.throws(() => buildPublicStep4Report({ tranche, prepared, ...mismatched }), /REPORT_INSTRUMENT_MISMATCH/);
});
