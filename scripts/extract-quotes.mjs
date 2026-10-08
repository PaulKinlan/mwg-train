#!/usr/bin/env node
/**
 * Derive docs/eval/quotes.jsonl from the raw provider pages we fetched.
 *
 *   node scripts/extract-quotes.mjs [--raw-dir docs/eval/quotes.raw] [--out docs/eval/quotes.jsonl]
 *
 * The point of this script is that the priced table is **derived, not typed**. Every row it emits
 * carries the URL, the retrieval time, the sha256 and byte count of the body it came from, and the
 * verbatim snippet the number was read out of. If a page changes or a quote is edited by hand, the
 * row no longer matches its body and scripts/verify-quotes.mjs fails.
 *
 * It is also deliberately conservative:
 *  - it only reads numbers that are present in the fetched HTML (a JS-only page yields nothing and
 *    is reported as unverified rather than guessed);
 *  - each extractor anchors on a structure that repeats itself, so a label cannot drift away from
 *    its price (see the RunPod card pattern);
 *  - anything ambiguous goes to quotes.unverified.jsonl with the reason, never into the priced file.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { decodeHtml } from '../src/eval/quotes.mjs';
import process from 'node:process';

const money = (value) => Number(value);

/**
 * RunPod lists GPU cards as:
 *   NAME <vram> GB VRAM <ram> GB RAM <n> vCPUs $ <price> /hr <vram> GB VRAM <ram> GB RAM <n> vCPUs Deploy NAME
 * The repeated name and the repeated spec triple are the anchor: a price can only be emitted when
 * the same card name and the same specs appear on both sides of it.
 */
function runpod(text) {
  const pattern =
    /([A-Za-z0-9][A-Za-z0-9 .\-]{1,28}?) (\d+) GB VRAM (\d+) GB RAM (\d+) vCPUs \$ ([0-9]+\.[0-9]{2}) \/hr \2 GB VRAM \3 GB RAM \4 vCPUs Deploy \1/g;
  const rows = [];
  const seen = new Set();
  for (const match of text.matchAll(pattern)) {
    const [snippet, name, vram, ram, vcpus, price] = match;
    const key = name.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      quote_id: `runpod-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ondemand`,
      provider: 'RunPod',
      product: 'community cloud',
      gpu: key.trim(),
      vram_gb: Number(vram),
      mode: 'on-demand',
      unit: 'usd_per_gpu_hour',
      value: money(price),
      billing_unit: 'per hour',
      verbatim: snippet.slice(0, 200),
      notes: `listed with ${ram} GB RAM and ${vcpus} vCPUs`,
    });
  }
  return rows;
}

