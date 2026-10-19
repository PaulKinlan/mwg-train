import { validationObservation } from '../corpus/accept.mjs';

const part = (name, status, detail) => ({ name, status, detail });
const measured = (value, name, detail) => part(name, value ? 'PASS' : 'FAIL', detail);

/** Decide only from driven observations. Missing/error receipts are never guessed into failures. */
export function journeyComponentVerdicts({ journey, persistence = null, validation = null, search = null, update = null }) {
  const parts = [];
  if (!persistence) parts.push(part('server-persistence', 'NOT_CHECKABLE', 'create/reload was not observed'));
  else {
    const submit = persistence.steps?.find((step) => step.step === 'submit');
    const reload = persistence.steps?.find((step) => step.step === 'reload');
    const witness = persistence.serverWitness;
    parts.push(submit?.status != null && reload && witness?.status === 200 && witness?.shape === 'records' ? measured(
      submit.status < 400 && (persistence.persistedText ?? '').includes(journey.expectText) &&
      witness.expectedRecordPresent === true, 'server-persistence',
      { submitStatus: submit.status, reloadObserved: true,
        expectedVisible: (persistence.persistedText ?? '').includes(journey.expectText),
        serverRecordPresent: witness.expectedRecordPresent, apiStatus: witness.status },
    ) : part('server-persistence', 'NOT_CHECKABLE',
      { reason: 'submit/reload/server API witness is incomplete', submitStatus: submit?.status ?? null,
        apiStatus: witness?.status ?? null, apiShape: witness?.shape ?? null }));
  }
  if (journey.steps?.length) {
    parts.push(persistence?.carry ? measured(
      persistence.carry.passed === true, 'multi-step-carry',
      { carryPassed: persistence.carry.passed, draftStateDiagnostic: persistence.state?.passed ?? null },
    ) : part('multi-step-carry', 'NOT_CHECKABLE', 'declared carry not observed; draft-state alone does not prove it'));
  }
  const validationState = validation ? validationObservation({ journeys: [{ name: 'validation-failure', ...validation }] }) : 'not-driven';
  parts.push(part('empty-form-validation', validationState === 'refused-observed' ? 'PASS' :
    validationState === 'accepted-empty' ? 'FAIL' : 'NOT_CHECKABLE', validationState));
  if (journey.search) parts.push(search?.verdict && (search.containerFound === true) &&
    (search.verdict.detail?.controlMissing?.length ?? 1) === 0 ?
    measured(search.verdict.passed === true, 'search', search.verdict.detail) :
    part('search', 'NOT_CHECKABLE', search?.detail?.controlImpossible ?? 'matching/decoy control not established'));
  if (journey.update) parts.push(update?.verdict && update.verdict.detail?.ref &&
    update.verdict.detail?.apiStatus === 200 && Number.isInteger(update.verdict.detail?.rowsBefore) &&
    Number.isInteger(update.verdict.detail?.rowsAfter) ?
    measured(update.verdict.passed === true, 'update-existing', update.verdict.detail) :
    part('update-existing', 'NOT_CHECKABLE', 'stable ref, record API or row-count witness not established'));
  return parts;
}

export function requiredRuleVerdicts(rulePlan, observed = []) {
  return rulePlan.map(({ rule_id, checkability, reason }) => {
    if (checkability !== 'CHECKABLE') return part(rule_id, 'NOT_CHECKABLE', reason);
    const receipt = observed.find((entry) => entry.rule === rule_id);
    return part(rule_id, receipt?.status === 'PASS' || receipt?.status === 'FAIL' ? receipt.status : 'NOT_CHECKABLE',
      receipt?.detail ?? 'no valid exact-ID rule observation');
  });
}

/** AC2: one count per checkable required rule or declared, observed journey component. */
export function headroom(journeyParts, requiredRules) {
  const parts = [...journeyParts, ...requiredRules];
  const passed = parts.filter((entry) => entry.status === 'PASS').length;
  const failed = parts.filter((entry) => entry.status === 'FAIL').length;
  const notCheckable = parts.length - passed - failed;
  return { passed, failed, not_checkable: notCheckable, coverage_incomplete: notCheckable > 0,
    rate: passed + failed === 0 ? null : passed / (passed + failed),
    // §14 explicitly excludes uncheckable parts; even a sparse denominator can meet the ratified
    // threshold. Preserve that decision but expose coverage_incomplete rather than imply a full floor.
    ceiling: passed + failed === 0 ? null : passed / (passed + failed) >= 0.9 };
}
