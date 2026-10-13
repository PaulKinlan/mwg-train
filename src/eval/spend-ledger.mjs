import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, rmdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';

export const GENERATION_BEAD = 'mwg-train-i5i2.1';
export const GENERATION_SCOPE = 'generation';
const TRUSTED_AUTHORS = new Set(['fleet-manager-coord', 'mwg-train-coord', 'paulkinlan']);
const SHA = /^[a-f0-9]{64}$/;
const finitePositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The Beads issue description is not an approval. Only a signed, verbatim owner comment is eligible. */
export function readGenerationApprovalComments() {
  return JSON.parse(execFileSync('bd', ['comments', GENERATION_BEAD, '--json'], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
  }));
}

/** A hub signature binds the exact quoted owner words and typed scope/cap/model to this bead.
 * Actor names alone are insufficient: BEADS_ACTOR can be supplied by an untrusted local process.
 */
export function verifyGenerationApproval(comments, { key, model, now = new Date(), host = hostname() } = {}) {
  if (!key || !Array.isArray(comments)) throw new Error('NO_OWNER_AUTH: signed bead comments and verification key required');
  for (const comment of [...comments].reverse()) {
    if (comment.issue_id !== GENERATION_BEAD || !TRUSTED_AUTHORS.has(comment.author)) continue;
    const text = String(comment.text ?? '');
    const lines = Object.fromEntries(text.split('\n').map((line) => {
      const match = /^([A-Za-z-]+): (.+)$/.exec(line);
      return match ? [match[1], match[2]] : [null, null];
    }).filter(([label]) => label));
    if (!text.startsWith('OWNER-AUTHORIZATION\n') || lines.Scope !== GENERATION_SCOPE || lines.Model !== model ||
        !host || lines['Ledger-host'] !== host) continue;
    const cap = Number(lines['Cap-USD']);
    const stop = Number(lines['Stop-at-pct']);
    const expiry = Date.parse(lines.Expiry ?? '');
    if (!/^"Authorised: up to [^"\n]+ USD in total for DeepSeek V4(?:\.1)? Flash generation; stop and ask at [^"\n]+\."$/.test(lines.Verbatim ?? '') ||
        !finitePositive(cap) || !Number.isInteger(stop) || stop < 1 || stop > 100 ||
        !Number.isFinite(expiry) || expiry <= now.getTime()) continue;
    const verbatimCap = /up to ([0-9]+(?:\.[0-9]{1,2})?) USD/.exec(lines.Verbatim)?.[1];
    const verbatimStop = /stop and ask at ([0-9]+)%\./.exec(lines.Verbatim)?.[1];
    if (Number(verbatimCap) !== cap || Number(verbatimStop) !== stop) continue;
    const payload = [GENERATION_BEAD, lines.Verbatim, lines.Scope, lines.Model, lines['Cap-USD'], lines.Expiry, lines['Stop-at-pct'], host].join('\n');
    const expected = createHmac('sha256', key).update(payload).digest('hex');
    const signature = lines.Signature?.replace(/^hmac-sha256:/, '');
    if (!SHA.test(signature ?? '') || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) continue;
    return { bead: GENERATION_BEAD, scope: GENERATION_SCOPE, capUsd: cap, stopPct: stop, expiry: lines.Expiry, commentId: comment.id, model, host, verbatim: lines.Verbatim };
  }
  throw new Error('NO_OWNER_AUTH: no unexpired, signed verbatim amount-scoped authorisation on the generation bead');
}

