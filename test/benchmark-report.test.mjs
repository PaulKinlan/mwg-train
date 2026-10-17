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
  assert.deepEqual(report.rules.find(({ name }) => name === 'forms/required'), { name: 'forms/required', before: 0, after: 1, comparable: 2, unmeasured: 0, delta: 1 });
  assert.match(renderBenchmarkMarkdown(report), /Pre: \*\*33\.3% \(1\/3\)\*\* → post: \*\*66\.7% \(2\/3\)\*\*/);
  assert.match(renderBenchmarkMarkdown(report), /mwg-train deterministic baseline/);
  const cli = spawnSync(process.execPath, ['scripts/benchmark-report.mjs', '--run', dir, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), report);
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
