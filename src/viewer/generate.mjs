/**
 * The image-generation seam for the /tuning workbench.
 *
 * WHAT THIS IS: an owner-only workbench action that takes the draft the operator is editing and asks a HOSTED image
 * model for a design board, returning the bytes to that browser. It is the interactive counterpart of the batch that
 * produced `docs/provenance/assets/design-layouts.md` on 2026-10-08 (same endpoint, same model).
 *
 * THREE THINGS IT DELIBERATELY DOES NOT DO.
 *
 * 1. It writes nothing. A generated board is returned to the caller and never lands in the tree. That is not caution
 *    for its own sake: every committed board carries a rights record, a SHA in a provenance table, and an approval
 *    flag, and `src/provenance/record.mjs` requires a hosted-api asset to live in arm `A3_teacher_generated` with
 *    `provider`, `model`, `account_ref` and `terms_ref`. A web click that overwrote `docs/design/training/<tr-NN>/
 *    reference.jpg` - which `test/viewer-tuning.test.mjs` treats as an AUTHORED board under the widescreen contract -
 *    would launder an unapproved model output into the authored corpus with no record. Persisting a board is a
 *    separate, deliberate promote step, and this module has no code path that can do it.
 *
 * 2. It does not run a model ON this machine. `docs/eval/pricing.md` records the owner constraint "no models on fleet
 *    VMs" (Paul, 2026-10-08) - that is about GPU compute on a 2 vCPU box with no GPU, and it is why `src/eval/cost.mjs`
 *    says all compute is external. This is a request to somebody else's datacentre; the VM only drives it. Nothing here
 *    loads weights, and there is no local inference path to add by accident.
 *
 * 3. It does not hold a credential. The endpoint is behind a proxy that injects the signed-in account's credentials
 *    itself, so no key, token or header is read from the environment, accepted from the client, or written to a log.
 *    If the endpoint were to require a key, this code has no way to supply one - that is intended, and it is why
 *    `docs/eval/owner-identity.json`'s credential scan stays clean.
 */

import { createHash } from 'node:crypto';

/** The model that produced the committed design boards. Pinned, because provenance needs a name, not a default. */
export const IMAGE_MODEL = 'gemini-nano-banana-2.1';

/**
 * The documented proxy. It is not a secret (it is already published verbatim in docs/provenance/assets/design-layouts.md)
 * and it is overridable so an operator can point the workbench at a different gateway without editing code, and so a
 * test can point it at a fake.
 */
export const DEFAULT_IMAGE_ENDPOINT = `https://gemini.int.exe.xyz/v1beta/models/${IMAGE_MODEL}:generateContent`;

/**
 * A MEASURED floor, not a guess. Asking this model for an image with `maxOutputTokens: 2048` (the workbench draft's
 * default) returns HTTP 200, `finishReason: "MAX_TOKENS"` and NO image part: the model spends ~1000 tokens thinking
 * and an image costs ~1300 more, so the budget is gone before any bytes are emitted. The workbench keeps the
 * operator's number as a hypothesis and this floor is applied at request time, reported back in `notes` so the page
 * can say the effective value rather than silently substituting it.
 */
export const MIN_IMAGE_OUTPUT_TOKENS = 4096;

/** The workbench form's own upper bound. Kept here so request building cannot exceed what the UI offers. */
export const MAX_IMAGE_OUTPUT_TOKENS = 8192;

/** A board is ~0.5 MB; the response is base64 JSON, ~4/3 of that. A cap this far above observed output turns a
 * gateway that streams something unexpected into an error instead of a memory spike. */
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** Generous: the observed wall clock is ~15 s, and the point is to bound a hung socket, not to race a slow image. */
export const DEFAULT_TIMEOUT_MS = 180_000;

/** The only sizes this seam will hand to a browser. A board is a raster image; anything else is a bug upstream. */
const IMAGE_FORMATS = Object.freeze({
  'image/jpeg': (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) =>
    bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
});

/**
 * One error type carrying a stable code and the HTTP status the server should use. The code is what a test asserts on
 * and what the page shows; `message` is for a human reading the panel, and it is always a statement about what
 * actually happened.
 */
export class GenerationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'GenerationError';
    this.code = code;
    this.status = status;
  }
}

const bad = (code, message) => new GenerationError(code, message, 400);
const upstream = (code, message, status = 502) => new GenerationError(code, message, status);

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Read the pixel dimensions out of the bytes themselves. The page reports these next to the board, and a dimension
 * read from the response metadata would be a claim about the image rather than a fact about it.
 * Returns null for bytes whose header cannot be parsed - the caller decides whether that is fatal (it is: an image
 * whose size cannot be established is not a board anyone can judge against the widescreen contract).
 */
