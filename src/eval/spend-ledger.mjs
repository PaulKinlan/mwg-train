import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, rmdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';

export const GENERATION_BEAD = 'mwg-train-i5i2.1';
export const GENERATION_SCOPE = 'generation';
// Code-pinned owner decision authorises DeepSeek V4.1 Flash generation; the 2026-10-18
// hub/coord provider choice binds this policy to the native integration, not Fireworks.
export const GENERATION_MODEL = 'deepseek/deepseek-flash';
// This exact, reviewed owner decision supersedes the earlier amount-scoped planning text. A different
// close reason, an open bead, or an unreachable Beads remote does NOT silently authorize a live call.
export const GENERATION_DECISION = "Owner decision recorded from chat (2026-10-13): 're: 2 - no spend caps, I am ok.' Live DeepSeek V4.1 Flash generation authorised without a dollar cap; log actual usage/spend.";
const SHA = /^[a-f0-9]{64}$/;
const VERIFIED_APPROVALS = new WeakSet();
const finitePositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const knownUsd = (value) => value === 'UNVERIFIED' || finitePositive(value);

/** Refresh the actual closed decision AND comments before every live request, never a cached approval. */
export function readGenerationApprovalComments() {
  execFileSync('bd', ['dolt', 'pull'], { encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 });
  const decisions = JSON.parse(execFileSync('bd', ['show', GENERATION_BEAD, '--json'], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
  }));
  const comments = JSON.parse(execFileSync('bd', ['comments', GENERATION_BEAD, '--json'], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
  }));
  return { decision: decisions?.[0], comments };
}

/** Pin the owner's no-cap decision as code-reviewed policy. A BEADS_ACTOR name alone never grants spend.
 * A revocation marker anywhere in ANY comment on this bead stops future calls. Beads actor identities
 * can be spoofed and change across the hub/owner dashboard: a deny-only check must not miss a real
 * revocation by relying on an incomplete allowlist. False-positive denial is safer than paid spend.
 */
export function verifyGenerationApproval({ decision, comments } = {}, { model, host = hostname() } = {}) {
  if (model !== GENERATION_MODEL || !host || decision?.id !== GENERATION_BEAD ||
      decision.status !== 'closed' || decision.close_reason !== GENERATION_DECISION || !Array.isArray(comments)) {
    throw new Error('NO_OWNER_AUTH: current closed generation decision and comments required for this model');
  }
  for (const comment of comments) {
    // bd comments <bead> is already scoped to this bead. Some client versions omit issue_id;
    // deny-only markers in those rows still revoke, but an explicitly foreign bead must not.
    if ((comment.issue_id == null || comment.issue_id === GENERATION_BEAD) &&
        /OWNER-AUTHORIZATION-REVOKED/i.test(String(comment.text ?? ''))) {
      throw new Error('NO_OWNER_AUTH: generation authorisation was revoked; stop before another request');
    }
  }
  // Private capability: a caller cannot reserve using an object that merely resembles an approval.
  const approval = Object.freeze({ bead: GENERATION_BEAD, scope: GENERATION_SCOPE, model, host,
    decision: 'no-usd-cap', decisionId: decision.id });
  VERIFIED_APPROVALS.add(approval);
  return approval;
}

