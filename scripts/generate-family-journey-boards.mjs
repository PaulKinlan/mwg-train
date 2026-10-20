#!/usr/bin/env node
/**
 * Unified Multimodal Reference-Conditioned Generator for Per-Family 4-Step
 * Light Mode & Dark Mode Concept Journey Boards (`tr-01`..`tr-39`).
 *
 * WHY THIS EXISTS:
 * Every training family (`tr-01`..`tr-39`) has its own brand identity, locale,
 * CSS custom property palette (`docs/train/design/tr-NN/design.md`), client+server
 * routes and form controls (`docs/train/design/tr-NN/plan.md`), and canonical
 * reference board (`docs/design/training/tr-NN/reference.jpg`).
 *
 * Previously, `/concepts/family/tr-NN` displayed `reference.jpg` at the top and
 * then fell back to the parent archetype's 4-step boards (`docs/design/archetypes/<archetype>/step*.jpg`),
 * which depicted a different brand and colour scheme for 24 of the 39 families
 * (e.g. `tr-15` Oakridge Tenant Co-operative in brick-red `#b91c1c` vs
 * `expense-tracker` The Ledger in spruce-teal `#0f766e`), and even for single-family
 * archetypes came from a different generation run than `reference.jpg`.
 *
 * This single deterministic script generates 8 unified boards per family
 * (4 Light Mode + 4 Dark Mode = 312 boards across `tr-01`..`tr-39`):
 *   - Light Mode: `docs/design/training/tr-NN/step1-overview.jpg` .. `step4-validation.jpg`
 *   - Dark Mode:  `docs/design/training/tr-NN/dark/step1-overview.jpg` .. `step4-validation.jpg`
 *   - Prompts:    `docs/design/training/tr-NN/journey-prompts.json`
 *   - Register:   `docs/provenance/assets/training-family-journeys.md`
 *
 * MULTIMODAL CONDITIONING CHAIN (locking visual identity within each family):
 *   1. `step1-overview.jpg` (Light) is conditioned on `docs/design/training/tr-NN/reference.jpg`
 *      (`inlineData` `image/jpeg`) + `design.md` + `plan.md` so the main image and Step 1
 *      share the exact same brand header, navigation, layout, typography, and colour tokens.
 *   2. `step2-interaction.jpg` (Light) is conditioned on `reference.jpg` + `step1-overview.jpg`.
 *   3. `step3-outcome.jpg` (Light) is conditioned on `reference.jpg` + `step1-overview.jpg`.
 *   4. `step4-validation.jpg` (Light) is conditioned on `reference.jpg` + `step2-interaction.jpg`.
 *   5. `dark/step1-overview.jpg` is conditioned on `step1-overview.jpg`.
 *   6. `dark/step2..4.jpg` are conditioned on `step{k}.jpg` + `dark/step1-overview.jpg`.
 *
 * Usage:
 *   node scripts/generate-family-journey-boards.mjs                          # dry-run status & digests
 *   node scripts/generate-family-journey-boards.mjs --write-prompts          # offline: write journey-prompts.json for all 39 families
 *   node scripts/generate-family-journey-boards.mjs --write                  # generate all 39 families (312 boards), pin frames, write register
 *   node scripts/generate-family-journey-boards.mjs --write --only tr-15     # generate one family or comma-separated batch (e.g. tr-01,tr-02)
 *   node scripts/generate-family-journey-boards.mjs --write --skip-existing  # resume cleanly, skipping already-valid 1376x768 step boards
 *   node scripts/generate-family-journey-boards.mjs --register               # offline: rewrite provenance register + frame pins from disk
 *   node scripts/generate-family-journey-boards.mjs --check                  # offline gate: verify all 8 Light+Dark boards for requested families
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

import {
  BOARD_ENDPOINT,
  BOARD_MAX_OUTPUT_TOKENS,
  BOARD_MODEL,
  assertWritable,
  boardPath,
  familySources,
  inspectBoard,
} from './generate-training-boards.mjs';
import { frameScanPinDocument, hasBrowserChrome, loadScanPins, scanFrames } from './check-archetype-frames.mjs';
import { TRAINING_TARGET_FAMILIES } from '../src/train/targets.mjs';
import {
  FAMILY_BOARD_HEIGHT,
  FAMILY_BOARD_PROMPT_DATE,
  FAMILY_BOARD_WIDTH,
  FAMILY_JOURNEY_STEP_IDS,
  composeFamilyJourneySteps,
  familyPromptsJsonPath,
  familyStepDarkPath,
  familyStepLightPath,
} from '../src/train/family-journeys.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TIMEOUT_MS = 180_000;
const TEMPERATURE = 0.4;

export const FAMILY_JOURNEY_REGISTER_PATH = 'docs/provenance/assets/training-family-journeys.md';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Build the structured 4-step Light + 4-step Dark plan for one training family.
 */
