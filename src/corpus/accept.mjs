/**
 * Acceptance for an original -> uplifted pair, and the yield report.
 *
 * The gate is the design brief's (section 6), not an opinion:
 *
 *   accept a pair only if
 *     1. both versions are runnable,
 *     2. the uplifted version preserves the original task (the same journey still works),
 *     3. it improves at least one independently confirmed MWG-relevant property,
 *     4. it introduces no new high-severity security issue and no broken flow.
 *
 * Rejects are classified rather than dropped, because acceptance bias is the thing a pilot exists to
 * make visible: "the tool had nothing to fix here" and "the tool broke the flow" are different facts
 * about the pipeline, and only one of them is a bug.
 */

const isPass = (entry) => entry?.status === 'PASS';
const isFail = (entry) => entry?.status === 'FAIL';

/** Did the journey work at all: record found after a reload, validation refused, no server error. */
export function journeyWorks(record) {
  const persistence = record.journeys?.find((journey) => journey.name === 'server-persistence');
  const validation = record.journeys?.find((journey) => journey.name === 'validation-failure');
  const problems = [];
  if (!persistence) problems.push('no server-persistence journey was recorded');
  else {
    const reload = persistence.steps?.find((step) => step.step === 'reload');
    if (!reload) problems.push('the reload step did not run');
    const expected = record.echo_expect;
    if (typeof expected !== 'string' || expected === '') {
      // Fail closed: without an expected value this clause cannot be checked, and a missing expectation
      // must not read as a pass - that is a gate that verifies nothing while reporting success.
      problems.push('the harness has no expected echoed value, so server persistence was not asserted');
    } else if (!(persistence.echoedText ?? persistence.persistedText ?? '').includes(expected)) {
      problems.push(`the page shown after a reload does not contain "${expected}", so the record did not persist as served`);
    }
    const submit = persistence.steps?.find((step) => step.step === 'submit');
    if (submit?.status && submit.status >= 500) problems.push(`the write route answered ${submit.status}`);
  }
  // The empty-submission journey is an OBSERVATION, not a precondition. Whether an empty form is refused
  // is the property the rules measure on both versions, per arm; requiring it here instead turned the
  // seeded defect this pilot exists to test into 'the original is not runnable', which discarded exactly
  // the pairs with the most to fix and biased the yield upward. It is recorded and reported, not gated.
  if (!validation) problems.push('no validation journey was recorded');
  // A declared write journey must have been driven and must have been shown to persist. The catalogue
  // archetype's reflected-query journey is not a write, so it is checked by this clause instead.
  const write = record.journeys?.find((journey) => journey.name === 'write-journey');
  if (record.expected_write_journey && !write) problems.push('the declared write journey was not driven');
  else if (write && write.posted === false) {
    problems.push(`the write journey posted to a route that refused it (status ${write.landedStatus})`);
  } else if (write && write.persisted !== true) {
    problems.push('the write journey did not show the posted value stored by the server');
  }
  if (record.errors?.length > 0) problems.push(...record.errors);
  return { ok: problems.length === 0, problems };
}

