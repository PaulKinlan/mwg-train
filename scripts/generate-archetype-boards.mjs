#!/usr/bin/env node
/**
 * Regenerate the five archetype concept sets with an EXPLICIT image model.
 *
 * Why this exists: the boards under docs/design/archetypes/ were generated on 2026-10-09 through the Antigravity
 * `generate_image` tool with no `model` argument, so the call fell back to a default that every provenance record
 * describes the same way - "the generating lane reports `gemini-3-pro-image`; the responses reported file paths, not an
 * attested model ID". The owner rejected those boards on sight (bead mwg-train-c1c). A record that cannot name the
 * model that made an asset is not a record, so this regenerates the same prompts against a named model, through an
 * endpoint that ATTESTS it: the response carries `modelVersion`, and the script writes that attestation into the
 * report it prints (and refuses the board if the attested version is not the model that was requested).
 *
 * The prompts are not re-authored here. They are read out of the archetype READMEs, which are the single source of
 * truth for them, and the nine Wave 2 prompts are then checked byte-for-byte against the digests already recorded in
 * docs/provenance/assets/design-reference-wave2.md. If this script's parser ever reads a prompt differently from the
 * recorded tool call, the digest check fails and nothing is generated. That is what makes "regenerate" mean "the same
 * brief, a named model" rather than "something new".
 *
 * The compute is external and the endpoint injects the signed-in account's credentials: this machine holds no key and
 * sends none (see docs/eval/pricing.md - "no models on fleet VMs" is about local GPU compute, which this is not).
 *
 * Usage:
 *   node scripts/generate-archetype-boards.mjs                 # offline: parse + verify prompts, report current digests
 *   node scripts/generate-archetype-boards.mjs --write         # generate and overwrite the committed JPEGs
 *   node scripts/generate-archetype-boards.mjs --write --only booking,catalogue
 *
 * --write is deliberately the only mode that touches the tree, and it is never wired into `npm test` or check:all:
 * every check in this repository has to run offline, and this one makes billed model calls.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** The model. Named once, sent explicitly, and verified against what the gateway says it used. */
export const BOARD_MODEL = 'gemini-nano-banana-2.1';

/** The documented credential-injecting proxy, overridable so an operator can repoint it. */
export const BOARD_ENDPOINT = process.env.MWG_TRAIN_IMAGE_ENDPOINT
  || `https://gemini.int.exe.xyz/v1beta/models/${BOARD_MODEL}:generateContent`;

/** Measured, not guessed: at 2048 output tokens this model spends the budget thinking and returns no image at all. */
export const BOARD_MAX_OUTPUT_TOKENS = 8192;
/** Recorded so the settings are part of the provenance rather than an unrecorded default. */
export const BOARD_TEMPERATURE = 0.7;
const TIMEOUT_MS = 180_000;

const FAMILIES = ['booking', 'catalogue', 'contact-lead', 'account-recovery', 'event-registration'];

const WAVE2_RECORD = 'docs/provenance/assets/design-reference-wave2.md';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * The two prompt formats the READMEs actually use, both read verbatim:
 *   - Wave 2 (catalogue, contact-lead, account-recovery, event-registration): `### \`name\`` then a ```text fence;
 *   - booking: a numbered journey list with `- File:` and a `- Prompt: "..."` on one line.
 * Neither is normalised: the bytes between the recorded delimiters are the prompt, escapes and all, because the
 * Wave 2 prompt digests are computed over exactly those bytes.
 */
export function extractPrompts(readmeText) {
  const prompts = new Map();
  for (const match of readmeText.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)) {
    prompts.set(match[1], match[2]);
  }
  for (const match of readmeText.matchAll(/- File:\s*`(step\d+[a-z0-9-]*\.jpg)`[\s\S]*?- Prompt:\s*"([\s\S]*?)"\s*\n\s*- Intent:/g)) {
    prompts.set(match[1], match[2]);
  }
  return prompts;
}

/** Board name -> prompt, for all five families, with a hard failure if a README yields nothing. */
export function collectBoards({ only = null } = {}) {
  const boards = [];
  for (const family of FAMILIES) {
    if (only && !only.includes(family)) continue;
    const readmePath = join(ROOT, 'docs/design/archetypes', family, 'README.md');
    const prompts = extractPrompts(readFileSync(readmePath, 'utf8'));
    if (prompts.size === 0) throw new Error(`${family}: no prompts parsed out of the README; refusing to guess`);
    for (const [name, prompt] of prompts) {
      boards.push({ family, name, prompt, path: join(ROOT, 'docs/design/archetypes', family, name) });
    }
  }
  return boards;
}

/**
 * The nine Wave 2 prompts are already pinned in a central record by SHA-256 of the exact prompt bytes. Reproducing
 * those digests from the README is the only evidence that this script is regenerating the SAME brief rather than a
 * paraphrase of it, so it is a precondition of --write, not a warning.
 */
export function verifyRecordedPrompts(boards) {
  const record = readFileSync(join(ROOT, WAVE2_RECORD), 'utf8');
  const rows = [...record.matchAll(/\|\s*\[`([a-z-]+)`\]\([^|]+\)\s*\|\s*\[`(step[0-9]+-[a-z0-9-]+\.jpg)`\]\([^|]+\)\s*\|\s*`([0-9a-f]{64})`\s*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`\s*\|/g)];
  if (rows.length === 0) throw new Error(`${WAVE2_RECORD}: no pinned prompt digests found; refusing to regenerate from unverified prompts`);
  const failures = [];
  let checked = 0;
  for (const [, family, name, , , promptDigest] of rows) {
    const board = boards.find((candidate) => candidate.family === family && candidate.name === name);
    if (!board) continue;
    checked += 1;
    const actual = sha256(board.prompt);
    if (actual !== promptDigest) failures.push(`${family}/${name}: README prompt hashes ${actual}, the record pins ${promptDigest}`);
  }
  if (checked === 0) throw new Error('no Wave 2 prompt could be matched against the record; the parser is not reading the READMEs');
  return { checked, failures };
}

