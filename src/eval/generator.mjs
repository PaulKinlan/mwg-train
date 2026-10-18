import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { evaluationBuildKey } from './build-key.mjs';
import { decodeConfig, decodeConfigSha256 } from './decode-config.mjs';
import { interfaceContractText, interfaceContractSha256, RATIFIED_TR01_INTERFACE_SHA256 } from './interface-contract.mjs';
import { readGenerationApprovalComments, verifyGenerationApproval, loadPinnedGenerationTariff, worstCaseGenerationUsd, hasGenerationReservation, reserveGeneration, settleGeneration } from './spend-ledger.mjs';

const SHA = /^[a-f0-9]{40}$/;
const FAMILY = /^tr-\d{2}$/;
const FRAMEWORKS = new Set(['hono', 'raw', 'react', 'preact', 'vue', 'webcomponents', 'svelte']);
const ARMS = new Set(['default', 'c1', 'c2', 'c3', 't']);
const RATIFIED_DECODE_SHA256 = '59c4e99faaa64669571c499689ed1116785471034e76c5255bbb1572c0011a20';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), { code });

/** Only the legacy no-reservation recovery path calls this; classify a racing mkdir without timing-dependent tests. */
export function rethrowLiveRecoveryMkdirError(error) {
  if (error?.code === 'EEXIST') throw fail('RUN_IN_PROGRESS', 'another live run reclaimed this identity; inspect its process and ledger');
  throw error;
}