export function decidePair({ original, uplifted, spec, uplift }) {
  const result = {
    project_id: spec.project_id,
    archetype: spec.archetype,
    framework: spec.framework.name,
    framework_family: spec.framework.family,
    seeded_defects: spec.seeded_defects,
    uplift_applied: uplift.applied,
    uplift_skipped: uplift.skipped,
    uplift_failed: uplift.failed,
    accepted: false,
    category: null,
    improved_rules: [],
    regressed_rules: [],
    new_security_findings: [],
    detail: [],
  };

  // Recorded on the decision itself: the report looked for the original under a key the decision does
  // not have, so every observation defaulted to 'not-driven' and the section printed
  // '0 of 25 ... 0 accepted it' - an authoritative-looking statement that measured nothing.
  result.validation_observation = validationObservation(original);
  const originalRunnable = journeyWorks({ ...original, echo_expect: spec.echo_expect, expected_write_journey: Boolean(spec.write_journey) });
  const upliftedRunnable = journeyWorks({ ...uplifted, echo_expect: spec.echo_expect, expected_write_journey: Boolean(spec.write_journey) });

  if (!originalRunnable.ok) {
    result.category = 'original-not-runnable';
    result.detail = originalRunnable.problems;
    return result;
  }
  if (!upliftedRunnable.ok) {
    result.category = 'uplift-broke-the-flow';
    result.detail = upliftedRunnable.problems;
    return result;
  }

  // A property that could not be measured is not a property that passed. Every rule the spec declares
  // must be present in *both* records with a real verdict: a missing entry, an ERROR, or an
  // applicability the project has not declared all block acceptance, because the yield would otherwise
  // count pairs where part of the vector silently did not run.
  const unmeasured = [];
  const declared = spec.required_rules;
  const declaredNotApplicable = new Set(spec.not_applicable_rules ?? []);
  if (!Array.isArray(declared) || declared.length === 0) {
    result.category = 'rule-not-measured';
    result.detail = ['the spec declares no required rules, so nothing was required to be measured'];
    return result;
  }
  for (const rule of declared) {
    for (const [label, record] of [['original', original], ['uplifted', uplifted]]) {
      const entry = (record.rules ?? []).find((candidate) => candidate.rule === rule);
      if (!entry) unmeasured.push(`${label}: ${rule} was not recorded`);
      else if (entry.status === 'ERROR') unmeasured.push(`${label}: ${rule} could not be measured (${entry.detail})`);
      else if (entry.status === 'NOT_APPLICABLE' && !declaredNotApplicable.has(rule)) {
        unmeasured.push(`${label}: ${rule} was reported not applicable, which ${label === 'original' ? 'project' : 'project'} has not declared`);
      }
    }
  }
  for (const rule of declaredNotApplicable) {
    if (!declared.includes(rule)) unmeasured.push(`${rule} is declared not applicable but is not a required rule`);
  }
  if (unmeasured.length > 0) {
    result.category = 'rule-not-measured';
    result.detail = unmeasured;
    return result;
  }

  const byRule = (record) => new Map((record.rules ?? []).map((entry) => [entry.rule, entry]));
  const originalRules = byRule(original);
  const upliftedRules = byRule(uplifted);
  for (const [rule, after] of upliftedRules) {
    const before = originalRules.get(rule);
    if (!before) continue;
    if (isFail(before) && isPass(after)) result.improved_rules.push(rule);
    // A property that passed and now cannot be measured has been lost, not preserved: recognising only
    // PASS -> FAIL let PASS -> ERROR through as if nothing had changed.
    if (isPass(before) && (isFail(after) || after.status === 'ERROR')) result.regressed_rules.push(rule);
  }
  for (const [rule, before] of originalRules) {
    if (before.status === 'PASS' && !upliftedRules.has(rule)) {
      result.regressed_rules.push(`${rule} (measured before, absent after)`);
    }
  }

  const byCheck = (record) => new Map((record.security ?? []).map((entry) => [entry.check, entry]));
  const originalSecurity = byCheck(original);
  for (const [check, after] of byCheck(uplifted)) {
    const before = originalSecurity.get(check);
    if (!before) continue;
    if (isPass(before) && isFail(after)) result.new_security_findings.push(`${check}: ${after.detail}`);
    if (isPass(before) && after.status === 'ERROR') {
      result.new_security_findings.push(`${check}: could not be measured after the uplift (${after.detail})`);
    }
  }
  for (const [check, before] of originalSecurity) {
    if (before.status === 'PASS' && !byCheck(uplifted).has(check)) {
      result.new_security_findings.push(`${check}: measured before the uplift, absent after`);
    }
  }

  if (result.regressed_rules.length > 0) {
    result.category = 'rule-regression';
    result.detail = result.regressed_rules.map((rule) => `${rule} passed before and fails after`);
    return result;
  }
  if (result.new_security_findings.length > 0) {
    result.category = 'security-regression';
    result.detail = result.new_security_findings;
    return result;
  }
  if (result.improved_rules.length === 0) {
    // Two different facts, deliberately not merged: nothing was wrong to begin with, or the tool
    // cannot fix what is wrong. The brief is explicit that an unchanged original is a valid control
    // case and NOT an instructive positive pair.
    const hadDefects = (spec.seeded_defects ?? []).length > 0;
    result.category = hadDefects ? 'no-mwg-improvement' : 'no-warranted-change';
    result.detail = hadDefects
      ? ['the uplift tool did not change any measured MWG property the original failed']
      : ['the original already satisfied every measured property'];
    return result;
  }

  result.accepted = true;
  result.category = 'accepted';
  result.detail = [`improved ${result.improved_rules.join(', ')}`];
  return result;
}

