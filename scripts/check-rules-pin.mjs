#!/usr/bin/env node
/**
 * Verify our committed rule vocabulary against web-uplift's pinned canonical ruleset.
 *
 *   node scripts/check-rules-pin.mjs [--rules docs/eval/rules.json] [--catalog <path>]
 *     [--require-catalog] [--skill-dir <installed skill dir>] [--json]
 *
 * Fails closed: a missing or unparsable rules file is a finding, not a stack trace, and an empty
 * vocabulary is a finding rather than a pass. Exit 0 means the vocabulary IS the pinned one.
 *
 * Why this can check the pin without the catalog: web-uplift publishes two hashes. One covers the
 * catalog file bytes (7931ac35...), which we can only verify when the file is here - and it is not in
 * this repo. The other is a set-identity hash over the sorted guide ids (bc041692...), and that IS
 * computable from our own vocabulary. The construction that reproduces it was identified by
 * measurement (see src/eval/ruleset.mjs), and web-uplift's own description in the journal - "recursive
 * key sort + compact JSON, UTF-8, and a SEPARATE set-identity hash over the sorted id list" - agrees
 * with it. So the id set is verified unconditionally, and the file pin is verified when available and
 * reported as NOT VERIFIED when not, never silently passed.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { checkRulesetPin, extractVocabulary, guideIdsHash, MWG_CANONICAL, readCatalog, ruleSetHash } from '../src/eval/ruleset.mjs';

function parseArgs(argv) {
  const args = { rules: 'docs/eval/rules.json', catalog: MWG_CANONICAL.file, requireCatalog: false, skillDir: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rules') args.rules = argv[++i];
    else if (argv[i] === '--catalog') args.catalog = argv[++i];
    else if (argv[i] === '--require-catalog') args.requireCatalog = true;
    else if (argv[i] === '--skill-dir') args.skillDir = argv[++i];
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`check-rules-pin: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.error('usage: node scripts/check-rules-pin.mjs [--rules <rules.json>] [--catalog <mwg-catalog.json>] [--require-catalog] [--skill-dir <dir>] [--json]');
  process.exit(0);
}

const findings = [];
const notes = [];

let rules = null;
try {
  rules = JSON.parse(readFileSync(args.rules, 'utf8'));
} catch (error) {
  findings.push({ code: 'RULES_UNREADABLE', message: `could not read ${args.rules}: ${error?.message ?? error}` });
}

const catalog = readCatalog(args.catalog);
if (rules) {
  for (const finding of checkRulesetPin(rules, {
    catalogBytes: catalog?.bytes,
    catalogPath: catalog?.path,
    requireCatalog: args.requireCatalog,
  })) {
    // A finding marked non-fatal is reported but does not fail the check: the catalog file is not in
    // this repo, so its absence is a stated limit of the check rather than a defect in the rules.
    if (finding.fatal === false) notes.push(finding);
    else findings.push(finding);
  }
}

// The installed skill is the source the snapshot was extracted from. When it is present, re-extracting
// must reproduce the committed vocabulary; when it is absent, that reproduction did not happen and the
// check says so instead of implying it did.
if (rules && args.skillDir) {
  try {
    const categories = extractVocabulary(args.skillDir);
    const installedHash = ruleSetHash(categories);
    if (installedHash !== rules.rule_set_hash) {
      findings.push({
        code: 'SKILL_DIR_MISMATCH',
        message: `the vocabulary installed at ${args.skillDir} hashes to ${installedHash}, but ${args.rules} pins ${rules.rule_set_hash ?? '(absent)'}; the snapshot is not the installed skill`,
      });
    }
    if (guideIdsHash(categories) !== MWG_CANONICAL.guideIdsSha256) {
      findings.push({
        code: 'SKILL_DIR_NOT_CANONICAL',
        message: `the installed skill at ${args.skillDir} is not the pinned canonical id set (${guideIdsHash(categories)} != ${MWG_CANONICAL.guideIdsSha256})`,
      });
    }
  } catch (error) {
    findings.push({ code: 'SKILL_DIR_UNREADABLE', message: `could not read a vocabulary from ${args.skillDir}: ${error?.message ?? error}` });
  }
} else if (rules) {
  notes.push({ code: 'SKILL_NOT_VERIFIED', message: 'no --skill-dir given, so the installed skill was not re-extracted; the pinned vocabulary was checked against the pin only' });
}

const report = {
  rules: args.rules,
  catalog: catalog ? args.catalog : null,
  canonical_guide_ids_sha256: MWG_CANONICAL.guideIdsSha256,
  canonical_catalog_sha256: MWG_CANONICAL.sha256,
  guides: rules ? Object.values(rules.categories ?? {}).flat().length : 0,
  findings: findings.length,
  notes: notes.map((n) => n.code),
};

if (args.json) {
  console.log(JSON.stringify({ ...report, findings_detail: findings, notes_detail: notes }, null, 2));
} else {
  for (const finding of findings) console.log(`FINDING ${finding.code} ${finding.message}`);
  for (const note of notes) console.log(`NOTE ${note.code} ${note.message}`);
}

if (findings.length) {
  console.error(`check-rules-pin: FAIL - ${findings.length} finding(s); our vocabulary is not the pinned canonical ruleset`);
  process.exit(1);
}
console.log(
  `check-rules-pin: PASS - ${report.guides} guide ids match ${MWG_CANONICAL.source} ${MWG_CANONICAL.file} (guideIdsSha256 ${MWG_CANONICAL.guideIdsSha256.slice(0, 16)}...)${
    catalog ? ` and the catalog file matches ${MWG_CANONICAL.sha256.slice(0, 16)}...` : '; catalog file not present, so its own sha256 was NOT verified'
  }`,
);
