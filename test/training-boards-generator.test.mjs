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
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  BOARD_DIR,
  BOARD_ENDPOINT,
  BOARD_HEIGHT,
  BOARD_MAX_OUTPUT_TOKENS,
  BOARD_MODEL,
  BOARD_PROMPT_DATE,
  BOARD_TEMPERATURE,
  BOARD_WIDTH,
  REGISTER_PATH,
  CROP_LEDGER_PATH,
  cropSourceProblems,
  derivedCropMatches,
  artDirectionOf,
  assertWritable,
  boardPath,
  collectBoards,
  composePrompt,
  describeStructure,
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

test('the component map is translated to words, because the model renders markup it is shown', () => {
  assert.equal(
    describeStructure(['header.vf-header', 'nav.vf-nav', 'main.vf-hero', 'form#velofix-booking', 'fieldset.vf-fieldset', 'fieldset.vf-fieldset', 'fieldset.vf-fieldset', 'footer.vf-footer']),
    'a brand header, then a navigation bar, then a main content area, then the working form, then a group of fields (3 of them), then a footer',
  );
  assert.equal(describeStructure([]), '');
  assert.equal(describeStructure(['div.card', 'div.card']), 'a surface (2 of them)');
  assert.equal(describeStructure(['unknownwidget.thing']), 'a unknownwidget block');
});