export function readImageDimensions(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      // Standalone markers carry no length payload.
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) return null;
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry the frame size; SOF4/SOF8/SOF12 do not.
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        if (offset + 8 >= bytes.length) return null;
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return null;
}

/**
 * Derive what may be generated from the workbench's own committed data, so the set of valid targets is the tree's
 * fact rather than a second list that can go stale. A brief is generatable only if it has an authored variant and at
 * least one scaffolded arm, and an arm is generatable only if it was scaffolded from THAT brief - which is the same
 * pairing `/tuning` displays.
 */
export function allowedTargetsFromTuningData(data) {
  const briefIds = new Set();
  const frameworksByBrief = new Map();
  for (const rows of data.families?.values() ?? []) {
    for (const row of rows) {
      if (!row?.brief_id) continue;
      briefIds.add(row.brief_id);
      if (!frameworksByBrief.has(row.brief_id)) frameworksByBrief.set(row.brief_id, new Set());
    }
  }
  for (const project of data.projects ?? []) {
    const set = frameworksByBrief.get(project?.brief_id);
    if (set && project?.framework) set.add(project.framework);
  }
  return { briefIds, frameworksByBrief };
}

/**
 * Validate a draft against the same bounds the workbench form declares, plus the two facts that make the request
 * attributable: the brief it was derived from, and the framework arm it was inspected under. This runs on the server
 * because a form attribute is a hint to the browser, not a constraint on the request - anyone can POST anything.
 *
 * `allowed` is `{ briefIds: Set<string>, frameworksByBrief: Map<string, Set<string>> }` from the committed tree, so a
 * brief or framework that does not exist in THIS checkout is refused rather than forwarded to the model.
 */
export function validateGenerationDraft(draft, allowed) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw bad('BAD_DRAFT', 'the request body must be a JSON object describing one draft');
  const briefId = draft.brief_id;
  if (typeof briefId !== 'string' || !briefId) throw bad('MISSING_FIELD', 'brief_id is required');
  if (!allowed.briefIds.has(briefId)) {
    throw bad('UNKNOWN_BRIEF', `brief_id "${briefId.slice(0, 80)}" is not an authored training brief in this checkout`);
  }
  const framework = draft.framework;
  if (typeof framework !== 'string' || !framework) throw bad('MISSING_FIELD', 'framework is required');
  const frameworks = allowed.frameworksByBrief.get(briefId);
  if (!frameworks || !frameworks.has(framework)) {
    throw bad('UNKNOWN_FRAMEWORK', `framework "${framework.slice(0, 40)}" has no scaffolded record for ${briefId}`);
  }
  const prompt = draft.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length < 80) {
    throw bad('OUT_OF_RANGE', 'prompt must be a string of at least 80 characters, matching the editor minimum');
  }
  if (prompt.length > 8000) throw bad('OUT_OF_RANGE', `prompt is ${prompt.length} characters; the cap is 8000`);
  const guidance = draft.system_guidance ?? '';
  if (typeof guidance !== 'string') throw bad('OUT_OF_RANGE', 'system_guidance must be a string');
  if (guidance.length > 4000) throw bad('OUT_OF_RANGE', `system_guidance is ${guidance.length} characters; the cap is 4000`);
  const settings = draft.settings ?? {};
  if (typeof settings !== 'object' || Array.isArray(settings)) throw bad('OUT_OF_RANGE', 'settings must be an object');
  const temperature = Number(settings.temperature);
  if (!isFiniteNumber(temperature) || temperature < 0 || temperature > 2) throw bad('OUT_OF_RANGE', 'settings.temperature must be between 0 and 2');
  const maxTokens = Number(settings.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > MAX_IMAGE_OUTPUT_TOKENS) {
    throw bad('OUT_OF_RANGE', `settings.max_tokens must be an integer between 256 and ${MAX_IMAGE_OUTPUT_TOKENS}`);
  }
  const seed = settings.seed === undefined || settings.seed === null || settings.seed === '' ? null : Number(settings.seed);
  if (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > 2147483647)) {
    throw bad('OUT_OF_RANGE', 'settings.seed must be an integer between 0 and 2147483647');
  }
  return { briefId, framework, prompt, guidance, temperature, maxTokens, seed };
}

