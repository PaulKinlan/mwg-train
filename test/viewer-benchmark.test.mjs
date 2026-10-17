import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve('.');

test('benchmark route shows unavailable model arms until a measured run exists, then measured pre/post rules', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-benchmark-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const corpusRoot = join(dir, 'corpus');
  mkdirSync(corpusRoot);
  const { server, pool } = createViewer({ allowAnonymous: true, corpusRoot, stateDir: join(dir, 'state'), repoRoot: ROOT });
  t.after(() => { pool.stopAll(); server.close(); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/benchmark`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /No paired rule measurements/);
  assert.match(html, /C1 \/ C2 \/ T/);
  assert.match(html, /css\/child-state-based-styling/);
  assert.match(html, /ui-behaviors\/platform-controls-dismiss-dialog/);
  assert.match(html, /Dark mode \(CDP\)/);
  assert.match(html, /Missing or ERROR verdicts count as unmeasured/);
  assert.match(html, /N\/A/);

  const run = join(corpusRoot, 'out', 'run-1');
  mkdirSync(join(run, 'site-raw'), { recursive: true });
  writeFileSync(join(run, 'yield.json'), JSON.stringify({ run_id: 'run-1', decisions: [{ project_id: 'site-raw', archetype: 'booking', framework: 'raw', model: 'provider/model', arm: 'C1' }] }));
  writeFileSync(join(run, 'site-raw', 'original.json'), JSON.stringify({ rules: [{ rule: 'forms/required', status: 'FAIL' }], dark_mode: { status: 'FAIL' } }));
  writeFileSync(join(run, 'site-raw', 'uplifted.json'), JSON.stringify({ rules: [{ rule: 'forms/required', status: 'PASS' }], dark_mode: { status: 'PASS' } }));
  response = await fetch(`${base}/benchmark?run=run-1`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /0\.0% \(0\/1\)/);
  assert.match(html, /100\.0% \(1\/1\)/);
  assert.match(html, /forms\/required/);
  assert.match(html, /provider\/model/);
  const darkSection = html.split('<h2>Dark mode (CDP)</h2>')[1];
  assert.ok(darkSection, 'a measured run has a separate dark-mode table');
  assert.match(darkSection, /<th scope="row">All projects<\/th>/);
  assert.match(darkSection, /<th scope="row">booking<\/th>/);
  assert.match(darkSection, /0\.0% \(0\/1\)[\s\S]*100\.0% \(1\/1\)/);
  assert.equal((await fetch(`${base}/benchmark?run=..%2Fprivate`)).status, 404);
});
