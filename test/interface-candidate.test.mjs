import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenerationPrompt } from '../src/eval/generator.mjs';
import { buildOfflineCandidatePrompt, candidateInterfaceSha256, candidateInterfaceText } from '../src/eval/interface-candidate.mjs';
import { decodeConfig, decodeConfigSha256 } from '../src/eval/decode-config.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const repo = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/generate-candidate.mjs', import.meta.url));
const REVISION = '2cba9e42aa026125f3ed06c6d98c1db82f7ca027';

// No test uses a provider, the real spend ledger, generated app execution, or local machine state.
test('candidate block and decode pins are explicit pending §14 rows, not an adopted deviation', () => {
  const prereg = readFileSync(join(repo, 'docs/eval/PREREGISTRATION.md'), 'utf8');
  const blockFile = readFileSync(join(repo, 'docs/eval/interface-contract.tr-01.candidate.md'), 'utf8');
  assert.equal(candidateInterfaceSha256, hash(candidateInterfaceText));
  assert.equal(candidateInterfaceSha256, '0faed7563e5e0b6df307f714b4e526fcd38ef719a4933d19d3f7ae5f967286e9');
  assert.ok(blockFile.includes(candidateInterfaceText));
  assert.ok(prereg.includes(`\`${candidateInterfaceSha256}\``));
  assert.ok(prereg.includes(`\`${decodeConfigSha256(decodeConfig.request)}\``));
  assert.match(prereg, /Candidate rows awaiting Paul's ratification — NOT part of the binding log/);
  assert.equal(decodeConfig.status.startsWith('proposed-offline'), true);
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
      env: { ...process.env, FIREWORKS_API_KEY: 'DO-NOT-USE-FAKE-KEY', FIREWORKS_BASE_URL: 'https://example.invalid/v1/chat/completions' } }));
    assert.equal(result.status, 'CANDIDATE_OFFLINE_ONLY');
    assert.equal(result.ratified, false);
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
