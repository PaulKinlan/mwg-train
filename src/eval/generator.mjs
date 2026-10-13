import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { evaluationBuildKey } from './build-key.mjs';
import { decodeConfig, decodeConfigSha256 } from './decode-config.mjs';
import { readGenerationApprovalComments, verifyGenerationApproval, loadPinnedGenerationTariff, worstCaseGenerationUsd, reserveGeneration, settleGeneration } from './spend-ledger.mjs';

const SHA = /^[a-f0-9]{40}$/;
const FAMILY = /^tr-\d{2}$/;
const FRAMEWORKS = new Set(['hono', 'raw', 'react', 'preact', 'vue', 'webcomponents', 'svelte']);
const ARMS = new Set(['default', 'c1', 'c2', 'c3', 't']);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), { code });

export function buildGenerationPrompt({ plan, design, arm, guidance = '' }) {
  if (!ARMS.has(arm)) throw fail('INVALID_ARM', `unknown arm ${arm}`);
  if (typeof plan !== 'string' || !plan.trim() || typeof design !== 'string' || !design.trim()) throw fail('INVALID_SPEC', 'plan.md and design.md are required');
  if (arm !== 'c2' && guidance) throw fail('SET_SEPARATION', 'only C2 may receive guidance; default/C1/C3/T must not receive MWG context');
  if (arm === 'c2' && !guidance.trim()) throw fail('MISSING_GUIDANCE', 'C2 requires explicit pinned guidance');
  const context = arm === 'c2' ? `\nApplicable guidance (C2 only):\n${guidance}\n` : '';
  // C3 generates the same unguided base as C1; a separate deterministic uplift stage operates afterward.
  return `Create a runnable website from the following text specifications. Return ONLY a JSON object {"files":[{"path":"relative/file","content":"file bytes as text"}]}. Include all routes and server persistence described by the plan. Do not execute or inspect generated code here.\n\nFunctional plan:\n${plan}\n\nVisual design contract (text; any reference image is an evaluation target, not a model input):\n${design}\n${context}`;
}

/** Treat model output as untrusted DATA. No child process, dynamic import, eval or package install here. */
export function parseProjectFiles(content) {
  if (typeof content !== 'string' || !content.trim()) throw fail('EMPTY_CONTENT', 'model produced no project files');
  if (Buffer.byteLength(content) > 12_000_000) throw fail('OUTPUT_TOO_LARGE', 'model content exceeds 12 MB');
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw fail('INVALID_OUTPUT', 'model must return JSON {files:[...]}'); }
  if (!Array.isArray(parsed?.files) || parsed.files.length === 0 || parsed.files.length > 128) throw fail('INVALID_OUTPUT', 'expected 1-128 files');
  const seen = new Set();
  for (const file of parsed.files) {
    if (typeof file?.path !== 'string' || typeof file.content !== 'string' ||
        file.path.length > 240 || file.path.startsWith('/') || file.path.includes('\\') ||
        !file.path.split('/').every((part) => part && part !== '.' && part !== '..' && !part.startsWith('.')) ||
        file.path.includes('\0') || seen.has(file.path) || Buffer.byteLength(file.content) > 3_000_000) {
      throw fail('UNSAFE_OUTPUT', 'invalid, duplicate or unsafe relative generated file path/content');
    }
    seen.add(file.path);
  }
  return parsed.files;
}

export function normaliseCompletion(payload) {
  const choice = payload?.choices?.[0];
  const usage = payload?.usage ?? {};
  return {
    content: choice?.message?.content ?? '', finish_reason: choice?.finish_reason ?? 'UNVERIFIED',
    prompt_tokens: usage.prompt_tokens ?? null,
    completion_tokens: usage.completion_tokens ?? null,
    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    content_tokens: typeof usage.completion_tokens === 'number' && typeof usage.completion_tokens_details?.reasoning_tokens === 'number'
      ? usage.completion_tokens - usage.completion_tokens_details.reasoning_tokens : null,
  };
}

/** Stream chunks for progress without an idle timeout; a hard 20-minute bound still applies. */
export async function streamCompletion({ endpoint, apiKey, payload, fetchImpl = fetch, maxMs = 20 * 60_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...payload, stream: true, stream_options: { include_usage: true } }), signal: controller.signal,
    });
    if (!response.ok || !response.body) throw fail('PROVIDER_ERROR', `provider returned HTTP ${response.status}`);
    const decoder = new TextDecoder();
    let text = ''; let content = ''; let reasoning = ''; let finish = null; let usage = null;
    for await (const chunk of response.body) {
      text += decoder.decode(chunk, { stream: true });
      if (text.length > 16_000_000) throw fail('OUTPUT_TOO_LARGE', 'stream exceeds limit');
      const frames = text.split(/\r?\n\r?\n/);
      text = frames.pop();
      for (const frame of frames) {
        for (const line of frame.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let event;
          try { event = JSON.parse(data); } catch { throw fail('PROVIDER_ERROR', 'malformed streaming event'); }
          content += event.choices?.[0]?.delta?.content ?? '';
          reasoning += event.choices?.[0]?.delta?.reasoning_content ?? '';
          finish = event.choices?.[0]?.finish_reason ?? finish;
          usage = event.usage ?? usage;
        }
      }
    }
    if (text.trim() && text.trim() !== 'data: [DONE]') throw fail('PROVIDER_ERROR', 'truncated streaming response');
    return normaliseCompletion({ choices: [{ message: { content, reasoning_content: reasoning }, finish_reason: finish }], usage });
  } finally { clearTimeout(timer); }
}

