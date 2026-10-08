#!/usr/bin/env node
/**
 * Turn a pilot run into a compact, committable record of what was actually measured.
 *
 * The report is committed and the evidence behind it was not: the journeys, the rule statuses and the
 * tree hashes lived only in the run directory, so no claim in the report could be checked from the
 * repository. This writes the parts worth checking - per project version, the journeys and their
 * observations, every rule and security status, and the tree hashes - at a size that belongs in git.
 *
 *   node scripts/pilot-records.mjs --run /tmp/pilot-v11/<run-id> --out docs/pilot/records.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { BASELINE_FIELDS } from '../src/eval/ruleset.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

/** The evidence a journey carried, without the raw page text. */
function journeySummary(journey) {
  const wanted = [
    'name', 'url', 'afterSubmit', 'status', 'landedStatus', 'posted', 'postedMethod', 'postedUrl',
    'persisted', 'submittedValue', 'readStatus', 'observedLength', 'echoed', 'echoedText', 'textLength',
    'stillOnForm', 'urlUnchanged', 'serverRefused', 'invalidCount', 'visibleErrors', 'path',
    'precondition', 'persistedText',
  ];
  const summary = {};
  for (const key of wanted) if (journey[key] !== undefined) summary[key] = journey[key];
  return summary;
}

function statusMap(entries) {
  const map = {};
  for (const entry of entries ?? []) map[entry.rule ?? entry.check] = entry.status;
  return map;
}

function summarizeVersion(record) {
  return {
    rules: statusMap(record.rules),
    security: statusMap(record.security),
    journeys: (record.journeys ?? []).map(journeySummary),
    errors: record.errors ?? [],
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.run || !args.out) {
  console.error('usage: pilot-records.mjs --run <run-directory> --out <file>');
  process.exit(2);
}

const runDir = args.run;
const yieldPath = join(runDir, 'yield.json');
let run;
try {
  run = JSON.parse(readFileSync(yieldPath, 'utf8'));
} catch (error) {
  console.error(`pilot-records: cannot read ${yieldPath}: ${error.message}`);
  process.exit(1);
}

const projectDirs = readdirSync(runDir)
  .filter((name) => statSync(join(runDir, name)).isDirectory())
  .sort();

// What is on disk must be what the run decided. A deleted project directory would otherwise be omitted
// silently, and the artefact would carry a full-run summary over a smaller set of projects.
const decided = run.decisions.map((decision) => decision.project_id).sort();
const missing = decided.filter((id) => !projectDirs.includes(id));
const extra = projectDirs.filter((id) => !decided.includes(id));
if (missing.length > 0 || extra.length > 0) {
  console.error(`pilot-records: refusing to write - decisions and directories disagree (missing ${missing.join(', ') || 'none'}; unexpected ${extra.join(', ') || 'none'})`);
  process.exit(1);
}

const projects = [];
for (const projectId of projectDirs) {
  const versions = {};
  for (const version of ['original', 'uplifted']) {
    const file = join(runDir, projectId, `${version}.json`);
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'));
      for (const journey of record.journeys ?? []) {
        // The reload assertion is made of the step's text length, the echoed value and its text; keep
        // them at a size that belongs in git, or the summary cannot show what the gate actually read.
        const steps = journey.steps ?? [];
        if (steps.length > 0) {
          // The last step is the reload, and it carries the assertion: the value that came back and how
          // much page text there was to find it in. Without these the persisted evidence is unreadable.
          journey.textLength = steps.at(-1).textLength ?? journey.textLength;
          journey.echoed = steps.at(-1).echoed ?? journey.echoed;
          journey.echoedText = steps.at(-1).echoedText ?? journey.echoedText;
          journey.persistedText = String(steps.at(-1).echoedText ?? steps.at(-1).echoed ?? '').slice(0, 160);
        }
      }
      versions[version] = summarizeVersion(record);
    } catch (error) {
      // Fail the export rather than writing null: an artefact that reports the full project count while
      // a version is missing looks complete, and a reader cannot tell which claims it covers.
      console.error(`pilot-records: cannot read ${file}: ${error.message}`);
      process.exit(1);
    }
  }
  projects.push({ project_id: projectId, ...versions });
}

const decision = new Map(run.decisions.map((entry) => [entry.project_id, entry]));
for (const project of projects) {
  const entry = decision.get(project.project_id);
  project.category = entry?.category ?? null;
  project.accepted = entry?.accepted ?? null;
  project.validation_observation = entry?.validation_observation ?? null;
  project.original_sha = entry?.original_sha ?? null;
  project.uplifted_sha = entry?.uplifted_sha ?? null;
}

const document = {
  ...BASELINE_FIELDS,
  run_id: run.run_id,
  generated_at: run.generated_at,
  summary: run.summary,
  note: 'Compact per-project evidence for docs/pilot/YIELD.md: journeys and observations, every rule and security status, and the measured tree hashes. Produced by scripts/pilot-records.mjs from a run directory.',
  projects,
};

writeFileSync(args.out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`pilot-records: wrote ${projects.length} projects to ${args.out}`);
void repoRoot;
