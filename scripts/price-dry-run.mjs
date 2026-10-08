#!/usr/bin/env node
/**
 * Render the compute dry-run sheets from the verified quote file.
 *
 *   node scripts/price-dry-run.mjs [--quotes docs/eval/quotes.jsonl] \
 *     [--unverified docs/eval/quotes.unverified.jsonl] [--out docs/eval/pricing.sheets.md]
 *
 * Everything it prints is derived from fetched pages (docs/eval/quotes.jsonl records the URL, the
 * retrieval time and a sha256 of the body) or from the estimator in src/eval/cost.mjs. It prints no
 * price of its own, and it marks every estimated quantity as an estimate, because the design brief
 * (section 7) forbids supplying a number that nobody fetched.
 *
 * The output is generated, not hand-written, so a price in the documentation cannot drift from the
 * price in the file: test/pricing.test.mjs re-runs this and fails if the checked-in sheets differ.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { verifyQuote } from './verify-quotes.mjs';

import { estimateVram, fitsOn, MEASUREMENT_PROTOCOL, trainingCost } from '../src/eval/cost.mjs';

/**
 * Model geometry used for the VRAM estimate. These are the shapes reported for the shortlisted
 * checkpoints; they are inputs to an estimate, not facts the estimate proves, and the note in the
 * output says to confirm each from the model's own config.json before renting.
 */
const SHORTLIST = [
  { id: 'qwen2.5-coder-7b', params: 7.6e9, hiddenSize: 3584, layers: 28, note: 'recommended first run (Apache-2.0, ungated)' },
  { id: 'qwen3.8-27b', params: 27e9, hiddenSize: 5120, layers: 64, note: 'scale-up comparator (Apache-2.0)' },
  { id: 'gemma-4-12b', params: 12e9, hiddenSize: 4096, layers: 48, note: 'alternate family (Apache-2.0)' },
];

const CONTEXTS = [
  { batchSize: 2, sequenceLength: 4096 },
  { batchSize: 4, sequenceLength: 8192 },
];

