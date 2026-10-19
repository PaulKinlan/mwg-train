import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MWG_RULE_IDS, MODERN_RULE_IDS } from '../corpus/rules.mjs';
import { selectorFieldName } from '../train/brief-schema.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checkableRules = new Set(MWG_RULE_IDS.filter((id) => !MODERN_RULE_IDS.includes(id)));
const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };

// The headroom universe/threshold/action must be approved as one exact §14 row before a generated
// default is driven. A code change with independent review is required to set this digest.
export const RATIFIED_STEP4_ROW_SHA256 = 'fa36c8d60ef1fde8e30243bf8715de935ca2bfdadc22e36709dd587015cc716e';
export function step4RatificationRow(markdown) {
  const rows = String(markdown).split('\n').filter((line) =>
    line.startsWith('| 2026-10-19 19:20Z, before any Step 4 default score |'));
  if (rows.length !== 1) fail('RATIFICATION_MISSING', 'expected one owner-ratified Step 4 §14 row');
  return rows[0];
}
export function assertStep4Ratification(rowText) {
  if (!RATIFIED_STEP4_ROW_SHA256 || typeof rowText !== 'string' ||
      hash(rowText) !== RATIFIED_STEP4_ROW_SHA256) fail('RATIFICATION_MISSING', 'no reviewed Step 4 §14 headroom row is pinned');
}

function rulePlan(ids) {
  return ids.map((id) => ({ rule_id: id, checkability: checkableRules.has(id) ? 'CHECKABLE' : 'NOT_CHECKABLE',
    ...(!checkableRules.has(id) ? { reason: 'no exact implemented checker for this rule id' } : {}) }));
}

/** Pure inventory: no private archive, generated source, browser or provider is accessed here. */
export function prepareDefaultStep4({ tranche, briefs, ratificationRow = null }) {
  if (ratificationRow !== null) assertStep4Ratification(ratificationRow);
  if (tranche?.kind !== 'untouched-default-tranche-metadata' || tranche?.arm !== 'default' ||
      tranche?.framework !== 'hono' || tranche?.run_records?.length !== 30 ||
      tranche.excluded_from_training !== true || tranche.approved_for_training !== false)
    fail('TRANCHE_IDENTITY_MISMATCH', 'expected thirty excluded default Hono identities');
  const index = hash(tranche.run_records.map((row) => `${row.family} ${row.manifest_sha256}\n`).join(''));
  if (index !== tranche.manifest_index_sha256) fail('TRANCHE_IDENTITY_MISMATCH', 'manifest index hash differs');
  const ids = new Set();
  const prepared = tranche.run_records.map((run, index) => {
    const family = `tr-${String(index + 1).padStart(2, '0')}`;
    if (run.family !== family || run.project_id !== `${family}-hono` ||
        !/^[0-9a-f]{64}$/.test(run.request_id ?? '') || ids.has(run.request_id) ||
        run.excluded_from_training !== true) fail('TRANCHE_IDENTITY_MISMATCH', `bad or duplicate ${family} run`);
    ids.add(run.request_id);
    const candidates = briefs.filter((brief) => brief.family_id === family && brief.brief_id === `${family}-v1`);
    if (candidates.length !== 1) fail('BRIEF_IDENTITY_MISMATCH', `${family} has ${candidates.length} canonical v1 briefs`);
    const brief = candidates[0];
    if (!Array.isArray(brief.required_rules) || !Array.isArray(brief.applicable_rules))
      fail('BRIEF_IDENTITY_MISMATCH', `${family} has no rule declarations`);
    const eligibility = run.status === 'SUCCESS' && run.outcome_kind === 'success' ? 'ELIGIBLE' :
      run.status === 'FAILED' && run.outcome_kind === 'model-length' && run.finish_reason === 'length' ? 'MODEL_LENGTH_NO_PROJECT' :
      run.status === 'FAILED' && run.outcome_kind === 'transport-unevaluable' && run.finish_reason === 'UNVERIFIED' ? 'TRANSPORT_UNEVALUABLE' : null;
    if (!eligibility) fail('TRANCHE_IDENTITY_MISMATCH', `${family} has an inconsistent outcome`);
    const echoed = (brief.fields ?? []).filter((field) => field.echoed === true);
    const echoSelectors = echoed.length === 1 ? Object.keys(brief.journey?.fill ?? {}).filter((selector) =>
      selectorFieldName(selector) === echoed[0].name) : [];
    if (echoSelectors.length !== 1 || brief.journey?.fill[echoSelectors[0]] !== brief.journey?.expectText)
      fail('ADAPTER_AMBIGUOUS', `${family} has no unique echoed fixture field`);
    const firstRequired = (brief.fields ?? []).find((field) => field.required && Object.keys(brief.journey.fill).some((selector) => selectorFieldName(selector) === field.name));
    const primaryFields = firstRequired ? Object.keys(brief.journey.fill).filter((selector) => selectorFieldName(selector) === firstRequired.name) : [];
    if (primaryFields.length !== 1) fail('ADAPTER_AMBIGUOUS', `${family} has no unique required primary field`);
    return { family, project_id: run.project_id, request_id: run.request_id, eligibility,
      brief_sha256: hash(JSON.stringify(brief)), journey_sha256: hash(JSON.stringify(brief.journey)),
      required_rules: rulePlan(brief.required_rules), applicable_diagnostics: rulePlan(brief.applicable_rules),
      ...(eligibility === 'ELIGIBLE' ? { adapter: { journey: structuredClone(brief.journey),
        primaryField: primaryFields[0], echoedField: echoed[0].name, echoedSelector: echoSelectors[0],
        framework: 'hono', archetype: brief.archetype } } : {}) };
  });
  return { kind: 'step4-preflight-only', tranche_manifest_index_sha256: index,
    ratification: ratificationRow === null ? 'MISSING' : 'RATIFIED', families: prepared };
}

// Direct invocation reads only public metadata and prints no fixture values, browser outcomes or scores.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const tranche = JSON.parse(readFileSync(`${root}/docs/eval/default-set-hono-tranche-2026-10-19.json`, 'utf8'));
  const briefs = readFileSync(`${root}/docs/train/briefs/manifest.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  const ratificationRow = step4RatificationRow(readFileSync(`${root}/docs/eval/PREREGISTRATION.md`, 'utf8'));
  const plan = prepareDefaultStep4({ tranche, briefs, ratificationRow });
  const eligible = plan.families.filter((row) => row.eligibility === 'ELIGIBLE');
  const required = eligible.flatMap((row) => row.required_rules);
  const applicable = eligible.flatMap((row) => row.applicable_diagnostics);
  process.stdout.write(`${JSON.stringify({ kind: plan.kind, ratification: plan.ratification,
    tranche_manifest_index_sha256: plan.tranche_manifest_index_sha256,
    families: plan.families.length, eligible: eligible.length,
    model_length: plan.families.filter((row) => row.eligibility === 'MODEL_LENGTH_NO_PROJECT').length,
    transport_unevaluable: plan.families.filter((row) => row.eligibility === 'TRANSPORT_UNEVALUABLE').length,
    required_rule_pairs: required.length, required_exact_checkable: required.filter((row) => row.checkability === 'CHECKABLE').length,
    applicable_diagnostic_pairs: applicable.length, applicable_exact_checkable: applicable.filter((row) => row.checkability === 'CHECKABLE').length,
    generated_default_executed: false }, null, 2)}\n`);
}
