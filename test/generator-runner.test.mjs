import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, rmdirSync, mkdirSync, cpSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { generateProject, buildGenerationPrompt, parseProjectFiles, streamCompletion, rethrowLiveRecoveryMkdirError, nativeCompletionEndpoint, NATIVE_DEEPSEEK_BASE_URL } from '../src/eval/generator.mjs';
import { GENERATION_BEAD, verifyGenerationApproval, worstCaseGenerationUsd, reserveGeneration, settleGeneration } from '../src/eval/spend-ledger.mjs';
import { decodeConfig, pinnedEvaluationBuildKey } from '../src/eval/decode-config.mjs';

const REVISION = '2cba9e42aa026125f3ed06c6d98c1db82f7ca027';
const MODEL = decodeConfig.build_model;
const root = () => mkdtempSync(join(tmpdir(), 'mwg-generator-'));
const options = (outRoot, extra = {}) => ({ family: 'tr-01', framework: 'hono', model: MODEL,
  revision: REVISION, outRoot, ...extra });
const canned = (content, finish = 'stop') => ({ choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 19, completion_tokens: 42, completion_tokens_details: { reasoning_tokens: 10 } } });
const project = (marker) => JSON.stringify({ files: [
  { path: 'server.mjs', content: "throw new Error('never execute generated code')" },
  { path: 'package.json', content: JSON.stringify({ scripts: { postinstall: `touch ${marker}` } }) },
] });

