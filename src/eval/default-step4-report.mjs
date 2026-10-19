import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDefaultStep4, RATIFIED_STEP4_ROW_SHA256, step4RatificationRow } from './default-step4-preflight.mjs';
import { BASELINE_FIELDS } from './ruleset.mjs';

const FAILURES = new Set(['MODEL_LENGTH_NO_PROJECT', 'TRANSPORT_UNEVALUABLE']);
const VISUAL = new Set(['SIMILAR', 'PARTIALLY_SIMILAR', 'DISSIMILAR', 'UNASSESSABLE']);
// The sealed tranche's known local remeasurements must not disappear on report regeneration.
export const REQUIRED_SUPERSEDED = Object.freeze({
  'tr-05': [
    '2f76811801d24b2774bd4b7c08355ae12c124ac418cd82a3260a14ce8369d963',
    'c4a40411bc9722f46783946803835aba65c190261de8efd735bfa1c4a7672345',
  ],
  'tr-07': ['75b036083151eaff28988f52ce285a9142be50d520ee0cabb4fe830e80d09fb0'],
});
const SUPERSESSION_REASONS = new Set(['measurement_revised', 'identity_pins_added', 'search_control_corrected']);
const requireHash = (value, label) => {
  if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw Error(`REPORT_IDENTITY_MISMATCH: ${label} has no SHA-256`);
  return value;
};

/** Only fixed outcome fields cross the public boundary; raw receipts and private paths do not. */
export function publicJourneyPart(part) {
  const { name, status, detail } = part;
  if (!['PASS', 'FAIL', 'NOT_CHECKABLE'].includes(status)) throw Error(`REPORT_INVALID_PART: ${name}`);
  const observed = typeof detail === 'object' && detail ? detail : {};
  const safe = {};
  if (name === 'server-persistence') {
    if (status === 'NOT_CHECKABLE') safe.reason = 'submit_reload_or_server_api_witness_incomplete';
    for (const key of ['submitStatus', 'reloadObserved', 'expectedVisible', 'serverRecordPresent', 'apiStatus']) {
      if (typeof observed[key] === 'boolean' || Number.isInteger(observed[key])) safe[key] = observed[key];
    }
  } else if (name === 'multi-step-carry') {
    if (status === 'NOT_CHECKABLE') safe.reason = 'declared_carry_not_observed';
    for (const key of ['carryPassed', 'draftStateDiagnostic']) if (typeof observed[key] === 'boolean') safe[key] = observed[key];
  } else if (name === 'empty-form-validation') {
    safe.observation = ['refused-observed', 'accepted-empty', 'blocked-without-evidence'].includes(detail) ? detail : 'not-driven';
  } else if (name === 'search') {
    safe.control_established = status !== 'NOT_CHECKABLE';
    if (status === 'NOT_CHECKABLE') safe.reason = 'matching_or_decoy_control_not_established';
    if (Array.isArray(observed.includesMissing)) safe.expected_value_found = observed.includesMissing.length === 0;
    if (Array.isArray(observed.excludesLeaked)) safe.excluded_value_absent = observed.excludesLeaked.length === 0;
  } else if (name === 'update-existing') {
    if (status === 'NOT_CHECKABLE') safe.reason = 'stable_ref_edit_form_record_api_or_row_count_not_established';
    for (const key of ['visibleAfterReload', 'newValueStored', 'oldValueGone', 'rowCountUnchanged', 'comparedAsField', 'apiStatus']) {
      if (typeof observed[key] === 'boolean' || Number.isInteger(observed[key])) safe[key] = observed[key];
    }
  } else throw Error(`REPORT_INVALID_PART: undeclared component ${name}`);
  return { name, status, detail: safe };
}

