import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { baselineAttributionLine } from './ruleset.mjs';
import { MODERN_RULE_IDS } from '../corpus/rules.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const validId = (value) => typeof value === 'string' && value.length > 0 && !/[/\\]|^\.|\.\./.test(value);
const measured = (status) => status === 'PASS' || status === 'FAIL';

/** Read measured pilot arms, never infer rule verdicts from the acceptance summary or uplift edits. */
export function readBenchmarkRun(runPath) {
  const dir = resolve(runPath);
  const yieldRecord = readJson(join(dir, 'yield.json'));
  if (!Array.isArray(yieldRecord.decisions) || !yieldRecord.run_id) throw new Error('benchmark: yield.json needs run_id and decisions');
  const committed = existsSync(join(dir, 'records.json')) ? readJson(join(dir, 'records.json')) : null;
  if (committed && (committed.run_id !== yieldRecord.run_id || !Array.isArray(committed.projects))) {
    throw new Error('benchmark: committed records and yield are not from the same measured run');
  }
  const committedById = new Map((committed?.projects ?? []).map((project) => [project.project_id, project]));
  if (committed && committedById.size !== committed.projects.length) throw new Error('benchmark: duplicate committed project');
  const seen = new Set();
  const rows = [];
  const darkRows = [];
  for (const decision of yieldRecord.decisions) {
    const id = decision.project_id;
    if (!validId(id) || seen.has(id)) throw new Error(`benchmark: invalid or duplicate project_id ${String(id)}`);
    seen.add(id);
    if (!decision.archetype || !decision.framework) throw new Error(`benchmark: ${id} has no archetype/framework`);
    // Current pilot is deterministic, not a trained model. New measured runs can supply a model
    // on their decision; never label this control as a real model from the project name.
    const model = decision.model ?? 'deterministic:no-model';
    if (typeof model !== 'string' || !model.trim()) throw new Error(`benchmark: ${id} has invalid model`);
    const arm = decision.arm ?? null;
    if (arm !== null && !['C1', 'C2', 'T'].includes(arm)) throw new Error(`benchmark: ${id} has unknown model arm`);
    const saved = committed?.projects && committedById.get(id);
    if (committed && (!saved || saved.original_sha !== decision.original_sha || saved.uplifted_sha !== decision.uplifted_sha)) {
      throw new Error(`benchmark: ${id} records and decision hashes do not match`);
    }
    if (saved && (!saved.original?.rules || !saved.uplifted?.rules)) throw new Error(`benchmark: ${id} has no committed rule verdicts`);
    const originalRecord = saved?.original ?? readJson(join(dir, id, 'original.json'));
    const upliftedRecord = saved?.uplifted ?? readJson(join(dir, id, 'uplifted.json'));
    const before = saved ? Object.entries(originalRecord.rules).map(([rule, status]) => ({ rule, status })) : originalRecord.rules;
    const after = saved ? Object.entries(upliftedRecord.rules).map(([rule, status]) => ({ rule, status })) : upliftedRecord.rules;
    if (!Array.isArray(before) || !Array.isArray(after)) throw new Error(`benchmark: ${id} has no measured rule arrays`);
    darkRows.push({ project_id: id, archetype: decision.archetype, model, arm,
      before: originalRecord.dark_mode?.status ?? null, after: upliftedRecord.dark_mode?.status ?? null });
    const toMap = (record) => {
      const map = new Map();
      for (const entry of record) {
        if (typeof entry.rule !== 'string' || !entry.rule.trim() || map.has(entry.rule)) throw new Error(`benchmark: ${id} has invalid or duplicate rule`);
        map.set(entry.rule, entry.status);
      }
      return map;
    };
    const pre = toMap(before);
    const post = toMap(after);
    for (const rule of new Set([...pre.keys(), ...post.keys()])) {
      rows.push({ archetype: decision.archetype, model, arm, rule,
        before: pre.get(rule) ?? null, after: post.get(rule) ?? null, project_id: id });
    }
  }
  if (committed && seen.size !== committedById.size) throw new Error('benchmark: committed records contain projects absent from yield');
  return { runId: yieldRecord.run_id, rows, darkRows, projects: seen.size };
}