export function buildFamilyJourneyPlan(family, { root = ROOT, briefRows = null } = {}) {
  const sources = familySources(family, { root, briefRows });
  const steps = composeFamilyJourneySteps({
    familyId: family.family_id,
    archetype: family.archetype,
    title: family.title,
    siteName: sources.siteName,
    brief: sources.brief,
    tokens: sources.tokens,
    literals: sources.literals,
    antiPatterns: sources.antiPatterns,
    visualThesis: sources.visualThesis,
    componentHierarchy: sources.componentHierarchy,
  });
  return {
    schemaVersion: 1,
    familyId: family.family_id,
    archetype: family.archetype,
    title: family.title,
    siteName: sources.siteName,
    locale: sources.brief.locale ?? 'en-US',
    promptDate: FAMILY_BOARD_PROMPT_DATE,
    referenceBoard: boardPath(family.family_id),
    designSource: `docs/train/design/${family.family_id}/design.md`,
    planSource: `docs/train/design/${family.family_id}/plan.md`,
    tokens: sources.tokens,
    steps,
  };
}

/**
 * Collect journey plans for all 39 families (or a filtered subset).
 */
export function collectFamilyJourneys({ root = ROOT, only = null } = {}) {
  return TRAINING_TARGET_FAMILIES
    .filter((family) => !only || only.includes(family.family_id))
    .map((family) => buildFamilyJourneyPlan(family, { root }));
}

/**
 * Serialize deterministic `journey-prompts.json` for a family.
 */
