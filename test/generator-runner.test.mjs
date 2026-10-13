import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { generateProject, buildGenerationPrompt, parseProjectFiles, streamCompletion } from '../src/eval/generator.mjs';
import { GENERATION_BEAD, verifyGenerationApproval, worstCaseGenerationUsd, reserveGeneration, settleGeneration } from '../src/eval/spend-ledger.mjs';
import { decodeConfig, pinnedEvaluationBuildKey } from '../src/eval/decode-config.mjs';

const REVISION = '2cba9e42aa026125f3ed06c6d98c1db82f7ca027';
const MODEL = decodeConfig.build_model;
const TEST_NOW = new Date('2026-10-13T17:00:00Z');
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

function signedComment({ cap = 20, stop = 50, model = MODEL, expiry = '2030-01-01T00:00:00Z', key = 'test-only', host = hostname() } = {}) {
  const verbatim = `"Authorised: up to ${cap} USD in total for DeepSeek V4.1 Flash generation; stop and ask at ${stop}%."`;
  const payload = [GENERATION_BEAD, verbatim, 'generation', model, String(cap), expiry, String(stop), host].join('\n');
  const signature = createHmac('sha256', key).update(payload).digest('hex');
  return { id: 'comment-test', issue_id: GENERATION_BEAD, author: 'fleet-manager-coord', text:
    `OWNER-AUTHORIZATION\nVerbatim: ${verbatim}\nScope: generation\nModel: ${model}\nCap-USD: ${cap}\nExpiry: ${expiry}\nStop-at-pct: ${stop}\nLedger-host: ${host}\nSignature: hmac-sha256:${signature}` };
}

test('authorisation requires signed verbatim owner cap, exact model, scope, expiry and trusted author', () => {
  const comment = signedComment();
  assert.equal(verifyGenerationApproval([comment], { key: 'test-only', model: MODEL, now: TEST_NOW }).capUsd, 20);
  assert.throws(() => verifyGenerationApproval([comment], { key: 'wrong', model: MODEL, now: TEST_NOW }), /NO_OWNER_AUTH/);
  assert.throws(() => verifyGenerationApproval([{ ...comment, author: 'mwg-train-imp-1' }], { key: 'test-only', model: MODEL, now: TEST_NOW }), /NO_OWNER_AUTH/);
  assert.throws(() => verifyGenerationApproval([comment], { key: 'test-only', model: 'fireworks/deepseek-v4-flash', now: TEST_NOW }), /NO_OWNER_AUTH/);
  assert.throws(() => verifyGenerationApproval([signedComment({ expiry: '2020-01-01T00:00:00Z' })], { key: 'test-only', model: MODEL, now: TEST_NOW }), /NO_OWNER_AUTH/);
  assert.throws(() => verifyGenerationApproval([signedComment({ host: 'another-vm' })], { key: 'test-only', model: MODEL, now: TEST_NOW }), /NO_OWNER_AUTH/);
  for (const text of ['OWNER-AUTHORIZATION-REVOKED', ' OWNER-AUTHORIZATION-REVOKED ', 'OWNER-AUTHORIZATION-REVOKED\nPaul revoked generation']) {
    assert.throws(() => verifyGenerationApproval([comment, { issue_id: GENERATION_BEAD, author: 'fleet-manager-coord', text }],
      { key: 'test-only', model: MODEL, now: TEST_NOW }), /revoked/);
  }
});

test('a cited exact-SKU rate and bounded prompt/output are mandatory; a training quote or -0731 rate cannot pass', () => {
  const tariff = { model: MODEL, scope: 'generation', billingMode: 'per-token', sourceUrl: 'https://fireworks.ai/pricing',
    sourceSha256: 'a'.repeat(64), inputUsdPerMillion: 2, outputUsdPerMillion: 4, reasoningUsdPerMillion: 6, minimumUsd: 1 };
  assert.equal(worstCaseGenerationUsd({ tariff, model: MODEL, promptTokensUpperBound: 100_000, maxOutputTokens: 65_536 }), 1);
  assert.throws(() => worstCaseGenerationUsd({ tariff: { ...tariff, model: 'fireworks/deepseek-v4-flash-0731' }, model: MODEL,
    promptTokensUpperBound: 100_000, maxOutputTokens: 65_536 }), /UNVERIFIED_COST/);
  assert.throws(() => worstCaseGenerationUsd({ tariff, model: MODEL, promptTokensUpperBound: null, maxOutputTokens: 65_536 }), /UNVERIFIED_COST/);
});

test('durable reservations count against the cap, are never refunded by unknown settlement and refuse duplicates', () => {
  const dir = root();
  try {
    const ledgerPath = join(dir, 'private', 'ledger.jsonl');
    const approval = verifyGenerationApproval([signedComment()], { key: 'test-only', model: MODEL, now: TEST_NOW });
    assert.throws(() => reserveGeneration({ ledgerPath, approval: { ...approval, capUsd: 1_000_000 },
      chargeBoundUsd: 6, requestId: 'forged', model: MODEL }), /missing scope, approval or charge bound/);
    assert.equal(existsSync(ledgerPath), false, 'forged object did not create a ledger');
    reserveGeneration({ ledgerPath, approval, chargeBoundUsd: 6, requestId: 'one', model: MODEL });
    settleGeneration({ ledgerPath, requestId: 'one', model: MODEL, status: 'unknown' });
    assert.throws(() => reserveGeneration({ ledgerPath, approval, chargeBoundUsd: 6, requestId: 'two', model: MODEL }), /cap exhausted/);
    assert.throws(() => reserveGeneration({ ledgerPath, approval, chargeBoundUsd: 1, requestId: 'one', model: MODEL }), /duplicate call/);
    reserveGeneration({ ledgerPath, approval, chargeBoundUsd: 4, requestId: 'two', model: MODEL });
    assert.equal(readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 3);
    mkdirSync(`${ledgerPath}.lock`);
    assert.throws(() => reserveGeneration({ ledgerPath, approval, chargeBoundUsd: 1, requestId: 'three', model: MODEL }), /lock held/);
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