/** Slice a section out of the decoded page text, between two anchors. */
function section(text, startAnchor, endAnchor) {
  const start = text.indexOf(startAnchor);
  if (start === -1) return '';
  const rest = text.slice(start + startAnchor.length);
  const end = endAnchor ? rest.indexOf(endAnchor) : -1;
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Fireworks: "Models up to 16B parameters $0.50 $1.00 $1.00 $2.00" for
 * LoRA SFT / LoRA DPO / full-parameter SFT / full-parameter DPO, per 1M training tokens.
 */
function fireworksBands(text) {
  const rows = [];
  const table = section(text, 'LoRA SFT', 'SFT and DPO prices are shown');
  const pattern = /(?:^| )Models ([^$]{2,80}?) (?:parameters )?\$([0-9.]+) \$([0-9.]+) \$([0-9.]+) \$([0-9.]+)/g;
  for (const match of table.matchAll(pattern)) {
    const [, bandRaw, loraSft, loraDpo, fullSft, fullDpo] = match;
    const band = bandRaw.trim().replace(/\s+/g, ' ');
    rows.push({
      quote_id: `fireworks-lora-sft-${band.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      provider: 'Fireworks',
      product: 'managed training (size band)',
      gpu: null,
      vram_gb: null,
      mode: 'managed',
      unit: 'usd_per_million_training_tokens',
      value: money(loraSft),
      model_size_band: `${band} parameters (LoRA SFT)`,
      billing_unit: 'per 1M training tokens',
      verbatim: match[0].trim().slice(0, 200),
      notes: `same table: LoRA DPO $${loraDpo}, full-parameter SFT $${fullSft}, full-parameter DPO $${fullDpo} per 1M tokens`,
    });
  }
  return rows;
}

/** Fireworks per-model serverless table: "Qwen 3.8 27B 128K $1.86 $0.372 $5.595 $4.103" (prefill, cached, sample, train). */
function fireworksPerModel(text) {
  const rows = [];
  const table = section(text, 'Train / 1M', 'Checkpoint storage');
  const pattern = /([A-Z][A-Za-z0-9.]+(?: [A-Za-z0-9.]+){0,3}) (\d+K) \$([0-9.]+) \$([0-9.]+) \$([0-9.]+) \$([0-9.]+)/g;
  for (const match of table.matchAll(pattern)) {
    const [, model, context, prefill, cached, sample, train] = match;
    rows.push({
      quote_id: `fireworks-train-${model.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      provider: 'Fireworks',
      product: 'serverless training (per model)',
      gpu: null,
      vram_gb: null,
      mode: 'managed',
      unit: 'usd_per_million_training_tokens',
      value: money(train),
      model_size_band: `${model.trim()} (${context} context, Train / 1M column)`,
      billing_unit: 'per 1M training tokens',
      verbatim: match[0].slice(0, 200),
      notes: `same row: prefill $${prefill}, cached prefill $${cached}, sample $${sample} per 1M`,
    });
  }
  return rows;
}

/**
 * Together publishes the same model list twice, once per toggle (the order in the document is
 * `LoRA fine-tuning` then `Full fine-tuning`), and each table is followed by the caption explaining
 * how the tokens are counted. Reading them as one table would attach a full-fine-tuning price to a
 * LoRA label, so the caption is the boundary and the toggle order is recorded as an inference.
 */
function togetherTable(text, { startAnchor, endAnchor, product, order }) {
  const rows = [];
  const table = section(text, startAnchor, endAnchor);
  const pattern = /([A-Z][A-Za-z0-9.\-]+(?: [A-Za-z0-9.\-]+){0,4}) \$([0-9.]+) \$([0-9.]+) \$([0-9.]+)(?= [A-Z]| Since| Model|$)/g;
  for (const match of table.matchAll(pattern)) {
    const [, model, sft, dpo, minimum] = match;
    if (/Minimum charge/.test(model)) continue;
    rows.push({
      quote_id: `together-${product === 'LoRA' ? 'lora' : 'full'}-sft-${model.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      provider: 'Together AI',
      product: `managed fine-tuning, table ${order} of 2 (${product})`,
      gpu: null,
      vram_gb: null,
      mode: 'managed',
      unit: 'usd_per_million_training_tokens',
      value: money(sft),
      model_size_band: `${model.trim()} (${product} supervised fine-tuning, table ${order} of 2)`,
      billing_unit: 'per 1M tokens, minimum charge per job',
      verbatim: match[0].slice(0, 200),
      notes: `same row: DPO $${dpo} per 1M tokens, MINIMUM CHARGE $${minimum} per job - for a small dry run the minimum is the effective price. Which table is LoRA and which is full-parameter is INFERRED from the toggle order (LoRA is listed first); the prices themselves are fetched.`,
    });
  }
  return rows;
}

/**
 * Lambda publishes four plan tables (8x/4x/2x/1x) and the toggle is client-side, so the static HTML
 * contains the tables without their labels. The per-GPU vCPU count identifies the plan shape
 * (26 vCPUs per GPU on these instances), which is recorded as an inference rather than a fact.
 */
function lambda(text) {
  const rows = [];
  const pattern = /(NVIDIA [A-Za-z0-9 ]+?) (\d+) GB (\d+) (\d+) GiB [0-9.]+ \w+ SSD \$([0-9]+\.[0-9]{2})/g;
  const seen = new Set();
  for (const match of text.matchAll(pattern)) {
    const [, gpu, vram, vcpus, ram, price] = match;
    const key = `${gpu.trim()}-${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const plan = Number(vcpus) % 26 === 0 ? `${Number(vcpus) / 26}x` : 'unknown';
    rows.push({
      quote_id: `lambda-${gpu.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${price.replace('.', '-')}`,
      provider: 'Lambda',
      product: 'GPU cloud',
      gpu: gpu.trim(),
      vram_gb: Number(vram),
      mode: 'on-demand',
      unit: 'usd_per_gpu_hour',
      value: money(price),
      billing_unit: 'per GPU per hour',
      verbatim: match[0].slice(0, 200),
      notes: `plan INFERRED as ${plan} from ${vcpus} vCPUs (26 per GPU); the plan toggle is client-side so the label is not in the fetched HTML - treat the plan as unverified, the price as fetched`,
    });
  }
  return rows;
}

function main() {
  const argv = process.argv.slice(2);
  let rawDir = 'docs/eval/quotes.raw';
  let out = 'docs/eval/quotes.jsonl';
  let unverifiedOut = 'docs/eval/quotes.unverified.jsonl';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--raw-dir') rawDir = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--unverified-out') unverifiedOut = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/extract-quotes.mjs [--raw-dir <dir>] [--out <file>]');
      process.exit(0);
    }
  }
  rawDir = resolve(rawDir);
  const fetched = JSON.parse(readFileSync(join(rawDir, 'fetched.json'), 'utf8'));

  const extractors = {
    runpod: [runpod],
    fireworks: [fireworksBands, fireworksPerModel],
    lambda: [lambda],
    // Together publishes two fine-tuning tables (LoRA and full-parameter) that differ by about 11%,
    // and the static HTML contains both copies without a machine-readable label for either - the
    // toggle that distinguishes them is client-side. Rather than attach the wrong label to a real
    // price, Together is recorded as unverified with both observed ranges (see the unverified file).
    together: [],
  };
  const togetherObserved = (() => {
    const body = readFileSync(join(rawDir, 'together.pricing.html'));
    const text = decodeHtml(body.toString('utf8'));
    const values = [...text.matchAll(/([A-Za-z0-9.\- ]{2,30}?) \$(0\.\d+) \$0\.\d+ \$4\.00/g)].map((m) => Number(m[2]));
    const unique = [...new Set(values)].sort((a, b) => a - b);
    return unique.length > 0 ? `observed supervised fine-tuning prices for small models: $${unique.join(', $')} per 1M tokens (two tables; which is LoRA and which is full-parameter is not determinable from the fetched HTML)` : 'observed, but no per-model values could be read';
  })();
  const rows = [];
  const coverage = [];

  for (const [file, meta] of Object.entries(fetched)) {
    const body = readFileSync(join(rawDir, file));
    const sha = createHash('sha256').update(body).digest('hex');
    const text = decodeHtml(body.toString('utf8'));
    const provider = file.split('.')[0];
    const extracted = [extractors[provider] ?? []].flat().flatMap((fn) => fn(text));
    coverage.push({ file, provider, extracted: extracted.length, sha });
    for (const row of extracted) {
      rows.push({
        ...row,
        currency: 'USD',
        region: '',
        retrieved_at: meta.fetched_at,
        source_url: meta.url,
        http_status: meta.http_status,
        sha256: sha,
        bytes: body.length,
        raw_file: file,
      });
    }
  }

  rows.sort((a, b) => `${a.provider}${a.gpu ?? a.model_size_band}`.localeCompare(`${b.provider}${b.gpu ?? b.model_size_band}`));
  writeFileSync(resolve(out), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

  // Pages we fetched that yielded no number, plus providers we could not fetch at all. These are
  // recorded as unverified: a priced sheet must not contain a number nobody read.
  const unverified = [];
  for (const entry of coverage) {
    if (entry.extracted === 0) {
      unverified.push({
        provider: entry.provider,
        claim_source: 'fetched page',
        claim: 'none extracted',
        why_unverified: `page fetched (${entry.sha.slice(0, 12)}) but it contains no price this extractor can read without executing JavaScript or parsing a client-side table`,
        url: fetched[entry.file].url,
        retrieved_at: fetched[entry.file].fetched_at,
      });
    }
  }
  unverified.push(
    {
      provider: 'Together AI',
      claim_source: 'fetched page (594049 bytes), structure ambiguous',
      claim: togetherObserved,
      why_unverified:
        'the fetched page contains two fine-tuning tables (LoRA and full-parameter, about 11% apart) plus a $4.00 minimum charge per job, but the toggle that labels each table is client-side, so a per-table price cannot be priced without guessing which table it came from',
      url: fetched['together.pricing.html']?.url ?? 'https://www.together.ai/pricing',
      retrieved_at: fetched['together.pricing.html']?.fetched_at ?? '',
    },
    {
      provider: 'Vast.ai',
      claim_source: 'fetched page, no prices present',
      claim: '',
      why_unverified: 'the pricing table is populated client-side; the fetched HTML has no per-GPU numbers',
      url: 'https://vast.ai/pricing',
      retrieved_at: fetched['vast.pricing.html']?.fetched_at ?? '',
    },
    {
      provider: 'Predibase',
      claim_source: 'not fetched',
      claim: '',
      why_unverified: 'HTTP 403 to a plain client',
      url: 'https://predibase.com/pricing',
      retrieved_at: '2026-10-08T09:30:00Z',
    },
    {
      provider: 'OpenAI',
      claim_source: 'not fetched',
      claim: '',
      why_unverified: 'HTTP 403 to a plain client',
      url: 'https://openai.com/api/pricing/',
      retrieved_at: '2026-10-08T09:30:00Z',
    },
    {
      provider: 'Lyceum',
      claim_source: 'lane report (mwg-train-coord), not fetched by this lane',
      claim: 'offers GLM-5.3 Flash or Qwen3.8 27B LoRA training with downloadable adapters, no published price',
      why_unverified: 'no published training price found; quote-on-request only',
      url: '',
      retrieved_at: '',
    },
  );
  writeFileSync(resolve(unverifiedOut), `${unverified.map((row) => JSON.stringify(row)).join('\n')}\n`);

  for (const entry of coverage) console.log(`extract-quotes: ${entry.file.padEnd(26)} ${String(entry.extracted).padStart(3)} rows`);
  console.log(`extract-quotes: ${rows.length} verified quotes -> ${out}; ${unverified.length} unverified -> ${unverifiedOut}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
