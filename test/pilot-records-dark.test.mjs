import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { benchmarkOverview, readBenchmarkRun } from '../src/eval/benchmark-report.mjs';

test('publishing a measured pilot run preserves the dark verdict through the committed-only /benchmark source', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pilot-publish-dark-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = join(root, 'run'); const published = join(root, 'published');
  mkdirSync(join(run, 'booking-raw'), { recursive: true }); mkdirSync(published);
  const decision = { project_id: 'booking-raw', archetype: 'booking', framework: 'raw', original_sha: 'before', uplifted_sha: 'after' };
  writeFileSync(join(run, 'yield.json'), JSON.stringify({ run_id: 'trusted-fixture', decisions: [decision] }));
  const rule = (status) => [{ rule: 'forms/required', status }];
  writeFileSync(join(run, 'booking-raw', 'original.json'), JSON.stringify({ rules: rule('PASS'),
    dark_mode: { status: 'FAIL', source: 'preference', observed: { minContrast: 2.5 } } }));
  writeFileSync(join(run, 'booking-raw', 'uplifted.json'), JSON.stringify({ rules: rule('PASS'),
    dark_mode: { status: 'PASS', source: 'toggle', observed: { minContrast: 5.3 } } }));
  const measured = benchmarkOverview(readBenchmarkRun(run));
  const exported = spawnSync(process.execPath, ['scripts/pilot-records.mjs', '--run', run, '--out', join(published, 'records.json')], { encoding: 'utf8' });
  assert.equal(exported.status, 0, exported.stderr);
  copyFileSync(join(run, 'yield.json'), join(published, 'yield.json'));
  const record = JSON.parse(readFileSync(join(published, 'records.json'), 'utf8'));
  assert.deepEqual(record.projects[0].original.dark_mode, { status: 'FAIL', source: 'preference', observed: { minContrast: 2.5 } });
  assert.deepEqual(record.projects[0].uplifted.dark_mode, { status: 'PASS', source: 'toggle', observed: { minContrast: 5.3 } });
  const committed = benchmarkOverview(readBenchmarkRun(published));
  assert.deepEqual(committed.darkMode, measured.darkMode);
  assert.equal(committed.darkMode[0].comparable, 1);
  assert.deepEqual(committed.overall, measured.overall, 'dark mode must not inflate the guidance score');
});

test('publishing an old run without dark observations keeps the committed dark score unmeasured', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-old-dark-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'site'), { recursive: true });
  writeFileSync(join(dir, 'yield.json'), JSON.stringify({ run_id: 'old', decisions: [{ project_id: 'site', archetype: 'booking', framework: 'raw', original_sha: 'x', uplifted_sha: 'y' }] }));
  for (const side of ['original', 'uplifted']) writeFileSync(join(dir, 'site', `${side}.json`), JSON.stringify({ rules: [] }));
  const out = join(dir, 'records.json');
  const published = spawnSync(process.execPath, ['scripts/pilot-records.mjs', '--run', dir, '--out', out], { encoding: 'utf8' });
  assert.equal(published.status, 0, published.stderr);
  assert.equal('dark_mode' in JSON.parse(readFileSync(out, 'utf8')).projects[0].original, false);
  assert.equal(benchmarkOverview(readBenchmarkRun(dir)).darkMode[0].unmeasured, 1);
});