export function publicSupersededReceipt({ receipt, sha256, change }, { family, publicRow, currentScore }) {
  if (!SUPERSESSION_REASONS.has(change) || receipt?.kind !== 'step4-functional-pilot' ||
      receipt.family !== family.family || receipt.project_id !== publicRow.project_id ||
      receipt.request_id !== publicRow.request_id || receipt.archive_manifest_sha256 !== publicRow.manifest_sha256 ||
      receipt.ratification_row_sha256 !== RATIFIED_STEP4_ROW_SHA256 || receipt.sandbox !== 'bubblewrap' ||
      receipt.excluded_from_training !== true)
    throw Error(`REPORT_SUPERSESSION_MISMATCH: ${family.family} historical identity`);
  const pinsAbsent = receipt.brief_sha256 == null && receipt.journey_sha256 == null;
  const pinsPresent = receipt.brief_sha256 === family.brief_sha256 && receipt.journey_sha256 === family.journey_sha256;
  if (!pinsAbsent && !pinsPresent) throw Error(`REPORT_SUPERSESSION_MISMATCH: ${family.family} historical pins`);
  const valid = new Set(['PASS', 'FAIL', 'NOT_CHECKABLE']);
  const parts = receipt.journey_parts;
  if (!Array.isArray(parts) || parts.length === 0 || !Array.isArray(receipt.required_rules) ||
      receipt.required_rules.length !== family.required_rules.length ||
      receipt.required_rules.some((rule, index) => rule.name !== family.required_rules[index].rule_id || rule.status !== 'NOT_CHECKABLE') ||
      parts.some((part) => !currentScore.journey_parts.some((current) => current.name === part.name) || !valid.has(part.status)) ||
      new Set(parts.map((part) => part.name)).size !== parts.length)
    throw Error(`REPORT_SUPERSESSION_MISMATCH: ${family.family} historical parts`);
  const passed = parts.filter((part) => part.status === 'PASS').length;
  const failed = parts.filter((part) => part.status === 'FAIL').length;
  const notCheckable = parts.filter((part) => part.status === 'NOT_CHECKABLE').length + receipt.required_rules.length;
  if (receipt.headroom?.passed !== passed || receipt.headroom.failed !== failed ||
      receipt.headroom.not_checkable !== notCheckable ||
      receipt.headroom.rate !== (passed + failed ? passed / (passed + failed) : null) ||
      receipt.headroom.ceiling !== (passed + failed ? passed / (passed + failed) >= 0.9 : null))
    throw Error(`REPORT_SUPERSESSION_MISMATCH: ${family.family} historical headroom`);
  const previous = new Map(parts.map((part) => [part.name, part.status]));
  const changedParts = currentScore.journey_parts.filter((part) => previous.get(part.name) !== part.status).map((part) => part.name);
  if ((change === 'measurement_revised' && changedParts.length === 0) ||
      (change === 'identity_pins_added' && !pinsAbsent) ||
      (change === 'search_control_corrected' && (previous.get('search') !== 'NOT_CHECKABLE' ||
        !currentScore.journey_parts.some((part) => part.name === 'search' && part.status === 'PASS'))))
    throw Error(`REPORT_SUPERSESSION_MISMATCH: ${family.family} change code not substantiated`);
  return { functional_receipt_sha256: requireHash(sha256, 'superseded receipt'),
    sha256_provenance: 'recomputed_from_retained_receipt',
    instrument_revision: receipt.instrument_sha256 ? requireHash(receipt.instrument_sha256, 'instrument') : 'UNRECORDED_AT_RUN',
    identity_pins: pinsPresent ? 'PRESENT' : 'ABSENT_AT_RUN', change,
    headroom: { passed, failed, not_checkable: notCheckable, rate: receipt.headroom.rate, ceiling: receipt.headroom.ceiling },
    changed_parts: changedParts };
}

function ruleCounts(rows) {
  return Object.fromEntries([...new Set(rows.map((row) => row.rule_id))].sort().map((id) => [id, {
    pass: rows.filter((row) => row.rule_id === id && row.status === 'PASS').length,
    fail: rows.filter((row) => row.rule_id === id && row.status === 'FAIL').length,
    not_checkable: rows.filter((row) => row.rule_id === id && row.status === 'NOT_CHECKABLE').length,
  }]));
}

