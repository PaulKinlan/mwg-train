import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { createViewer } from '../src/viewer/server.mjs';
import { loadTuningData, renderTuning } from '../src/viewer/tuning.mjs';
import {
  allowedTargetsFromTuningData,
  buildGenerationRequest,
  createBoardGenerator,
  extractGeneratedImage,
  GenerationError,
  IMAGE_MODEL,
  MIN_IMAGE_OUTPUT_TOKENS,
  readImageDimensions,
  validateGenerationDraft,
} from '../src/viewer/generate.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * A real JPEG, built by hand so it is a few bytes instead of a megabyte: SOI, a SOF0 frame header carrying the size,
 * EOI. It is valid enough that `readImageDimensions` and the magic-byte check both accept it, which is what the
 * assertions below need - and the same reader is separately checked against the committed boards on disk.
 */
function tinyJpeg(width, height, byte = 0x11) {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2); // length field: precision + height + width + components, plus the two length bytes
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof.writeUInt8(3, 9);
  sof.fill(byte, 10, 19);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}

const imageResponse = (bytes, { mime = 'image/jpeg', usage = { totalTokenCount: 3211, thoughtsTokenCount: 992 }, finishReason = 'STOP', extra = {} } = {}) => ({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: bytes.toString('base64') } }] }, finishReason }],
  usageMetadata: usage,
  modelVersion: IMAGE_MODEL,
  ...extra,
});

/** A fetch stand-in: records the request and answers with a prepared body. No test in this file touches a network. */
function fakeFetch(responder) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const result = await responder({ url, init, index: calls.length - 1 });
    if (result instanceof Response) return result;
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result.body ?? result), {
      status: result.status ?? 200,
      headers: { 'content-type': 'application/json', ...(result.headers ?? {}) },
    });
  };
  impl.calls = calls;
  return impl;
}

const allowedFor = () => allowedTargetsFromTuningData(loadTuningData(ROOT));

const validDraft = (overrides = {}) => ({
  schema_version: 1,
  brief_id: 'tr-01-v1',
  framework: 'raw',
  prompt: 'Build a bicycle repair booking page with a calendar strip, three service cards and a confirmation step for the chosen slot.',
  system_guidance: '',
  settings: { temperature: 0.7, max_tokens: 2048, seed: 42 },
  ...overrides,
});

// ---------------------------------------------------------------------------------------------------------------------
// 1. The token floor: a measured fact, not a preference
// ---------------------------------------------------------------------------------------------------------------------

test('the request raises max_tokens to the measured image floor, and says so', () => {
  const low = buildGenerationRequest({ prompt: 'x', guidance: '', temperature: 0.7, maxTokens: 2048, seed: null });
  assert.equal(low.effectiveMaxOutputTokens, MIN_IMAGE_OUTPUT_TOKENS);
  assert.equal(low.body.generationConfig.maxOutputTokens, MIN_IMAGE_OUTPUT_TOKENS);
  assert.equal(low.notes.length, 1, 'raising the operator number must be reported, not silent');
  assert.match(low.notes[0], /raised from 2048 to 4096/);
  assert.deepEqual(low.body.generationConfig.responseModalities, ['IMAGE']);

  const high = buildGenerationRequest({ prompt: 'x', guidance: '', temperature: 0.7, maxTokens: 8192, seed: null });
  assert.equal(high.effectiveMaxOutputTokens, 8192);
  assert.deepEqual(high.notes, [], 'an operator number above the floor is honoured and is not a note');

  const exactly = buildGenerationRequest({ prompt: 'x', guidance: '', temperature: 0.7, maxTokens: MIN_IMAGE_OUTPUT_TOKENS, seed: null });
  assert.deepEqual(exactly.notes, [], 'the floor itself is not an adjustment');
});

