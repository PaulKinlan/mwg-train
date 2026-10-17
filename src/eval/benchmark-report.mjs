import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { baselineAttributionLine } from './ruleset.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const validId = (value) => typeof value === 'string' && value.length > 0 && !/[/\\]|^\.|\.\./.test(value);
const measured = (status) => status === 'PASS' || status === 'FAIL';

/** Read measured pilot arms, never infer rule verdicts from the acceptance summary or uplift edits. */
export function readBenchmarkRun(runPath) {
  const dir = resolve(runPath);
  const yieldRecord = readJson(join(dir, 'yield.json'));
  if (!Array.isArray(yieldRecord.decisions) || !yieldRecord.run_id) throw new Error('benchmark: yield.json needs run_id and decisions');
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
    const before = readJson(join(dir, id, 'original.json'));
    const after = readJson(join(dir, id, 'uplifted.json'));
    if (!Array.isArray(before.rules) || !Array.isArray(after.rules)) throw new Error(`benchmark: ${id} has no measured rule arrays`);
    const toMap = (record) => {
      const map = new Map();
      for (const entry of record.rules) {
        if (typeof entry.rule !== 'string' || !entry.rule.trim() || map.has(entry.rule)) throw new Error(`benchmark: ${id} has invalid or duplicate rule`);
        map.set(entry.rule, entry.status);
      }
      return map;
    };
    const pre = toMap(before);
    const post = toMap(after);
    for (const rule of new Set([...pre.keys(), ...post.keys()])) {
      rows.push({ archetype: decision.archetype, model, rule,
        before: pre.get(rule) ?? null, after: post.get(rule) ?? null, project_id: id });
    }
  }
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
  const group = (key) => [...new Set(run.rows.map((row) => row[key]))].sort().map((name) => ({
    name, ...summarize(run.rows.filter((row) => row[key] === name)),
  }));
  return { runId: run.runId, projects: run.projects, overall: summarize(run.rows),
    archetypes: group('archetype'), models: group('model'), rules: group('rule') };
}

export function renderBenchmarkMarkdown(report) {
  const score = (pass, n) => n ? `${(pass / n * 100).toFixed(1)}% (${pass}/${n})` : 'N/A';
  const table = (title, rows) => [
    `## ${title}`, '', '| Name | Pre score | Post score | Δ pass | Paired rule checks | Unmeasured |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| \`${row.name.replaceAll('|', '\\|')}\` | ${score(row.before, row.comparable)} | ${score(row.after, row.comparable)} | ${row.delta >= 0 ? '+' : ''}${row.delta} | ${row.comparable} | ${row.unmeasured} |`), '',
  ];
  const o = report.overall;
  return [
    `# Benchmark overview — ${report.runId}`, '', baselineAttributionLine(), '',
    `Measured projects: ${report.projects}. Pre: **${score(o.before, o.comparable)}** → post: **${score(o.after, o.comparable)}** (${o.delta >= 0 ? '+' : ''}${o.delta} passes).`, '',
    'Scores are PASS / paired PASS-or-FAIL rule checks from the same measured project and rule on both sides. ERROR, NOT_APPLICABLE, missing and unmatched verdicts are excluded from both denominators and counted as unmeasured; these are rule-adherence scores, not visual, functional, or model-quality scores. The deterministic pilot is not a trained-model benchmark.', '',
    ...table('Archetypes', report.archetypes), ...table('Models', report.models), ...table('Guidance rules', report.rules),
  ].join('\n');
}
