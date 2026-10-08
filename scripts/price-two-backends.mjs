#!/usr/bin/env node
/**
 * The comparative cost sheet: one shared checkpoint, both backends, from pinned quotes only.
 *
 * Every rate is read out of docs/eval/quotes.jsonl by quote id. Nothing is typed in here, and a quote id
 * that is missing fails the run rather than falling back to a remembered number - the rule that produced
 * this file, after a rate arrived shell-mangled as `/bin/bash.50` and was believed for ten minutes.
 *
 * The headline comparison uses a checkpoint both backends can train, because otherwise the difference
 * between the columns is the model as well as the platform. The cluster column is an ESTIMATE for the
 * parts that depend on a machine nobody has rented; that is recorded, not smoothed over.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { estimateTokensFromCharacters } from '../src/eval/cost.mjs';
import { TrainingSeamError } from '../src/train/seam.mjs';
import { backendCostPerAccepted, compareBackends, renderComparison } from '../src/train/compare.mjs';
import { FIREWORKS_TRAINABLE } from '../src/train/reachability.mjs';
import { adapter as fireworks } from '../src/train/backends/fireworks.mjs';
import { adapter as cluster } from '../src/train/backends/cluster.mjs';

const repoRoot = join(import.meta.dirname, '..');

/** Load quotes and refuse to proceed without the ones this sheet is built on. */
export function loadQuotes(path = join(repoRoot, 'docs/eval/quotes.jsonl')) {
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const byId = new Map(rows.map((row) => [row.quote_id, row]));
  return {
    rows,
    require(quoteId) {
      const row = byId.get(quoteId);
      if (!row) {
        throw new TrainingSeamError('UNKNOWN_QUOTE', `no quote "${quoteId}" in ${path}. A rate we cannot point at is not a rate.`);
      }
      return row;
    },
  };
}

/** Total characters of the training corpus, from the briefs manifest. */
export function corpusCharacters(path = join(repoRoot, 'docs/eval/briefs/manifest.jsonl')) {
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const characters = rows.reduce((sum, row) => sum + String(row.prompt ?? '').length, 0);
  return { rows: rows.length, characters };
}

/** The pilot's measured yield, so the denominator is a measurement rather than a round number. */
export function pilotYield(path = join(repoRoot, 'docs/pilot/yield.json')) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  const decisions = report.decisions ?? [];
  const attempted = decisions.length;
  const accepted = decisions.filter((decision) => decision.category === 'accepted').length;
  if (attempted === 0) throw new TrainingSeamError('NO_PILOT', 'the pilot report has no decisions; cost per accepted pair needs a measured yield');
  return { attempted_pairs: attempted, accepted_pairs: accepted, source: path };
}

export async function buildSheet({ checkpoint = 'qwen3-8b', servingGpuHours = 2, tokens = null } = {}) {
  const quotes = loadQuotes();
  const managed = quotes.require('fireworks-lora-sft-up-to-16b');
  const clusterGpu = quotes.require('lambda-nvidia-a100-sxm-1-99');

  const model = FIREWORKS_TRAINABLE.find((candidate) => candidate.id === checkpoint);
  if (!model) throw new TrainingSeamError('UNREACHABLE_BASE', `"${checkpoint}" is not a trainable checkpoint (${FIREWORKS_TRAINABLE.map((m) => m.id).join(', ')})`);
  if (model.params > 16_000_000_000) {
    throw new TrainingSeamError('WRONG_BAND', `"${checkpoint}" is ${model.params} parameters, outside the up-to-16B quote this sheet prices with`);
  }

  const corpus = corpusCharacters();
  const estimate = tokens ?? estimateTokensFromCharacters(corpus.characters);
  const measuredTokens = typeof tokens === 'number' ? { measured: tokens, source: 'supplied' } : { measured: null, estimate: estimate.tokens, source: estimate.note };

  const yieldNow = pilotYield();
  const job = {
    corpus: { path: 'docs/eval/briefs/manifest.jsonl', sha256: `sha256:${'0'.repeat(64)}`, rows: corpus.rows },
    // The canonical id, which each adapter resolves to its own provider's name.
    base: { repo: checkpoint, model_id: checkpoint, revision: 'c03e6d358207e414f1eca0bb1891e29f1db0e242', licence: model.licence },
    hyperparameters: { method: 'lora-sft', rank: 16, epochs: 2, max_seq_len: 4096, learning_rate: 0.0002 },
    output_ref: 'runs/dry-run-1',
  };

  // Plan only: planning prices the job, it does not train anything. `runTraining` is the seam that would
  // actually run it, and it requires a client, so it is not called from a pricing script.
  const planned = { fireworks: fireworks.plan(job), cluster: cluster.plan(job) };
  for (const [name, plan] of Object.entries(planned)) {
    if (plan.base.resolved_revision !== job.base.revision) {
      throw new TrainingSeamError('SEAM_MISMATCH', `the ${name} adapter planned against revision ${plan.base.resolved_revision}, not the declared ${job.base.revision}`);
    }
  }

  const manifests = {
    fireworks: {
      backend: 'fireworks',
      resolved_base_revision: job.base.revision,
      corpus_sha256: job.corpus.sha256,
      tokenizer: 'qwen3',
      hyperparameters: job.hyperparameters,
      tokens: measuredTokens,
      training_log: 'runs/dry-run-1/fireworks.log',
      adapter: { uri: 'runs/dry-run-1/adapter', sha256: `sha256:${'1'.repeat(64)}`, format: 'lora-fireworks' },
    },
    cluster: {
      backend: 'cluster',
      resolved_base_revision: job.base.revision,
      corpus_sha256: job.corpus.sha256,
      tokenizer: 'qwen3',
      hyperparameters: job.hyperparameters,
      tokens: measuredTokens,
      training_log: 'runs/dry-run-1/cluster.log',
      adapter: { uri: 'runs/dry-run-1/adapter', sha256: `sha256:${'2'.repeat(64)}`, format: 'lora-peft' },
    },
  };

  const comparison = compareBackends({
    yield: yieldNow,
    backends: [
      {
        name: 'fireworks',
        manifest: manifests.fireworks,
        rates: { usd_per_million_training_tokens: managed.value, currency: managed.currency, quote_ids: [managed.quote_id] },
        serving: { gpuHours: servingGpuHours, measured: false, unit: 'gpu_hours' },
      },
      {
        name: 'cluster',
        manifest: manifests.cluster,
        // The cluster's training is host time, so it is priced as GPU-hours rather than per token; the
        // per-token rate is supplied only so the same quantity is priced the same way on both sides.
        rates: { usd_per_million_training_tokens: managed.value, usd_per_gpu_hour: clusterGpu.value, currency: clusterGpu.currency, quote_ids: [clusterGpu.quote_id] },
        serving: { gpuHours: servingGpuHours, measured: false, unit: 'gpu_hours' },
      },
    ],
  });

  return { comparison, corpus, estimate, yield: yieldNow, quotes: { managed, clusterGpu }, planned, job };
}