export function buildPublicStep4Report({ tranche, prepared, scoreReceipts, smokeReceipts, scoreHashes, smokeHashes, visualVerdicts, visualHashes, supersededReceipts = {} }) {
  if (prepared?.kind !== 'step4-preflight-only' || prepared.ratification !== 'RATIFIED' ||
      prepared.families.length !== 30 || tranche?.run_records?.length !== 30)
    throw Error('REPORT_IDENTITY_MISMATCH: preregistered thirty-family tranche required');
  const families = prepared.families.map((family) => {
    const publicRow = tranche.run_records.find((row) => row.family === family.family);
    if (!publicRow || publicRow.project_id !== family.project_id || publicRow.request_id !== family.request_id)
      throw Error(`REPORT_IDENTITY_MISMATCH: ${family.family} register differs`);
    if (FAILURES.has(family.eligibility)) return { family: family.family, project_id: family.project_id,
      generation: family.eligibility, functional: 'NOT_RUN', visual: 'NOT_RUN', retry: false };
    if (family.eligibility !== 'ELIGIBLE') throw Error(`REPORT_IDENTITY_MISMATCH: ${family.family} has unknown eligibility`);
    const score = scoreReceipts[family.family];
    const smoke = smokeReceipts[family.family];
    const visual = visualVerdicts[family.family];
    if (!score || !smoke || !VISUAL.has(visual) || score.family !== family.family || smoke.family !== family.family ||
        score.request_id !== family.request_id || smoke.request_id !== family.request_id ||
        score.archive_manifest_sha256 !== publicRow.manifest_sha256 || smoke.archive_manifest_sha256 !== publicRow.manifest_sha256 ||
        score.ratification_row_sha256 !== RATIFIED_STEP4_ROW_SHA256 || smoke.ratification_row_sha256 !== RATIFIED_STEP4_ROW_SHA256 ||
        score.brief_sha256 !== family.brief_sha256 || smoke.brief_sha256 !== family.brief_sha256 ||
        score.journey_sha256 !== family.journey_sha256 || smoke.journey_sha256 !== family.journey_sha256 ||
        score.sandbox !== 'bubblewrap' || smoke.sandbox !== 'bubblewrap' ||
        score.excluded_from_training !== true || smoke.excluded_from_training !== true)
      throw Error(`REPORT_IDENTITY_MISMATCH: ${family.family} has incomplete or mismatched evidence`);
    if (smoke.screenshots?.length !== 2 || smoke.screenshots[0]?.viewport?.width !== 1376 ||
        smoke.screenshots[0]?.viewport?.height !== 768 || smoke.screenshots[1]?.viewport?.width !== 390 ||
        smoke.screenshots[1]?.viewport?.height !== 844 ||
        smoke.screenshots.some((shot) => shot.documentStatus !== 200 ||
          !shot.documentUrl || new URL(shot.documentUrl).pathname !== family.adapter.journey.startPath))
      throw Error(`REPORT_VIEWPORT_MISMATCH: ${family.family}`);
    if (score.required_rules?.length !== family.required_rules.length ||
        score.applicable_diagnostics?.length !== family.applicable_diagnostics.length ||
        score.headroom?.coverage_incomplete !== true)
      throw Error(`REPORT_COVERAGE_MISMATCH: ${family.family}`);
    const required = family.required_rules.map((rule, index) => {
      const observed = score.required_rules[index];
      if (observed?.name !== rule.rule_id || observed.status !== 'NOT_CHECKABLE' || rule.checkability !== 'NOT_CHECKABLE')
        throw Error(`REPORT_COVERAGE_MISMATCH: ${family.family} ${rule.rule_id}`);
      return { rule_id: rule.rule_id, status: 'NOT_CHECKABLE', reason: 'no exact implemented checker' };
    });
    const diagnostics = family.applicable_diagnostics.map((rule, index) => {
      const observed = score.applicable_diagnostics[index];
      if (observed?.name !== rule.rule_id || !['PASS', 'FAIL', 'NOT_CHECKABLE'].includes(observed.status))
        throw Error(`REPORT_COVERAGE_MISMATCH: ${family.family} diagnostic ${rule.rule_id}`);
      // Fixed reason codes preserve the deciding property without copying rendered page/fixture text.
      const detail = String(observed.detail ?? '');
      const reasons = [];
      if (detail.includes('aria-errormessage') || detail.includes('aria-describedby')) reasons.push('missing_associated_error_text');
      if (detail.includes('aria-invalid')) reasons.push('missing_aria_invalid');
      if (detail.includes('autocomplete')) reasons.push('autocomplete_token_mismatch');
      if (detail.includes('colour alone')) reasons.push('colour_only_error');
      if (detail.includes('user-invalid') && observed.status !== 'PASS') reasons.push('invalid_state_not_observed');
      return { rule_id: rule.rule_id, status: observed.status,
        reason: rule.checkability !== 'CHECKABLE' ? 'no_exact_checker' :
          observed.status === 'PASS' ? 'exact_checker_passed' : observed.status === 'NOT_CHECKABLE' ? 'checker_not_measured' :
          reasons.length ? reasons.join(',') : 'exact_checker_failed_private_detail' };
    });
    const lineage = supersededReceipts[family.family] ?? [];
    const expectedHashes = REQUIRED_SUPERSEDED[family.family] ?? [];
    if (lineage.length !== expectedHashes.length || lineage.some((entry, index) => entry.sha256 !== expectedHashes[index] ||
        entry.sha256 === scoreHashes[family.family]))
      throw Error(`REPORT_SUPERSESSION_MISSING: ${family.family}`);
    const superseded = lineage.map((entry) => publicSupersededReceipt(entry, { family, publicRow, currentScore: score }));
    const instrument = score.instrument_sha256 ?? null;
    if (instrument !== (smoke.instrument_sha256 ?? null)) throw Error(`REPORT_INSTRUMENT_MISMATCH: ${family.family}`);
    const instrumentRevision = instrument ? requireHash(instrument, 'instrument') : 'UNRECORDED_AT_RUN';
    const journey = score.journey_parts.map(publicJourneyPart);
    const passed = journey.filter((part) => part.status === 'PASS').length;
    const failed = journey.filter((part) => part.status === 'FAIL').length;
    const notCheckable = journey.filter((part) => part.status === 'NOT_CHECKABLE').length;
    if (score.headroom.passed !== passed || score.headroom.failed !== failed ||
        score.headroom.not_checkable !== notCheckable + required.length ||
        score.headroom.rate !== (passed + failed ? passed / (passed + failed) : null) ||
        score.headroom.ceiling !== (passed + failed ? passed / (passed + failed) >= 0.9 : null))
      throw Error(`REPORT_HEADROOM_MISMATCH: ${family.family}`);
    return { family: family.family, project_id: family.project_id, generation: 'SUCCESS',
      functional: 'MEASURED', instrument_revision: instrumentRevision, superseded_functional_receipts: superseded,
      headroom: score.headroom, journey_parts: journey,
      required_rules: required, applicable_diagnostics: diagnostics,
      visual: { verdict: visual, desktop: 'EVALUATED', mobile: 'EVALUATED',
        label: 'similarity to authored board, image not supplied during generation', numeric_score: null,
        target_sha256: requireHash(smoke.visual_target_sha256, 'target'),
        desktop_sha256: requireHash(smoke.screenshots[0].sha256, 'desktop'),
        mobile_sha256: requireHash(smoke.screenshots[1].sha256, 'mobile'),
        evidence_sha256: requireHash(visualHashes[family.family], 'visual review') },
      archive_manifest_sha256: requireHash(publicRow.manifest_sha256, 'archive'),
      functional_receipt_sha256: requireHash(scoreHashes[family.family], 'functional receipt'),
      screenshot_receipt_sha256: requireHash(smokeHashes[family.family], 'screenshot receipt'),
      brief_sha256: requireHash(family.brief_sha256, 'brief'),
      journey_sha256: requireHash(family.journey_sha256, 'journey') };
  });
  const successes = families.filter((row) => row.generation === 'SUCCESS');
  const required = successes.flatMap((row) => row.required_rules);
  const diagnostics = successes.flatMap((row) => row.applicable_diagnostics);
  const journey = successes.flatMap((row) => row.journey_parts);
  return { kind: 'default-set-step4-sanitized-report', attribution: 'mwg-train deterministic baseline',
    ...BASELINE_FIELDS, training_exclusion: true,
    manifest_index_sha256: requireHash(prepared.tranche_manifest_index_sha256, 'tranche'),
    ratification_row_sha256: RATIFIED_STEP4_ROW_SHA256, framework: 'hono', arm: 'default',
    counts: { identities: 30, success: successes.length, model_length: families.filter((row) => row.generation === 'MODEL_LENGTH_NO_PROJECT').length,
      transport_unevaluable: families.filter((row) => row.generation === 'TRANSPORT_UNEVALUABLE').length,
      ceiling_families: successes.filter((row) => row.headroom.ceiling === true).length,
      required_rule_pairs: required.length, required_not_checkable: required.filter((row) => row.status === 'NOT_CHECKABLE').length,
      applicable_diagnostic_pairs: diagnostics.length,
      applicable_diagnostic_pass: diagnostics.filter((row) => row.status === 'PASS').length,
      applicable_diagnostic_fail: diagnostics.filter((row) => row.status === 'FAIL').length,
      applicable_diagnostic_not_checkable: diagnostics.filter((row) => row.status === 'NOT_CHECKABLE').length,
      journey_pass: journey.filter((row) => row.status === 'PASS').length,
      journey_fail: journey.filter((row) => row.status === 'FAIL').length,
      journey_not_checkable: journey.filter((row) => row.status === 'NOT_CHECKABLE').length },
    required_rule_counts: ruleCounts(required), applicable_diagnostic_rule_counts: ruleCounts(diagnostics),
    limitations: [
      'Headroom is per-family over observable structured journeys only; all required-rule IDs on eligible families are umbrellas without exact checkers. It is not a complete MWG or prose-assertion evaluation.',
      'Transport-unevaluable cells are not model failures; model-length cells are generation failures with no runnable project. No paid identity was retried.',
      'At or above 90% of a family’s checkable parts: CEILING, exclude improvement claim and pause promotion until a separately preregistered expanded held-out endpoint.',
      'Visual assessment is qualitative against an authored desktop reference image not supplied during generation. No authored mobile board or numeric visual score.',
      'Generated servers ran in Linux bubblewrap; generated client JavaScript ran in contained Chrome. macOS sample is post-evaluation and not yet reproduced.',
      'The baseline metadata describes the separate deterministic ideal comparator, not this generated default arm or a model training input.',
      'Historical Step 4 receipts did not pin the source instrument: UNRECORDED_AT_RUN does not imply the latest commit measured them. Superseded receipt hashes were recomputed from retained private bytes; no old receipt was rewritten.',
      'Local read-only SHA-256 archive is not WORM or off-VM immutable. Exact served model checkpoint remains UNVERIFIED.',
    ], families };
}