function summarize(rows) {
  const comparable = rows.filter((row) => measured(row.before) && measured(row.after));
  const before = comparable.filter((row) => row.before === 'PASS').length;
  const after = comparable.filter((row) => row.after === 'PASS').length;
  return { before, after, comparable: comparable.length, unmeasured: rows.length - comparable.length,
    delta: after - before };
}

export function benchmarkOverview(run) {
  const group = (key) => [...new Set(run.rows.map((row) => row[key]))].sort().map((name) => ({
    name, ...summarize(run.rows.filter((row) => row[key] === name)),
  }));
  const darkRows = run.darkRows ?? [];
  const darkMode = [{ name: 'All projects', ...summarize(darkRows) },
    ...[...new Set(darkRows.map(({ archetype }) => archetype))].sort().map((name) => ({
      name, ...summarize(darkRows.filter(({ archetype }) => archetype === name)),
    }))];
  return { runId: run.runId, projects: run.projects, overall: summarize(run.rows),
    archetypes: group('archetype'), models: group('model'),
    arms: ['C1', 'C2', 'T'].map((name) => ({ name, ...summarize(run.rows.filter((row) => row.arm === name)) })),
    rules: [...group('rule'), ...MODERN_RULE_IDS.filter((id) => !run.rows.some((row) => row.rule === id))
      .map((name) => ({ name, ...summarize([]) }))].sort((a, b) => a.name.localeCompare(b.name)),
    darkMode };
}

export function renderBenchmarkMarkdown(report) {
  const score = (pass, n) => n ? `${(pass / n * 100).toFixed(1)}% (${pass}/${n})` : 'N/A';
  const table = (title, rows, checkLabel = 'Paired rule checks') => [
    `## ${title}`, '', `| Name | Pre score | Post score | Δ pass | ${checkLabel} | Unmeasured |`,
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| \`${row.name.replaceAll('|', '\\|')}\` | ${score(row.before, row.comparable)} | ${score(row.after, row.comparable)} | ${row.comparable ? `${row.delta >= 0 ? '+' : ''}${row.delta}` : 'N/A'} | ${row.comparable} | ${row.unmeasured} |`), '',
  ];
  const o = report.overall;
  return [
    `# Benchmark overview — ${report.runId}`, '', baselineAttributionLine(), '',
    `Measured projects: ${report.projects}. Pre: **${score(o.before, o.comparable)}** → post: **${score(o.after, o.comparable)}** (${o.comparable ? `${o.delta >= 0 ? '+' : ''}${o.delta}` : 'N/A'} change in passes).`, '',
    'Scores are PASS / paired PASS-or-FAIL rule checks from the same measured project and rule on both sides. ERROR, NOT_APPLICABLE, missing and unmatched verdicts are excluded from both denominators and counted as unmeasured; these are rule-adherence scores, not visual, functional, or model-quality scores. The deterministic pilot is not a trained-model benchmark. New platform-feature diagnostics are N/A on historical runs and do not change the preregistered acceptance gate.', '',
    ...table('Archetypes', report.archetypes),
    '## Sealed model arms', '', 'C1 = bare base; C2 = base + guidance prompt; T = trained adapter. N/A means no paired measurements were supplied for that arm, not a score of zero.', '',
    ...table('C1 / C2 / T', report.arms), ...table('Recorded model identities (including deterministic controls)', report.models), ...table('Guidance rules', report.rules),
    'Dark mode is a separate CDP-measured axis: emulated preference or a working theme toggle, computed root color-scheme, changed effective color tokens and sampled text contrast. Reference JPEGs are design illustrations, not proof of runtime behaviour. Missing, ERROR and unpaired verdicts are unmeasured, never passes.', '',
    ...table('Dark mode (CDP)', report.darkMode, 'Paired dark checks'),
  ].join('\n');
}
