import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  BOARD_ENDPOINT,
  BOARD_MAX_OUTPUT_TOKENS,
  BOARD_MODEL,
  BOARD_TEMPERATURE,
  collectBoards,
  extractPrompts,
  verifyRecordedPrompts,
} from '../scripts/generate-archetype-boards.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const FAMILIES = ['booking', 'catalogue', 'contact-lead', 'account-recovery', 'event-registration'];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Bead mwg-train-c1c regenerated the archetype boards with an explicitly named model. The regeneration is only worth
 * anything if it used the SAME prompts, and the only evidence of that is the digest register: the nine Wave 2 prompts
 * are pinned by SHA-256 of their exact bytes. This test keeps that guarantee runnable offline, so a parser change that
 * silently started reading a different prompt would fail here instead of at the next billed generation.
 */
test('the regenerator reads the recorded prompts byte-for-byte and covers all five archetypes', () => {
  const boards = collectBoards();
  assert.equal(boards.length, 14, 'five archetype sets: booking 5, catalogue 3, contact-lead 2, account-recovery 2, event-registration 2');
  assert.deepEqual([...new Set(boards.map((board) => board.family))].sort(), [...FAMILIES].sort());

  const verification = verifyRecordedPrompts(boards);
  assert.deepEqual(verification.failures, [], 'every pinned Wave 2 prompt must be reproduced from the README');
  assert.equal(verification.checked, 9, 'the register pins nine prompts and all nine must be checked');
  for (const board of boards) {
    assert.match(board.name, /^step\d+-[a-z0-9-]+\.jpg$/, `${board.family}: unexpected board name ${board.name}`);
    assert.ok(board.prompt.length > 100, `${board.family}/${board.name}: prompt looks truncated (${board.prompt.length} chars)`);
    assert.doesNotMatch(board.prompt, /^\s*$/, `${board.family}/${board.name}: empty prompt`);
  }
});

test('both recorded prompt formats parse exactly', () => {
  const waved = extractPrompts('### `step1-grid.jpg`\n\n```text\nA prompt.\n```\n');
  assert.deepEqual([...waved], [['step1-grid.jpg', 'A prompt.']]);
  const booked = extractPrompts('1. **Step 1**\n   - File: `step1-browse.jpg` (SHA-256: `' + 'a'.repeat(64) + '`)\n   - Model: `x`\n   - Prompt: "A quoted prompt."\n   - Intent: something\n');
  assert.deepEqual([...booked], [['step1-browse.jpg', 'A quoted prompt.']]);
  // An unparseable README yields nothing rather than an invented prompt. `collectBoards` turns that empty result into a
  // hard failure ("refusing to guess") before any board is requested, which is asserted where it belongs: by the fact
  // that the 14 boards above all come from prompts this parser read out of the committed READMEs.
  assert.equal(extractPrompts('nothing to parse here').size, 0);
  assert.deepEqual(collectBoards({ only: ['__no_such_family__'] }), []);
});

test('the model is named once and the endpoint cannot drift away from it', () => {
  assert.equal(BOARD_MODEL, 'gemini-nano-banana-2.1');
  assert.match(BOARD_ENDPOINT, /gemini-nano-banana-2\.1:generateContent$/, 'the default endpoint must request the pinned model');
  assert.equal(BOARD_MAX_OUTPUT_TOKENS, 8192);
  assert.equal(BOARD_TEMPERATURE, 0.7);
  // The recorded settings have to be able to produce an image at all: measured, 2048 returns no image part.
  assert.ok(BOARD_MAX_OUTPUT_TOKENS >= 4096);
});

test('the default mode generates nothing and cannot write a board', () => {
  const paths = FAMILIES.flatMap((family) => readdirSync(join(ROOT, 'docs/design/archetypes', family))
    .filter((name) => name.endsWith('.jpg'))
    .map((name) => join('docs/design/archetypes', family, name)));
  const before = new Map(paths.map((path) => [path, sha256(readFileSync(join(ROOT, path)))]));

  const output = execFileSync(process.execPath, [join(ROOT, 'scripts/generate-archetype-boards.mjs')], { encoding: 'utf8', timeout: 60_000 });
  assert.match(output, /Nothing was generated/);
  assert.match(output, /pinned Wave 2 prompt\(s\) reproduced byte-for-byte/);
  // `--write` is the only path that touches the tree, so a bare run must not have reached a model at all.
  assert.doesNotMatch(output, /^generating /m, 'a dry run must not make a model call');

  for (const path of paths) {
    assert.equal(sha256(readFileSync(join(ROOT, path))), before.get(path), `${path}: a dry run changed committed bytes`);
  }
});
