/**
 * The training-family reference-board generator.
 *
 * Two things this file exists to keep true without spending a model call:
 *   1. A board's prompt is composed from the family's OWN committed sources, so the digest the register pins is
 *      reproducible from the repository alone. A composer that started reading the prompt from somewhere else - or that
 *      drifted into paraphrasing the brief - would fail here rather than at the next billed generation.
 *   2. A teacher-model image can never be written into the corpus. `assertWritable` is the guard, and this test proves it
 *      refuses `data/` rather than trusting the comment that says it does.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  BOARD_DIR,
  BOARD_ENDPOINT,
  BOARD_HEIGHT,
  BOARD_MAX_OUTPUT_TOKENS,
  BOARD_MODEL,
  BOARD_TEMPERATURE,
  BOARD_WIDTH,
  REGISTER_PATH,
  artDirectionOf,
  assertWritable,
  boardPath,
  collectBoards,
  composePrompt,
  familySources,
  inventedDomain,
  boardIsWidescreen,
  inspectBoard,
  promptPath,
  renderRegister,
  requestBoard,
  siteNameOf,
} from '../scripts/generate-training-boards.mjs';
import { TRAINING_TARGET_FAMILIES } from '../src/train/targets.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

test('the model is named once and requested explicitly, at the measured settings', () => {
  assert.equal(BOARD_MODEL, 'gemini-nano-banana-2.1');
  assert.match(BOARD_ENDPOINT, /gemini-nano-banana-2\.1:generateContent$/);
  assert.equal(BOARD_MAX_OUTPUT_TOKENS, 8192);
  assert.equal(BOARD_TEMPERATURE, 0.7);
  assert.equal(BOARD_WIDTH, 1376);
  assert.equal(BOARD_HEIGHT, 768);
  assert.equal(BOARD_DIR, 'docs/design/training');
});

test('the site name and art direction come from design.md, with the conformance sentences dropped', () => {
  const design = readFileSync(join(ROOT, 'docs/train/design/tr-01/design.md'), 'utf8');
  assert.equal(siteNameOf(design, 'fallback'), 'VeloFix Mobile Mechanic — Doorstep Bicycle Tuning & Repair');
  assert.equal(siteNameOf('# `tr-01` target design\n', 'fallback'), 'fallback');
  assert.equal(inventedDomain('VeloFix Mobile Mechanic', 'tr-01'), 'velofixmobile.studio');
  assert.equal(inventedDomain('Good Neighbour Community Transit', 'tr-21'), 'goodneighbour.shop');
  // A prompt that carries "a student model's output is measured against it" invites a mood board instead of a website.
  const direction = artDirectionOf('The page for a booking site, in a dark palette. The page\'s job is to be a *target*: a student model\'s output is measured against it.');
  assert.equal(direction, 'The page for a booking site, in a dark palette.');
  assert.doesNotMatch(direction, /student model|measured against|\btarget\b/);
});

test('every prompt is composed from the family own sources and carries the owner words verbatim', () => {
  const boards = collectBoards();
  assert.equal(boards.length, TRAINING_TARGET_FAMILIES.length, 'one board per training family');
  assert.deepEqual(boards.map((board) => board.family), TRAINING_TARGET_FAMILIES.map((family) => family.family_id));

  const brief = JSON.parse(readFileSync(join(ROOT, 'docs/train/briefs/manifest.jsonl'), 'utf8').split('\n')[0]);
  const tr01 = boards[0];
  assert.ok(tr01.prompt.includes(brief.prompt), 'the canonical brief prompt appears in the board prompt verbatim');
  assert.match(tr01.prompt, /LOCALE: en-GB\./, 'the family locale is stated');
  assert.match(tr01.prompt, /Use £ prices/, 'en-GB families are priced in sterling');
  assert.match(tr01.prompt, /#0f172a/, 'the design.md palette is carried into the prompt');
  assert.match(tr01.prompt, /AVOID: a calendar widget/, 'the design.md anti-patterns are carried into the prompt');
  assert.match(tr01.prompt, /ONE full-bleed 16:9 desktop browser window/);
  assert.match(tr01.prompt, /never show two windows side by side/, 'the duplicate-frame defect that a 16:9 request can trigger is named');
  assert.match(tr01.prompt, /NOT a sketch, NOT a wireframe/);
  assert.doesNotMatch(tr01.prompt, /student model|measured against/i, 'no meta-language about the conformance artefact');

  const tr01Family = TRAINING_TARGET_FAMILIES[0];
  assert.equal(composePrompt(familySources(tr01Family)), tr01.prompt, 'collectBoards must be a thin wrapper over familySources + composePrompt');
  for (const board of boards) {
    assert.ok(board.prompt.length > 1200, `${board.family}: prompt looks truncated (${board.prompt.length} chars)`);
  }
  // Composition is a pure function of the committed sources: two runs over the same tree are byte-identical.
  assert.deepEqual(collectBoards().map((board) => board.prompt), boards.map((board) => board.prompt));
});

test('the generator may only ever write under docs/, never into the corpus', () => {
  assert.equal(assertWritable('docs/design/training/tr-01/reference.jpg'), join(ROOT, 'docs/design/training/tr-01/reference.jpg'));
  for (const forbidden of [
    'data/A1_self_generated/targets/tr-01/target.png',
    'data/A3_teacher_generated/boards/tr-01.jpg',
    'docs/../data/A1_self_generated/targets/tr-01/target.png',
    'pilot/boards/tr-01.jpg',
  ]) {
    assert.throws(() => assertWritable(forbidden), /refusing to write/, `${forbidden} must be refused`);
  }
  assert.equal(boardPath('tr-01'), 'docs/design/training/tr-01/reference.jpg');
  assert.equal(promptPath('tr-01'), 'docs/design/training/tr-01/prompt.txt');
});

test('a board is only accepted when the gateway attests the requested model', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0]), Buffer.alloc(6)]);
  const respond = (payload, ok = true, status = 200) => async () => ({
    ok,
    status,
    text: async () => JSON.stringify(payload).slice(0, 300),
    json: async () => payload,
  });
  const imagePayload = (modelVersion) => ({
    modelVersion,
    candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }] } }],
  });

  const attested = await requestBoard({ prompt: 'x', fetchImpl: respond(imagePayload(BOARD_MODEL)) });
  assert.equal(attested.attestedModel, BOARD_MODEL);

  // The defect this whole script exists to prevent: bytes whose model cannot be named.
  const unattested = await requestBoard({ prompt: 'x', fetchImpl: respond(imagePayload(undefined)) });
  assert.equal(unattested.attestedModel, null, 'an absent modelVersion must come back null so the caller can fail closed');

  await assert.rejects(requestBoard({ prompt: 'x', fetchImpl: respond({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'thinking' }] } }] }) }), /no image part/);
  await assert.rejects(requestBoard({ prompt: 'x', fetchImpl: respond({ error: 'quota' }, false, 429) }), /endpoint answered 429/);
  await assert.rejects(
    requestBoard({ prompt: 'x', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('not a jpeg').toString('base64') } }] } }] }) }) }),
    /not a JPEG/,
  );
});

test('inspectBoard measures the bytes and the 16:9 contract, and the register records what it measured', () => {
  // A 1376x768 JPEG: SOI, a correctly-sized APP0 segment, then an SOF0 frame header (T.81 marker lengths include the
  // two length bytes, so the APP0 payload is 14 bytes for a declared length of 16).
  const header = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.alloc(14),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x00, 0x05, 0x60]),
    // The reader's scan bound needs a byte past the frame header; EOI is what a real JPEG has there anyway.
    Buffer.from([0xff, 0xd9]),
  ]);
  const wide = inspectBoard(header);
  assert.deepEqual(wide.dimensions, { width: 1376, height: 768 });
  assert.equal(wide.bytes, header.length);
  assert.equal(wide.sha256, sha256(header));
  assert.equal(boardIsWidescreen(wide.dimensions), true);
  assert.equal(boardIsWidescreen({ width: 1024, height: 1024 }), false);
  assert.equal(boardIsWidescreen(null), false);

  const register = renderRegister([
    { family: 'tr-01', board: 'docs/design/training/tr-01/reference.jpg', promptFile: 'docs/design/training/tr-01/prompt.txt', model: BOARD_MODEL, bytes: 12, dimensions: { width: 1376, height: 768 }, boardSha256: 'a'.repeat(64), promptSha256: 'b'.repeat(64) },
  ], { generatedOn: '2026-10-11' });
  assert.match(register, /excluded_from_training: true/);
  assert.match(register, /approved_for_training: false/);
  assert.match(register, /A3_teacher_generated/);
  assert.match(register, /fails closed unless the response's own `modelVersion`/);
  assert.match(register, /\| `tr-01` \|/);
  assert.match(register, new RegExp(`\\\`${'a'.repeat(64)}\\\``));
  assert.match(register, /1376 × 768/);
  assert.doesNotMatch(register, /UNATTESTED/);
  const unattested = renderRegister([
    { family: 'tr-02', board: 'b', promptFile: 'p', model: 'gemini-3-pro-image', bytes: 1, dimensions: null, boardSha256: 'c', promptSha256: 'd' },
  ]);
  assert.match(unattested, /UNATTESTED ROWS/);
});

test('the committed boards and the register, when the register exists, agree with each other', () => {
  const registerPath = join(ROOT, REGISTER_PATH);
  if (!existsSync(registerPath)) {
    // Before the first generation there is nothing to agree with. The assertion that matters is the other direction:
    // a register that exists must be true.
    return;
  }
  const register = readFileSync(registerPath, 'utf8');
  const rows = [...register.matchAll(/^\| `(tr-\d{2})` \| \[`reference\.jpg`\]\(\.\.\/\.\.\/([^)]+)\) \| `([0-9a-f]{64})` \| (\d+) \| (\d+) × (\d+) \| \[`prompt\.txt`\]\(\.\.\/\.\.\/([^)]+)\) \| `([0-9a-f]{64})` \|/gm)];
  assert.ok(rows.length > 0, 'a register with no rows is not a register');
  for (const [, family, board, boardDigest, bytes, width, height, promptFile, promptDigest] of rows) {
    const boardBytes = readFileSync(join(ROOT, board));
    assert.equal(sha256(boardBytes), boardDigest, `${family}: committed board digest must match the register`);
    assert.equal(boardBytes.length, Number(bytes), `${family}: committed board byte count must match the register`);
    assert.equal(boardIsWidescreen({ width: Number(width), height: Number(height) }), true, `${family}: register must only pin 16:9 boards`);
    assert.equal(sha256(readFileSync(join(ROOT, promptFile))), promptDigest, `${family}: committed prompt digest must match the register`);
  }
  assert.doesNotMatch(register, /UNATTESTED ROWS/, 'a committed register may not carry an unattested row');
});