export function buildGenerationPrompt({ plan, design, arm, guidance = '', interfaceContract = '' }) {
  if (!ARMS.has(arm)) throw fail('INVALID_ARM', `unknown arm ${arm}`);
  if (typeof plan !== 'string' || !plan.trim() || typeof design !== 'string' || !design.trim()) throw fail('INVALID_SPEC', 'plan.md and design.md are required');
  if (arm !== 'c2' && guidance) throw fail('SET_SEPARATION', 'only C2 may receive guidance; default/C1/C3/T must not receive MWG context');
  if (arm === 'c2' && !guidance.trim()) throw fail('MISSING_GUIDANCE', 'C2 requires explicit pinned guidance');
  const context = arm === 'c2' ? `\nApplicable guidance (C2 only):\n${guidance}\n` : '';
  // C3 generates the same unguided base as C1; a separate deterministic uplift stage operates afterward.
  const base = `Create a runnable website from the following text specifications. Return ONLY a JSON object {"files":[{"path":"relative/file","content":"file bytes as text"}]}. Include all routes and server persistence described by the plan. Do not execute or inspect generated code here.\n\nFunctional plan:\n${plan}\n\nVisual composition requirement: Follow the authored design's section hierarchy and spatial layout, including its named navigation, hero/media, service or content cards, form placement and interactive widgets where specified. Preserve the plan's working routes, controls, validation and persisted state rather than replacing the site with a generic form-only layout. Adapt the composition to narrow screens without copying any static conformance-viewport instruction. Reference JPEGs are illustrative design assets, not supplied model inputs; do not embed a JPEG as the website or invent unseen image content, prices, customer details or confirmed outcomes. A1/A6 conformance targets are separate evaluation instruments, not generation inputs.\n\nVisual design contract (authored text only):\n${design}\n${context}`;
  return interfaceContract ? `${base.trimEnd()}\n\nEvaluator interface contract (identical for every arm):\n${interfaceContract}` : base;
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
    let text = ''; let content = ''; let contentBytes = 0; let finish = null; let usage = null;
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
          const fragment = event.choices?.[0]?.delta?.content ?? '';
          if (typeof fragment !== 'string') throw fail('PROVIDER_ERROR', 'non-text content in streaming event');
          contentBytes += Buffer.byteLength(fragment);
          if (contentBytes > 12_000_000) throw fail('OUTPUT_TOO_LARGE', 'streamed project exceeds 12 MB');
          // Do not accumulate reasoning text; provider usage reports reasoning tokens separately.
          content += fragment;
          finish = event.choices?.[0]?.finish_reason ?? finish;
          usage = event.usage ?? usage;
        }
      }
    }
    if (text.trim() && text.trim() !== 'data: [DONE]') throw fail('PROVIDER_ERROR', 'truncated streaming response');
    return normaliseCompletion({ choices: [{ message: { content }, finish_reason: finish }], usage });
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
  promptTokensUpperBound = null, approvalComments = readGenerationApprovalComments,
  chromeVersion = 'UNVERIFIED', retry = false } = {}) {
  if (!FAMILY.test(family ?? '') || !FRAMEWORKS.has(framework) || !SHA.test(revision ?? '')) {
    throw fail('INVALID_IDENTITY', 'training family, supported framework and resolved 40-character model revision required');
  }
  if (model !== decodeConfig.build_model) throw fail('UNPINNED_MODEL', 'chosen model differs from proposed pinned decode config; ratify a new config before spending');
  if (!['stub', 'live'].includes(backend)) throw fail('INVALID_BACKEND', 'only stub or guarded live are supported');
  // A SIGKILL can leave the paid reservation and project directory but no run.json. Never let
  // --retry override that ambiguity or start another live request, even on a fresh identity.
  if (backend === 'live' && retry) throw fail('LIVE_RETRY_UNSUPPORTED', 'live --retry is forbidden; reconcile any earlier request before a new identity');
  const source = resolve(sourceRoot);
  const plan = await readFile(join(source, 'docs/train/design', family, 'plan.md'), 'utf8');
  const design = await readFile(join(source, 'docs/train/design', family, 'design.md'), 'utf8');
  // Only tr-01 has an owner-ratified interface. Other families may preview offline, not spend.
  const contract = family === 'tr-01' ? interfaceContractText : '';
  const prompt = buildGenerationPrompt({ plan, design, arm, guidance, interfaceContract: contract });
  const promptSha256 = hash(prompt);
  // Streaming is a transport detail, not a decode knob: the evaluator and runner must share one key.
  const request = decodeConfig.request;
  const decodeSha = decodeConfigSha256(request);
  const projectId = `${family}-${framework}`;
  const buildKey = evaluationBuildKey({ projectId, model, decodeConfigSha256: decodeSha });
  // Hash the key as a directory name (provider/id contains a slash and must never become a path).
  const keyDirectory = hash(buildKey);
  // Stub and live outputs must never share a success record: a prior offline stub is not a model call.
  const runId = hash([buildKey, revision, backend, arm, promptSha256].join('\n'));
  const base = join(resolve(outRoot), keyDirectory, arm, runId);
  const output = { build_key: buildKey, output_dir: base, project_dir: join(base, 'project'), prompt_sha256: promptSha256,
    decode_config_sha256: decodeSha, interface_contract_sha256: contract ? interfaceContractSha256 : null };
  if (dryRun) return { ...output, status: 'DRY_RUN', cost: 'UNVERIFIED', prompt };
  // A failed preflight has sent nothing and must not consume this identity. No run directory or
  // ledger reservation is created until the endpoint and current owner decision are verified.
  const preflightFailure = (code, error) => ({ ...output, status: 'FAILED', backend,
    error: { code, message: apiKey ? String(error.message).replaceAll(apiKey, '[REDACTED]') : String(error.message) } });
  let approval = null;
  let chargeBoundUsd = 'UNVERIFIED';
  let tariff = null;
  if (backend === 'live') {
    if (!contract || interfaceContractSha256 !== RATIFIED_TR01_INTERFACE_SHA256 ||
        decodeConfigSha256(request) !== RATIFIED_DECODE_SHA256 || !decodeConfig.status.startsWith('ratified-owner-')) {
      return preflightFailure('UNRATIFIED_INTERFACE', fail('UNRATIFIED_INTERFACE', 'exact owner-ratified tr-01 interface and decode request required'));
    }
    if (!endpoint || !apiKey || !ledgerPath) return preflightFailure('NO_PROVIDER_CONFIG',
      fail('NO_PROVIDER_CONFIG', 'provider endpoint, key and private ledger path required'));
    if (!/^https:\/\//.test(endpoint)) return preflightFailure('NO_PROVIDER_CONFIG',
      fail('NO_PROVIDER_CONFIG', 'provider endpoint must be HTTPS'));
    try { approval = verifyGenerationApproval(approvalComments(), { model }); }
    catch (error) { return preflightFailure('NO_OWNER_AUTH', error); }
    try { tariff = loadPinnedGenerationTariff(model); } catch { tariff = null; }
    if (tariff && Number.isSafeInteger(promptTokensUpperBound) && promptTokensUpperBound > 0) {
      try { chargeBoundUsd = worstCaseGenerationUsd({ tariff, model, promptTokensUpperBound, maxOutputTokens: request.max_tokens }); }
      catch (error) { return preflightFailure('SPEND_GUARD', error); }
    }
  }
  // The ledger must remember a paid build even if its artifact directory is deleted. Bind live
  // requests to the deterministic build+revision+backend+arm+prompt identity, not a new UUID per call;
  // distinct arms or changed prompts remain independently measurable.
  const requestId = backend === 'live' ? runId : randomUUID();
  if (backend === 'live') {
    // Validate ledger readability and prior paid identity BEFORE any run directory is allocated.
    // This read is not a reservation; reserveGeneration rechecks atomically under the same lock.
    let priorReservation;
    try { priorReservation = hasGenerationReservation({ ledgerPath, requestId }); }
    catch (error) { return preflightFailure('SPEND_GUARD', error); }
    if (priorReservation) {
      try {
        const prior = JSON.parse(await readFile(join(base, 'run.json'), 'utf8'));
        if (prior.status === 'SUCCESS' && prior.backend === 'live') return { ...output, ...prior, resumed: true };
      } catch { /* An absent or incomplete artifact never overrides a durable reservation. */ }
      return preflightFailure('SPEND_GUARD', new Error('SPEND_GUARD: duplicate call; no request sent'));
    }
  }
  await mkdir(join(resolve(outRoot), keyDirectory, arm), { recursive: true });
  try { await mkdir(base); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const record = JSON.parse(await readFile(join(base, 'run.json'), 'utf8'));
      if (record.status === 'SUCCESS') {
        if (backend === 'live' && !hasGenerationReservation({ ledgerPath, requestId })) {
          throw fail('SPEND_GUARD', 'live success lacks a durable reservation; refusing unverified artifact');
        }
        return { ...output, ...record, resumed: true };
      }
      if (backend === 'live') {
        if (hasGenerationReservation({ ledgerPath, requestId })) {
          throw fail('RUN_EXISTS', 'paid or uncertain live reservation exists; this identity cannot retry');
        }
        // Older runners wrote failed preflight records before checking credentials/authority.
        // Only a known pre-request refusal with NO ledger row is safe to replace.
        if (!['NO_PROVIDER_CONFIG', 'NO_OWNER_AUTH', 'SPEND_GUARD'].includes(record.error?.code)) {
          throw fail('RUN_IN_PROGRESS', 'live run may be active; inspect before clearing this directory');
        }
        await rm(base, { recursive: true, force: true });
        try { await mkdir(base); }
        catch (recoveryError) {
          // A competing generator may reclaim this legacy directory between rm and mkdir.
          rethrowLiveRecoveryMkdirError(recoveryError);
        }
      } else {
        if (!retry) throw fail('RUN_EXISTS', 'failed or unfinished run exists; explicit offline retry only');
        await rm(join(base, 'project'), { recursive: true, force: true });
      }
    } catch (readError) {
      if (readError.code !== 'ENOENT') throw readError;
      if (backend === 'live') {
        if (hasGenerationReservation({ ledgerPath, requestId })) throw fail('RUN_EXISTS', 'paid or uncertain live reservation exists');
        throw fail('RUN_IN_PROGRESS', 'live run without run.json may still be pre-reservation; quiesce generators, verify no ledger row, then remove only an empty orphan directory (docs/eval/generator-runner.md#manual-recovery-of-an-empty-pre-reservation-orphan)');
      }
      if (!retry) throw fail('RUN_EXISTS', 'unfinished run exists; inspect before retry');
    }
  }
  const started = performance.now();
  let reserved = false;
  const record = { status: 'FAILED', project_id: projectId, family, framework, arm, model,
    resolved_revision: revision, build_key: buildKey, decode_config_sha256: decodeSha, decode_config: request,
    transport: { stream: backend === 'live' }, time_limit_ms: backend === 'live' ? 20 * 60_000 : null,
    prompt_sha256: promptSha256, interface_contract_sha256: output.interface_contract_sha256,
    plan_sha256: hash(plan), design_sha256: hash(design), prompt,
    scope: backend === 'live' ? 'generation' : 'offline-stub', bead: backend === 'live' ? 'mwg-train-i5i2.1' : null,
    request_id: requestId, backend, platform: process.platform, node_version: process.version, chrome_version: chromeVersion,
    prompt_tokens: null, completion_tokens: null, reasoning_tokens: null, content_tokens: null,
    finish_reason: 'UNVERIFIED', projected_cost_usd: 'UNVERIFIED', computed_cost_usd: 'UNVERIFIED',
    cost_source_sha256: 'UNVERIFIED' };
  try {
    let completion;
    if (backend === 'stub') completion = normaliseCompletion(canned);
    else {
      // The owner explicitly approved generation without a USD ceiling. The current CLOSED decision
      // was refreshed before allocating this run directory; reservation remains atomic and precedes fetch.
      reserveGeneration({ ledgerPath, approval, chargeBoundUsd, requestId, model, revision, projectId });
      reserved = true;
      record.projected_cost_usd = chargeBoundUsd;
      record.cost_source_sha256 = tariff?.sourceSha256 ?? 'UNVERIFIED';
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
    // Only the reservation site is reachable while live is unreserved; classify by that stage,
    // never by an error-message prefix or a raw OS code (e.g. JSON.parse or ETIMEDOUT).
    record.error = { code: backend === 'live' && !reserved ? 'SPEND_GUARD' : error.code ?? 'GENERATION_FAILED',
      message: apiKey && backend === 'live'
        ? String(error.message).replaceAll(apiKey, '[REDACTED]') : error.message };
  } finally {
    record.wall_time_ms = Math.round(performance.now() - started);
    // The API reports usage, not billed dollars. Compute only against an exact cited inference tariff;
    // otherwise cost is UNVERIFIED, never $0 or a borrowed training/-0731 rate.
    if (reserved) {
      try {
        if (tariff && Number.isSafeInteger(record.prompt_tokens) && Number.isSafeInteger(record.reasoning_tokens) &&
            Number.isSafeInteger(record.content_tokens) && record.content_tokens >= 0) {
          record.computed_cost_usd = Math.ceil(100 * Math.max(tariff.minimumUsd,
            (record.prompt_tokens * tariff.inputUsdPerMillion + record.reasoning_tokens * tariff.reasoningUsdPerMillion +
              record.content_tokens * tariff.outputUsdPerMillion) / 1_000_000)) / 100;
        }
        settleGeneration({ ledgerPath, requestId, model, computedUsd: record.computed_cost_usd,
          status: record.status === 'SUCCESS' ? 'completed' : 'unknown',
          tokens: { prompt: record.prompt_tokens, completion: record.completion_tokens,
            reasoning: record.reasoning_tokens, content: record.content_tokens } });
      } catch {
        record.status = 'FAILED';
        record.error = { code: 'LEDGER_UNSETTLED', message: 'reservation status uncertain; reconcile before any retry' };
      }
    }
    if (backend === 'live' && !reserved) {
      // Reserve can refuse or fail before any request. Remove only our just-created empty run dir;
      // an appended-but-uncertain ledger row still prevents a second paid call on the next attempt.
      await rm(base, { recursive: true, force: true });
    } else {
      await writeFile(join(base, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'w', mode: 0o600 });
    }
  }
  return { ...output, ...record };
}

function dirnamePortable(path) { return path.slice(0, path.lastIndexOf(sep)); }