function parseArgs(argv) {
  const args = {
    quotes: 'docs/eval/quotes.jsonl',
    unverified: 'docs/eval/quotes.unverified.jsonl',
    out: 'docs/eval/pricing.sheets.md',
    rawDir: 'docs/eval/quotes.raw',
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--quotes') args.quotes = argv[++i];
    else if (argv[i] === '--unverified') args.unverified = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--raw-dir') args.rawDir = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`price-dry-run: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

function readJsonl(path, { optional = false } = {}) {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (optional) return [];
    throw error;
  }
}

function money(value) {
  // Quote precision is preserved: a rate read as $4.103 is shown as $4.103, not rounded to $4.10.
  // Two decimal places only when the recorded rate has no more precision than that.
  const text = String(value);
  return `$${text.includes('.') && text.split('.')[1].length > 2 ? text : Number(value).toFixed(2)}`;
}

/**
 * A priced sheet must not contain a row the verifier would reject. Structural checks always run; the
 * body checks run when the raw pages are present (they are gitignored, so a CI checkout that only
 * regenerates the markdown cannot run them).
 *
 * `hasRawBodies` is what makes the second half of that sentence true: `fetched.json` is committed
 * while the pages themselves are gitignored, so the directory exists even in a checkout that has
 * never fetched one. Testing the directory is not testing for bodies, and treating the two as the
 * same made `price-dry-run` refuse in every fresh checkout.
 */
function hasRawBodies(rawDir) {
  return existsSync(rawDir) && readdirSync(rawDir).some((name) => name !== 'fetched.json' && !name.startsWith('.'));
}

function assertVerified(quotes, rawDir) {
  const failures = [];
  for (const row of quotes) {
    const { problems } = verifyQuote(row, { rawDir });
    for (const problem of problems) {
      // A missing body is expected when this checkout has not fetched any pages. It is a real failure
      // when the checkout HAS bodies and this one row's is missing.
      if (problem.code === 'NO_RAW_BODY' && !hasRawBodies(rawDir)) continue;
      failures.push(`${row.quote_id}: ${problem.code} ${problem.message}`);
    }
  }
  if (failures.length > 0) {
    console.error('price-dry-run: refusing to price rows that do not verify:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
}

/**
 * Notes are never truncated in the output. The Lambda rows carry an inference ("the plan label is
 * not in the fetched HTML; treat the plan as unverified, the price as fetched") and a 110-character
 * cutoff used to slice that disclosure in half, leaving the table looking more certain than the
 * evidence. Each row gets a marker and the full text is printed underneath.
 */
function noteMarker(row, footnotes) {
  const note = (row.notes ?? '').trim();
  if (note === '') return '';
  footnotes.push(`- [^${footnotes.length + 1}] ${row.quote_id}: ${note.replace(/\|/g, '\\|')}`);
  return `[^${footnotes.length}]`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error('usage: node scripts/price-dry-run.mjs [--quotes <file>] [--out <file>]');
    process.exit(0);
  }

  const quotes = readJsonl(args.quotes);
  assertVerified(quotes, args.rawDir);
  const unverified = readJsonl(args.unverified, { optional: true });
  const gpuQuotes = quotes.filter((q) => q.unit === 'usd_per_gpu_hour').sort((a, b) => a.value - b.value);
  const tokenQuotes = quotes.filter((q) => q.unit === 'usd_per_million_training_tokens').sort((a, b) => a.value - b.value);

  const lines = [];
  const footnotes = [];
  const push = (line = '') => lines.push(line);

  push('<!-- GENERATED by scripts/price-dry-run.mjs from docs/eval/quotes.jsonl - do not edit by hand. -->');
  push('<!-- test/pricing.test.mjs re-runs the generator and fails if this file differs. -->');
  push();
  push('## Fetched quotes');
  push();
  push(`Every rate below was read from the provider's own page on the retrieval date, and the response body is hashed.`);
  push(`Rows: **${quotes.length} verified**, ${unverified.length} recorded as unverified.`);
  push();
  push('### Rented GPU, per GPU-hour');
  push();
  if (gpuQuotes.length === 0) push('_No verified per-GPU-hour quote yet._');
  else {
    push('| GPU | VRAM | mode | USD/hour | billing | fetched | notes | source |');
    push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const q of gpuQuotes) {
      push(`| ${q.gpu} (${q.provider}) | ${q.vram_gb} GB | ${q.mode} | ${money(q.value)} | ${q.billing_unit ?? ''} | ${q.retrieved_at.slice(0, 10)} | ${noteMarker(q, footnotes)} | [${q.provider}](${q.source_url}) |`);
    }
  }
  push();
  push('### Managed fine-tuning, per million training tokens');
  push();
  if (tokenQuotes.length === 0) push('_No verified per-token training quote yet._');
  else {
    push('| service | size band | USD / 1M training tokens | fetched | notes | source |');
    push('| --- | --- | --- | --- | --- | --- |');
    for (const q of tokenQuotes) {
      push(`| ${q.provider} | ${q.model_size_band ?? ''} | ${money(q.value)} | ${q.retrieved_at.slice(0, 10)} | ${noteMarker(q, footnotes)} | [${q.provider}](${q.source_url}) |`);
    }
  }
  if (footnotes.length > 0) {
    push();
    push('Notes on the rows above (nothing here is truncated):');
    push();
    for (const footnote of footnotes) push(footnote);
  }
  push();
  push('### What every row must carry to be usable');
  push();
  push('`quote_id`, provider, GPU or size band, mode, unit, value, currency, billing unit, `retrieved_at`,');
  push('`source_url`, `http_status: 200`, `sha256` of the fetched body, and a verbatim snippet containing');
  push('the number. Anything that could not be fetched is not priced at all; it is listed as unverified.');
  push();
  if (unverified.length > 0) {
    push('### Recorded as unverified (deliberately not priced)');
    push();
    push('| provider | claim | why unverified | url |');
    push('| --- | --- | --- | --- |');
    for (const row of unverified) {
      push(`| ${row.provider} | ${String(row.claim).replace(/\|/g, '\\|')} | ${row.why_unverified} | ${row.url ?? ''} |`);
    }
    push();
  }

  push('## VRAM estimate for the shortlist');
  push();
  push('ESTIMATED, not measured: this VM has no GPU and, by owner decision, does not run models. The');
  push('estimate exposes each term so it can be argued with, and carries a band of +/-30% because the');
  push('activation term is a checkpointed-forward/backward heuristic rather than a measurement.');
  push();
  push('| model | params | batch x seq | base | adapter | activations | overhead | total (band) | fits (cheapest first) |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const model of SHORTLIST) {
    for (const ctx of CONTEXTS) {
      const est = estimateVram({ params: model.params, hiddenSize: model.hiddenSize, layers: model.layers, ...ctx });
      const fits = fitsOn(Math.ceil(est.band_gb[1]), quotes).slice(0, 3).map((g) => `${g.label} ${money(g.usd_per_gpu_hour)}/h`);
      push(
        `| ${model.id} | ${(model.params / 1e9).toFixed(1)}B nf4 | ${ctx.batchSize} x ${ctx.sequenceLength} | ${est.components_gb.base_weights} GB | ${est.components_gb.adapter_and_optimizer} GB | ${est.components_gb.activations} GB | ${est.components_gb.framework_overhead} GB | ${est.total_gb} GB (${est.band_gb[0]}-${est.band_gb[1]}) | ${fits.join(', ') || 'no verified quote fits'} |`,
      );
    }
  }
  push();
  push('Model geometry above (hidden size, layer count) is the published shape of each checkpoint, used');
  push('as estimator input only. Confirm it from the model\'s own `config.json` at rental time, and');
  push('replace the whole table with measured peaks using the protocol below.');
  push();

  if (gpuQuotes.length > 0 && tokenQuotes.length > 0) {
    const cheapestGpu = gpuQuotes[0];
    const cheapestToken = tokenQuotes[0];
    const illustrative = { tokens: 2_000_000, epochs: 2, tokensPerSecond: 1200, evaluationTokens: 400_000, evaluationTokensPerSecond: 2000, restartMultiplier: 1.2, setupMinutes: 15 };
    const cost = trainingCost({ measured: illustrative, quotes, gpuQuoteId: cheapestGpu.quote_id, managedQuoteId: cheapestToken.quote_id });
    push('## Illustrative dry-run cost, both ways');
    push();
    push('INPUTS ARE ILLUSTRATIVE, NOT MEASURED: 2,000,000 training tokens (2 epochs -> 4,000,000), 1200');
    push('tokens/s, 400,000 evaluation tokens, 1.2x restarts, 15 minutes billed setup. Only the rates and');
    push('their dates are fetched facts; the token count and throughput are placeholders until the dry run');
    push('is executed on the rented host.');
    push();
    push('| route | rate | billed work | compute | total |');
    push('| --- | --- | --- | --- | --- |');
    push(`| rented GPU (${cost.gpu_route.label}, fetched ${cost.gpu_route.retrieved_at.slice(0, 10)}) | ${money(cost.gpu_route.usd_per_gpu_hour)}/h | ${cost.gpu_route.billed_gpu_hours} GPU-hours (${cost.gpu_route.train_hours} train + ${cost.gpu_route.eval_hours} eval + ${cost.gpu_route.setup_hours} setup) | ${money(cost.gpu_route.compute_usd)} | ${money(cost.gpu_route.total_usd)} |`);
    push(`| managed per token (${cost.managed_route.label}, fetched ${cost.managed_route.retrieved_at.slice(0, 10)}) | ${money(cost.managed_route.usd_per_million_training_tokens)}/1M tokens | ${(cost.total_training_tokens / 1e6).toFixed(1)}M tokens | ${money(cost.managed_route.compute_usd)} | ${money(cost.managed_route.total_usd)} |`);
    push();
    push(`Cheaper on these inputs: **${cost.cheaper === 'gpu_route' ? 'rented GPU' : 'managed per token'}**. The`);
    push('deciding inputs are the total training tokens, the measured tokens per second, and the billed');
    push('setup time per attempt: a short job on a rented card spends more time provisioning than training,');
    push('and a slow card can cost more than paying per token.');
    push();
  } else {
    push('## Illustrative dry-run cost');
    push();
    push('_Not computed: a cost needs at least one verified per-GPU-hour quote and one verified per-token');
    push('quote, and a missing rate is reported rather than invented._');
    push();
  }

  push('## What the dry run must record');
  push();
  push(`Scope: ${MEASUREMENT_PROTOCOL.scope}.`);
  push();
  for (const item of MEASUREMENT_PROTOCOL.record) push(`- ${item}`);
  push();
  push(`These measurements replace: ${MEASUREMENT_PROTOCOL.replaces.join(', ')}.`);
  push();
  push(`> ${MEASUREMENT_PROTOCOL.warning}`);
  push();

  const output = `${lines.join('\n')}\n`;
  if (args.out) {
    writeFileSync(args.out, output);
    console.log(`price-dry-run: wrote ${args.out} (${quotes.length} verified quotes, ${unverified.length} unverified)`);
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