test('the request sends a system instruction only when there is guidance, and a seed only when one was set', () => {
  const bare = buildGenerationRequest({ prompt: 'p', guidance: '   ', temperature: 0, maxTokens: 4096, seed: null });
  assert.equal('systemInstruction' in bare.body, false);
  assert.equal('seed' in bare.body.generationConfig, false);
  assert.equal(bare.body.contents[0].parts[0].text, 'p');

  const guided = buildGenerationRequest({ prompt: 'p', guidance: 'Stay flat and editorial.', temperature: 1.4, maxTokens: 4096, seed: 7 });
  assert.deepEqual(guided.body.systemInstruction, { parts: [{ text: 'Stay flat and editorial.' }] });
  assert.equal(guided.body.generationConfig.seed, 7);
  assert.equal(guided.body.generationConfig.temperature, 1.4);
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. Every way the model can fail to return a board, named
// ---------------------------------------------------------------------------------------------------------------------

test('extractGeneratedImage returns verified bytes and the type the magic bytes prove', () => {
  const bytes = tinyJpeg(1376, 768);
  const found = extractGeneratedImage(imageResponse(bytes));
  assert.equal(found.mime, 'image/jpeg');
  assert.equal(found.declaredMime, 'image/jpeg');
  assert.deepEqual(found.bytes, bytes);
});

test('a declared content type is not trusted over the bytes', () => {
  // The upstream calls it a PNG and hands over JPEG bytes. The bytes win, and the discrepancy is still recorded.
  const found = extractGeneratedImage(imageResponse(tinyJpeg(1376, 768), { mime: 'image/png' }));
  assert.equal(found.mime, 'image/jpeg');
  assert.equal(found.declaredMime, 'image/png');
});

test('a response with no image part fails with a code that names the reason', () => {
  const runOut = extractGeneratedImageSafely({
    candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }] }, finishReason: 'MAX_TOKENS' }],
    usageMetadata: { thoughtsTokenCount: 992, totalTokenCount: 1549 },
  });
  assert.equal(runOut.code, 'MAX_TOKENS');
  assert.match(runOut.message, /992 thinking tokens of 1549 total/);
  assert.match(runOut.message, /Raise max tokens/);

  const refused = extractGeneratedImageSafely({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });
  assert.equal(refused.code, 'CONTENT_BLOCKED');
  assert.match(refused.message, /PROHIBITED_CONTENT/);

  const safety = extractGeneratedImageSafely({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] });
  assert.equal(safety.code, 'CONTENT_BLOCKED');

  const empty = extractGeneratedImageSafely({ candidates: [{ content: { parts: [{ text: 'no image here' }] }, finishReason: 'STOP' }] });
  assert.equal(empty.code, 'NO_IMAGE_PART');
  assert.match(empty.message, /non-image parts: text/);

  assert.equal(extractGeneratedImageSafely({ candidates: [] }).code, 'NO_CANDIDATE');
  assert.equal(extractGeneratedImageSafely(null).code, 'BAD_UPSTREAM_JSON');
});

test('bytes that are not an image are refused, whatever they are labelled', () => {
  const notAnImage = extractGeneratedImageSafely({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: Buffer.from('this is not a jpeg at all').toString('base64') } }] }, finishReason: 'STOP' }],
  });
  assert.equal(notAnImage.code, 'BAD_IMAGE_MAGIC');
  assert.match(notAnImage.message, /image\/jpeg/);

  const emptyData = extractGeneratedImageSafely({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: '' } }] }, finishReason: 'STOP' }],
  });
  assert.equal(emptyData.code, 'NO_IMAGE_PART', 'an image part with no data is not an image part');
});

function extractGeneratedImageSafely(payload) {
  try {
    extractGeneratedImage(payload);
    return null;
  } catch (error) {
    assert.ok(error instanceof GenerationError, `expected a GenerationError, got ${error?.name}: ${error?.message}`);
    return error;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Dimensions come from the bytes, and are right for the committed boards too
// ---------------------------------------------------------------------------------------------------------------------

test('image dimensions are read from the bytes, including the real committed boards', () => {
  assert.deepEqual(readImageDimensions(tinyJpeg(1376, 768)), { width: 1376, height: 768 });
  assert.deepEqual(readImageDimensions(tinyJpeg(640, 480)), { width: 640, height: 480 });

  // T.81 permits fill bytes before a marker (FF FF ... FF C0). Read as a marker, that leading FF yields a bogus length
  // which skips past the frame header and reports a valid JPEG as unmeasurable.
  const filled = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xff]), tinyJpeg(800, 600).subarray(2)]);
  assert.deepEqual(readImageDimensions(filled), { width: 800, height: 600 }, 'FF fill bytes must not hide the frame header');

  // The same reader against the authored reference board and an authored PNG target: if it disagreed with the files on
  // disk, every number the page shows beside a generated board would be unfounded.
  const reference = readImageDimensions(readFileSync(join(ROOT, 'docs/design/training/tr-01/reference.jpg')));
  assert.deepEqual(reference, { width: 1376, height: 768 });
  const target = readImageDimensions(readFileSync(join(ROOT, 'data/A1_self_generated/targets/tr-01/target.png')));
  assert.equal(target.width, 1280);

  assert.equal(readImageDimensions(Buffer.from('nope')), null);
  assert.equal(readImageDimensions(Buffer.alloc(0)), null);
  assert.equal(readImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null, 'a JPEG with no frame header has no size to report');
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. Validation: the server, not the form, decides what is generatable
// ---------------------------------------------------------------------------------------------------------------------