/** Default canned response is inert data. Stub and --dry-run never read credentials or contact a provider. */
export function stubCompletion() {
  return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ files: [
    { path: 'index.html', content: '<!doctype html><html><title>Offline stub</title><body><main>Stub only — no model ran.</main></body></html>' },
  ] }) } }], usage: { prompt_tokens: 42, completion_tokens: 84, completion_tokens_details: { reasoning_tokens: 10 } } };
}

export async function generateProject({ family, framework, model = decodeConfig.build_model, revision,
  arm = 'default', guidance = '', backend = 'stub', dryRun = false, outRoot = '.generated-runs',
  sourceRoot = '.', fetchImpl = fetch, canned = stubCompletion(), endpoint = process.env.FIREWORKS_BASE_URL,
  apiKey = process.env.FIREWORKS_API_KEY, ledgerPath = process.env.MWG_SPEND_LEDGER_PATH,
  authKey = process.env.MWG_AUTH_VERIFY_KEY, promptTokensUpperBound = null,
  approvalComments = readGenerationApprovalComments, chromeVersion = 'UNVERIFIED', retry = false } = {}) {
  if (!FAMILY.test(family ?? '') || !FRAMEWORKS.has(framework) || !SHA.test(revision ?? '')) {
    throw fail('INVALID_IDENTITY', 'training family, supported framework and resolved 40-character model revision required');
  }
  if (model !== decodeConfig.build_model) throw fail('UNPINNED_MODEL', 'chosen model differs from proposed pinned decode config; ratify a new config before spending');
  if (!['stub', 'live'].includes(backend)) throw fail('INVALID_BACKEND', 'only stub or guarded live are supported');
  const source = resolve(sourceRoot);
  const plan = await readFile(join(source, 'docs/train/design', family, 'plan.md'), 'utf8');
  const design = await readFile(join(source, 'docs/train/design', family, 'design.md'), 'utf8');
  const prompt = buildGenerationPrompt({ plan, design, arm, guidance });
  const promptSha256 = hash(prompt);
  const request = { ...decodeConfig.request, stream: true };
  const decodeSha = decodeConfigSha256(request);
  const projectId = `${family}-${framework}`;
  const buildKey = evaluationBuildKey({ projectId, model, decodeConfigSha256: decodeSha });
  // Hash the key as a directory name (provider/id contains a slash and must never become a path).
  const keyDirectory = hash(buildKey);
  const runId = hash([buildKey, revision, arm, promptSha256].join('\n'));
  const base = join(resolve(outRoot), keyDirectory, arm, runId);
  const output = { build_key: buildKey, output_dir: base, project_dir: join(base, 'project'), prompt_sha256: promptSha256 };
  if (dryRun) return { ...output, status: 'DRY_RUN', cost: 'UNVERIFIED', prompt };
  await mkdir(join(resolve(outRoot), keyDirectory, arm), { recursive: true });
  try { await mkdir(base); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const record = JSON.parse(await readFile(join(base, 'run.json'), 'utf8'));
      if (record.status === 'SUCCESS') return { ...output, ...record, resumed: true };
      if (!retry || backend === 'live') throw fail('RUN_EXISTS', 'failed or unfinished run exists; explicit offline retry only');
      await rm(join(base, 'project'), { recursive: true, force: true });
    } catch (readError) { if (readError.code !== 'ENOENT') throw readError; if (!retry) throw fail('RUN_EXISTS', 'unfinished run exists; inspect before retry'); }
  }
  const started = performance.now();
  const requestId = randomUUID();
  let chargeBoundUsd = null;
  let tariff = null;
  let reserved = false;
  const record = { status: 'FAILED', project_id: projectId, family, framework, arm, model,
    resolved_revision: revision, build_key: buildKey, decode_config_sha256: decodeSha, decode_config: request,
    prompt_sha256: promptSha256, plan_sha256: hash(plan), design_sha256: hash(design), prompt,
    scope: backend === 'live' ? 'generation' : 'offline-stub', bead: backend === 'live' ? 'mwg-train-i5i2.1' : null,
    request_id: requestId, backend, platform: process.platform, node_version: process.version, chrome_version: chromeVersion,
    prompt_tokens: null, completion_tokens: null, reasoning_tokens: null, content_tokens: null,
    finish_reason: 'UNVERIFIED', projected_cost_usd: 'UNVERIFIED' };
  try {
    let completion;
    if (backend === 'stub') completion = normaliseCompletion(canned);
    else {
      // No inference quote for either exact DeepSeek SKU is currently pinned. The tariff is an injected
      // verified quote, NEVER a default or a training/-0731 price. Any missing precondition refuses before fetch.
      const approval = verifyGenerationApproval(approvalComments(), { key: authKey, model });
      tariff = loadPinnedGenerationTariff(model);
      chargeBoundUsd = worstCaseGenerationUsd({ tariff, model, promptTokensUpperBound, maxOutputTokens: request.max_tokens });
      if (!endpoint || !apiKey || !ledgerPath) throw fail('NO_PROVIDER_CONFIG', 'provider endpoint, key and private ledger path required');
      if (!/^https:\/\//.test(endpoint)) throw fail('NO_PROVIDER_CONFIG', 'provider endpoint must be HTTPS');
      reserveGeneration({ ledgerPath, approval, chargeBoundUsd, requestId, model });
      reserved = true;
      record.projected_cost_usd = chargeBoundUsd;
      completion = await streamCompletion({ endpoint, apiKey, fetchImpl, payload: { model: decodeConfig.model,
        messages: [{ role: 'user', content: prompt }], ...request } });
    }
    Object.assign(record, { prompt_tokens: completion.prompt_tokens, completion_tokens: completion.completion_tokens,
      reasoning_tokens: completion.reasoning_tokens, content_tokens: completion.content_tokens, finish_reason: completion.finish_reason });
    if (completion.finish_reason === 'length' && !completion.content.trim()) throw fail('EMPTY_LENGTH', 'generation exhausted its token budget with empty content');
    if (completion.finish_reason !== 'stop') throw fail('BAD_FINISH', `generation finished with ${completion.finish_reason}`);
    const files = parseProjectFiles(completion.content);
    await mkdir(output.project_dir, { recursive: true });
    for (const file of files) {
      const dest = resolve(output.project_dir, file.path);
      if (!dest.startsWith(`${resolve(output.project_dir)}${sep}`)) throw fail('UNSAFE_OUTPUT', 'generated path escapes project directory');
      await mkdir(dirnamePortable(dest), { recursive: true });
      // No generated file is imported, spawned, served or evaluated in this process.
      await writeFile(dest, file.content, { flag: 'wx', mode: 0o600 });
    }
    record.status = 'SUCCESS';
    record.files = files.map((file) => ({ path: file.path, sha256: hash(file.content), bytes: Buffer.byteLength(file.content) }));
  } catch (error) {
    record.error = { code: error.code ?? 'GENERATION_FAILED', message: apiKey && backend === 'live'
      ? String(error.message).replaceAll(apiKey, '[REDACTED]') : error.message };
  } finally {
    record.wall_time_ms = Math.round(performance.now() - started);
    // If the provider's bill cannot be reconciled, retain the full reservation against the cap.
    if (reserved) {
      try {
        const actualUsd = Number.isSafeInteger(record.prompt_tokens) && Number.isSafeInteger(record.reasoning_tokens) &&
          Number.isSafeInteger(record.content_tokens) && record.content_tokens >= 0
          ? Math.ceil(100 * Math.max(tariff.minimumUsd,
            (record.prompt_tokens * tariff.inputUsdPerMillion + record.reasoning_tokens * tariff.reasoningUsdPerMillion +
              record.content_tokens * tariff.outputUsdPerMillion) / 1_000_000)) / 100 : null;
        settleGeneration({ ledgerPath, requestId, model, actualUsd,
          status: record.status === 'SUCCESS' ? 'completed' : 'unknown',
          tokens: { prompt: record.prompt_tokens, completion: record.completion_tokens, reasoning: record.reasoning_tokens, content: record.content_tokens } });
        if (actualUsd !== null && actualUsd > chargeBoundUsd) {
          record.status = 'FAILED';
          record.error = { code: 'CHARGE_OVER_BOUND', message: 'provider usage exceeds pre-call reservation; halt and reconcile' };
        }
      } catch {
        record.status = 'FAILED';
        record.error = { code: 'LEDGER_UNSETTLED', message: 'reservation remains charged; reconcile ledger before any further call' };
      }
    }
    await writeFile(join(base, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'w', mode: 0o600 });
  }
  return { ...output, ...record };
}

function dirnamePortable(path) { return path.slice(0, path.lastIndexOf(sep)); }