/** A cited, exact inference SKU is OPTIONAL for no-cap calls, but required to quote a dollar number. */
export function loadPinnedGenerationTariff(model) {
  const quotes = readFileSync(new URL('../../docs/eval/quotes.jsonl', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const quote = quotes.find((entry) => entry.provider === 'DeepSeek' && entry.model === model &&
    entry.product === 'inference (exact model)' && entry.mode === 'serverless' &&
    entry.inference_rates?.billingMode === 'per-token' && SHA.test(entry.sha256 ?? ''));
  if (!quote) return null;
  const rates = quote.inference_rates;
  if (!finitePositive(rates.inputUsdPerMillion) || !finitePositive(rates.outputUsdPerMillion) ||
      !finitePositive(rates.reasoningUsdPerMillion) || !Number.isFinite(rates.minimumUsd) || rates.minimumUsd < 0 ||
      !/^https:\/\//.test(quote.source_url ?? '')) return null;
  return { ...rates, model, scope: GENERATION_SCOPE, sourceUrl: quote.source_url,
    sourceSha256: quote.sha256, billingMode: 'per-token' };
}

/** Optional pre-call accounting estimate; absence of a tokenizer/tariff is UNVERIFIED, never $0. */
export function worstCaseGenerationUsd({ tariff, model, promptTokensUpperBound, maxOutputTokens }) {
  if (tariff?.model !== model || tariff?.scope !== GENERATION_SCOPE || tariff?.billingMode !== 'per-token' ||
      !/^https:\/\//.test(tariff.sourceUrl ?? '') || !SHA.test(tariff.sourceSha256 ?? '') ||
      !finitePositive(tariff.inputUsdPerMillion) || !finitePositive(tariff.outputUsdPerMillion) ||
      !finitePositive(tariff.reasoningUsdPerMillion) || !Number.isFinite(tariff.minimumUsd) || tariff.minimumUsd < 0 ||
      !Number.isSafeInteger(promptTokensUpperBound) || promptTokensUpperBound <= 0 ||
      !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new Error('UNVERIFIED_COST: exact-SKU cited inference tariff and bounded tokens required');
  }
  const bound = Math.max(tariff.minimumUsd,
    (promptTokensUpperBound * tariff.inputUsdPerMillion +
      maxOutputTokens * Math.max(tariff.outputUsdPerMillion, tariff.reasoningUsdPerMillion)) / 1_000_000);
  if (!finitePositive(bound)) throw new Error('UNVERIFIED_COST: no finite conservative charge bound');
  return Math.ceil(bound * 100) / 100;
}

/** Reserve a request identity under a durable, single-host lock BEFORE sending any provider bytes.
 * A no-cap decision removes the dollar ceiling, not duplicate, corrupt-ledger or uncertain-call checks.
 */
export function reserveGeneration({ ledgerPath, approval, chargeBoundUsd = 'UNVERIFIED', requestId, model, revision, projectId }) {
  if (!ledgerPath || !requestId || !approval || !VERIFIED_APPROVALS.has(approval) || approval.bead !== GENERATION_BEAD ||
      approval.scope !== GENERATION_SCOPE || approval.model !== model || approval.host !== hostname() ||
      !knownUsd(chargeBoundUsd)) throw new Error('SPEND_GUARD: missing scope, verified decision or cost status');
  mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 });
  withLedgerLock(ledgerPath, () => {
    const requests = readLedger(ledgerPath);
    if (requests.has(requestId)) throw new Error('SPEND_GUARD: duplicate call; no request sent');
    appendDurable(ledgerPath, { type: 'reserve', bead: GENERATION_BEAD, scope: GENERATION_SCOPE, model,
      revision: revision ?? 'UNVERIFIED', projectId: projectId ?? 'UNVERIFIED', requestId,
      approvalDecisionId: approval.decisionId, reservedUsd: chargeBoundUsd, at: new Date().toISOString() });
  });
}

/** Read-only reservation check for a pre-request artifact left by an interrupted older runner.
 * The ledger, not a removable run directory, is authoritative for possibly paid requests.
 */
export function hasGenerationReservation({ ledgerPath, requestId }) {
  if (!ledgerPath || !requestId) throw new Error('SPEND_GUARD: ledger path and request ID required');
  mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 });
  return withLedgerLock(ledgerPath, () => readLedger(ledgerPath).has(requestId));
}

export function settleGeneration({ ledgerPath, requestId, model, computedUsd = 'UNVERIFIED', status, tokens = null }) {
  if (!ledgerPath || !requestId || !model || !['completed', 'failed', 'unknown'].includes(status) ||
      (computedUsd !== 'UNVERIFIED' && !(typeof computedUsd === 'number' && Number.isFinite(computedUsd) && computedUsd >= 0))) {
    throw new Error('SPEND_GUARD: invalid settlement');
  }
  withLedgerLock(ledgerPath, () => {
    const requests = readLedger(ledgerPath);
    const reservation = requests.get(requestId);
    if (!reservation || reservation.model !== model || reservation.settled) {
      throw new Error('SPEND_GUARD: settlement without matching unsettled reservation');
    }
    appendDurable(ledgerPath, { type: 'settle', bead: GENERATION_BEAD, scope: GENERATION_SCOPE,
      requestId, model, computedUsd, tokens: tokens ?? 'UNVERIFIED', status, at: new Date().toISOString() });
  });
}

function readLedger(path) {
  const requests = new Map();
  let content;
  try { content = readFileSync(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return requests; throw error; }
  if (content && !content.endsWith('\n')) throw new Error('SPEND_GUARD: torn ledger row');
  const lines = content.split('\n').filter(Boolean);
  for (const line of lines) {
    const entry = JSON.parse(line); // torn/corrupt ledger fails closed
    if (entry.scope !== GENERATION_SCOPE || entry.bead !== GENERATION_BEAD || !entry.requestId ||
        !['reserve', 'settle'].includes(entry.type)) throw new Error('SPEND_GUARD: malformed ledger row');
    if (entry.type === 'reserve') {
      if (requests.has(entry.requestId) || !knownUsd(entry.reservedUsd) || !entry.model) {
        throw new Error('SPEND_GUARD: malformed reservation');
      }
      requests.set(entry.requestId, { model: entry.model, settled: false });
    } else {
      const prior = requests.get(entry.requestId);
      if (!prior || prior.settled || prior.model !== entry.model ||
          (entry.computedUsd !== 'UNVERIFIED' && !(typeof entry.computedUsd === 'number' &&
            Number.isFinite(entry.computedUsd) && entry.computedUsd >= 0))) {
        throw new Error('SPEND_GUARD: malformed settlement');
      }
      prior.settled = true;
    }
  }
  return requests;
}

function withLedgerLock(path, action) {
  const lockPath = `${path}.lock`;
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch { throw new Error('SPEND_GUARD: ledger lock held or unavailable; refusing request'); }
  try { return action(); } finally { rmdirSync(lockPath); }
}

function appendDurable(path, entry) {
  const fd = openSync(path, 'a', 0o600);
  try { appendFileSync(fd, `${JSON.stringify(entry)}\n`); fsyncSync(fd); }
  finally { closeSync(fd); }
}