test('validation refuses anything the committed tree does not contain, and every out-of-range setting', () => {
  const allowed = allowedFor();
  assert.equal(allowed.briefIds.size, 60, '30 training families x 2 authored voices');
  assert.ok(allowed.frameworksByBrief.get('tr-01-v1').has('raw'));

  const expect = (draft, code, match) => {
    try {
      validateGenerationDraft(draft, allowed);
      assert.fail(`expected ${code}, but validation passed`);
    } catch (error) {
      assert.ok(error instanceof GenerationError, `expected a GenerationError, got ${error?.message}`);
      assert.equal(error.code, code);
      assert.equal(error.status, 400);
      if (match) assert.match(error.message, match);
    }
  };

  validateGenerationDraft(validDraft(), allowed);
  expect(validDraft({ brief_id: 'fam-r01-v1' }), 'UNKNOWN_BRIEF', /not an authored training brief/);
  expect(validDraft({ brief_id: 'tr-99-v1' }), 'UNKNOWN_BRIEF');
  expect(validDraft({ brief_id: undefined }), 'MISSING_FIELD');
  // A framework that exists in the repository but was not scaffolded from THIS brief is not generatable either, and
  // `angular` is not an arm at all: both directions of the pairing are checked, not just "the name looks plausible".
  expect(validDraft({ framework: 'angular' }), 'UNKNOWN_FRAMEWORK');
  expect(validDraft({ brief_id: 'fam-r01-v1', framework: 'svelte' }), 'UNKNOWN_BRIEF');
  expect(validDraft({ framework: '' }), 'MISSING_FIELD');
  expect(validDraft({ prompt: 'too short' }), 'OUT_OF_RANGE', /at least 80 characters/);
  expect(validDraft({ prompt: 'x'.repeat(8001) }), 'OUT_OF_RANGE', /cap is 8000/);
  expect(validDraft({ system_guidance: 'x'.repeat(4001) }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 3, max_tokens: 4096, seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 0.7, max_tokens: 999999, seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 0.7, max_tokens: 4096.5, seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 0.7, max_tokens: 4096, seed: -1 } }), 'OUT_OF_RANGE');
  // Coercion leniency: these all used to pass because `Number(...)` turned them into in-range numbers. A JSON endpoint
  // that says "a number between 0 and 2" and then accepts `true` is describing itself wrongly.
  expect(validDraft({ settings: { temperature: true, max_tokens: 4096, seed: 1 } }), 'OUT_OF_RANGE', /temperature must be a number/);
  expect(validDraft({ settings: { temperature: '', max_tokens: 4096, seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: '0.7', max_tokens: 4096, seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 0.7, max_tokens: [4096], seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 0.7, max_tokens: '4096', seed: 1 } }), 'OUT_OF_RANGE');
  expect(validDraft({ settings: { temperature: 0.7, max_tokens: 4096, seed: true } }), 'OUT_OF_RANGE');
  expect(validDraft({ brief_id: undefined }), 'MISSING_FIELD');
  expect(validDraft({ framework: undefined }), 'MISSING_FIELD');
  expect(null, 'BAD_DRAFT');
  expect([validDraft()], 'BAD_DRAFT');
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. The generator itself: request shape, bounds, and every upstream failure mode
// ---------------------------------------------------------------------------------------------------------------------

