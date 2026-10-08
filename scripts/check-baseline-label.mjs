#!/usr/bin/env node
/**
 * Verify that every floor report we generate carries the attribution label.
 *
 *   node scripts/check-baseline-label.mjs [--json]
 *
 * Coord's decision (2026-10-08, bead mwg-train-6ek): we consume web-uplift's published ruleset, and
 * every floor artifact and report we produce must say 'mwg-train deterministic baseline' explicitly -
 * so nobody reads our deterministic mechanical floor as an official `web-uplift` result. This is the
 * enforced half of that decision; the pin check verifies the ruleset, this verifies the attribution.
 *
 * The registry below is the list of reports that state a floor. It is declared rather than discovered,
 * because a glob would quietly include a new report the day it is added and quietly exclude one that is
 * renamed - and a check whose scope drifts is a check that stops meaning anything. A file in the
 * registry that is missing is a FAILURE: the report we claim to check is not there to check.
 *
 * Two reports deliberately are NOT in the registry, and the reason matters more than the exclusion:
 *   docs/train/corpus/SERVED.md  reports which ROUTES a project serves. It is a measurement of the
 *     generated server, not a floor value, and it has no committed generator to carry the label - it
 *     was rendered ad hoc. If it is ever promoted to a floor report it needs a generator first.
 *   docs/train/briefs/manifest.jsonl  is the briefs corpus, not a floor result.
 * A floor value that reaches a new artifact without being listed here is a gap this check cannot see,
 * so the registry is reviewed whenever a report is added.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { BASELINE_LABEL } from '../src/eval/ruleset.mjs';

const REGISTRY = [
  'docs/eval/conformance/account-recovery-identity.md',
  'docs/eval/conformance/booking-identity.md',
  'docs/eval/conformance/catalogue-identity.md',
  'docs/eval/conformance/contact-lead-identity.md',
  'docs/eval/conformance/event-registration-identity.md',
  'docs/train/corpus/YIELD.md',
];

/**
 * Whether the report claims web-uplift's authorship. Two shapes: an ownership claim, and the phrase
 * "official web-uplift result" *unless it is negated* - because the label's own disclaimer uses exactly
 * that phrase and must not trip the check. Matching a negation needs the surrounding words, so this
 * scans each occurrence rather than using a lookahead that cannot express it.
 */
export function falseProvenance(text) {
  const ownership = text.match(/\bweb-uplift\s+(?:generated|produced|output|released)\b/i);
  if (ownership) return ownership[0];
  for (const match of text.matchAll(/official\s+web-uplift\s+result/gi)) {
    const before = text.slice(Math.max(0, match.index - 16), match.index).toLowerCase();
    if (!/\bnot\s+(?:an?\s+)?$/.test(before)) return match[0];
  }
  return null;
}

/**
 * Check a set of report paths. Exported so a test can point it at fixtures; the CLI passes REGISTRY.
 */
export function checkBaselineLabel(paths) {
  const findings = [];
  for (const path of paths) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      findings.push({ code: 'REPORT_MISSING', subject: path, message: `the report is registered but could not be read: ${error?.message ?? error}` });
      continue;
    }
    if (!text.includes(BASELINE_LABEL)) {
      findings.push({ code: 'LABEL_MISSING', subject: path, message: `does not contain the required label '${BASELINE_LABEL}'` });
      continue;
    }
    const claim = falseProvenance(text);
    if (claim) {
      findings.push({ code: 'FALSE_PROVENANCE', subject: path, message: `claims provenance it does not have: '${claim}'` });
    }
  }
  return findings;
}

const asJson = process.argv.includes('--json');

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = checkBaselineLabel(REGISTRY);
  if (asJson) {
    // Machine output is JSON and nothing else: a caller that parses it must not have to strip a
    // trailing human line. The failure detail still goes to stderr, which is not parsed.
    console.log(JSON.stringify({ label: BASELINE_LABEL, checked: REGISTRY.length, findings }, null, 2));
  } else {
    for (const finding of findings) console.log(`FINDING ${finding.code} ${finding.subject} ${finding.message}`);
  }
  if (findings.length) {
    console.error(`check-baseline-label: FAIL - ${findings.length} finding(s); a floor report is unattributed or misattributed`);
    process.exit(1);
  }
  if (!asJson) console.log(`check-baseline-label: PASS - ${REGISTRY.length} floor report(s) carry '${BASELINE_LABEL}'`);
}