/** What happened when an empty form was submitted: refused, or accepted. Reported, never gating. */
export function validationObservation(record) {
  const validation = record.journeys?.find((journey) => journey.name === 'validation-failure');
  if (!validation) return 'not-driven';
  // Refusal must be OBSERVED. An unchanged URL with nothing else to show also happens when a submit
  // handler silently prevents submission, which is not evidence of refusal but the absence of evidence
  // either way - and calling it 'refused' claimed more than the record shows.
  const observed = validation.invalidCount > 0 || validation.visibleErrors > 0 || validation.serverRefused === true;
  if (observed) return 'refused-observed';
  if (validation.urlUnchanged === true && validation.stillOnForm === true) return 'blocked-without-evidence';
  return 'accepted-empty';
}
export function summarizeYield(decisions) {
  const byCategory = {};
  for (const decision of decisions) byCategory[decision.category] = (byCategory[decision.category] ?? 0) + 1;
  const byFramework = {};
  for (const decision of decisions) {
    byFramework[decision.framework] ??= { total: 0, accepted: 0 };
    byFramework[decision.framework].total += 1;
    if (decision.accepted) byFramework[decision.framework].accepted += 1;
  }
  const byArchetype = {};
  for (const decision of decisions) {
    byArchetype[decision.archetype] ??= { total: 0, accepted: 0 };
    byArchetype[decision.archetype].total += 1;
    if (decision.accepted) byArchetype[decision.archetype].accepted += 1;
  }
  const improved = {};
  for (const decision of decisions) for (const rule of decision.improved_rules) improved[rule] = (improved[rule] ?? 0) + 1;
  const attempted = decisions.length;
  const accepted = decisions.filter((decision) => decision.accepted).length;
  return {
    attempted,
    accepted,
    yield: attempted === 0 ? null : accepted / attempted,
    by_category: byCategory,
    by_framework: byFramework,
    by_archetype: byArchetype,
    rules_improved: Object.fromEntries(Object.entries(improved).sort((a, b) => b[1] - a[1])),
  };
}