test('every prompt is composed from the family own sources and carries the owner words verbatim', () => {
  const boards = collectBoards();
  assert.equal(boards.length, TRAINING_TARGET_FAMILIES.length, 'one board per training family');
  assert.deepEqual(boards.map((board) => board.family), TRAINING_TARGET_FAMILIES.map((family) => family.family_id));

  const brief = JSON.parse(readFileSync(join(ROOT, 'docs/train/briefs/manifest.jsonl'), 'utf8').split('\n')[0]);
  const tr01 = boards[0];
  assert.ok(tr01.prompt.includes(brief.prompt), 'the canonical brief prompt appears in the board prompt verbatim');
  assert.match(tr01.prompt, /Write the page's copy in en-GB conventions\./, 'the family locale is stated in prose');
  assert.match(tr01.prompt, /Use £ prices/, 'en-GB families are priced in sterling');
  assert.match(tr01.prompt, /#0f172a/, 'the design.md palette is carried into the prompt');
  assert.match(tr01.prompt, /Avoid: a calendar widget/, 'the design.md anti-patterns are carried into the prompt');
  assert.match(tr01.prompt, /ONLY the website itself/);
  assert.match(tr01.prompt, /Strictly NO browser chrome, macOS traffic lights, OS window controls/);
  assert.match(tr01.prompt, /tabs, address or URL bars, browser borders, window frames/);
  assert.match(tr01.prompt, /never show the same page twice/, 'the duplicate-frame defect that a 16:9 request can trigger is named');
  assert.match(tr01.prompt, /cropped tight to the page/, 'the frame is pinned: the page fills the image and is cropped to it');
  assert.match(tr01.prompt, /print no URL, query string or slash-path text/, 'the model is told not to print the prompt on the page');
  assert.doesNotMatch(tr01.prompt, /plus its chrome|anywhere except the address bar|single centered desktop browser window/i);
  // The recorded date, not the wall clock: a prompt that moved with `new Date()` would stop matching every committed
  // prompt.txt the next morning, and the second batch is why it exists - asked for "the near future", the model dated
  // twenty boards in 2023 and 2024.
  assert.equal(BOARD_PROMPT_DATE, '11 October 2026');
  assert.match(tr01.prompt, /Today's date is 11 October 2026\./);
  assert.match(tr01.prompt, /NOT a sketch, NOT a wireframe/);
  assert.doesNotMatch(tr01.prompt, /student model|measured against/i, 'no meta-language about the conformance artefact');

  // The first batch printed `header.ot-head` and `form#expense-log-form` ON the page (tr-15) because the prompt showed
  // the model the raw component map. No prompt may carry markup syntax again.
  for (const board of boards) {
    assert.doesNotMatch(board.prompt, /\b(?:header|nav|main|section|form|fieldset|footer|aside)\.[a-z][\w-]*/, `${board.family}: selector syntax leaked into the prompt`);
    assert.doesNotMatch(board.prompt, /#[a-z][\w-]*(?:-form|-grid|-nav)/, `${board.family}: id selector leaked into the prompt`);
    assert.doesNotMatch(board.prompt, /https:\/\/[^\s"]+\//, `${board.family}: a browser address or URL leaked into the new concept image prompt`);
  }

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
  const ledger = JSON.parse(readFileSync(join(ROOT, CROP_LEDGER_PATH), 'utf8'));
  assert.equal(ledger.sourceCommit.length, 40);
  assert.equal(Object.keys(ledger.boards).length, 30, 'each derived board must have its own source and crop box');
  const originalDigests = new Map();
  assert.deepEqual(cropSourceProblems(ledger, { originalDigests }), [], 'Git originals and the pinned crop script bind the ledger source claims');
  assert.deepEqual(cropSourceProblems({ ...ledger, sourceCommit: '0'.repeat(40) }),
    ['crop ledger has no matching pinned source commit or board map']);
  const altered = { ...ledger, boards: { ...ledger.boards,
    'tr-01': { ...ledger.boards['tr-01'], sourceSha256: '0'.repeat(64) } } };
  assert.match(cropSourceProblems(altered).join('\n'), /tr-01: source SHA-256 or dimensions differ/,
    'a plausible 64-hex digest from the ledger must not replace the original Git blob');
  const shifted = { ...ledger, boards: { ...ledger.boards,
    'tr-01': { ...ledger.boards['tr-01'], box: [0, 57, 1376, 767] } } };
  assert.match(cropSourceProblems(shifted).join('\n'), /tr-01: crop box differs/,
    'a plausible box and matching dimensions must still agree with the pinned derivation script');
  assert.match(register, /Offline frame removal:\*\* 30 committed references/);
  // Resolve each link against the register's own directory instead of hard-coding how far up the tree it sits. This
  // test used to match the literal `../../` prefix and join the remainder to ROOT, which baked the register's depth
  // into the test: when the register's links were corrected to `../../design/training/...`, the remainder became
  // `design/training/...` and the test looked for it at the repository root. A test for links whose correctness
  // depends on depth must not depend on depth itself.
  const registerDir = dirname(registerPath);
  const rows = [...register.matchAll(/^\| `(tr-\d{2})` \| \[`reference\.jpg`\]\(([^)]+)\) \| `([0-9a-f]{64})` \| (\d+) \| (\d+) × (\d+) \| \[`prompt\.txt`\]\(([^)]+)\) \| `([0-9a-f]{64})` \|/gm)];
  assert.ok(rows.length > 0, 'a register with no rows is not a register');
  for (const [, family, board, boardDigest, bytes, width, height, promptFile, promptDigest] of rows) {
    const boardBytes = readFileSync(resolve(registerDir, board));
    assert.equal(sha256(boardBytes), boardDigest, `${family}: committed board digest must match the register`);
    assert.equal(boardBytes.length, Number(bytes), `${family}: committed board byte count must match the register`);
    const crop = ledger.boards[family];
    if (crop) {
      assert.equal(derivedCropMatches({ width: Number(width), height: Number(height) }, crop, boardDigest, boardBytes.length,
        originalDigests.get(family)), true,
        `${family}: actual bytes and dimensions must match a real source-bound page-only crop`);
      assert.equal(derivedCropMatches({ width: Number(width), height: Number(height) }, crop, boardDigest, boardBytes.length), false,
        `${family}: omitting the original blob must fail closed`);
      assert.ok(register.includes('| `' + BOARD_MODEL + '` | `' + crop.sourceSha256 + '` | `' + crop.box.join(',') + '` |'),
        `${family}: register must display the source SHA and exact crop box beside the derived SHA`);
    } else {
      assert.equal(boardIsWidescreen({ width: Number(width), height: Number(height) }), true,
        `${family}: a future uncropped model image must retain the raw 16:9 contract`);
    }
    assert.equal(sha256(readFileSync(resolve(registerDir, promptFile))), promptDigest, `${family}: committed prompt digest must match the register`);
  }
  assert.doesNotMatch(register, /UNATTESTED ROWS/, 'a committed register may not carry an unattested row');
});