/** A quote for this precise inference SKU and billing mode is required. Training and -0731 quotes never match. */
export function loadPinnedGenerationTariff(model) {
  const quotes = readFileSync(new URL('../../docs/eval/quotes.jsonl', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const quote = quotes.find((entry) => entry.provider === 'Fireworks' && entry.model === model &&
    entry.product === 'inference (exact model)' && entry.mode === 'serverless' &&
    entry.inference_rates?.billingMode === 'per-token' && SHA.test(entry.sha256 ?? ''));
  if (!quote) throw new Error(`UNVERIFIED_COST: no cited exact-SKU inference quote in docs/eval/quotes.jsonl for ${model}`);
  return { ...quote.inference_rates, model, scope: GENERATION_SCOPE, sourceUrl: quote.source_url,
    sourceSha256: quote.sha256, billingMode: 'per-token' };
}

export function worstCaseGenerationUsd({ tariff, model, promptTokensUpperBound, maxOutputTokens }) {
  if (tariff?.model !== model || tariff?.scope !== GENERATION_SCOPE || tariff?.billingMode !== 'per-token' ||
      !/^https:\/\//.test(tariff.sourceUrl ?? '') || !SHA.test(tariff.sourceSha256 ?? '') ||
      !finitePositive(tariff.inputUsdPerMillion) || !finitePositive(tariff.outputUsdPerMillion) ||
      !finitePositive(tariff.reasoningUsdPerMillion) || !Number.isFinite(tariff.minimumUsd) || tariff.minimumUsd < 0 ||
      !Number.isSafeInteger(promptTokensUpperBound) || promptTokensUpperBound <= 0 ||
      !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new Error('UNVERIFIED_COST: exact-SKU cited inference tariff and bounded tokens required');
  }
  // Reasoning shares the completion cap. Price ALL completion tokens at the more expensive rate;
  // never double-count output and reasoning or assume reasoning is free.
  const bound = Math.max(tariff.minimumUsd,
    (promptTokensUpperBound * tariff.inputUsdPerMillion +
      maxOutputTokens * Math.max(tariff.outputUsdPerMillion, tariff.reasoningUsdPerMillion)) / 1_000_000);
  if (!finitePositive(bound)) throw new Error('UNVERIFIED_COST: no finite conservative charge bound');
  return Math.ceil(bound * 100) / 100;
}

/** Single-machine reservation under a cross-process lock. Never steal a stale lock automatically:
 * a crashed request could still be running or charged, and an uncertain reservation stays charged.
 * A shared account across VMs requires a single shared atomic ledger/lock, else live calls must refuse.
 */
export function reserveGeneration({ ledgerPath, approval, chargeBoundUsd, requestId, model }) {
  if (!ledgerPath || !requestId || !approval || approval.bead !== GENERATION_BEAD ||
      approval.scope !== GENERATION_SCOPE || approval.model !== model || approval.host !== hostname() || !finitePositive(chargeBoundUsd)) {
    throw new Error('SPEND_GUARD: missing scope, approval or charge bound');
  }
  mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 });
  const lockPath = `${ledgerPath}.lock`;
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch { throw new Error('SPEND_GUARD: ledger lock held or unavailable; refusing live request'); }
  try {
    const charges = new Map();
    try {
      for (const line of readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean)) {
        const entry = JSON.parse(line); // a torn/corrupt ledger fails closed
        if (entry.scope !== GENERATION_SCOPE || entry.bead !== GENERATION_BEAD || !entry.requestId ||
            !['reserve', 'settle'].includes(entry.type)) throw new Error('SPEND_GUARD: malformed ledger row');
        if (entry.type === 'reserve') {
          if (!finitePositive(entry.reservedUsd) || charges.has(entry.requestId)) throw new Error('SPEND_GUARD: malformed reservation');
          charges.set(entry.requestId, entry.reservedUsd);
        } else {
          if (!charges.has(entry.requestId)) throw new Error('SPEND_GUARD: settlement without reservation');
          if (typeof entry.actualUsd === 'number' && Number.isFinite(entry.actualUsd)) {
            charges.set(entry.requestId, Math.max(charges.get(entry.requestId), entry.actualUsd));
          }
        }
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const used = [...charges.values()].reduce((sum, value) => sum + value, 0);
    const effectiveCap = approval.capUsd * approval.stopPct / 100;
    if (charges.has(requestId) || !Number.isFinite(used) || used + chargeBoundUsd > effectiveCap + 1e-9) {
      throw new Error('SPEND_GUARD: duplicate call or cap exhausted; no request sent');
    }
    appendDurable(ledgerPath, { type: 'reserve', bead: GENERATION_BEAD, scope: GENERATION_SCOPE, model,
      requestId, approvalCommentId: approval.commentId, reservedUsd: chargeBoundUsd, at: new Date().toISOString() });
  } finally { rmdirSync(lockPath); }
}

export function settleGeneration({ ledgerPath, requestId, model, actualUsd = null, status, tokens = null }) {
  if (!requestId || !model || !['completed', 'failed', 'unknown'].includes(status) ||
      (actualUsd !== null && (!Number.isFinite(actualUsd) || actualUsd < 0))) throw new Error('SPEND_GUARD: invalid settlement');
  const lockPath = `${ledgerPath}.lock`;
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch { throw new Error('SPEND_GUARD: ledger lock held or unavailable; settlement must be reconciled'); }
  try {
    appendDurable(ledgerPath, { type: 'settle', bead: GENERATION_BEAD, scope: GENERATION_SCOPE,
      requestId, model, actualUsd: actualUsd ?? 'UNVERIFIED', tokens: tokens ?? 'UNVERIFIED', status, at: new Date().toISOString() });
  } finally { rmdirSync(lockPath); }
}

function appendDurable(path, entry) {
  const fd = openSync(path, 'a', 0o600);
  try { appendFileSync(fd, `${JSON.stringify(entry)}\n`); fsyncSync(fd); }
  finally { closeSync(fd); }
}
