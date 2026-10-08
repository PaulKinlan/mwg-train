#!/usr/bin/env node
/**
 * Check the reachability evidence, offline and (optionally) against the live documents.
 *
 *   node scripts/check-train-evidence.mjs           # offline: records complete, every row backed by a quote
 *   node scripts/check-train-evidence.mjs --fetch    # also re-fetch and compare the hashes and quotes
 *
 * Why this exists: `src/train/reachability.mjs` carried a cost-estimator digest whose first 16 hex
 * characters were real and whose remaining 48 were invented, and a serving-fees digest truncated to 16
 * characters. Both sat next to real-looking quotes, so nothing failed. A number in this project is only
 * as good as the check that recomputes it, so the record shape (a full 64-character digest, a positive
 * byte count, a verbatim quote) is asserted offline, and `--fetch` re-derives each record from the URL it
 * names. A page that has genuinely changed is reported as CHANGED with both digests, not as a pass.
 *
 * The Hugging Face model API is dynamic (download counters move), so the cluster rows pin the immutable
 * parts - the revision sha and the `safetensors.total` parameter count - and `--fetch` re-reads those
 * fields rather than a body hash.
 */
import { createHash } from 'node:crypto';
import process from 'node:process';

import { CLUSTER_TRAINABLE, EVIDENCE, FIREWORKS_TRAINABLE } from '../src/train/reachability.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const normalise = (value) => String(value).replace(/\s+/g, ' ').trim();