export function serializePromptsJson(plan) {
  const payload = {
    schemaVersion: plan.schemaVersion,
    familyId: plan.familyId,
    archetype: plan.archetype,
    title: plan.title,
    siteName: plan.siteName,
    locale: plan.locale,
    promptDate: plan.promptDate,
    referenceBoard: plan.referenceBoard,
    designSource: plan.designSource,
    planSource: plan.planSource,
    steps: plan.steps.map((step) => ({
      id: step.id,
      number: step.number,
      title: step.title,
      lightPath: step.lightPath,
      darkPath: step.darkPath,
      state: step.state,
      lightPrompt: step.lightPrompt,
      darkPrompt: step.darkPrompt,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Call Gemini 3.1 Flash Image (`gemini-nano-banana-2.1`) with multimodal `inlineData` reference images
 * and strict post-generation verification (gateway model attestation, 1376x768 dimensions, no browser chrome).
 */
export async function requestMultimodalBoard({
  endpoint = BOARD_ENDPOINT,
  images = [],
  prompt,
  retries = 4,
  fetchImpl = globalThis.fetch,
} = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const retryNote = attempt === 1
      ? ''
      : `\n\nCRITICAL RETRY INSTRUCTION (attempt ${attempt}/${retries}): Render ONLY a full-bleed 1376x768 web page canvas with ZERO browser chrome, ZERO macOS red/yellow/green window dots near the top-left corner, and edge-to-edge background fill.`;
    const parts = [
      ...images.map((buf) => ({
        inlineData: {
          mimeType: 'image/jpeg',
          data: buf.toString('base64'),
        },
      })),
      { text: `${prompt}${retryNote}` },
    ];
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: TEMPERATURE,
        maxOutputTokens: BOARD_MAX_OUTPUT_TOKENS,
        imageConfig: { aspectRatio: '16:9' },
      },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint, {
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
      if (payload.modelVersion !== BOARD_MODEL) {
        throw new Error(`gateway attested model "${payload.modelVersion ?? 'absent'}", not "${BOARD_MODEL}"`);
      }
      const candidate = payload?.candidates?.[0];
      const part = (candidate?.content?.parts ?? []).find((entry) => (entry.inlineData ?? entry.inline_data)?.data);
      if (!part) {
        throw new Error(`no image part returned (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
      }
      const inline = part.inlineData ?? part.inline_data;
      const bytes = Buffer.from(inline.data, 'base64');
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new Error('returned bytes are not a valid JPEG');
      }
      const inspected = inspectBoard(bytes);
      if (!inspected.dimensions || inspected.dimensions.width !== FAMILY_BOARD_WIDTH || inspected.dimensions.height !== FAMILY_BOARD_HEIGHT) {
        throw new Error(`returned dimensions ${inspected.dimensions ? `${inspected.dimensions.width}x${inspected.dimensions.height}` : 'unknown'}, expected ${FAMILY_BOARD_WIDTH}x${FAMILY_BOARD_HEIGHT}`);
      }
      if (hasBrowserChrome(bytes)) {
        throw new Error('detected browser chrome / macOS traffic lights in generated image');
      }
      return {
        bytes,
        dimensions: inspected.dimensions,
        sha256: inspected.sha256,
        attestedModel: payload.modelVersion,
      };
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`    [retry ${attempt}/${retries}] ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('exhausted retries');
}

function isValidStepBoardOnDisk(absPath) {
  if (!existsSync(absPath)) return false;
  try {
    const bytes = readFileSync(absPath);
    const inspected = inspectBoard(bytes);
    if (!inspected.dimensions || inspected.dimensions.width !== FAMILY_BOARD_WIDTH || inspected.dimensions.height !== FAMILY_BOARD_HEIGHT) {
      return false;
    }
    return !hasBrowserChrome(bytes);
  } catch {
    return false;
  }
}

/**
 * Inspect committed per-family journey boards on disk.
 */
export function inspectCommittedFamilyJourneys({ root = ROOT, only = null } = {}) {
  const plans = collectFamilyJourneys({ root, only });
  const rows = [];
  const problems = [];

  for (const plan of plans) {
    const promptsRel = familyPromptsJsonPath(plan.familyId);
    const promptsAbs = join(root, promptsRel);
    const expectedJson = serializePromptsJson(plan);
    if (!existsSync(promptsAbs)) {
      problems.push(`${plan.familyId}: missing ${promptsRel}`);
    } else {
      const actualJson = readFileSync(promptsAbs, 'utf8');
      if (actualJson !== expectedJson) {
        problems.push(`${plan.familyId}: ${promptsRel} does not match deterministic family sources`);
      }
    }
    const promptsSha256 = sha256(Buffer.from(expectedJson, 'utf8'));

    for (const step of plan.steps) {
      for (const [mode, relPath, promptText] of [
        ['light', step.lightPath, step.lightPrompt],
        ['dark', step.darkPath, step.darkPrompt],
      ]) {
        const absPath = join(root, relPath);
        if (!existsSync(absPath)) {
          problems.push(`${plan.familyId} (${step.id} ${mode}): missing ${relPath}`);
          continue;
        }
        const bytes = readFileSync(absPath);
        const inspected = inspectBoard(bytes);
        if (!inspected.dimensions || inspected.dimensions.width !== FAMILY_BOARD_WIDTH || inspected.dimensions.height !== FAMILY_BOARD_HEIGHT) {
          problems.push(`${plan.familyId} (${step.id} ${mode}): expected ${FAMILY_BOARD_WIDTH}x${FAMILY_BOARD_HEIGHT}, got ${inspected.dimensions ? `${inspected.dimensions.width}x${inspected.dimensions.height}` : 'unmeasurable'}`);
        }
        if (hasBrowserChrome(bytes)) {
          problems.push(`${plan.familyId} (${step.id} ${mode}): browser chrome / traffic lights detected in ${relPath}`);
        }
        rows.push({
          familyId: plan.familyId,
          siteName: plan.siteName,
          stepId: step.id,
          mode,
          board: relPath,
          boardSha256: inspected.sha256,
          bytes: inspected.bytes,
          dimensions: inspected.dimensions,
          promptsFile: promptsRel,
          promptsSha256,
          stepPromptSha256: sha256(Buffer.from(promptText, 'utf8')),
          model: BOARD_MODEL,
        });
      }
    }
  }
  return { rows, problems, plans };
}

/**
 * Render `docs/provenance/assets/training-family-journeys.md` from committed boards on disk.
 */
export function renderFamilyJourneyRegister(rows, { generatedOn = '2026-10-16' } = {}) {
  const registerDir = dirname(FAMILY_JOURNEY_REGISTER_PATH);
  const linkTo = (target) => relative(registerDir, target).split('\\').join('/');
  const families = [...new Set(rows.map((r) => r.familyId))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const scope = families.length
    ? `${rows.length} illustrative JPEGs across ${families.length} training families (\`${families[0]}\`..\`${families.at(-1)}\`)`
    : '0 illustrative JPEGs';

  const tableRows = rows.map((row) =>
    `| \`${row.familyId}\` | \`${row.stepId}\` | \`${row.mode}\` | [\`${row.board.split('/').slice(-2).join('/')}\`](${linkTo(row.board)}) | \`${row.boardSha256}\` | ${row.bytes} | ${row.dimensions ? `${row.dimensions.width} × ${row.dimensions.height}` : 'unmeasured'} | [\`journey-prompts.json\`](${linkTo(row.promptsFile)}) | \`${row.stepPromptSha256}\` | \`${row.model}\` |`,
  );

  return [
    `# Provenance: training-family 4-step Light & Dark Mode journey boards`,
    ``,
    `- **Scope:** ${scope}, under [\`docs/design/training/<family>/step*.jpg\`](../../design/training) and \`docs/design/training/<family>/dark/step*.jpg\`. Each family has 4 Light Mode and 4 Dark Mode boards context-chained from its canonical [\`reference.jpg\`](training-reference-boards.md), [\`design.md\`](../../train/design), and [\`plan.md\`](../../train/design).`,
    `- **Generation & model attestation:** generated ${generatedOn} by [\`scripts/generate-family-journey-boards.mjs\`](../../../scripts/generate-family-journey-boards.mjs) requesting \`${BOARD_MODEL}\` explicitly through \`https://gemini.int.exe.xyz/v1beta/models/${BOARD_MODEL}:generateContent\` and failing closed unless \`modelVersion === "${BOARD_MODEL}"\`, dimensions equal \`${FAMILY_BOARD_WIDTH}×${FAMILY_BOARD_HEIGHT}\`, and \`hasBrowserChrome\` passes.`,
    `- **Multimodal consistency lock:** Step 1 Light (\`step1-overview.jpg\`) is conditioned on \`docs/design/training/<family>/reference.jpg\` (\`inlineData\` \`image/jpeg\`); Steps 2–4 Light are conditioned on \`reference.jpg\` + \`step1-overview.jpg\`; Step 1 Dark is conditioned on \`step1-overview.jpg\`; Steps 2–4 Dark are conditioned on their corresponding Light step + \`dark/step1-overview.jpg\`.`,
    `- **Rights & training quarantine:** \`excluded_from_training: true\`, \`approved_for_training: false\`, arm \`A3_teacher_generated\`. Under [Google consumer-account terms](../accounts/google-antigravity-consumer.md), these boards are visual planning references and prompt/validation targets for the viewer and harness, never SFT corpus training weights.`,
    ``,
    `| Family | Step | Mode | Board | SHA-256 (JPEG bytes) | Bytes | Dimensions | Prompts File | Step Prompt SHA-256 | Model (attested) |`,
    `| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |`,
    ...tableRows,
    ``,
  ].join('\n');
}

export function updateCleanFramePins({ root = ROOT } = {}) {
  // A re-pin replaces the digests but must not drop the reviewed deviations they were reviewed against:
  // the record is re-checked below against the bytes actually committed.
  let reviewedFindings = {};
  try { reviewedFindings = loadScanPins(join(root, '.fleet', 'frame-scan-pins.json')).reviewedFindings; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { images, failed, exempt, pinnedFindings, hashes, decoded } = scanFrames({ root, cleanPins: null, reviewedFindings });
  if (failed.length || exempt.length) {
    throw new Error(`frame scan failed on ${failed.length + exempt.length} image(s): ${failed.map((f) => relative(root, f)).join(', ')}`);
  }
  writeFileSync(
    join(root, '.fleet', 'frame-scan-pins.json'),
    `${JSON.stringify(frameScanPinDocument({ images: hashes, reviewedFindings: pinnedFindings }), null, 2)}\n`,
  );
  return { totalPinned: images.length, decoded };
}

async function main() {
  const write = process.argv.includes('--write');
  const writePromptsOnly = process.argv.includes('--write-prompts');
  const registerOnly = process.argv.includes('--register');
  const checkOnly = process.argv.includes('--check');
  const skipExisting = process.argv.includes('--skip-existing');
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx === -1 ? null : process.argv[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean);

  const plans = collectFamilyJourneys({ root: ROOT, only });
  console.log(`model: ${BOARD_MODEL} via ${BOARD_ENDPOINT}`);
  console.log(`families: ${plans.length} (${plans.length * 8} total step boards: ${plans.length * 4} Light + ${plans.length * 4} Dark)\n`);

  if (writePromptsOnly) {
    for (const plan of plans) {
      const relPath = familyPromptsJsonPath(plan.familyId);
      const absPath = assertWritable(relPath, ROOT);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, serializePromptsJson(plan));
    }
    console.log(`wrote deterministic journey-prompts.json for ${plans.length} family/families.`);
    return;
  }

  if (checkOnly) {
    const { rows, problems } = inspectCommittedFamilyJourneys({ root: ROOT, only });
    if (problems.length) {
      for (const problem of problems) console.error(`PROBLEM: ${problem}`);
      console.error(`\nFAILED: ${problems.length} problem(s) found across ${plans.length} family/families.`);
      process.exit(1);
    }
    console.log(`PASS: verified ${rows.length} committed Light & Dark step boards across ${plans.length} family/families.`);
    return;
  }

  if (registerOnly) {
    const { rows } = inspectCommittedFamilyJourneys({ root: ROOT, only: null });
    const regAbs = assertWritable(FAMILY_JOURNEY_REGISTER_PATH, ROOT);
    mkdirSync(dirname(regAbs), { recursive: true });
    writeFileSync(regAbs, renderFamilyJourneyRegister(rows, { generatedOn: process.env.MWG_TRAIN_BOARDS_DATE ?? '2026-10-16' }));
    const pinned = updateCleanFramePins({ root: ROOT });
    console.log(`register: wrote ${rows.length} board row(s) to ${FAMILY_JOURNEY_REGISTER_PATH}; pinned ${pinned.totalPinned} clean images.`);
    return;
  }

  if (!write) {
    let presentLight = 0;
    let presentDark = 0;
    for (const plan of plans) {
      const lightCount = plan.steps.filter((s) => existsSync(join(ROOT, s.lightPath))).length;
      const darkCount = plan.steps.filter((s) => existsSync(join(ROOT, s.darkPath))).length;
      presentLight += lightCount;
      presentDark += darkCount;
      const jsonDigest = sha256(Buffer.from(serializePromptsJson(plan), 'utf8')).slice(0, 12);
      console.log(
        `${plan.familyId} (${plan.archetype.padEnd(28)}) | ${plan.siteName.slice(0, 44).padEnd(44)} | prompts:${jsonDigest} | Light:${lightCount}/4 Dark:${darkCount}/4`,
      );
    }
    console.log(`\nSummary: ${presentLight}/${plans.length * 4} Light boards and ${presentDark}/${plans.length * 4} Dark boards on disk.`);
    console.log(`(Dry run: pass --write-prompts to write journey-prompts.json, --write to generate boards, --register to update register, or --check to verify.)`);
    return;
  }

  const failures = [];
  for (const plan of plans) {
    console.log(`\n=== ${plan.familyId}: ${plan.siteName} (${plan.archetype}) ===`);
    const refAbs = join(ROOT, plan.referenceBoard);
    if (!existsSync(refAbs)) {
      failures.push(`${plan.familyId}: missing anchor reference board ${plan.referenceBoard}`);
      console.error(`  FAILED: missing ${plan.referenceBoard}`);
      continue;
    }
    const referenceBytes = readFileSync(refAbs);

    // Always write the deterministic journey-prompts.json alongside the boards
    const promptsAbs = assertWritable(familyPromptsJsonPath(plan.familyId), ROOT);
    mkdirSync(dirname(promptsAbs), { recursive: true });
    writeFileSync(promptsAbs, serializePromptsJson(plan));

    const lightBuffers = new Map();
    let familyFailed = false;

    // 1. Generate 4 Light Mode steps
    for (const step of plan.steps) {
      const outAbs = assertWritable(step.lightPath, ROOT);
      mkdirSync(dirname(outAbs), { recursive: true });
      if (skipExisting && isValidStepBoardOnDisk(outAbs)) {
        const existingBytes = readFileSync(outAbs);
        lightBuffers.set(step.id, existingBytes);
        console.log(`  [light] ${step.id}: skipped existing valid 1376x768 board (${existingBytes.length} bytes)`);
        continue;
      }
      const refImages = [referenceBytes];
      if (step.id === 'step2-interaction' || step.id === 'step3-outcome') {
        if (lightBuffers.has('step1-overview')) refImages.push(lightBuffers.get('step1-overview'));
      } else if (step.id === 'step4-validation') {
        if (lightBuffers.has('step2-interaction')) refImages.push(lightBuffers.get('step2-interaction'));
        else if (lightBuffers.has('step1-overview')) refImages.push(lightBuffers.get('step1-overview'));
      }

      process.stdout.write(`  [light] generating ${step.lightPath} ... `);
      try {
        const result = await requestMultimodalBoard({ images: refImages, prompt: step.lightPrompt });
        writeFileSync(outAbs, result.bytes);
        lightBuffers.set(step.id, result.bytes);
        console.log(`ok (${result.bytes.length} bytes, sha256 ${result.sha256.slice(0, 12)}...)`);
      } catch (error) {
        console.log(`FAILED: ${error.message}`);
        failures.push(`${plan.familyId} (${step.id} light): ${error.message}`);
        familyFailed = true;
        break;
      }
    }

    if (familyFailed) continue;

    // 2. Generate 4 Dark Mode steps conditioned on corresponding Light step + Dark step 1
    let darkStep1Bytes = null;
    for (const step of plan.steps) {
      const outAbs = assertWritable(step.darkPath, ROOT);
      mkdirSync(dirname(outAbs), { recursive: true });
      if (skipExisting && isValidStepBoardOnDisk(outAbs)) {
        const existingBytes = readFileSync(outAbs);
        if (step.id === 'step1-overview') darkStep1Bytes = existingBytes;
        console.log(`  [dark]  ${step.id}: skipped existing valid 1376x768 board (${existingBytes.length} bytes)`);
        continue;
      }
      const lightBuf = lightBuffers.get(step.id);
      const refImages = [lightBuf];
      if (step.id !== 'step1-overview' && darkStep1Bytes) {
        refImages.push(darkStep1Bytes);
      }

      process.stdout.write(`  [dark]  generating ${step.darkPath} ... `);
      try {
        const result = await requestMultimodalBoard({ images: refImages, prompt: step.darkPrompt });
        writeFileSync(outAbs, result.bytes);
        if (step.id === 'step1-overview') darkStep1Bytes = result.bytes;
        console.log(`ok (${result.bytes.length} bytes, sha256 ${result.sha256.slice(0, 12)}...)`);
      } catch (error) {
        console.log(`FAILED: ${error.message}`);
        failures.push(`${plan.familyId} (${step.id} dark): ${error.message}`);
        break;
      }
    }
  }

  // Update frame-scan pins and provenance register for all valid boards currently on disk
  const { rows } = inspectCommittedFamilyJourneys({ root: ROOT, only: null });
  if (rows.length > 0) {
    const regAbs = assertWritable(FAMILY_JOURNEY_REGISTER_PATH, ROOT);
    mkdirSync(dirname(regAbs), { recursive: true });
    writeFileSync(regAbs, renderFamilyJourneyRegister(rows, { generatedOn: process.env.MWG_TRAIN_BOARDS_DATE ?? '2026-10-16' }));
    const pinned = updateCleanFramePins({ root: ROOT });
    console.log(`\nregister: wrote ${rows.length} board row(s) to ${FAMILY_JOURNEY_REGISTER_PATH}; pinned ${pinned.totalPinned} clean images.`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} step board(s) failed; retry with --write --skip-existing or --only:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
