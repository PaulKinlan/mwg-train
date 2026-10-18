import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenerationPrompt, generateProject } from '../src/eval/generator.mjs';
import { buildOfflineCandidatePrompt, candidateInterfaceSha256, candidateInterfaceText } from '../src/eval/interface-candidate.mjs';
import { decodeConfig, decodeConfigSha256 } from '../src/eval/decode-config.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const repo = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/generate-candidate.mjs', import.meta.url));
const REVISION = '2cba9e42aa026125f3ed06c6d98c1db82f7ca027';

// No test uses a provider, the real spend ledger, generated app execution, or local machine state.
test('ratified tr-01 block and decode pins are binding §14 rows without changing the sealed briefs', () => {
  const prereg = readFileSync(join(repo, 'docs/eval/PREREGISTRATION.md'), 'utf8');
  const blockFile = readFileSync(join(repo, 'docs/eval/interface-contract.tr-01.candidate.md'), 'utf8');
  assert.equal(candidateInterfaceSha256, hash(candidateInterfaceText));
  assert.equal(candidateInterfaceSha256, '0faed7563e5e0b6df307f714b4e526fcd38ef719a4933d19d3f7ae5f967286e9');
  assert.ok(blockFile.includes(candidateInterfaceText));
  assert.ok(prereg.includes(`\`${candidateInterfaceSha256}\``));
  assert.ok(prereg.includes(`\`${decodeConfigSha256(decodeConfig.request)}\``));
  assert.match(prereg, /Paul selected Option A via coord relay 2026-10-18 23:14Z/);
  assert.match(prereg, /Paul ratified Option A\/decode config via coord relay 2026-10-18 23:14Z/);
  assert.match(prereg, /Supersede the previously named Fireworks inference route/);
  assert.match(prereg, /native DeepSeek integration `https:\/\/deepseek\.int\.exe\.xyz\/v1` with request model `deepseek-flash`/);
  assert.equal(decodeConfig.status.startsWith('ratified-owner-2026-10-18'), true);
});

test('all generation arms receive the identical candidate interface suffix without leaking C2 guidance', () => {
  const plan = 'One synthetic functional booking plan.';
  const design = 'One synthetic visual design.';
  for (const arm of ['default', 'c1', 'c2', 'c3', 't']) {
    const guidance = arm === 'c2' ? 'C2-only guidance token' : '';
    const prompt = buildOfflineCandidatePrompt({ plan, design, arm, guidance });
    assert.equal(prompt, `${buildGenerationPrompt({ plan, design, arm, guidance }).trimEnd()}\n\nEvaluator interface contract (identical for every arm):\n${candidateInterfaceText}`);
    assert.equal(prompt.slice(prompt.indexOf('Evaluator interface contract (identical for every arm):')),
      `Evaluator interface contract (identical for every arm):\n${candidateInterfaceText}`);
    assert.equal(prompt.includes('C2-only guidance token'), arm === 'c2');
    assert.match(prompt, /GET \/api\/records/);
    assert.match(prompt, /GET \/api\/record\/\{ref\}/);
    assert.match(prompt, /document\.body\.innerText/);
    assert.match(prompt, /POST \/book/);
  }
  assert.throws(() => buildOfflineCandidatePrompt({ plan, design, arm: 'default', guidance: 'C2-only' }),
    (error) => error.code === 'SET_SEPARATION');
});

test('live runner dry-run uses the identical ratified block and decode pin for every tr-01 arm, refusing other families', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-ratified-interface-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const family of ['tr-01', 'tr-02']) {
    const input = join(dir, 'docs/train/design', family);
    mkdirSync(input, { recursive: true });
    writeFileSync(join(input, 'plan.md'), 'Synthetic functional plan.');
    writeFileSync(join(input, 'design.md'), 'Synthetic visual design.');
  }
  const outRoot = join(dir, 'never-created');
  const suffix = `Evaluator interface contract (identical for every arm):\n${candidateInterfaceText}`;
  let fetchCalls = 0;
  for (const arm of ['default', 'c1', 'c2', 'c3', 't']) {
    const guidance = arm === 'c2' ? 'C2-only guidance token' : '';
    const result = await generateProject({ family: 'tr-01', framework: 'hono', revision: REVISION,
      arm, guidance, backend: 'live', dryRun: true, sourceRoot: dir, outRoot });
    assert.equal(result.status, 'DRY_RUN');
    assert.equal(result.interface_contract_sha256, candidateInterfaceSha256);
    assert.equal(result.decode_config_sha256, decodeConfigSha256(decodeConfig.request));
    assert.ok(result.build_key.endsWith(decodeConfigSha256(decodeConfig.request)));
    assert.equal(result.prompt.slice(result.prompt.indexOf('Evaluator interface contract (identical for every arm):')), suffix);
    assert.equal(result.prompt_sha256, hash(result.prompt));
    assert.equal(result.prompt.includes('C2-only guidance token'), arm === 'c2');
  }
  const denied = await generateProject({ family: 'tr-02', framework: 'hono', revision: REVISION,
    backend: 'live', endpoint: 'https://example.invalid/v1/chat/completions', apiKey: 'fake-key',
    ledgerPath: join(dir, 'unused-ledger.json'), sourceRoot: dir, outRoot,
    fetchImpl: async () => { fetchCalls++; throw new Error('provider must not be called'); },
    approvalComments: () => { throw new Error('unratified family must refuse before authority lookup'); } });
  assert.equal(denied.status, 'FAILED');
  assert.equal(denied.error.code, 'UNRATIFIED_INTERFACE');
  assert.equal(fetchCalls, 0);
  assert.equal(existsSync(outRoot), false);
});

test('offline CLI previews a pinned prompt and rejects paid flags without allocating any output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-interface-candidate-'));
  try {
    const input = join(dir, 'docs/train/design/tr-01');
    mkdirSync(input, { recursive: true });
    writeFileSync(join(input, 'plan.md'), 'Synthetic functional plan.');
    writeFileSync(join(input, 'design.md'), 'Synthetic visual design.');
    const argv = [SCRIPT, '--family', 'tr-01', '--framework', 'hono', '--revision', REVISION,
      '--source', dir, '--dry-run', 'true'];
    const result = JSON.parse(execFileSync(process.execPath, argv, { cwd: repo, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, DEEPSEEK_API_KEY: 'DO-NOT-USE-FAKE-KEY', DEEPSEEK_BASE_URL: 'https://deepseek.int.exe.xyz/v1' } }));
    assert.equal(result.status, 'RATIFIED_OFFLINE_PREVIEW');
    assert.equal(result.ratified, true);
    assert.equal(result.provider_requests, 0);
    assert.equal(result.interface_contract_sha256, candidateInterfaceSha256);
    assert.equal(result.decode_config_sha256, decodeConfigSha256(decodeConfig.request));
    assert.equal(result.prompt_sha256, hash(result.prompt));
    assert.equal(result.prompt.includes('DO-NOT-USE-FAKE-KEY'), false);
    assert.equal(existsSync(join(dir, '.generated-runs')), false);
    const denied = spawnSync(process.execPath, [...argv, '--live', 'true'], { cwd: repo, encoding: 'utf8', timeout: 10_000 });
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /CANDIDATE_OFFLINE_ONLY:.*--live is forbidden/);
    assert.equal(denied.stdout, '');
    assert.equal(existsSync(join(dir, '.generated-runs')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
