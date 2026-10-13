import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { serializeSft, serializeFiles, projectSources, LORA_SHAPE_CONTEXT, CONSERVATIVE_TRAIN_CONTEXT } from '../src/train/serializer.mjs';
const sha = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const tokenizer = (total = 50) => ({ pinned: true, metadata: { source: 'fixture only' }, countBatch: (pairs) => pairs.map(() => ({ prompt: 20, total })) });
function fixture(edit = (row) => row) {
  const root = mkdtempSync(join(tmpdir(), 'mwg-sft-test-'));
  mkdirSync(join(root, 'project'));
  writeFileSync(join(root, 'prompt.txt'), 'Build a Hono service with a persisted form and server route.');
  writeFileSync(join(root, 'project', 'server.mjs'), 'export const app = "ok";\n');
  writeFileSync(join(root, 'project', 'package-lock.json'), 'DO-NOT-TRAIN');
  mkdirSync(join(root, 'docs', 'provenance', 'assets'), { recursive: true });
  writeFileSync(join(root, 'docs', 'provenance', 'assets', 'approved-asset.md'), 'Synthetic test approval; not a real training permission.\n');
  const target = serializeFiles(projectSources(join(root, 'project')));
  const row = edit({ brief_id: 'tr-01-v1', family_id: 'tr-01', split: 'train', project_id: 'tr-01-hono',
    arm: 'A1_self_generated', excluded_from_training: false, approved_for_training: true,
    approved_by: 'synthetic-test-fixture', approved_at: '2026-10-13T00:00:00Z',
    rights_ref: 'docs/provenance/assets/approved-asset.md', prompt_path: 'prompt.txt', project_dir: 'project',
    prompt_sha256: sha(readFileSync(join(root, 'prompt.txt'))), target_sha256: sha(target) });
  const manifestPath = join(root, 'approved.jsonl');
  writeFileSync(manifestPath, `${JSON.stringify(row)}\n`);
  return { root, row, manifestPath, outputPath: join(root, 'dataset.jsonl'), target };
}
const withFixture = (fn) => {
  const f = fixture();
  try { fn(f); } finally { rmSync(f.root, { recursive: true, force: true }); }
};