function render(sheet) {
  const { comparison, quotes, corpus, estimate, yield: measured } = sheet;
  const lines = [];
  lines.push('# Two backends, one shared checkpoint');
  lines.push('');
  lines.push('Generated by `npm run price:two-backends`. Every rate below is read from `docs/eval/quotes.jsonl` by quote id.');
  lines.push('');
  lines.push('## What was priced');
  lines.push('');
  lines.push(`- **Checkpoint:** \`${sheet.planned.fireworks.base.model_id}\` (${sheet.planned.fireworks.params} parameters) - available on *both* backends, so the difference between the columns is the platform and not the model.`);
  lines.push(`- **Corpus:** ${corpus.rows} briefs, ${corpus.characters} characters. Token count: **${estimate.tokens} ${estimate.source === 'supplied' ? '(supplied)' : 'ESTIMATE'}** (${estimate.note}).`);
  lines.push(`- **Yield:** ${measured.accepted_pairs} of ${measured.attempted_pairs} accepted pairs, measured by the pilot (\`${measured.source}\`), not assumed.`);
  lines.push('');
  lines.push('## Rates');
  lines.push('');
  lines.push('| Quote id | Provider | Product | Rate | Retrieved | sha256 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of [quotes.managed, quotes.clusterGpu]) {
    lines.push(`| \`${row.quote_id}\` | ${row.provider} | ${row.product} | ${row.value} ${row.currency} ${row.billing_unit} | ${row.retrieved_at} | \`${String(row.sha256).slice(0, 18)}…\` |`);
  }
  lines.push('');
  lines.push('## Cost per accepted pair');
  lines.push('');
  lines.push(renderComparison(comparison));
  lines.push('');
  lines.push(`**Verdict: ${comparison.verdict}${comparison.cheaper_backend ? ` - cheaper: \`${comparison.cheaper_backend}\`` : ''}** (confidence ${comparison.confidence}). ${comparison.note}`);
  lines.push('');
  lines.push('## What this sheet does not claim');
  lines.push('');
  lines.push('- The token count is an ESTIMATE from characters/4. It must be replaced by a count from the training tokenizer before any per-token price is treated as a quote.');
  lines.push('- Serving time is an assumed wall-clock multiplied by a pinned rate, so the serving line is an ESTIMATE. Managed LoRA serving requires an on-demand **dedicated deployment** billed per GPU-second; it is not covered by serverless per-token inference.');
  lines.push('- The cluster column assumes the same wall-clock as the managed column. Nobody has rented a GPU, so its setup time and throughput are unmeasured: the first real run replaces this with a measurement.');
  lines.push('- This is a dry-run price, not a quote. Generation, failures, repeated hyperparameter runs and checks are not in it.');
  lines.push('');
  return lines.join('\n');
}

if (import.meta.filename === process.argv[1]) {
  const sheet = await buildSheet({ servingGpuHours: Number(process.argv[2] ?? 2) });
  const out = join(repoRoot, 'docs/eval/two-backends.md');
  writeFileSync(out, render(sheet));
  console.log(`wrote ${out}`);
  console.log(`${sheet.comparison.verdict}${sheet.comparison.cheaper_backend ? ` (cheaper: ${sheet.comparison.cheaper_backend})` : ''} | confidence ${sheet.comparison.confidence}`);
}
