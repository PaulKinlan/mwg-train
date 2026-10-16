import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  BOARD_MODEL,
} from '../scripts/generate-training-boards.mjs';
import {
  buildFamilyJourneyPlan,
  collectFamilyJourneys,
  renderFamilyJourneyRegister,
  requestMultimodalBoard,
  serializePromptsJson,
} from '../scripts/generate-family-journey-boards.mjs';
import {
  FAMILY_BOARD_HEIGHT,
  FAMILY_BOARD_WIDTH,
  FAMILY_JOURNEY_STEP_IDS,
  familyPromptsJsonPath,
} from '../src/train/family-journeys.mjs';
import { listConcepts, renderConceptFamily, trainingFamilyStep } from '../src/viewer/concepts.mjs';
import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('every training family (tr-01..tr-39) has a deterministic 4-step Light + 4-step Dark journey plan matching its committed journey-prompts.json', () => {
  const plans = collectFamilyJourneys({ root: ROOT });
  assert.equal(plans.length, 39);
  for (const plan of plans) {
    assert.equal(plan.steps.length, 4, `${plan.familyId} must declare 4 steps`);
    assert.deepEqual(plan.steps.map((s) => s.id), [...FAMILY_JOURNEY_STEP_IDS]);
    const jsonPath = join(ROOT, familyPromptsJsonPath(plan.familyId));
    assert.equal(existsSync(jsonPath), true, `${plan.familyId} must have committed journey-prompts.json`);
    assert.equal(
      readFileSync(jsonPath, 'utf8'),
      serializePromptsJson(plan),
      `${plan.familyId}: committed journey-prompts.json must match deterministic family sources`,
    );
    for (const step of plan.steps) {
      assert.ok(step.lightPrompt.includes(plan.siteName), `${plan.familyId}/${step.id} light prompt must name ${plan.siteName}`);
      assert.ok(step.darkPrompt.includes(plan.siteName.toUpperCase()), `${plan.familyId}/${step.id} dark prompt must name ${plan.siteName}`);
      for (const [tokenName, tokenHex] of Object.entries(plan.tokens)) {
        assert.ok(step.lightPrompt.includes(tokenHex), `${plan.familyId}/${step.id} light prompt must include token ${tokenName}: ${tokenHex}`);
      }
    }
  }

  // Verify tr-15 specifically uses Oakridge Tenant Co-operative (#b91c1c), never "The Ledger"
  const tr15 = plans.find((p) => p.familyId === 'tr-15');
  assert.equal(tr15.siteName, 'Oakridge Tenant Co-operative — Maintenance Ledger & Expenses');
  for (const step of tr15.steps) {
    assert.doesNotMatch(step.lightPrompt, /The Ledger/);
    assert.match(step.lightPrompt, /#b91c1c/);
  }
});

test('/concepts/family/tr-15 renders Oakridge Tenant Co-operative and per-family step routes, never The Ledger archetype boards', async (t) => {
  const scope = listConcepts(ROOT, { view: 'family', id: 'tr-15' });
  const html = renderConceptFamily(scope, 'tr-15');
  assert.ok(html);
  assert.match(html, /Oakridge Tenant Co-operative — Maintenance Ledger &amp; Expenses/);
  assert.doesNotMatch(html, /The Ledger/);
  assert.doesNotMatch(html, /\/concepts\/images\/expense-tracker\/step/);
  assert.match(html, /\/concepts\/family-images\/tr-15\/step1-overview\.jpg/);
  assert.match(html, /docs\/design\/training\/tr-15\/step\*/);
  assert.match(html, /docs\/design\/training\/tr-15\/dark\/step\*/);

  // Verify trainingFamilyStep serves Step 1 Light (backed by step1-overview.jpg or reference.jpg) and rejects unknown families/steps
  const step1 = trainingFamilyStep(ROOT, 'tr-15', 'step1-overview');
  assert.ok(step1 && step1.bytes.length > 1000 && step1.type === 'image/jpeg');
  assert.equal(trainingFamilyStep(ROOT, 'tr-40', 'step1-overview'), null);
  assert.equal(trainingFamilyStep(ROOT, 'tr-15', 'step9-invalid'), null);
  assert.equal(trainingFamilyStep(ROOT, 'tr-15', '../reference'), null);

  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-family-step-'));
  const { server, liveServer, pool } = createViewer({
    allowAnonymous: true,
    corpusRoot: join(ROOT, 'pilot'),
    stateDir,
    repoRoot: ROOT,
  });
  t.after(() => {
    pool.stopAll();
    server.close();
    liveServer.close();
    rmSync(stateDir, { recursive: true, force: true });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/concepts/family-images/tr-15/step1-overview.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.ok((await res.arrayBuffer()).byteLength > 1000);

  const res404 = await fetch(`${base}/concepts/family-images/tr-40/step1-overview.jpg`);
  assert.equal(res404.status, 404);
});

test('requestMultimodalBoard enforces model attestation, 1376x768 dimensions, and renderFamilyJourneyRegister formats provenance cleanly', async () => {
  await assert.rejects(
    requestMultimodalBoard({
      prompt: 'test',
      retries: 1,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          modelVersion: 'wrong-model',
          candidates: [],
        }),
      }),
    }),
    /gateway attested model "wrong-model", not "gemini-nano-banana-2.1"/,
  );

  const reg = renderFamilyJourneyRegister([
    {
      familyId: 'tr-15',
      siteName: 'Oakridge Tenant Co-operative — Maintenance Ledger & Expenses',
      stepId: 'step1-overview',
      mode: 'light',
      board: 'docs/design/training/tr-15/step1-overview.jpg',
      boardSha256: 'a'.repeat(64),
      bytes: 123456,
      dimensions: { width: FAMILY_BOARD_WIDTH, height: FAMILY_BOARD_HEIGHT },
      promptsFile: 'docs/design/training/tr-15/journey-prompts.json',
      promptsSha256: 'b'.repeat(64),
      stepPromptSha256: 'c'.repeat(64),
      model: BOARD_MODEL,
    },
  ]);
  assert.match(reg, /excluded_from_training: true/);
  assert.match(reg, /approved_for_training: false/);
  assert.match(reg, /\| `tr-15` \| `step1-overview` \| `light` \|/);
  assert.match(reg, /1376 × 768/);
});