// CLI: the inventory lives in owner-only private storage. Only the allowlisted fields above leave it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inventoryPath, outputPath] = process.argv.slice(2);
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  if (!inventoryPath || resolve(outputPath ?? '') !== join(repo, 'docs/eval/default-set-step4-hono-2026-10-19.json'))
    throw Error('usage: node src/eval/default-step4-report.mjs <private-inventory-json> <docs/eval/default-set-step4-hono-2026-10-19.json>');
  const inventoryFile = realpathSync(inventoryPath);
  const privateRoot = realpathSync(join(homedir(), '.fleet'));
  if (!inventoryFile.startsWith(`${privateRoot}/`) || statSync(inventoryFile).mode & 0o077)
    throw Error('REPORT_PRIVATE_INPUT: inventory must be owner-only under ~/.fleet');
  const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const load = (file) => {
    const full = realpathSync(join(privateRoot, file));
    if (!full.startsWith(`${privateRoot}/`) || !lstatSync(full).isFile()) throw Error('REPORT_PRIVATE_INPUT: unsafe evidence path');
    const bytes = readFileSync(full);
    const text = bytes.toString('utf8');
    return { body: full.endsWith('.json') ? JSON.parse(text) : null, text, sha256: sha256(bytes) };
  };
  const scan = (roots, prefix) => {
    const found = {}, hashes = {};
    for (const name of roots) {
      if (typeof name !== 'string' || !name.startsWith(prefix) || basename(name) !== name)
        throw Error('REPORT_PRIVATE_INPUT: evidence root is not allowlisted');
      const dir = realpathSync(join(privateRoot, name));
      for (const folder of readdirSync(dir)) {
        const path = join(dir, folder, 'receipt.json');
        if (!folder.startsWith('tr-') || !existsSync(path) || !lstatSync(path).isFile()) continue;
        const loaded = load(join(name, folder, 'receipt.json'));
        const receipt = loaded.body;
        if (found[receipt.family] && inventory.overrides?.[receipt.family] !== name)
          throw Error(`REPORT_DUPLICATE_EVIDENCE: ${receipt.family}`);
        found[receipt.family] = receipt;
        hashes[receipt.family] = loaded.sha256;
      }
    }
    return { found, hashes };
  };
  const tranche = JSON.parse(readFileSync(join(repo, 'docs/eval/default-set-hono-tranche-2026-10-19.json'), 'utf8'));
  const briefs = readFileSync(join(repo, 'docs/train/briefs/manifest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const ratificationRow = step4RatificationRow(readFileSync(join(repo, 'docs/eval/PREREGISTRATION.md'), 'utf8'));
  const prepared = prepareDefaultStep4({ tranche, briefs, ratificationRow });
  const { found: scoreReceipts, hashes: scoreHashes } = scan(inventory.functional_roots, 'mwg-train-step4-functional-');
  const { found: smokeReceipts, hashes: smokeHashes } = scan(inventory.smoke_roots, 'mwg-train-step4-smoke-');
  const supersededReceipts = {};
  for (const [family, records] of Object.entries(inventory.superseded_functional ?? {})) {
    const publicRow = tranche.run_records.find((row) => row.family === family);
    if (!publicRow || !Object.hasOwn(REQUIRED_SUPERSEDED, family) || !Array.isArray(records))
      throw Error(`REPORT_SUPERSESSION_MISMATCH: ${family}`);
    supersededReceipts[family] = records.map(({ root: name, change }) => {
      if (typeof name !== 'string' || !name.startsWith('mwg-train-step4-functional-') || basename(name) !== name)
        throw Error(`REPORT_PRIVATE_INPUT: unsafe superseded root for ${family}`);
      const loaded = load(join(name, `${family}-${publicRow.request_id}`, 'receipt.json'));
      return { receipt: loaded.body, sha256: loaded.sha256, change };
    });
  }
  const visualVerdicts = {}, visualHashes = {};
  for (const [family, record] of Object.entries(inventory.visual ?? {})) {
    if (!VISUAL.has(record.verdict)) throw Error(`REPORT_INVALID_VISUAL: ${family}`);
    const visualEvidence = load(record.evidence);
    const smoke = smokeReceipts[family];
    if (!smoke || !visualEvidence.text.includes(family) ||
        !visualEvidence.text.includes(smoke.visual_target_sha256) ||
        !visualEvidence.text.includes(smoke.screenshots?.[0]?.sha256) ||
        !visualEvidence.text.includes(smoke.screenshots?.[1]?.sha256) ||
        !(visualEvidence.text.includes(record.verdict) ||
          visualEvidence.text.toLowerCase().includes(record.verdict.toLowerCase().replaceAll('_', ' '))))
      throw Error(`REPORT_INVALID_VISUAL: ${family} image or verdict not bound to review`);
    visualVerdicts[family] = record.verdict;
    visualHashes[family] = visualEvidence.sha256;
  }
  const report = buildPublicStep4Report({ tranche, prepared, scoreReceipts, smokeReceipts,
    scoreHashes, smokeHashes, visualVerdicts, visualHashes, supersededReceipts });
  const publicJson = `${JSON.stringify(report, null, 2)}\n`;
  if (publicJson.includes(privateRoot) || publicJson.includes('/home/exedev/') || publicJson.includes('file:'))
    throw Error('REPORT_PRIVATE_OUTPUT: source path escaped sanitization');
  writeFileSync(outputPath, publicJson, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ kind: report.kind, counts: report.counts, output_sha256: sha256(publicJson) })}\n`);
}