/** A bounded POST that returns the image plus the gateway's own attestation of the model it used. */
async function requestBoard({ endpoint = BOARD_ENDPOINT, prompt, fetchImpl = globalThis.fetch } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      temperature: BOARD_TEMPERATURE,
      maxOutputTokens: BOARD_MAX_OUTPUT_TOKENS,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      throw new Error(`endpoint answered ${response.status}: ${text}`);
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    if (!candidate) throw new Error(`no candidate returned (${JSON.stringify(payload).slice(0, 200)})`);
    const part = (candidate.content?.parts ?? []).find((entry) => (entry.inlineData ?? entry.inline_data)?.data);
    if (!part) {
      const kinds = (candidate.content?.parts ?? []).map((entry) => (entry.thought ? 'thought' : 'text')).join(', ') || 'none';
      throw new Error(`no image part (finishReason ${candidate.finishReason}, non-image parts: ${kinds}); raise maxOutputTokens or change the prompt`);
    }
    const inline = part.inlineData ?? part.inline_data;
    const bytes = Buffer.from(inline.data, 'base64');
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error(`returned bytes are not a JPEG (declared ${inline.mimeType ?? 'absent'}, first bytes ${bytes.subarray(0, 4).toString('hex')})`);
    }
    return {
      bytes,
      declaredMime: inline.mimeType ?? null,
      // The gateway's attestation. This is the field the previous generation could not produce.
      attestedModel: payload.modelVersion ?? null,
      finishReason: candidate.finishReason ?? null,
      totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
      thoughtsTokens: payload.usageMetadata?.thoughtsTokenCount ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    if (bytes[offset + 1] === 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    offset += 2 + length;
  }
  return null;
}

async function main() {
  const write = process.argv.includes('--write');
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg === -1 ? null : process.argv[onlyArg + 1].split(',').map((value) => value.trim());

  const boards = collectBoards({ only });
  const verification = verifyRecordedPrompts(boards);
  if (verification.failures.length) {
    for (const failure of verification.failures) console.error(`PROMPT MISMATCH ${failure}`);
    console.error('Refusing to generate: the prompts this script reads are not the prompts the records pin.');
    process.exit(1);
  }
  console.log(`prompt check: ${verification.checked} pinned Wave 2 prompt(s) reproduced byte-for-byte from the READMEs`);
  console.log(`model: ${BOARD_MODEL} (explicit) via ${BOARD_ENDPOINT}`);
  console.log(`settings: temperature ${BOARD_TEMPERATURE}, maxOutputTokens ${BOARD_MAX_OUTPUT_TOKENS}, ${boards.length} board(s)\n`);

  if (!write) {
    for (const board of boards) {
      const current = readFileSync(board.path);
      console.log(`${board.family}/${board.name}\tcurrent ${sha256(current).slice(0, 16)}...\t${current.length} bytes\tprompt ${board.prompt.length} chars`);
    }
    console.log('\n(dry run: pass --write to regenerate. Nothing was generated.)');
    return;
  }

  const failures = [];
  for (const board of boards) {
    process.stdout.write(`generating ${board.family}/${board.name} ... `);
    try {
      const result = await requestBoard({ prompt: board.prompt });
      if (result.attestedModel !== BOARD_MODEL) {
        // Fail closed. A board whose model cannot be attested is the exact defect this bead is about.
        throw new Error(`gateway attested model "${result.attestedModel ?? 'absent'}", not "${BOARD_MODEL}"`);
      }
      const dimensions = jpegDimensions(result.bytes);
      if (!dimensions) throw new Error('returned JPEG could not be measured');
      writeFileSync(board.path, result.bytes);
      console.log(`ok ${dimensions.width}x${dimensions.height}, ${result.bytes.length} bytes, sha256 ${sha256(result.bytes)}, attested ${result.attestedModel}, finish ${result.finishReason}, ${result.totalTokens} tokens`);
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      failures.push(`${board.family}/${board.name}: ${error.message}`);
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} board(s) failed; the tree now contains a MIX of old and new boards. Fix and re-run before committing:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log('\nAll boards regenerated. Now update the digests in the archetype READMEs and the two provenance records.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
