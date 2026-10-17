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
    const before = saved ? Object.entries(saved.original.rules).map(([rule, status]) => ({ rule, status })) : readJson(join(dir, id, 'original.json')).rules;
    const after = saved ? Object.entries(saved.uplifted?.rules ?? {}).map(([rule, status]) => ({ rule, status })) : readJson(join(dir, id, 'uplifted.json')).rules;
    if (!Array.isArray(before) || !Array.isArray(after)) throw new Error(`benchmark: ${id} has no measured rule arrays`);
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
  return { runId: yieldRecord.run_id, rows, projects: seen.size };
}

function summarize(rows) {
  const comparable = rows.filter((row) => measured(row.before) && measured(row.after));
  const before = comparable.filter((row) => row.before === 'PASS').length;
  const after = comparable.filter((row) => row.after === 'PASS').length;
  return { before, after, comparable: comparable.length, unmeasured: rows.length - comparable.length,
    delta: after - before };
}

export function benchmarkOverview(run) {
  // The historical headline counted only the original pilot vector. Newly introduced optional
  // diagnostics stay visible per rule, but cannot silently change its paired denominator.
  const optional = new Set(MODERN_RULE_IDS);
  const coreRows = run.rows.filter((row) => !optional.has(row.rule));
  const diagnosticRows = run.rows.filter((row) => optional.has(row.rule));
  const group = (key, rows) => [...new Set(rows.map((row) => row[key]))].sort().map((name) => ({
    name, ...summarize(rows.filter((row) => row[key] === name)),
  }));
  return { runId: run.runId, projects: run.projects, overall: summarize(coreRows),
    diagnostics: summarize(diagnosticRows),
    archetypes: group('archetype', coreRows), models: group('model', coreRows),
    arms: ['C1', 'C2', 'T'].map((name) => ({ name, ...summarize(coreRows.filter((row) => row.arm === name)) })),
    rules: [...group('rule', run.rows), ...MODERN_RULE_IDS.filter((id) => !run.rows.some((row) => row.rule === id))
      .map((name) => ({ name, ...summarize([]) }))].sort((a, b) => a.name.localeCompare(b.name)) };
}

export function renderBenchmarkMarkdown(report) {
  const score = (pass, n) => n ? `${(pass / n * 100).toFixed(1)}% (${pass}/${n})` : 'N/A';
  const table = (title, rows) => [
    `## ${title}`, '', '| Name | Pre score | Post score | Δ pass | Paired rule checks | Unmeasured |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| \`${row.name.replaceAll('|', '\\|')}\` | ${score(row.before, row.comparable)} | ${score(row.after, row.comparable)} | ${row.comparable ? `${row.delta >= 0 ? '+' : ''}${row.delta}` : 'N/A'} | ${row.comparable} | ${row.unmeasured} |`), '',
  ];
  const o = report.overall;
  const d = report.diagnostics;
  return [
    `# Benchmark overview — ${report.runId}`, '', baselineAttributionLine(), '',
    `Measured projects: ${report.projects}. Pre: **${score(o.before, o.comparable)}** → post: **${score(o.after, o.comparable)}** (${o.comparable ? `${o.delta >= 0 ? '+' : ''}${o.delta}` : 'N/A'} change in passes).`, '',
    'The headline, archetype, model and arm totals use the historical core rule vector. Optional modern-platform diagnostics are shown per rule but excluded from these totals, so adding them cannot alter the historical denominator. Scores are PASS / paired PASS-or-FAIL checks for the same project and rule on both sides. ERROR, NOT_APPLICABLE, missing and unmatched verdicts are unmeasured, not passes; this is rule adherence, not visual, functional, or model quality. The deterministic pilot is not a trained-model benchmark.', '',
    `Optional diagnostics (separate, not in headline): pre ${score(d.before, d.comparable)} → post ${score(d.after, d.comparable)}; ${d.unmeasured} unmeasured.`, '',
    ...table('Archetypes', report.archetypes),
    '## Sealed model arms', '', 'C1 = bare base; C2 = base + guidance prompt; T = trained adapter. N/A means no paired measurements were supplied for that arm, not a score of zero.', '',
    ...table('C1 / C2 / T', report.arms), ...table('Recorded model identities (including deterministic controls)', report.models), ...table('Guidance rules', report.rules),
  ].join('\n');
}