test('Python helper refuses missing pinned files before importing optional tokenizer dependencies', () => withFixture((f) => {
  const result = spawnSync('python3', ['scripts/count-deepseek-sft.py', f.root], {
    cwd: process.cwd(), input: JSON.stringify([[{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'ok' }]]), encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TOKENIZER_REFUSED/);
}));

test('Python helper rejects invented reasoning and any extra message keys before tokenizer work', () => {
  const code = `import json, runpy, sys\nrunpy.run_path('scripts/count-deepseek-sft.py')['validate_pairs'](json.load(sys.stdin))`;
  const count = (pair) => spawnSync('python3', ['-c', code], {
    cwd: process.cwd(), input: JSON.stringify([pair]), encoding: 'utf8', timeout: 10_000,
  });
  const user = { role: 'user', content: 'brief' }, assistant = { role: 'assistant', content: 'code' };
  assert.equal(count([user, assistant]).status, 0);
  for (const extra of [{ reasoning_content: 'SECRET TRACE' }, { tool_calls: [] }, { metadata: {} }]) {
    const result = count([user, { ...assistant, ...extra }]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /only role\/content/);
  }
});

test('CLI refuses a missing approved manifest/tokenizer instead of writing output', () => {
  const result = spawnSync(process.execPath, ['scripts/serialize-sft.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage:/);
});

test('approved disjoint manifest becomes deterministic Fireworks conversational JSONL with measured prompt and target', () => withFixture((f) => {
  const result = serializeSft({ ...f, tokenizer: tokenizer(50) });
  assert.equal(readFileSync(f.outputPath, 'utf8'), result.dataset);
  const pair = JSON.parse(result.dataset);
  assert.deepEqual(pair.messages.map((m) => m.role), ['user', 'assistant']);
  assert.match(pair.messages[0].content, /Build a Hono/);
  assert.match(pair.messages[1].content, /FILE "server.mjs" BYTES/);
  assert.doesNotMatch(pair.messages[1].content, /DO-NOT-TRAIN/);
  assert.deepEqual(result.report.pairs[0], { project_id: 'tr-01-hono', prompt_tokens: 20,
    target_tokens: 30, total_tokens: 50, char4_estimate: Math.round((pair.messages[0].content.length + pair.messages[1].content.length) / 4),
    over_262k: false, over_conservative_train_ctx: false });
  assert.equal(result.report.matched_row_char4.estimated_total, result.report.pairs[0].char4_estimate);
  assert.equal(result.report.dataset_sha256, sha(result.dataset));
  assert.equal(result.report.pair.max, 50);
}));

test('no missing approval, changed prompt, changed target, or held-out split can write a dataset', () => {
  for (const change of [
    (r) => { r.approved_for_training = false; },
    (r) => { r.excluded_from_training = true; },
    (r) => { delete r.approved_by; },
    (r) => { r.approved_by = '   '; },
    (r) => { delete r.approved_at; },
    (r) => { r.approved_at = '   '; },
    (r) => { r.rights_ref = 'docs/provenance/assets/does-not-exist.md'; },
    (r) => { r.prompt_sha256 = sha('old prompt'); },
    (r) => { r.target_sha256 = sha('old target'); },
    (r) => { r.split = 'eval'; },
    (r) => { r.family_id = 'cf-01'; },
  ]) {
    const f = fixture((r) => { change(r); return r; });
    try {
      assert.throws(() => serializeSft({ ...f, tokenizer: tokenizer() }), /NOT_APPROVED|PROMPT_DIGEST|TARGET_DIGEST|NOT_DISJOINT/);
      assert.equal(existsSync(f.outputPath), false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('source selection matches documented build/lock/readme exclusions but retains nested app spec.json', () => withFixture((f) => {
  const project = join(f.root, 'project');
  for (const dir of ['dist', 'build', '.next', 'out', 'coverage', '_site', 'target']) {
    mkdirSync(join(project, dir));
    writeFileSync(join(project, dir, 'generated.mjs'), 'DO-NOT-TRAIN');
  }
  for (const file of ['README.md', '.DS_Store', 'spec.json', 'npm-shrinkwrap.json']) {
    writeFileSync(join(project, file), 'DO-NOT-TRAIN');
  }
  assert.equal(serializeFiles(projectSources(project)), f.target, 'excluded files must not change the target digest');
  mkdirSync(join(project, 'src'));
  writeFileSync(join(project, 'src', 'spec.json'), '{"useful":true}\n');
  assert.match(serializeFiles(projectSources(project)), /FILE "src\/spec.json" BYTES/);
}));

test('a missing or symlinked rights record fails before output even with an approval flag', () => withFixture((f) => {
  const ref = join(f.root, f.row.rights_ref);
  rmSync(ref);
  assert.throws(() => serializeSft({ ...f, tokenizer: tokenizer() }), /NOT_APPROVED/);
  assert.equal(existsSync(f.outputPath), false);
  symlinkSync(join(f.root, 'prompt.txt'), ref);
  assert.throws(() => serializeSft({ ...f, tokenizer: tokenizer() }), /NOT_APPROVED/);
  assert.equal(existsSync(f.outputPath), false);
}));

test('both conservative trainCtx and 262K LoRA shape exceedances fail with exact measured counts, never truncate', () => withFixture((f) => {
  for (const n of [CONSERVATIVE_TRAIN_CONTEXT + 1, LORA_SHAPE_CONTEXT + 1]) {
    assert.throws(() => serializeSft({ ...f, tokenizer: tokenizer(n) }), (e) => e.message.includes('OVER_CONTEXT') &&
      e.message.includes(`"total_tokens":${n}`) && e.message.includes('"over_conservative_train_ctx":true'));
    assert.equal(existsSync(f.outputPath), false);
  }
}));

test('unverified tokenizer, escaping source, symlink and invalid token results fail closed', () => withFixture((f) => {
  assert.throws(() => serializeSft({ ...f, tokenizer: {} }), /TOKENIZER_UNVERIFIED/);
  assert.throws(() => serializeSft({ ...f, tokenizer: { ...tokenizer(), countBatch: () => [{ prompt: 10.5, total: 50 }] } }), /TOKEN_COUNT/);
  symlinkSync(join(f.root, 'prompt.txt'), join(f.root, 'project', 'leaked.txt'));
  assert.throws(() => serializeSft({ ...f, tokenizer: tokenizer() }), /SYMLINK_SOURCE/);
  assert.equal(existsSync(f.outputPath), false);
}));
