import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { generateProject, buildGenerationPrompt, parseProjectFiles, streamCompletion } from '../src/eval/generator.mjs';
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
    assert.equal(readFileSync(join(first.project_dir, 'server.mjs'), 'utf8'), "throw new Error('never execute generated code')");
    assert.ok(!existsSync(marker));
    const record = JSON.parse(readFileSync(join(first.output_dir, 'run.json'), 'utf8'));
    assert.equal(record.status, 'SUCCESS');
    assert.equal(record.resolved_revision, REVISION);
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
  const dir = root(); let calls = 0;
  try {
    const approval = { decision: { id: GENERATION_BEAD, status: 'closed', close_reason:
      "Owner decision recorded from chat (2026-10-13): 're: 2 - no spend caps, I am ok.' Live DeepSeek V4.1 Flash generation authorised without a dollar cap; log actual usage/spend." }, comments: [] };
    const live = await generateProject(options(dir, { backend: 'live', endpoint: 'https://example.test/v1/chat/completions',
      apiKey: 'TOP-SECRET-KEY', ledgerPath: join(dir, 'ledger.jsonl'), approvalComments: () => approval,
      fetchImpl: async () => { calls += 1; return { ok: true, body: Readable.from([Buffer.from(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ files: [{ path: 'index.html', content: '<p>inert</p>' }] }) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 19, completion_tokens: 42, completion_tokens_details: { reasoning_tokens: 10 } } })}\n\ndata: [DONE]\n\n`)]), status: 200 }; },
    }));
    assert.equal(calls, 1);
    assert.equal(live.status, 'SUCCESS');
    assert.equal(live.computed_cost_usd, 'UNVERIFIED');
    assert.equal(live.reasoning_tokens, 10);
    const ledger = readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].reservedUsd, 'UNVERIFIED');
    assert.equal(ledger[1].computedUsd, 'UNVERIFIED');
    assert.equal(ledger[1].tokens.prompt, 19);
    assert.ok(!readFileSync(join(live.output_dir, 'run.json'), 'utf8').includes('TOP-SECRET-KEY'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deleting paid artifacts cannot resend the same live identity; a distinct arm still can run', async () => {
  const dir = root(); let calls = 0;
  try {
    const ledgerPath = join(dir, 'ledger.jsonl');
    const data = JSON.stringify({ files: [{ path: 'index.html', content: '<p>Inert model output</p>' }] });
    const events = `data: ${JSON.stringify({ choices: [{ delta: { content: data }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 19, completion_tokens: 42, completion_tokens_details: { reasoning_tokens: 10 } } })}\n\ndata: [DONE]\n\n`;
    const args = options(dir, { backend: 'live', endpoint: 'https://example.test/v1/chat/completions',
      apiKey: 'OFFLINE_FAKE_KEY', ledgerPath, approvalComments: () => ownerApproval(),
      fetchImpl: async () => { calls++; return { ok: true, status: 200, body: Readable.from([Buffer.from(events)]) }; } });
    const first = await generateProject(args);
    assert.equal(first.status, 'SUCCESS');
    assert.equal(calls, 1);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 2);
    rmSync(first.output_dir, { recursive: true, force: true }); // operator removed the only artifact record
    const duplicate = await generateProject(args);
    assert.equal(duplicate.status, 'FAILED');
    assert.match(duplicate.error.message, /duplicate call/);
    assert.equal(calls, 1, 'the private ledger remembers a charged identity after its artifacts vanish');
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 2);
    const otherArm = await generateProject({ ...args, arm: 'c1' });
    assert.equal(otherArm.status, 'SUCCESS');
    assert.equal(calls, 2, 'a separate arm is an intentionally distinct generation');
    assert.notEqual(otherArm.request_id, first.request_id);
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Markdown-wrapped trusted revocation prevents a live fetch or ledger reservation', async () => {
  const dir = root(); let calls = 0;
  try {
    const result = await generateProject(options(dir, { backend: 'live',
      endpoint: 'https://example.test/v1/chat/completions', apiKey: 'OFFLINE_FAKE_KEY',
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
    const args = options(dir, { backend: 'live', endpoint: 'https://example.test/v1/chat/completions',
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
    const fresh = options(join(dir, 'fresh'), { ...args, outRoot: join(dir, 'fresh'), retry: true });
    await assert.rejects(generateProject(fresh), refusesLiveRetry);
    assert.equal(calls, 1, 'live --retry is forbidden even for a new identity');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live mode refuses the real undecided bead and never contacts the provider or logs a key', async () => {
  const dir = root(); let calls = 0;
  try {
    const result = await generateProject(options(dir, { backend: 'live', endpoint: 'https://example.test/v1/chat/completions',
      apiKey: 'TOP-SECRET-KEY', ledgerPath: join(dir, 'ledger.jsonl'), authKey: 'test-only', approvalComments: () => [],
      fetchImpl: () => { calls += 1; throw Error('network used'); } }));
    assert.equal(result.status, 'FAILED');
    assert.equal(calls, 0);
    assert.equal(result.error.code, 'GENERATION_FAILED');
    assert.match(result.error.message, /NO_OWNER_AUTH/);
    assert.ok(!readFileSync(join(result.output_dir, 'run.json'), 'utf8').includes('TOP-SECRET-KEY'));
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
  assert.throws(() => verifyGenerationApproval(ownerApproval(), { model: 'fireworks/deepseek-v4-flash' }), /NO_OWNER_AUTH/);
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
  const answer = await streamCompletion({ endpoint: 'https://example.test/v1/chat/completions', apiKey: 'test-only',
    payload: { model: 'fake', messages: [{ role: 'user', content: 'Hi' }] }, fetchImpl });
  assert.equal(request.stream, true);
  assert.equal(answer.finish_reason, 'stop');
  assert.equal(answer.content, '{"files":[]}');
  assert.equal(answer.reasoning_tokens, 18);
  assert.equal(answer.content_tokens, 12);
});
