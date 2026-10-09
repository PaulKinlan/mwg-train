import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createViewer } from '../src/viewer/server.mjs';
import { loadTuningData, renderTuning } from '../src/viewer/tuning.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('workbench reads authored training variants and recorded templates without touching eval', () => {
  const data = loadTuningData(ROOT);
  assert.equal(data.families.size, 30);
  assert.equal(data.families.get('tr-01').length, 2);
  assert.equal(data.projects.length, 210);
  const html = renderTuning({ data, repoRoot: ROOT, familyId: 'tr-26', variant: 'v2', framework: 'hono' });
  assert.match(html, /tr-26-v2/);
  assert.match(html, /Compare the original authored prompts \(2 voices\)/);
  assert.match(html, /tr-26-v1/);
  assert.match(html, /tr-26-hono/);
  assert.match(html, /scaffolded from tr-26-v1/);
  assert.match(html, /mwg-train deterministic baseline/);
  assert.match(html, /\/tuning\/target\/tr-26\.png/);
  assert.match(html, /not a model-generated site/);
  assert.match(html, /Editing the prompt or settings below does not regenerate it/);
  assert.match(html, /name="temperature"/);
  assert.match(html, /name="max_tokens"/);
  assert.match(html, /name="seed"/);
  assert.doesNotMatch(html, /<script>.*fetch\(/s);
});

test('full-page targets use their actual dimensions, and absent records show honest empty evidence', (t) => {
  const data = loadTuningData(ROOT);
  assert.match(renderTuning({ data, repoRoot: ROOT, familyId: 'tr-02' }), /width="1280" height="1246"/);
  const empty = mkdtempSync(join(tmpdir(), 'viewer-tuning-missing-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const absent = loadTuningData(empty);
  assert.equal(absent.missing.length, 3);
  assert.match(renderTuning({ data: absent, repoRoot: empty }), /Missing committed training input: docs\/train\/briefs\/manifest.jsonl/);
});

test('untrusted prompt text is escaped and unknown family falls back to an authored training family', () => {
  const data = loadTuningData(ROOT);
  data.families.get('tr-01')[0] = { ...data.families.get('tr-01')[0], prompt: '<script>alert(1)</script>' };
  const html = renderTuning({ data, repoRoot: ROOT, familyId: '../../docs/eval', variant: 'v1', framework: 'raw' });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\/tuning\/target\/tr-01\.png/);
  assert.doesNotMatch(html, /\/tuning\/target\/\.\./);
});

test('tuning routes serve only fixed training targets, never eval targets or mutated drafts', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-tuning-'));
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT });
  t.after(() => { pool.stopAll(); server.close(); liveServer.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;
  const workbench = await fetch(`${base}/tuning?family=tr-27&variant=v1&framework=raw`);
  assert.equal(workbench.status, 200);
  assert.match(await workbench.text(), /tr-27-v1/);
  const asset = await fetch(`${base}/tuning/target/tr-27.png`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /image\/png/);
  assert.equal((await asset.arrayBuffer()).byteLength > 1000, true);
  assert.equal((await fetch(`${base}/tuning/target/fam-r01.png`)).status, 404);
  assert.equal((await fetch(`${base}/tuning/target/tr-27.json`)).status, 404);
  assert.equal((await fetch(`${base}/tuning`, { method: 'POST', body: 'prompt=secret' })).status, 404);
  const client = await fetch(`${base}/tuning/client.js`);
  assert.equal(client.status, 200);
  assert.match(await client.text(), /source_prompt/);
});

test('training target route refuses symlinked and non-file images', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-tuning-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'data/A1_self_generated/targets/tr-01');
  mkdirSync(dir, { recursive: true });
  const outside = join(root, 'outside.png');
  writeFileSync(outside, Buffer.from([137, 80, 78, 71]));
  const image = join(dir, 'target.png');
  symlinkSync(outside, image);
  const { server, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir: join(root, 'state'), repoRoot: root });
  t.after(() => { pool.stopAll(); server.close(); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const url = `http://127.0.0.1:${server.address().port}/tuning/target/tr-01.png`;
  assert.equal((await fetch(url)).status, 404);
  rmSync(image);
  mkdirSync(image);
  assert.equal((await fetch(url)).status, 404);
});