/**
 * Build the generateContent body. Pure, so the wire format can be asserted without a network call, and so the
 * token floor and the seed decision are visible in one place rather than spread through the handler.
 *
 * `seed` is sent only when the operator set one. Whether the endpoint honours it is not asserted here: the code never
 * claims a generation is reproducible, and the board's SHA is recorded as a fact about the bytes, not as evidence of
 * reproducibility.
 */
export function buildGenerationRequest({ prompt, guidance, temperature, maxTokens, seed }) {
  const effectiveMaxOutputTokens = clamp(Math.max(maxTokens, MIN_IMAGE_OUTPUT_TOKENS), MIN_IMAGE_OUTPUT_TOKENS, MAX_IMAGE_OUTPUT_TOKENS);
  const notes = [];
  if (effectiveMaxOutputTokens !== maxTokens) {
    notes.push(`max_tokens raised from ${maxTokens} to ${effectiveMaxOutputTokens}: below ${MIN_IMAGE_OUTPUT_TOKENS} this model spends the whole budget thinking and returns no image`);
  }
  const generationConfig = {
    responseModalities: ['IMAGE'],
    temperature,
    maxOutputTokens: effectiveMaxOutputTokens,
  };
  if (seed !== null) generationConfig.seed = seed;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (guidance.trim()) body.systemInstruction = { parts: [{ text: guidance }] };
  return { body, effectiveMaxOutputTokens, notes };
}

/**
 * Pull the image out of a generateContent response, or say exactly why there is none. Every failure path the model
 * actually produces is named: a truncated budget is MAX_TOKENS (with the floor in the message), a refusal is
 * CONTENT_BLOCKED, and "200 with no parts" is NO_IMAGE_PART rather than a blank board.
 */
export function extractGeneratedImage(payload) {
  if (!payload || typeof payload !== 'object') throw upstream('BAD_UPSTREAM_JSON', 'the image endpoint returned a response that is not a JSON object');
  const feedback = payload.promptFeedback ?? {};
  if (feedback.blockReason) {
    throw upstream('CONTENT_BLOCKED', `the model refused this prompt (blockReason: ${String(feedback.blockReason).slice(0, 80)})`);
  }
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!candidates.length) throw upstream('NO_CANDIDATE', 'the image endpoint returned no candidate at all');
  const candidate = candidates[0];
  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const imagePart = parts.find((part) => {
    const inline = part?.inlineData ?? part?.inline_data;
    return inline && typeof inline.data === 'string' && inline.data.length > 0;
  });
  if (!imagePart) {
    const finish = candidate.finishReason ?? 'absent';
    if (finish === 'MAX_TOKENS') {
      const usage = payload.usageMetadata ?? {};
      throw upstream('MAX_TOKENS', `the model ran out of output budget before emitting an image (finishReason: MAX_TOKENS, ${usage.thoughtsTokenCount ?? 'unrecorded'} thinking tokens of ${usage.totalTokenCount ?? 'unrecorded'} total). Raise max tokens and try again.`);
    }
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'RECITATION' || finish === 'IMAGE_SAFETY') {
      throw upstream('CONTENT_BLOCKED', `the model refused to produce an image for this prompt (finishReason: ${finish})`);
    }
    const kinds = parts.map((part) => (part?.thought ? 'thought' : typeof part?.text === 'string' ? 'text' : 'other')).join(', ');
    throw upstream('NO_IMAGE_PART', `the response carried no image part (finishReason: ${finish}${kinds ? `, non-image parts: ${kinds}` : ', zero parts'})`);
  }
  const inline = imagePart.inlineData ?? imagePart.inline_data;
  const declaredMime = typeof inline.mimeType === 'string' ? inline.mimeType : typeof inline.mime_type === 'string' ? inline.mime_type : null;
  const bytes = Buffer.from(inline.data, 'base64');
  if (!bytes.length) throw upstream('BAD_IMAGE_BASE64', 'the image part decoded to zero bytes');
  // Magic bytes decide, not the declared type: the client is told one content type and served the bytes under it.
  const mime = Object.keys(IMAGE_FORMATS).find((type) => IMAGE_FORMATS[type](bytes)) ?? null;
  if (!mime) {
    throw upstream('BAD_IMAGE_MAGIC', `the image part is not a JPEG or PNG (declared: ${declaredMime ?? 'absent'}, first bytes: ${bytes.subarray(0, 4).toString('hex')})`);
  }
  return { bytes, mime, declaredMime };
}

/**
 * A bounded generator: one call in flight, and a minimum interval between two calls. The workbench is reachable by
 * anyone the exe.dev proxy admits and every call spends money and ~15 s, so an unthrottled button is a way to buy a
 * lot of images by holding the keyboard. Both limits answer 429 with a message the page can show verbatim.
 */
