import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * anything if it used the SAME prompts, and the only evidence of that is the digest register: every Wave 2 prompt
 * are pinned by SHA-256 of their exact bytes. This test keeps that guarantee runnable offline, so a parser change that
 * silently started reading a different prompt would fail here instead of at the next billed generation.
 */
test('the regenerator reads the recorded prompts byte-for-byte and covers every archetype with an authored README', () => {
  const boards = collectBoards();
  const byFamily = {};
  for (const board of boards) byFamily[board.family] = (byFamily[board.family] ?? 0) + 1;

  // The five evaluation families, with the exact board counts their READMEs author. Named individually because
  // these are the boards whose prompts the digest register pins.
  for (const [family, count] of Object.entries({ booking: 5, catalogue: 3, 'contact-lead': 3, 'account-recovery': 3, 'event-registration': 3 })) {
    assert.equal(byFamily[family], count, `${family}: expected ${count} authored boards`);
  }
  assert.ok(boards.length >= 14, 'the evaluation families alone are 14 boards');
  // And NO family is silently excluded. This assertion exists because the inventory used to be a hardcoded array of
  // exactly those five names, so an authored README for any other archetype was never generated - which is how the
  // corpus came to hold one type while Paul was asking for blogs, games, wikis and storefronts. A family with a
  // README is a family this generator covers, and a new one is allowed to appear here without editing this test.
  const discovered = [...new Set(boards.map((board) => board.family))].sort();
  for (const family of FAMILIES) assert.ok(discovered.includes(family), `${family}: missing from the board inventory`);
  assert.deepEqual(
    discovered,
    readdirSync(join(ROOT, 'docs/design/archetypes'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'docs/design/archetypes', entry.name, 'README.md')))
      .map((entry) => entry.name)
      .sort(),
    'every archetype with an authored README must be in the inventory',
  );

  const verification = verifyRecordedPrompts(boards);
  assert.deepEqual(verification.failures, [], 'every pinned Wave 2 prompt must be reproduced from the README');
  assert.equal(verification.checked, 12, 'the register pins twelve prompts and all twelve must be checked');
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