test('the generator posts the built request and returns the facts about the bytes', async () => {
  const bytes = tinyJpeg(1376, 768);
  const fetchImpl = fakeFetch(() => imageResponse(bytes));
  const generator = createBoardGenerator({ fetchImpl, minIntervalMs: 0, now: () => 1000 });
  const board = await generator.generate({ draft: validDraft(), allowed: allowedFor() });

  assert.equal(fetchImpl.calls.length, 1, 'exactly one call per generation');
  const call = fetchImpl.calls[0];
  assert.equal(call.url, generator.endpoint);
  assert.equal(call.init.method, 'POST');
  // No credential can be attached: there is no header-construction path in the module.
  assert.deepEqual(Object.keys(call.init.headers), ['content-type', 'accept']);
  assert.equal(call.body.generationConfig.maxOutputTokens, MIN_IMAGE_OUTPUT_TOKENS, 'the floor is applied on the wire');
  assert.equal(call.body.generationConfig.responseModalities[0], 'IMAGE');
  assert.equal(call.body.contents[0].parts[0].text, validDraft().prompt);

  assert.deepEqual(board.bytes, bytes);
  assert.equal(board.mime, 'image/jpeg');
  assert.equal(board.model, IMAGE_MODEL);
  assert.equal(board.width, 1376);
  assert.equal(board.height, 768);
  assert.equal(board.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(board.promptSha256, createHash('sha256').update(validDraft().prompt).digest('hex'));
  assert.equal(board.briefId, 'tr-01-v1');
  assert.equal(board.framework, 'raw');
  assert.equal(board.requestedMaxOutputTokens, 2048);
  assert.equal(board.effectiveMaxOutputTokens, MIN_IMAGE_OUTPUT_TOKENS);
  assert.equal(board.notes.length, 1, 'the raised floor travels with the result so the page can report it');
  assert.match(board.notes[0], /raised from 2048 to 4096/);
  assert.equal(board.thoughtsTokens, 992);
  assert.equal(board.finishReason, 'STOP');
  // `bytes` is what the route sends; nothing in the result is a path, because nothing is written.
  assert.equal(Object.values(board).some((value) => typeof value === 'string' && value.includes('/') && value.startsWith('/')), false);
});

test('an upstream HTTP error is reported with the gateway\u2019s own words and mapped to 502', async () => {
  const fetchImpl = fakeFetch(() => ({ status: 400, body: { error: { code: 400, message: 'contents is not specified', status: 'INVALID_ARGUMENT' } } }));
  const generator = createBoardGenerator({ fetchImpl, minIntervalMs: 0 });
  const error = await generateAndCatch(generator);
  assert.equal(error.code, 'UPSTREAM_HTTP');
  assert.equal(error.status, 502);
  assert.match(error.message, /answered 400: contents is not specified/);
});

test('an unreachable endpoint, a timeout and an oversized response each fail with their own code', async () => {
  const boom = createBoardGenerator({ fetchImpl: fakeFetch(() => new Error('getaddrinfo ENOTFOUND gemini.int.exe.xyz')), minIntervalMs: 0 });
  const unreachable = await generateAndCatch(boom);
  assert.equal(unreachable.code, 'UPSTREAM_UNREACHABLE');
  assert.match(unreachable.message, /could not be reached/);

  // A fetch that only settles when the abort signal fires: the real shape of a hung socket.
  const hang = createBoardGenerator({
    fetchImpl: (url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
    timeoutMs: 30,
    minIntervalMs: 0,
  });
  const timedOut = await generateAndCatch(hang);
  assert.equal(timedOut.code, 'UPSTREAM_TIMEOUT');
  assert.equal(timedOut.status, 504);

  const huge = createBoardGenerator({
    fetchImpl: fakeFetch(() => ({ status: 200, body: {}, headers: { 'content-length': String(64 * 1024 * 1024) } })),
    minIntervalMs: 0,
  });
  const tooLarge = await generateAndCatch(huge);
  assert.equal(tooLarge.code, 'RESPONSE_TOO_LARGE');

  // The cap that matters: a CHUNKED response with no content-length header at all. The declared-header check cannot
  // see this one, so if the bound were only applied after buffering, this is the request that would prove it.
  let chunksServed = 0;
  const unbounded = createBoardGenerator({
    fetchImpl: async () => new Response(new ReadableStream({
      pull(controller) {
        chunksServed += 1;
        controller.enqueue(new Uint8Array(1024 * 1024).fill(0x61));
        if (chunksServed > 64) controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    maxResponseBytes: 4 * 1024 * 1024,
    minIntervalMs: 0,
  });
  const stopped = await generateAndCatch(unbounded);
  assert.equal(stopped.code, 'RESPONSE_TOO_LARGE');
  assert.match(stopped.message, /was not buffered in full/);
  assert.ok(chunksServed < 64, `reading must stop at the cap, but ${chunksServed} MiB was pulled from the stream`);

  const notJson = createBoardGenerator({ fetchImpl: async () => new Response('<html>gateway</html>', { status: 200 }), minIntervalMs: 0 });
  const unparsable = await generateAndCatch(notJson);
  assert.equal(unparsable.code, 'BAD_UPSTREAM_JSON');
});

test('a response that stalls mid-body is a timeout (504), not an unreachable gateway (502)', async () => {
  // Headers arrive, then the body never does. The abort fires while reading the body, not while connecting, which is a
  // different code path from a fetch that never resolves at all - and it must not tell the operator the network is
  // down when the gateway answered and then went quiet.
  let cancelled = false;
  const stalling = createBoardGenerator({
    fetchImpl: async (url, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"candidates":'));
        init.signal.addEventListener('abort', () => { cancelled = true; controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
      },
      cancel() { cancelled = true; },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    timeoutMs: 30,
    minIntervalMs: 0,
  });
  const stalled = await generateAndCatch(stalling);
  assert.equal(stalled.code, 'UPSTREAM_TIMEOUT');
  assert.equal(stalled.status, 504);
  assert.match(stalled.message, /stopped sending its response before the 0s deadline|deadline/);
  assert.equal(cancelled, true, 'the stalled stream must actually be aborted');
});

test('the workbench allows one generation at a time, with a cooldown between them', async () => {
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  const fetchImpl = fakeFetch(async () => { await gate; return imageResponse(tinyJpeg(1376, 768)); });
  const generator = createBoardGenerator({ fetchImpl, minIntervalMs: 0 });

  const first = generator.generate({ draft: validDraft(), allowed: allowedFor() });
  const second = await generateAndCatch(generator);
  assert.equal(second.code, 'BUSY');
  assert.equal(second.status, 429);
  assert.equal(fetchImpl.calls.length, 1, 'a refused second call must not reach the model at all');

  release();
  assert.equal((await first).width, 1376);

  // The cooldown is measured against the clock, so it is checked with a clock rather than a sleep.
  let clock = 1_000_000;
  const cooled = createBoardGenerator({ fetchImpl: fakeFetch(() => imageResponse(tinyJpeg(1376, 768))), minIntervalMs: 5000, now: () => clock });
  await cooled.generate({ draft: validDraft(), allowed: allowedFor() });
  const tooSoon = await generateAndCatch(cooled);
  assert.equal(tooSoon.code, 'COOLDOWN');
  assert.equal(tooSoon.status, 429);
  clock += 5001;
  const allowedNow = await cooled.generate({ draft: validDraft(), allowed: allowedFor() });
  assert.equal(allowedNow.width, 1376);
});

test('the cooldown starts when a generation FINISHES, so a slow one still spaces out the next', async () => {
  // The bug this pins: with the clock taken at the START of a call, a real ~15s generation had already outlived a 5s
  // interval by the time it returned, so the next press went straight out and the interval bounded nothing at all -
  // it only throttled fast failures. The clock below advances DURING the call, exactly as a real one does.
  let clock = 500_000;
  const fetchImpl = fakeFetch(() => { clock += 20_000; return imageResponse(tinyJpeg(1376, 768)); });
  const generator = createBoardGenerator({ fetchImpl, minIntervalMs: 5000, now: () => clock });

  await generator.generate({ draft: validDraft(), allowed: allowedFor() });
  const immediately = await generateAndCatch(generator);
  assert.equal(immediately.code, 'COOLDOWN', 'a 20s generation must still be followed by the interval');
  assert.equal(fetchImpl.calls.length, 1);

  clock += 5001;
  await generator.generate({ draft: validDraft(), allowed: allowedFor() });
  assert.equal(fetchImpl.calls.length, 2);
});

async function generateAndCatch(generator, draft = validDraft()) {
  try {
    await generator.generate({ draft, allowed: allowedFor() });
    assert.fail('expected the generator to throw');
  } catch (error) {
    assert.ok(error instanceof GenerationError, `expected a GenerationError, got ${error?.name}: ${error?.message}`);
    return error;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. The route: draft in, bytes out, nothing written
// ---------------------------------------------------------------------------------------------------------------------

/** A fingerprint of every file under a directory: name, size and mtime. A write of any kind changes it. */
function fingerprint(dir) {
  const seen = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else seen.push(`${relative(dir, full)}:${statSync(full).size}:${statSync(full).mtimeMs}`);
    }
  };
  walk(dir);
  return seen.sort();
}

async function withViewer(t, options, run) {
  const stateDir = mkdtempSync(join(tmpdir(), 'nb0-generate-'));
  const { server, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot: ROOT, ...options });
  t.after(() => { pool.stopAll(); server.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return run({
    base: `http://127.0.0.1:${server.address().port}`,
    post: (body, init = {}) => fetch(`http://127.0.0.1:${server.address().port}/tuning/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    }),
  });
}

test('POST /tuning/generate returns the board with its metadata and writes nothing to the repository', async (t) => {
  const bytes = tinyJpeg(1376, 768, 0x42);
  const fetchImpl = fakeFetch(() => imageResponse(bytes));
  const watched = ['docs/design/training', 'data/A1_self_generated/targets', 'docs/train/briefs', 'docs/provenance'];
  const before = watched.map((dir) => fingerprint(join(ROOT, dir)));

  await withViewer(t, { boardGenerator: createBoardGenerator({ fetchImpl, minIntervalMs: 0 }) }, async ({ post }) => {
    const response = await post(validDraft());
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/jpeg/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-mwg-model'), IMAGE_MODEL);
    assert.equal(response.headers.get('x-mwg-width'), '1376');
    assert.equal(response.headers.get('x-mwg-height'), '768');
    assert.equal(response.headers.get('x-mwg-sha256'), createHash('sha256').update(bytes).digest('hex'));
    assert.equal(response.headers.get('x-mwg-requested-max-output-tokens'), '2048');
    assert.equal(response.headers.get('x-mwg-max-output-tokens'), String(MIN_IMAGE_OUTPUT_TOKENS));
    assert.match(decodeURIComponent(response.headers.get('x-mwg-notes')), /raised from 2048 to 4096/);
    const returned = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(returned, bytes, 'the bytes served are the bytes the model returned, untouched');
    assert.equal(fetchImpl.calls.length, 1);
  });

  // The whole point of returning bytes instead of storing them: the authored corpus, the target manifest, the briefs
  // and the provenance records are byte-identical after a generation.
  assert.deepEqual(watched.map((dir) => fingerprint(join(ROOT, dir))), before, 'a generation must not modify the repository');
});

test('the route refuses a malformed, oversized or wrong-content-type body before it reads a draft', async (t) => {
  const fetchImpl = fakeFetch(() => imageResponse(tinyJpeg(1376, 768)));
  await withViewer(t, { boardGenerator: createBoardGenerator({ fetchImpl, minIntervalMs: 0 }) }, async ({ post, base }) => {
    const wrongType = await fetch(`${base}/tuning/generate`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 400);
    assert.equal((await wrongType.json()).error, 'BAD_CONTENT_TYPE');

    const notJson = await post('{not json');
    assert.equal(notJson.status, 400);
    assert.equal((await notJson.json()).error, 'BAD_JSON');

    const oversized = await post(JSON.stringify({ ...validDraft(), system_guidance: 'x'.repeat(70 * 1024) }));
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, 'BODY_TOO_LARGE');

    assert.equal(fetchImpl.calls.length, 0, 'none of these may reach the model');
  });
});

test('a chunked body past the cap is answered 413, not a dropped socket', async (t) => {
  // The body here declares no content-length, so the early header check cannot catch it and the running total is the
  // only bound. Destroying the socket at that point aborts the connection before the 413 can be written, and the
  // client sees a socket hang up instead of the reason, on the one path with no early cap to hit.
  const fetchImpl = fakeFetch(() => imageResponse(tinyJpeg(1376, 768)));
  await withViewer(t, { boardGenerator: createBoardGenerator({ fetchImpl, minIntervalMs: 0 }) }, async ({ base }) => {
    const answer = await new Promise((resolveAnswer, rejectAnswer) => {
      const url = new URL('/tuning/generate', base);
      const req = httpRequest({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolveAnswer({ status: res.statusCode, body, connection: res.headers.connection }));
      });
      // Settled before any late socket error can reject: the response is the evidence.
      req.on('error', (error) => rejectAnswer(error));
      for (let i = 0; i < 5; i += 1) req.write(Buffer.alloc(16 * 1024, 0x78));
      req.end();
    });
    assert.equal(answer.status, 413, 'the refusal must reach the client as a response, not as ECONNRESET');
    assert.equal(JSON.parse(answer.body).error, 'BODY_TOO_LARGE');
    assert.equal(answer.connection, 'close');
    assert.equal(fetchImpl.calls.length, 0);
  });
});

test('the route refuses an ungeneratable brief, framework or setting with a 400 naming the field', async (t) => {
  const fetchImpl = fakeFetch(() => imageResponse(tinyJpeg(1376, 768)));
  await withViewer(t, { boardGenerator: createBoardGenerator({ fetchImpl, minIntervalMs: 0 }) }, async ({ post }) => {
    const cases = [
      [validDraft({ brief_id: 'fam-r01-v1' }), 'UNKNOWN_BRIEF'],
      [validDraft({ framework: 'angular' }), 'UNKNOWN_FRAMEWORK'],
      [validDraft({ prompt: 'nope' }), 'OUT_OF_RANGE'],
      [validDraft({ settings: { temperature: 9, max_tokens: 4096, seed: 1 } }), 'OUT_OF_RANGE'],
    ];
    for (const [draft, code] of cases) {
      const response = await post(draft);
      assert.equal(response.status, 400, `${code} must be a 400`);
      const failure = await response.json();
      assert.equal(failure.error, code);
      assert.ok(failure.message.length > 20, 'a refusal must say what was wrong');
    }
    assert.equal(fetchImpl.calls.length, 0, 'a refused draft must never reach the model');
  });
});

test('an upstream failure reaches the browser as a truthful status and message, never as an image', async (t) => {
  const failing = {
    generate: async () => { throw new GenerationError('UPSTREAM_TIMEOUT', 'the image endpoint did not answer within 180s', 504); },
  };
  await withViewer(t, { boardGenerator: failing }, async ({ post }) => {
    const response = await post(validDraft());
    assert.equal(response.status, 504);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const failure = await response.json();
    assert.equal(failure.error, 'UPSTREAM_TIMEOUT');
    assert.match(failure.message, /did not answer within 180s/);
  });
});

test('generation exists only on the viewer origin, and only as a POST', async (t) => {
  const fetchImpl = fakeFetch(() => imageResponse(tinyJpeg(1376, 768)));
  await withViewer(t, { boardGenerator: createBoardGenerator({ fetchImpl, minIntervalMs: 0 }), livePort: 0 }, async ({ base }) => {
    const get = await fetch(`${base}/tuning/generate`);
    assert.equal(get.status, 404, 'a GET has no draft to generate from');
    const options = await fetch(`${base}/tuning/generate`, { method: 'OPTIONS' });
    assert.equal(options.status, 404);
  });
});

test('the workbench page offers the generation and is honest about what it does and does not write', () => {
  const html = renderTuning({ data: loadTuningData(ROOT), repoRoot: ROOT, familyId: 'tr-01', variant: 'v1', framework: 'raw' });
  assert.match(html, /id="generate-board"/);
  assert.match(html, /Generate a board from this draft/);
  assert.match(html, new RegExp(IMAGE_MODEL.replace(/\./g, '\\.')));
  assert.match(html, /HOSTED MODEL - ONE BILLED CALL PER PRESS/);
  // The claims the previous copy made that are no longer true must be gone, not softened.
  assert.doesNotMatch(html, /No model is run/);
  assert.doesNotMatch(html, /No hosted model calls or training jobs run here/);
  assert.doesNotMatch(html, /No system prompt or model runner exists in this repository yet/);
  // And the claims that must survive: a generation still does not touch the authored artifacts.
  assert.match(html, /No file is written by a generation/);
  assert.match(html, /approved_for_training: false/);
  // All behaviour lives in /tuning/client.js; the rendered page carries no inline script that could reach a model.
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
});