test('offline stub writes inert files and a complete build-keyed run record; resumed runs reuse it', async () => {
  const dir = root();
  try {
    const marker = join(dir, 'postinstall-was-executed');
    const first = await generateProject(options(dir, { canned: canned(project(marker)), chromeVersion: 'UNVERIFIED' }));
    assert.equal(first.status, 'SUCCESS');
    assert.equal(first.build_key, pinnedEvaluationBuildKey({ projectId: 'tr-01-hono' }),
      'transport streaming must not change the evaluator-pinned decode identity');
    assert.equal(first.content_tokens, 32);
    assert.equal(first.reasoning_tokens, 10);
    assert.equal(first.finish_reason, 'stop');
    assert.equal(first.projected_cost_usd, 'UNVERIFIED');
    assert.ok(first.prompt.includes('Functional plan:') && first.prompt.includes('Visual design contract'));
    assert.match(first.prompt, /Visual composition requirement:[\s\S]*hero\/media[\s\S]*generic form-only layout/);
    assert.match(first.prompt, /substantial service hero[\s\S]*tune-up package cards[\s\S]*booking surface/,
      'the tr-01 text design must carry the authored reference composition into offline generation');
    assert.match(first.prompt, /Reference JPEGs are illustrative design assets, not supplied model inputs/);
    assert.equal(readFileSync(join(first.project_dir, 'server.mjs'), 'utf8'), "throw new Error('never execute generated code')");
    assert.ok(!existsSync(marker));
    const record = JSON.parse(readFileSync(join(first.output_dir, 'run.json'), 'utf8'));
    assert.equal(record.status, 'SUCCESS');
    assert.equal(record.caller_supplied_revision, REVISION);
    assert.equal(record.resolved_revision, 'UNVERIFIED', 'a caller-supplied HF hash is not native-provider attestation');
    assert.ok(record.prompt_sha256 && record.node_version && record.platform);
    assert.equal((await generateProject(options(dir, { canned: canned(project(marker)) }))).resumed, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI generates an offline project and resumes a batch without paid calls', () => {
  const dir = root();
  const repo = fileURLToPath(new URL('..', import.meta.url));
  try {
    const script = fileURLToPath(new URL('../scripts/generate.mjs', import.meta.url));
    const batch = join(dir, 'batch.json');
    writeFileSync(batch, JSON.stringify([{ family: 'tr-01', framework: 'hono' }, { family: 'tr-01', framework: 'react' }]));
    const args = [script, '--batch', batch, '--source', repo, '--model', MODEL, '--revision', REVISION, '--out', join(dir, 'runs')];
    const first = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 15_000 }));
    assert.equal(first.length, 2);
    assert.ok(first.every((entry) => entry.status === 'SUCCESS'));
    const again = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 15_000 }));
    assert.deepEqual(again.map((entry) => entry.status), ['SUCCESS', 'SUCCESS']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('dry-run produces a keyed prompt without writing an app or requiring spend authority', async () => {
  const dir = root();
  try {
    const result = await generateProject(options(join(dir, 'not-created'), { backend: 'live', dryRun: true,
      apiKey: undefined, approvalComments: () => { throw Error('auth must not be read'); } }));
    assert.equal(result.status, 'DRY_RUN');
    assert.equal(existsSync(result.output_dir), false);
    assert.ok(result.prompt_sha256);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('length with empty content is a recorded failed run, with no app directory', async () => {
  const dir = root();
  try {
    const result = await generateProject(options(dir, { canned: canned('', 'length') }));
    assert.equal(result.status, 'FAILED');
    assert.equal(result.finish_reason, 'length');
    assert.equal(result.error.code, 'EMPTY_LENGTH');
    assert.equal(existsSync(result.project_dir), false);
    assert.equal(JSON.parse(readFileSync(join(result.output_dir, 'run.json'), 'utf8')).status, 'FAILED');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('visual composition instruction is arm-neutral; sealed targets and image bytes are not inputs', () => {
  const inputs = { plan: 'Book a bicycle service', design: 'Hero beside package cards and booking controls' };
  for (const arm of ['default', 'c1', 'c2', 'c3', 't']) {
    const prompt = buildGenerationPrompt({ ...inputs, arm, ...(arm === 'c2' ? { guidance: 'Rule 1' } : {}) });
    assert.match(prompt, /Visual composition requirement: Follow the authored design/);
    assert.match(prompt, /Reference JPEGs are illustrative design assets, not supplied model inputs/);
    assert.match(prompt, /A1\/A6 conformance targets are separate evaluation instruments/);
    assert.ok(prompt.includes(inputs.design));
  }
});

test('default/C1/C3/T prompts never accept guidance; C2 requires it', () => {
  for (const arm of ['default', 'c1', 'c3', 't']) {
    assert.throws(() => buildGenerationPrompt({ plan: 'plan', design: 'design', arm, guidance: 'MWG uplift rules' }), (error) => error.code === 'SET_SEPARATION');
    assert.ok(!buildGenerationPrompt({ plan: 'plan', design: 'design', arm }).includes('MWG'));
  }
  assert.throws(() => buildGenerationPrompt({ plan: 'plan', design: 'design', arm: 'c2' }), (error) => error.code === 'MISSING_GUIDANCE');
  assert.match(buildGenerationPrompt({ plan: 'plan', design: 'design', arm: 'c2', guidance: 'Rule 1' }), /Rule 1/);
});

test('untrusted file paths and duplicate files are rejected before writing anything', () => {
  for (const path of ['../secret', '/tmp/evil', '.git/config', 'x/../server', 'x\\path', 'x//y']) {
    assert.throws(() => parseProjectFiles(JSON.stringify({ files: [{ path, content: 'bad' }] })), (error) => error.code === 'UNSAFE_OUTPUT');
  }
  assert.throws(() => parseProjectFiles(JSON.stringify({ files: [{ path: 'a', content: '1' }, { path: 'a', content: '2' }] })));
});

test('closed no-cap owner decision permits scoped generation without a tariff; cost stays UNVERIFIED', async () => {
  const dir = root(); let calls = 0; let posted;
  try {
    const approval = { decision: { id: GENERATION_BEAD, status: 'closed', close_reason:
      "Owner decision recorded from chat (2026-10-13): 're: 2 - no spend caps, I am ok.' Live DeepSeek V4.1 Flash generation authorised without a dollar cap; log actual usage/spend." }, comments: [] };
    const live = await generateProject(options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'TOP-SECRET-KEY', ledgerPath: join(dir, 'ledger.jsonl'), approvalComments: () => approval,
      fetchImpl: async (url, init) => {
        calls += 1;
        posted = { url, body: JSON.parse(init.body) };
        assert.equal(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').length, 1,
          'durable reservation must be on disk before the mock provider is contacted');
        return { ok: true, body: Readable.from([Buffer.from(
        `data: ${JSON.stringify({ model: 'deepseek-flash', choices: [{ delta: { content: JSON.stringify({ files: [{ path: 'index.html', content: '<p>inert</p>' }] }) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 19, completion_tokens: 42, completion_tokens_details: { reasoning_tokens: 10 } } })}\n\ndata: [DONE]\n\n`)]), status: 200 };
      },
    }));
    assert.equal(calls, 1);
    assert.equal(posted.url, 'https://deepseek.int.exe.xyz/v1/chat/completions');
    assert.equal(posted.body.model, 'deepseek-flash');
    assert.equal(posted.body.reasoning_effort, 'high');
    assert.equal(posted.body.max_tokens, 65536);
    assert.equal(posted.body.stream, true);
    assert.equal(live.status, 'SUCCESS');
    assert.equal(live.provider_response_model, 'deepseek-flash');
    assert.equal(live.resolved_revision, 'UNVERIFIED');
    assert.equal(live.computed_cost_usd, 'UNVERIFIED');
    assert.equal(live.reasoning_tokens, 10);
    assert.equal(live.raw_response_file, 'model-response.txt');
    const raw = readFileSync(join(live.output_dir, live.raw_response_file), 'utf8');
    assert.equal(live.raw_response_sha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(live.raw_response_bytes, Buffer.byteLength(raw));
    const ledger = readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].reservedUsd, 'UNVERIFIED');
    assert.equal(ledger[1].computedUsd, 'UNVERIFIED');
    assert.equal(ledger[1].tokens.prompt, 19);
    assert.ok(!readFileSync(join(live.output_dir, 'run.json'), 'utf8').includes('TOP-SECRET-KEY'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('native DeepSeek rejects wrong origins and credential-bearing URLs before allocation or authority lookup', async () => {
  assert.equal(nativeCompletionEndpoint(`${NATIVE_DEEPSEEK_BASE_URL}/`), `${NATIVE_DEEPSEEK_BASE_URL}/chat/completions`);
  let streamCalls = 0;
  await assert.rejects(streamCompletion({ endpoint: 'https://evil.example/v1/chat/completions',
    apiKey: 'FAKE_KEY', payload: {}, fetchImpl: () => { streamCalls++; throw Error('key forwarded'); } }),
  (error) => error.code === 'NO_PROVIDER_CONFIG');
  assert.equal(streamCalls, 0, 'even direct stream callers cannot forward a key off origin');
  for (const baseUrl of ['https://evil.example/v1', 'http://deepseek.int.exe.xyz/v1',
    'https://user:pass@deepseek.int.exe.xyz/v1', 'https://deepseek.int.exe.xyz/v1?key=secret',
    'https://deepseek.int.exe.xyz/v1/chat/completions']) {
    assert.throws(() => nativeCompletionEndpoint(baseUrl), (error) => error.code === 'NO_PROVIDER_CONFIG');
  }
  const dir = root(); let calls = 0;
  try {
    const refused = await generateProject(options(join(dir, 'out'), { backend: 'live',
      endpoint: 'https://evil.example/v1/chat/completions', apiKey: 'FAKE_KEY', ledgerPath: join(dir, 'ledger.jsonl'),
      approvalComments: () => { throw new Error('authority lookup must not run'); },
      fetchImpl: () => { calls++; throw new Error('fake fetch saw a paid key'); } }));
    assert.equal(refused.status, 'FAILED');
    assert.equal(refused.error.code, 'NO_PROVIDER_CONFIG');
    assert.equal(calls, 0, 'an injected fetch cannot bypass the pinned origin or receive the key');
    assert.equal(existsSync(refused.output_dir), false);
    assert.equal(existsSync(join(dir, 'ledger.jsonl')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an injected fetch cannot exfiltrate a fake key even with a test-only approved decode config', async () => {
  const dir = root(); let calls = 0;
  try {
    const fixture = join(dir, 'fixture');
    mkdirSync(join(fixture, 'docs/eval'), { recursive: true });
    mkdirSync(join(fixture, 'docs/train/design/tr-01'), { recursive: true });
    cpSync(fileURLToPath(new URL('../src/eval', import.meta.url)), join(fixture, 'src/eval'), { recursive: true });
    const docs = fileURLToPath(new URL('../docs/eval/', import.meta.url));
    copyFileSync(join(docs, 'interface-contract.tr-01.candidate.md'), join(fixture, 'docs/eval/interface-contract.tr-01.candidate.md'));
    const config = JSON.parse(readFileSync(join(docs, 'decode-config.deepseek-flash.json'), 'utf8'));
    config.status = 'ratified-owner-TEST-FIXTURE-ONLY'; // no actual owner decision is implied
    writeFileSync(join(fixture, 'docs/eval/decode-config.deepseek-flash.json'), JSON.stringify(config));
    writeFileSync(join(fixture, 'docs/train/design/tr-01/plan.md'), 'Synthetic plan');
    writeFileSync(join(fixture, 'docs/train/design/tr-01/design.md'), 'Synthetic design');
    const isolated = await import(pathToFileURL(join(fixture, 'src/eval/generator.mjs')).href);
    const ledgerPath = join(dir, 'never-created-ledger.jsonl');
    const denied = await isolated.generateProject({ family: 'tr-01', framework: 'hono', model: config.build_model,
      revision: REVISION, sourceRoot: fixture, outRoot: join(dir, 'runs'), backend: 'live',
      endpoint: 'https://evil.example/v1/chat/completions', apiKey: 'FAKE-NON-SECRET-KEY', ledgerPath,
      approvalComments: () => { throw new Error('authority lookup must not run for bad origin'); },
      fetchImpl: (_url, _init) => { calls++; throw new Error('fake key forwarded'); } });
    assert.equal(denied.status, 'FAILED');
    assert.equal(denied.error.code, 'NO_PROVIDER_CONFIG');
    assert.equal(calls, 0);
    assert.equal(existsSync(ledgerPath), false);
    assert.equal(existsSync(denied.output_dir), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid paid JSON remains a private raw artifact and cannot be retried', async () => {
  const dir = root(); let calls = 0;
  try {
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'FAKE_KEY', ledgerPath: join(dir, 'ledger.jsonl'), approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([
        Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: 'not json' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`),
      ]) }; } });
    const first = await generateProject(args);
    assert.equal(first.status, 'FAILED');
    assert.equal(first.error.code, 'INVALID_OUTPUT');
    assert.equal(readFileSync(join(first.output_dir, 'model-response.txt'), 'utf8'), 'not json');
    assert.equal(first.raw_response_sha256, createHash('sha256').update('not json').digest('hex'));
    assert.equal(existsSync(first.project_dir), false);
    assert.equal(calls, 1);
    const ledger = readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(ledger.map((row) => row.type), ['reserve', 'settle']);
    assert.equal(ledger[1].status, 'unknown');
    const second = await generateProject(args);
    assert.equal(second.status, 'FAILED');
    assert.equal(second.error.code, 'SPEND_GUARD');
    assert.equal(calls, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an offline stub cannot masquerade as a resumed live provider response', async () => {
  const dir = root(); let calls = 0;
  try {
    const base = options(dir);
    const stub = await generateProject(base);
    assert.equal(stub.backend, 'stub');
    const body = `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ files: [
      { path: 'index.html', content: '<p>Mock model response</p>' },
    ] }) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 8 } } })}\n\ndata: [DONE]\n\n`;
    const live = await generateProject({ ...base, backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath: join(dir, 'ledger.jsonl'), approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([Buffer.from(body)]) }; } });
    assert.equal(live.status, 'SUCCESS');
    assert.equal(live.backend, 'live');
    assert.equal(live.resumed, undefined);
    assert.equal(calls, 1, 'a live request must not reuse the stub page');
    assert.notEqual(live.output_dir, stub.output_dir);
    assert.equal(readFileSync(join(live.project_dir, 'index.html'), 'utf8'), '<p>Mock model response</p>');
    assert.equal(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deleting paid artifacts cannot resend the same live identity; distinct arms and changed prompts remain separate', async () => {
  const dir = root(); let calls = 0;
  try {
    const ledgerPath = join(dir, 'ledger.jsonl');
    const data = JSON.stringify({ files: [{ path: 'index.html', content: '<p>Inert model output</p>' }] });
    const events = `data: ${JSON.stringify({ choices: [{ delta: { content: data }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 19, completion_tokens: 42, completion_tokens_details: { reasoning_tokens: 10 } } })}\n\ndata: [DONE]\n\n`;
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath, approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([Buffer.from(events)]) }; } });
    const first = await generateProject(args);
    assert.equal(first.status, 'SUCCESS');
    assert.equal(calls, 1);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 2);
    rmSync(first.output_dir, { recursive: true, force: true }); // operator removed the only artifact record
    const duplicate = await generateProject(args);
    assert.equal(duplicate.status, 'FAILED');
    assert.equal(duplicate.error.code, 'SPEND_GUARD');
    assert.match(duplicate.error.message, /duplicate call/);
    assert.equal(calls, 1, 'the private ledger remembers a charged identity after its artifacts vanish');
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 2);
    const otherArm = await generateProject({ ...args, arm: 'c1' });
    assert.equal(otherArm.status, 'SUCCESS');
    assert.equal(calls, 2, 'a separate arm is an intentionally distinct generation');
    assert.notEqual(otherArm.request_id, first.request_id);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 4);
    const sourceRoot = join(dir, 'changed-source');
    const designDir = join(sourceRoot, 'docs/train/design/tr-01');
    mkdirSync(designDir, { recursive: true });
    const plan = readFileSync(new URL('../docs/train/design/tr-01/plan.md', import.meta.url), 'utf8');
    const design = readFileSync(new URL('../docs/train/design/tr-01/design.md', import.meta.url), 'utf8');
    writeFileSync(join(designDir, 'plan.md'), `${plan}\nAdditional synthetic prompt detail for this local test.\n`);
    writeFileSync(join(designDir, 'design.md'), design);
    const changedPrompt = await generateProject({ ...args, sourceRoot });
    assert.equal(changedPrompt.status, 'SUCCESS');
    assert.notEqual(changedPrompt.prompt_sha256, first.prompt_sha256);
    assert.notEqual(changedPrompt.request_id, first.request_id, 'prompt bytes are part of the ledger identity');
    assert.equal(calls, 3);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 6);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Markdown-wrapped trusted revocation prevents a live fetch or ledger reservation', async () => {
  const dir = root(); let calls = 0;
  try {
    const result = await generateProject(options(dir, { backend: 'live',
      endpoint: NATIVE_DEEPSEEK_BASE_URL, apiKey: 'OFFLINE_FAKE_KEY',
      ledgerPath: join(dir, 'ledger.jsonl'), approvalComments: () => ownerApproval([{
        issue_id: GENERATION_BEAD, author: 'mwg-train-coord', text: '> **OWNER-AUTHORIZATION-REVOKED**: stop',
      }]), fetchImpl: () => { calls++; throw Error('network used'); } }));
    assert.equal(result.status, 'FAILED');
    assert.equal(calls, 0);
    assert.match(result.error.message, /revoked/);
    assert.equal(existsSync(join(dir, 'ledger.jsonl')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a paid request with unknown provider outcome is recorded but never retried in-place', async () => {
  const dir = root(); let calls = 0;
  try {
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath: join(dir, 'ledger.jsonl'), approvalComments: () => ownerApproval(),
      fetchImpl: () => { calls++; throw Error('simulated transport loss'); } });
    const first = await generateProject(args);
    assert.equal(first.status, 'FAILED');
    assert.equal(calls, 1);
    const rows = readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(rows.map((row) => row.type), ['reserve', 'settle']);
    assert.equal(rows[1].status, 'unknown');
    assert.equal(rows[1].computedUsd, 'UNVERIFIED');
    const refusesLiveRetry = (error) => error.code === 'LIVE_RETRY_UNSUPPORTED';
    await assert.rejects(generateProject({ ...args, retry: true }), refusesLiveRetry);
    assert.equal(calls, 1);
    // A kill between the paid call and run.json can leave its directory and ledger reservation behind.
    rmSync(join(first.output_dir, 'run.json'));
    await assert.rejects(generateProject({ ...args, retry: true }), refusesLiveRetry);
    assert.equal(calls, 1, 'an interrupted live identity is never sent twice');
    assert.equal(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').length, 2);
    rmSync(first.output_dir, { recursive: true, force: true });
    const noPaidRetry = await generateProject(args);
    assert.equal(noPaidRetry.status, 'FAILED');
    assert.equal(noPaidRetry.error.code, 'SPEND_GUARD');
    assert.equal(calls, 1, 'a failed, possibly paid identity cannot resend after artifact deletion');
    assert.equal(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').length, 2);
    const fresh = options(join(dir, 'fresh'), { ...args, outRoot: join(dir, 'fresh'), retry: true });
    await assert.rejects(generateProject(fresh), refusesLiveRetry);
    assert.equal(calls, 1, 'live --retry is forbidden even for a new identity');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('zero-request preflight refusal does not consume the live identity after configuration is corrected', async () => {
  const dir = root(); let calls = 0;
  try {
    const body = `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ files: [
      { path: 'index.html', content: '<p>Inert</p>' },
    ] }) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 15 } })}\n\ndata: [DONE]\n\n`;
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: '', ledgerPath: '', approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([Buffer.from(body)]) }; } });
    const refused = await generateProject(args);
    assert.equal(refused.status, 'FAILED');
    assert.equal(refused.error.code, 'NO_PROVIDER_CONFIG');
    assert.equal(existsSync(refused.output_dir), false, 'no run identity allocated before credential checks');
    const corrected = await generateProject({ ...args, apiKey: 'OFFLINE_FAKE_KEY', ledgerPath: join(dir, 'ledger.jsonl') });
    assert.equal(corrected.status, 'SUCCESS');
    assert.equal(calls, 1);
    assert.equal(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a legacy-recovery mkdir race is a fail-closed policy refusal, not raw EEXIST', () => {
  const raced = Object.assign(new Error('already exists'), { code: 'EEXIST' });
  assert.throws(() => rethrowLiveRecoveryMkdirError(raced),
    (error) => error.code === 'RUN_IN_PROGRESS' && /another live run/.test(error.message));
  const other = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  assert.throws(() => rethrowLiveRecoveryMkdirError(other), (error) => error === other);
});

test('a racing legacy-recovery mkdir is classified through generateProject, without provider or ledger activity', () => {
  const dir = root();
  try {
    // A child-only module shim fails exactly the second mkdir(base), not the initial EEXIST
    // that enters recovery. No timing, shared machine state, or production injection API.
    const generatorUrl = new URL('../src/eval/generator.mjs', import.meta.url).href;
    const shim = [
      "import { promises as fs } from 'node:fs';",
      'export const readFile = fs.readFile, writeFile = fs.writeFile, rm = fs.rm;',
      'let baseMkdirCount = 0;',
      'export async function mkdir(path, options) {',
      "  if (path === process.env.MWG_RACE_DIR && ++baseMkdirCount === 2) throw Object.assign(new Error('racing mkdir'), { code: 'EEXIST' });",
      '  return fs.mkdir(path, options);',
      '}',
    ].join('\n');
    const loaderPath = join(dir, 'race-loader.mjs');
    writeFileSync(loaderPath, `export function resolve(specifier, context, nextResolve) {
      if (specifier === 'node:fs/promises' && context.parentURL?.startsWith(${JSON.stringify(generatorUrl)})) {
        return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(shim)}`)}, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }`);
    const probe = String.raw`
      import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
      import { join } from 'node:path';
      const moduleUrl = process.env.MWG_GENERATOR_MODULE;
      const { generateProject } = await import(moduleUrl);
      const { decodeConfig } = await import(new URL('./decode-config.mjs', moduleUrl));
      const outRoot = join(process.env.MWG_TEST_ROOT, 'runs');
      const ledgerPath = join(process.env.MWG_TEST_ROOT, 'ledger.jsonl');
      let requests = 0;
      const args = { family: 'tr-01', framework: 'hono', model: decodeConfig.build_model,
        revision: process.env.MWG_TEST_REVISION, outRoot, ledgerPath, backend: 'live',
        endpoint: 'https://deepseek.int.exe.xyz/v1', apiKey: 'OFFLINE_FAKE_KEY',
        approvalComments: () => JSON.parse(process.env.MWG_APPROVAL_JSON),
        fetchImpl: async () => { requests++; throw Error('no provider call expected'); } };
      const identity = await generateProject({ ...args, dryRun: true });
      process.env.MWG_RACE_DIR = identity.output_dir;
      mkdirSync(identity.output_dir, { recursive: true });
      writeFileSync(join(identity.output_dir, 'run.json'), JSON.stringify({ status: 'FAILED', error: { code: 'NO_PROVIDER_CONFIG' } }));
      let refusal;
      try { await generateProject(args); } catch (error) { refusal = { code: error.code, message: error.message }; }
      console.log(JSON.stringify({ refusal, requests, ledgerExists: existsSync(ledgerPath) }));`;
    const result = JSON.parse(execFileSync(process.execPath,
      ['--no-warnings', '--loader', loaderPath, '--input-type=module', '--eval', probe],
      { encoding: 'utf8', timeout: 20_000, env: { PATH: process.env.PATH, HOME: dir,
        MWG_GENERATOR_MODULE: generatorUrl, MWG_TEST_ROOT: dir, MWG_TEST_REVISION: REVISION,
        MWG_APPROVAL_JSON: JSON.stringify(ownerApproval()) } }));
    assert.equal(result.refusal?.code, 'RUN_IN_PROGRESS');
    assert.match(result.refusal.message, /another live run reclaimed this identity/);
    assert.equal(result.requests, 0);
    assert.equal(result.ledgerExists, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an empty pre-reservation orphan names a safe manual exit, never an automatic paid retry', async () => {
  const dir = root(); let calls = 0;
  try {
    const ledgerPath = join(dir, 'ledger.jsonl');
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ files: [
      { path: 'index.html', content: '<p>Inert</p>' },
    ] }) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 15 } })}\n\ndata: [DONE]\n\n`;
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath, approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([Buffer.from(sse)]) }; } });
    const identity = await generateProject({ ...args, dryRun: true });
    mkdirSync(identity.output_dir, { recursive: true });
    await assert.rejects(generateProject(args), (error) => error.code === 'RUN_IN_PROGRESS' &&
      error.message.includes('manual-recovery-of-an-empty-pre-reservation-orphan'));
    assert.equal(calls, 0);
    assert.equal(existsSync(ledgerPath), false);
    // Only an empty, confirmed-unreserved directory can be removed with rmdir, never a paid run.
    rmdirSync(identity.output_dir);
    const recovered = await generateProject(args);
    assert.equal(recovered.status, 'SUCCESS');
    assert.equal(calls, 1);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a legacy failed preflight directory without a reservation is recoverable but an unfinished directory is not', async () => {
  const dir = root(); let calls = 0;
  try {
    const ledgerPath = join(dir, 'ledger.jsonl');
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath, approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([Buffer.from(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ files: [
          { path: 'index.html', content: '<p>Inert</p>' },
        ] }) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 15 } })}\n\ndata: [DONE]\n\n`)]), }; } });
    const identity = await generateProject({ ...args, dryRun: true });
    mkdirSync(identity.output_dir, { recursive: true });
    await assert.rejects(generateProject(args), (error) => error.code === 'RUN_IN_PROGRESS');
    assert.equal(calls, 0);
    writeFileSync(join(identity.output_dir, 'run.json'), JSON.stringify({ status: 'FAILED', backend: 'live',
      error: { code: 'NO_PROVIDER_CONFIG' } }));
    const recovered = await generateProject(args);
    assert.equal(recovered.status, 'SUCCESS');
    assert.equal(calls, 1);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unreadable owner decision or corrupt ledger refuses with a policy code and no paid identity burn', async () => {
  const dir = root(); let calls = 0;
  try {
    const ledgerPath = join(dir, 'ledger.jsonl');
    const args = options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath,
      fetchImpl: () => { calls++; throw Error('provider must not be contacted'); } });
    const authFailure = await generateProject({ ...args, approvalComments: () => {
      const error = new Error('bd dolt pull timed out'); error.code = 'ETIMEDOUT'; throw error;
    } });
    assert.equal(authFailure.status, 'FAILED');
    assert.equal(authFailure.error.code, 'NO_OWNER_AUTH');
    assert.equal(existsSync(authFailure.output_dir), false);
    writeFileSync(ledgerPath, 'not-json-at-all\n');
    const ledgerFailure = await generateProject({ ...args, approvalComments: () => ownerApproval() });
    assert.equal(ledgerFailure.status, 'FAILED');
    assert.equal(ledgerFailure.error.code, 'SPEND_GUARD');
    assert.equal(existsSync(ledgerFailure.output_dir), false);
    assert.equal(calls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live mode refuses the real undecided bead and never contacts the provider or logs a key', async () => {
  const dir = root(); let calls = 0;
  try {
    const result = await generateProject(options(dir, { backend: 'live', endpoint: NATIVE_DEEPSEEK_BASE_URL,
      apiKey: 'TOP-SECRET-KEY', ledgerPath: join(dir, 'ledger.jsonl'), authKey: 'test-only', approvalComments: () => [],
      fetchImpl: () => { calls += 1; throw Error('network used'); } }));
    assert.equal(result.status, 'FAILED');
    assert.equal(calls, 0);
    assert.equal(result.error.code, 'NO_OWNER_AUTH');
    assert.match(result.error.message, /NO_OWNER_AUTH/);
    assert.equal(existsSync(result.output_dir), false, 'a denied, zero-request identity is not allocated');
    assert.ok(!JSON.stringify(result).includes('TOP-SECRET-KEY'));
    assert.ok(!existsSync(join(dir, 'ledger.jsonl')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function ownerDecision() {
  return { id: GENERATION_BEAD, status: 'closed', close_reason:
    "Owner decision recorded from chat (2026-10-13): 're: 2 - no spend caps, I am ok.' Live DeepSeek V4.1 Flash generation authorised without a dollar cap; log actual usage/spend." };
}

const ownerApproval = (comments = []) => ({ decision: ownerDecision(), comments });

test('no-cap generation authority is the exact closed owner decision, not an actor name or fake scope', () => {
  assert.equal(verifyGenerationApproval(ownerApproval(), { model: MODEL }).decision, 'no-usd-cap');
  for (const decision of [
    { ...ownerDecision(), status: 'open' },
    { ...ownerDecision(), close_reason: 'I am not worried about cost' },
    { ...ownerDecision(), id: 'other-bead' },
  ]) assert.throws(() => verifyGenerationApproval({ decision, comments: [] }, { model: MODEL }), /NO_OWNER_AUTH/);
  assert.throws(() => verifyGenerationApproval(ownerApproval(), { model: 'fireworks/deepseek-v4p1-flash' }), /NO_OWNER_AUTH/);
  assert.throws(() => verifyGenerationApproval({ decision: ownerDecision(), comments: null }, { model: MODEL }), /NO_OWNER_AUTH/);
});

test('any trusted revocation marker anywhere, Markdown-wrapped or suffixed, refuses before another call', () => {
  for (const text of [
    'OWNER-AUTHORIZATION-REVOKED', '**OWNER-AUTHORIZATION-REVOKED**',
    '*owner-authorization-revoked*', '> OWNER-AUTHORIZATION-REVOKED',
    '- OWNER-AUTHORIZATION-REVOKED: reason', 'This is a note.\n```\nOWNER-AUTHORIZATION-REVOKED.\n```',
  ]) {
    assert.throws(() => verifyGenerationApproval(ownerApproval([{ issue_id: GENERATION_BEAD,
      author: 'mwg-train-coord', text }]), { model: MODEL }), /revoked/, text);
  }
  for (const author of ['antigravity-assistant', 'paul.kinlan@gmail.com', 'untrusted-local-actor']) {
    assert.throws(() => verifyGenerationApproval(ownerApproval([{ issue_id: GENERATION_BEAD,
      author, text: '**owner-authorization-revoked**' }]), { model: MODEL }), /revoked/, author);
  }
  assert.throws(() => verifyGenerationApproval(ownerApproval([{ author: 'paul.kinlan@gmail.com',
    text: 'OWNER-AUTHORIZATION-REVOKED' }]), { model: MODEL }), /revoked/, 'Beads rows without issue_id still revoke');
  assert.equal(verifyGenerationApproval(ownerApproval([{ issue_id: 'other-bead', author: 'paul.kinlan@gmail.com',
    text: 'OWNER-AUTHORIZATION-REVOKED' }]), { model: MODEL }).decision, 'no-usd-cap');
});

test('a cited exact-SKU rate can produce a bounded estimate; training/-0731 rates cannot', () => {
  const tariff = { model: MODEL, scope: 'generation', billingMode: 'per-token', sourceUrl: 'https://fireworks.ai/pricing',
    sourceSha256: 'a'.repeat(64), inputUsdPerMillion: 2, outputUsdPerMillion: 4, reasoningUsdPerMillion: 6, minimumUsd: 1 };
  assert.equal(worstCaseGenerationUsd({ tariff, model: MODEL, promptTokensUpperBound: 100_000, maxOutputTokens: 65_536 }), 1);
  assert.throws(() => worstCaseGenerationUsd({ tariff: { ...tariff, model: 'fireworks/deepseek-v4-flash-0731' }, model: MODEL,
    promptTokensUpperBound: 100_000, maxOutputTokens: 65_536 }), /UNVERIFIED_COST/);
  assert.throws(() => worstCaseGenerationUsd({ tariff, model: MODEL, promptTokensUpperBound: null, maxOutputTokens: 65_536 }), /UNVERIFIED_COST/);
});

test('durable no-cap reservations record unknown cost and refuse forged tickets, duplicates and corrupt ledgers', () => {
  const dir = root();
  try {
    const ledgerPath = join(dir, 'private', 'ledger.jsonl');
    const approval = verifyGenerationApproval(ownerApproval(), { model: MODEL });
    assert.throws(() => reserveGeneration({ ledgerPath, approval: { ...approval },
      requestId: 'forged', model: MODEL }), /verified decision/);
    assert.equal(existsSync(ledgerPath), false, 'forged object did not create a ledger');
    reserveGeneration({ ledgerPath, approval, requestId: 'one', model: MODEL, revision: REVISION, projectId: 'tr-01-hono' });
    settleGeneration({ ledgerPath, requestId: 'one', model: MODEL, status: 'unknown' });
    assert.throws(() => reserveGeneration({ ledgerPath, approval, requestId: 'one', model: MODEL }), /duplicate call/);
    reserveGeneration({ ledgerPath, approval, requestId: 'two', model: MODEL }); // no dollar cap blocks another request
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 3);
    assert.throws(() => settleGeneration({ ledgerPath, requestId: 'one', model: MODEL, status: 'completed' }), /unsettled/);
    mkdirSync(`${ledgerPath}.lock`);
    assert.throws(() => reserveGeneration({ ledgerPath, approval, requestId: 'three', model: MODEL }), /lock held/);
    rmSync(`${ledgerPath}.lock`, { recursive: true });
    const cleanLedger = readFileSync(ledgerPath, 'utf8');
    writeFileSync(ledgerPath, cleanLedger.trimEnd());
    assert.throws(() => reserveGeneration({ ledgerPath, approval, requestId: 'three', model: MODEL }), /torn ledger/);
    writeFileSync(ledgerPath, `${cleanLedger}not-json\n`);
    assert.throws(() => reserveGeneration({ ledgerPath, approval, requestId: 'three', model: MODEL }), /Unexpected token|JSON/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('streaming chat stays open across reasoning chunks and records usage, without an idle deadline', async () => {
  let request;
  const fetchImpl = async (_, options) => {
    request = JSON.parse(options.body);
    const events = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking' }, finish_reason: null }] }),
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '{"files":[]}' }, finish_reason: 'stop' }] }),
      'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 18 } } }),
      'data: [DONE]',
    ].join('\n\n') + '\n\n';
    return { ok: true, body: Readable.from([Buffer.from(events)]) };
  };
  const answer = await streamCompletion({ endpoint: `${NATIVE_DEEPSEEK_BASE_URL}/chat/completions`, apiKey: 'test-only',
    payload: { model: 'fake', messages: [{ role: 'user', content: 'Hi' }] }, fetchImpl });
  assert.equal(request.stream, true);
  assert.equal(answer.finish_reason, 'stop');
  assert.equal(answer.content, '{"files":[]}');
  assert.equal(answer.reasoning_tokens, 18);
  assert.equal(answer.content_tokens, 12);
});