export function createBoardGenerator({
  endpoint = DEFAULT_IMAGE_ENDPOINT,
  model = IMAGE_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  minIntervalMs = 5000,
  maxResponseBytes = MAX_RESPONSE_BYTES,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('createBoardGenerator needs a fetch implementation');
  let inFlight = false;
  let lastAttemptAt = 0;

  async function call({ body, signal }) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        // No credential is attached and none can be: the proxy in front of the endpoint injects the account's own
        // credentials, which is why this method has no header-construction path to review.
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw upstream('UPSTREAM_TIMEOUT', `the image endpoint did not answer within ${Math.round(timeoutMs / 1000)}s`, 504);
      }
      throw upstream('UPSTREAM_UNREACHABLE', `the image endpoint could not be reached: ${String(error?.message ?? error).slice(0, 200)}`);
    }
    const declaredLength = Number(response.headers?.get?.('content-length') ?? NaN);
    if (isFiniteNumber(declaredLength) && declaredLength > maxResponseBytes) {
      throw upstream('RESPONSE_TOO_LARGE', `the image endpoint announced ${declaredLength} bytes, above the ${maxResponseBytes} byte cap`);
    }
    let text;
    try {
      text = await response.text();
    } catch (error) {
      throw upstream('UPSTREAM_UNREACHABLE', `the image response could not be read: ${String(error?.message ?? error).slice(0, 200)}`);
    }
    if (text.length > maxResponseBytes) {
      throw upstream('RESPONSE_TOO_LARGE', `the image response is ${text.length} characters, above the ${maxResponseBytes} byte cap`);
    }
    if (!response.ok) {
      // The gateway's own words, truncated: an operator fixing a config needs the reason, and it is not a secret
      // (it is an API error, never an echo of the prompt or of any credential).
      let detail = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text);
        detail = String(parsed?.error?.message ?? parsed?.error ?? detail).slice(0, 300);
      } catch { /* Not JSON: the raw prefix is the best available statement of what happened. */ }
      throw upstream('UPSTREAM_HTTP', `the image endpoint answered ${response.status}: ${detail}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw upstream('BAD_UPSTREAM_JSON', `the image endpoint answered ${response.status} with a body that is not JSON (${text.slice(0, 120)})`);
    }
  }

  /**
   * Generate one board. Returns the bytes and the facts about them - never a path, because nothing is written.
   */
  async function generate({ draft, allowed }) {
    const validated = validateGenerationDraft(draft, allowed);
    if (inFlight) throw new GenerationError('BUSY', 'an image is already being generated; wait for it to finish before starting another', 429);
    const since = now() - lastAttemptAt;
    if (lastAttemptAt && since < minIntervalMs) {
      throw new GenerationError('COOLDOWN', `a generation was started ${Math.round(since / 1000)}s ago; this workbench allows one every ${Math.round(minIntervalMs / 1000)}s`, 429);
    }
    const { body, effectiveMaxOutputTokens, notes } = buildGenerationRequest(validated);
    inFlight = true;
    lastAttemptAt = now();
    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const payload = await call({ body, signal: controller.signal });
      const { bytes, mime, declaredMime } = extractGeneratedImage(payload);
      const dimensions = readImageDimensions(bytes);
      if (!dimensions) throw upstream('BAD_IMAGE_MAGIC', 'the image bytes could not be measured, so the board cannot be compared against the widescreen contract');
      const usage = payload.usageMetadata ?? {};
      return {
        model,
        endpoint,
        mime,
        declaredMime,
        bytes,
        sha256: sha256(bytes),
        width: dimensions.width,
        height: dimensions.height,
        requestedMaxOutputTokens: validated.maxTokens,
        effectiveMaxOutputTokens,
        promptSha256: sha256(validated.prompt),
        promptBytes: Buffer.byteLength(validated.prompt, 'utf8'),
        guidanceApplied: !!validated.guidance.trim(),
        briefId: validated.briefId,
        framework: validated.framework,
        temperature: validated.temperature,
        seedSent: validated.seed,
        finishReason: payload.candidates?.[0]?.finishReason ?? null,
        totalTokens: usage.totalTokenCount ?? null,
        thoughtsTokens: usage.thoughtsTokenCount ?? null,
        elapsedMs: now() - startedAt,
        notes,
      };
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  }

  return { generate, model, endpoint, timeoutMs, minIntervalMs };
}
