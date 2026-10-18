import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readBenchmarkRun, benchmarkOverview, renderBenchmarkMarkdown } from '../src/eval/benchmark-report.mjs';

function fixture(t, projects) {
  const dir = mkdtempSync(join(tmpdir(), 'benchmark-report-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path, data) => writeFileSync(path, JSON.stringify(data));
  write(join(dir, 'yield.json'), { run_id: 'measured-1', decisions: projects.map(({ id, archetype, model }) => ({ project_id: id, archetype, framework: 'raw', ...(model ? { model } : {}) })) });
  for (const { id, before, after } of projects) {
    mkdirSync(join(dir, id));
    write(join(dir, id, 'original.json'), { rules: before });
    write(join(dir, id, 'uplifted.json'), { rules: after });
  }
  return dir;
}
const rule = (name, status) => ({ rule: name, status });

test('CLI summarizes only paired verdicts by archetype, model and guidance rule', (t) => {
  const dir = fixture(t, [
    { id: 'booking-raw', archetype: 'booking', before: [rule('forms/required', 'FAIL'), rule('a11y/label', 'PASS'), rule('forms/unknown', 'ERROR')], after: [rule('forms/required', 'PASS'), rule('a11y/label', 'PASS'), rule('forms/unknown', 'PASS')] },
    { id: 'catalogue-raw', archetype: 'catalogue', model: 'provider/model-a', before: [rule('forms/required', 'FAIL'), rule('a11y/label', 'PASS')], after: [rule('forms/required', 'FAIL'), rule('a11y/label', 'ERROR'), rule('new/rule', 'PASS')] },
  ]);
  const report = benchmarkOverview(readBenchmarkRun(dir));
  assert.deepEqual(report.overall, { before: 1, after: 2, comparable: 3, unmeasured: 3, delta: 1 });
  assert.deepEqual(report.archetypes.map(({ name, comparable }) => [name, comparable]), [['booking', 2], ['catalogue', 1]]);
  assert.deepEqual(report.models.map(({ name, comparable }) => [name, comparable]), [['deterministic:no-model', 2], ['provider/model-a', 1]]);
  assert.deepEqual(report.arms.map(({ name, comparable }) => [name, comparable]), [['C1', 0], ['C2', 0], ['T', 0]]);
  assert.deepEqual(report.rules.find(({ name }) => name === 'css/child-state-based-styling'), { name: 'css/child-state-based-styling', before: 0, after: 0, comparable: 0, unmeasured: 0, delta: 0, optional: true, recorded: false });
  assert.match(renderBenchmarkMarkdown(report), /`css\/child-state-based-styling` \(optional; not in headline\) \| N\/A \| N\/A \| N\/A \| 0 \| not recorded/);
  assert.deepEqual(report.rules.find(({ name }) => name === 'forms/required'), { name: 'forms/required', before: 0, after: 1, comparable: 2, unmeasured: 0, delta: 1, optional: false, recorded: true });
  assert.match(renderBenchmarkMarkdown(report), /Pre: \*\*33\.3% \(1\/3\)\*\* → post: \*\*66\.7% \(2\/3\)\*\*/);
  assert.match(renderBenchmarkMarkdown(report), /\| `booking` \| 50\.0% \(1\/2\) \| 100\.0% \(2\/2\) \| \+1 \| 2 \| 1 \|/,
    'archetype rows must keep their measured unmeasured count');
  assert.match(renderBenchmarkMarkdown(report), /mwg-train deterministic baseline/);
  const cli = spawnSync(process.execPath, ['scripts/benchmark-report.mjs', '--run', dir, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), report);
});

test('optional modern diagnostics never inflate the comparable historical headline', () => {
  const core = { archetype: 'booking', model: 'deterministic:no-model', arm: null, project_id: 'p1',
    rule: 'forms/required-field-feedback', before: 'PASS', after: 'PASS' };
  const optional = ['ui-behaviors/platform-controls-dismiss-dialog', 'ui-behaviors/declarative-dialog-popover-control',
    'css/size-aware-styling', 'ui-behaviors/same-document-transitions', 'css/child-state-based-styling'];
  const historical = benchmarkOverview({ runId: 'historical', projects: 1, rows: [core] });
  const fresh = benchmarkOverview({ runId: 'fresh', projects: 1, rows: [core, ...optional.map((rule) => ({ ...core, rule, after: 'FAIL' }))] });
  assert.deepEqual(fresh.overall, historical.overall);
  assert.deepEqual(fresh.archetypes, historical.archetypes);
  assert.deepEqual(fresh.models, historical.models);
  assert.deepEqual(fresh.arms, historical.arms);
  assert.deepEqual(fresh.diagnostics, { before: 5, after: 0, comparable: 5, unmeasured: 0, delta: -5 });
  assert.equal(historical.diagnostics.comparable, 0);
  assert.match(renderBenchmarkMarkdown(historical), /Optional diagnostics \(separate, not in headline\): pre N\/A → post N\/A; not recorded in this run\./);
  assert.doesNotMatch(renderBenchmarkMarkdown(historical), /0 unmeasured/);
  assert.ok(historical.rules.filter((row) => row.optional).every((row) => row.recorded === false));
  assert.ok(fresh.rules.filter((row) => row.optional).every((row) => row.recorded === true));
  assert.match(renderBenchmarkMarkdown(fresh), /Optional diagnostics \(separate, not in headline\): pre 100\.0% \(5\/5\) → post 0\.0% \(0\/5\); 0 unmeasured/);

  const partial = benchmarkOverview({ runId: 'partial', projects: 1, rows: [core,
    { ...core, rule: optional[0], after: 'FAIL' }, { ...core, rule: optional[1], after: 'ERROR' }] });
  assert.deepEqual(partial.overall, historical.overall);
  assert.match(renderBenchmarkMarkdown(partial), /1 recorded check unmeasured; 3 optional rules not recorded in this run/);
  assert.match(renderBenchmarkMarkdown(partial), /`ui-behaviors\/declarative-dialog-popover-control` \(optional; not in headline\) \| N\/A \| N\/A \| N\/A \| 0 \| 1/);
});

test('committed historical pilot joins only matching-run, matching-hash measurements', (t) => {
  const dir = fixture(t, [{ id: 'booking-raw', archetype: 'booking', before: [], after: [] }]);
  const yieldPath = join(dir, 'yield.json');
  writeFileSync(yieldPath, JSON.stringify({ run_id: 'measured-1', decisions: [{ project_id: 'booking-raw', archetype: 'booking', framework: 'raw', original_sha: 'pre', uplifted_sha: 'post' }] }));
  const records = { run_id: 'measured-1', projects: [{ project_id: 'booking-raw', original_sha: 'pre', uplifted_sha: 'post', original: { rules: { 'forms/required': 'FAIL' } }, uplifted: { rules: { 'forms/required': 'PASS' } } }] };
  writeFileSync(join(dir, 'records.json'), JSON.stringify(records));
  assert.equal(benchmarkOverview(readBenchmarkRun(dir)).overall.after, 1);
  records.run_id = 'other-run';
  writeFileSync(join(dir, 'records.json'), JSON.stringify(records));
  assert.throws(() => readBenchmarkRun(dir), /not from the same measured run/);
  records.run_id = 'measured-1'; records.projects[0].original_sha = 'other-tree';
  writeFileSync(join(dir, 'records.json'), JSON.stringify(records));
  assert.throws(() => readBenchmarkRun(dir), /hashes do not match/);
});

test('no measured pairs show N/A, not a made-up zero score', (t) => {
  const dir = fixture(t, [{ id: 'booking-raw', archetype: 'booking', before: [rule('a', 'ERROR')], after: [rule('a', 'NOT_APPLICABLE')] }]);
  const report = benchmarkOverview(readBenchmarkRun(dir));
  assert.equal(report.overall.comparable, 0);
  assert.match(renderBenchmarkMarkdown(report), /Pre: \*\*N\/A\*\* → post: \*\*N\/A\*\*/);
});

test('missing measurements and duplicate project/rule identities refuse instead of hiding gaps', (t) => {
  const dir = fixture(t, [{ id: 'booking-raw', archetype: 'booking', before: [rule('a', 'PASS')], after: [rule('a', 'PASS')] }]);
  rmSync(join(dir, 'booking-raw', 'uplifted.json'));
  assert.throws(() => readBenchmarkRun(dir), /ENOENT/);
  writeFileSync(join(dir, 'booking-raw', 'uplifted.json'), JSON.stringify({ rules: [rule('a', 'PASS'), rule('a', 'FAIL')] }));
  assert.throws(() => readBenchmarkRun(dir), /duplicate rule/);
  writeFileSync(join(dir, 'yield.json'), JSON.stringify({ run_id: 'x', decisions: [{ project_id: '../escape', archetype: 'x', framework: 'raw' }] }));
  assert.throws(() => readBenchmarkRun(dir), /invalid or duplicate project_id/);
});