/** The report. Numbers plus the rejects, because the rejects are the useful part at this scale. */
export function renderYieldReport({ summary, decisions, runId, generatedAt, notes = [] }) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const lines = [];
  lines.push(`# Pilot acceptance yield (${runId})`);
  lines.push('');
  lines.push(`Generated ${generatedAt} by \`scripts/pilot.mjs\`. ${summary.attempted} pairs attempted, ${summary.accepted} accepted: **${percent(summary.yield ?? 0)}**.`);
  lines.push('');
  lines.push('Every number here comes from a record produced by driving the project in a real browser; the');
  lines.push('per-project records and their screenshots and traces are next to this file.');
  lines.push('');
  // Reported, not gated: an empty submission being accepted is a finding about the original (usually the
  // seeded defect), and hiding it would make the corpus look cleaner than it is.
  const observations = decisions.map((decision) => decision.validation_observation ?? 'absent');
  const refusedCount = observations.filter((value) => value === 'refused-observed').length;
  const acceptedCount = observations.filter((value) => value === 'accepted-empty').length;
  const blockedCount = observations.filter((value) => value === 'blocked-without-evidence').length;
  const missingCount = observations.filter((value) => !['refused-observed', 'accepted-empty', 'blocked-without-evidence'].includes(value)).length;
  lines.push('## Empty-submission observation (not a gate)');
  lines.push('');
  lines.push(`${refusedCount} of ${observations.length} originals showed an observed refusal of an empty submission; ${acceptedCount} accepted it; ${blockedCount} left the page with neither an observed refusal nor an error.`);
  if (missingCount > 0) {
    // Named, not folded into a zero: a count of zero over 25 decisions used to read as a clean result.
    lines.push('');
    lines.push(`${missingCount} decision(s) carry no observation, which means the journey was not recorded for them.`);
  }
  if (acceptedCount > 0) {
    lines.push('');
    lines.push('The originals that accepted it are the ones seeded without client-side requirements. That is the');
    lines.push('defect two rules measure on both versions, so it is reported here and judged there, never used');
    lines.push('to exclude the pair.');
  }
  lines.push('');
  lines.push('## Why pairs were rejected');
  lines.push('');
  lines.push('| category | count | what it means |');
  lines.push('| --- | --- | --- |');
  const meanings = {
    accepted: 'the uplifted version preserved the task and improved at least one measured MWG property',
    'original-not-runnable': 'the original did not complete its own journey, so there was nothing to uplift',
    'uplift-broke-the-flow': 'the uplifted version no longer completed the journey → **tool or rule bug**',
    'rule-regression': 'a property that passed before now fails → **rule bug**',
    'security-regression': 'the uplift introduced a security finding → **rule bug**',
    'no-mwg-improvement': 'defects were seeded but the tool changed none of the measured properties → coverage gap',
    'no-warranted-change': 'the original was already clean, so there was nothing to fix (a valid control, not a positive pair)',
    'rule-not-measured': 'a rule the project declares could not produce a verdict, so the pair cannot be accepted on the others',
  };
  for (const [category, count] of Object.entries(summary.by_category)) {
    lines.push(`| \`${category}\` | ${count} | ${meanings[category] ?? ''} |`);
  }
  lines.push('');
  lines.push('## Yield by framework arm');
  lines.push('');
  lines.push('| framework | accepted | attempted | yield |');
  lines.push('| --- | --- | --- | --- |');
  for (const [framework, counts] of Object.entries(summary.by_framework)) {
    lines.push(`| ${framework} | ${counts.accepted} | ${counts.total} | ${percent(counts.accepted / counts.total)} |`);
  }
  lines.push('');
  lines.push('## Yield by archetype');
  lines.push('');
  lines.push('| archetype | accepted | attempted | yield |');
  lines.push('| --- | --- | --- | --- |');
  for (const [archetype, counts] of Object.entries(summary.by_archetype)) {
    lines.push(`| ${archetype} | ${counts.accepted} | ${counts.total} | ${percent(counts.accepted / counts.total)} |`);
  }
  lines.push('');
  lines.push('## Which rules the tool actually improved');
  lines.push('');
  if (Object.keys(summary.rules_improved).length === 0) lines.push('_No rule was improved in any pair: the tool changed nothing that the vector measures._');
  else {
    lines.push('| rule | pairs improved |');
    lines.push('| --- | --- |');
    for (const [rule, count] of Object.entries(summary.rules_improved)) lines.push(`| \`${rule}\` | ${count} |`);
  }
  lines.push('');
  lines.push('## Every pair');
  lines.push('');
  lines.push('| project | archetype | framework | defects seeded | rules improved | outcome |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const decision of decisions) {
    lines.push(
      `| \`${decision.project_id}\` | ${decision.archetype} | ${decision.framework} | ${(decision.seeded_defects ?? []).length} | ${decision.improved_rules.length} | ${decision.accepted ? '**accepted**' : `\`${decision.category}\``} |`,
    );
  }
  if (notes.length > 0) {
    lines.push('');
    lines.push('## Notes');
    lines.push('');
    for (const note of notes) lines.push(`- ${note}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