/** Offline findings: every record complete, and every table row supported by a quote. No network. */
export function validateTrainEvidence() {
  const findings = [];
  const add = (code, subject, message) => findings.push({ code, subject, message });

  for (const [key, record] of Object.entries(EVIDENCE)) {
    if (!/^https:\/\//.test(String(record.url))) add('EVIDENCE_URL', key, `url must be https, got ${record.url}`);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(record.fetched_at))) add('EVIDENCE_DATE', key, 'fetched_at must be an ISO timestamp');
    if (record.http_status !== 200) add('EVIDENCE_STATUS', key, `http_status is ${record.http_status}, not 200`);
    // The fabricated digest is the whole reason this check exists: a full 64-character sha256 or nothing.
    if (!SHA256.test(String(record.sha256))) add('EVIDENCE_SHA', key, `sha256 must be a full 64-hex digest, got "${record.sha256}"`);
    if (!Number.isInteger(record.bytes) || record.bytes <= 0) add('EVIDENCE_BYTES', key, 'bytes must be a positive integer');
    if (typeof record.quote !== 'string' || record.quote.trim().length < 8) add('EVIDENCE_QUOTE', key, 'a verbatim quote is required');
  }

  for (const model of FIREWORKS_TRAINABLE) {
    const record = EVIDENCE[model.source];
    if (!record) {
      add('ROW_SOURCE', model.id, `row cites unknown evidence "${model.source}"`);
      continue;
    }
    const quote = record.model_quotes?.[model.id];
    if (!quote) {
      add('ROW_QUOTE', model.id, `no quoted evidence for ${model.id} in ${model.source}`);
      continue;
    }
    const normalised = normalise(quote);
    for (const [field, value] of [['paramCount', model.params], ['managedSft', model.managed_sft], ['managedDpo', model.managed_dpo]]) {
      if (!normalised.includes(`"${field}": ${value}`)) add('ROW_QUOTE_FACT', model.id, `the quoted evidence does not contain ${field}=${value}`);
    }
    if (!(model.lora_shapes > 0)) add('ROW_LORA', model.id, 'a trainable row needs at least one LoRA shape');
    // The licence is the one field that can silently make a run unlawful, and the cost-estimator does
    // not state it, so each row must cite a source for it.
    const licenceSource = model.licence_source;
    if (!licenceSource || !/^https:\/\//.test(String(licenceSource.url))) add('ROW_LICENCE_SOURCE', model.id, 'a trainable row must cite an https source for its licence');
    if (licenceSource?.field !== 'cardData.license') add('ROW_LICENCE_FIELD', model.id, 'the licence source field must be cardData.license');
    if (!COMMIT.test(String(licenceSource?.revision))) add('ROW_LICENCE_REVISION', model.id, 'the licence source needs a resolved 40-character revision');
  }

  for (const model of CLUSTER_TRAINABLE) {
    const source = model.source;
    if (!source || !/^https:\/\//.test(String(source.url))) add('CLUSTER_SOURCE', model.id, 'cluster rows must cite an https source');
    if (source?.field !== 'safetensors.total') add('CLUSTER_FIELD', model.id, 'the cluster source field must be safetensors.total');
    if (!Number.isInteger(model.params) || model.params <= 0) add('CLUSTER_PARAMS', model.id, 'params must be a positive integer');
    if (!COMMIT.test(String(model.revision))) add('CLUSTER_REVISION', model.id, 'a resolved 40-character revision is required, or the count comes from a moving branch');
    if (typeof model.licence !== 'string' || model.licence === '') add('CLUSTER_LICENCE', model.id, 'a licence is required');
  }

  return findings;
}

async function fetchBody(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'mwg-train-evidence-check/1.0' } });
    const body = Buffer.from(await response.arrayBuffer());
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const findings = validateTrainEvidence();
  const fetchMode = process.argv.includes('--fetch');

  if (fetchMode) {
    for (const [key, record] of Object.entries(EVIDENCE)) {
      try {
        const { status, body } = await fetchBody(record.url);
        const text = normalise(body.toString('utf8'));
        const sha = `sha256:${createHash('sha256').update(body).digest('hex')}`;
        if (status !== record.http_status) findings.push({ code: 'FETCH_STATUS', subject: key, message: `live HTTP ${status}, record says ${record.http_status}` });
        if (!text.includes(normalise(record.quote))) findings.push({ code: 'FETCH_QUOTE', subject: key, message: 'the verbatim quote does not occur in the live body' });
        for (const [modelId, quote] of Object.entries(record.model_quotes ?? {})) {
          if (!text.includes(normalise(quote))) findings.push({ code: 'FETCH_MODEL_QUOTE', subject: `${key}:${modelId}`, message: 'the per-model quote does not occur in the live body' });
        }
        if (Number.isInteger(record.model_count)) {
          const counted = new Set([...text.matchAll(/"id": "[^"]+"/g)].map((match) => match[0]));
          if (counted.size !== record.model_count) findings.push({ code: 'FETCH_MODEL_COUNT', subject: key, message: `live document has ${counted.size} distinct ids, record says ${record.model_count}` });
        }
        if (sha !== record.sha256 || body.length !== record.bytes) {
          // A moved page is not the same finding as a fabricated digest, so it is reported as CHANGED with
          // the live values plainly, and the operator decides whether to refresh the record.
          findings.push({
            code: 'FETCH_CHANGED',
            subject: key,
            message: `live body is ${body.length} bytes ${sha}; record says ${record.bytes} bytes ${record.sha256}. The page changed since the record was taken - re-read it and update the record deliberately.`,
          });
        }
      } catch (error) {
        findings.push({ code: 'FETCH_FAILED', subject: key, message: `could not fetch ${record.url}: ${error?.message ?? error}` });
      }
    }

    for (const model of CLUSTER_TRAINABLE) {
      try {
        const { status, body } = await fetchBody(model.source.url);
        const data = JSON.parse(body.toString('utf8'));
        if (status !== 200) findings.push({ code: 'HF_STATUS', subject: model.id, message: `Hugging Face API returned HTTP ${status}` });
        if (data.sha !== model.revision) findings.push({ code: 'HF_REVISION', subject: model.id, message: `live revision ${data.sha}, row says ${model.revision}` });
        const total = data?.safetensors?.total;
        if (total !== model.params) findings.push({ code: 'HF_PARAMS', subject: model.id, message: `live safetensors.total ${total}, row says ${model.params}` });
        const licence = data?.cardData?.license;
        if (licence !== model.licence) findings.push({ code: 'HF_LICENCE', subject: model.id, message: `live licence ${licence}, row says ${model.licence}` });
      } catch (error) {
        findings.push({ code: 'HF_FAILED', subject: model.id, message: `could not fetch ${model.source.url}: ${error?.message ?? error}` });
      }
    }

    for (const model of FIREWORKS_TRAINABLE) {
      try {
        const { status, body } = await fetchBody(model.licence_source.url);
        const data = JSON.parse(body.toString('utf8'));
        if (status !== 200) findings.push({ code: 'HF_STATUS', subject: `${model.id} licence`, message: `Hugging Face API returned HTTP ${status}` });
        if (data.sha !== model.licence_source.revision) findings.push({ code: 'HF_REVISION', subject: `${model.id} licence`, message: `live revision ${data.sha}, row says ${model.licence_source.revision}` });
        const licence = data?.cardData?.license;
        if (licence !== model.licence) findings.push({ code: 'HF_LICENCE', subject: `${model.id} licence`, message: `live licence ${licence}, row claims ${model.licence}` });
      } catch (error) {
        findings.push({ code: 'HF_FAILED', subject: `${model.id} licence`, message: `could not fetch ${model.licence_source.url}: ${error?.message ?? error}` });
      }
    }
  }

  if (findings.length === 0) {
    const scope = fetchMode ? 're-fetched and matched' : 'records complete, quotes back their rows';
    console.log(`check-train-evidence: PASS (${Object.keys(EVIDENCE).length} records, ${FIREWORKS_TRAINABLE.length} Fireworks rows, ${CLUSTER_TRAINABLE.length} cluster rows) - ${scope}`);
    return 0;
  }
  for (const finding of findings) console.error(`check-train-evidence: ${finding.code} ${finding.subject}: ${finding.message}`);
  console.error(`check-train-evidence: FAIL (${findings.length} finding${findings.length === 1 ? '' : 's'})`);
  return 1;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(await main());
}
