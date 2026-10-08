import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CostError,
  MEASUREMENT_PROTOCOL,
  costPerAccepted,
  estimateTokensFromCharacters,
  estimateVram,
  fitsOn,
  scaleToTarget,
  trainingCost,
} from '../src/eval/cost.mjs';

const quotes = [
  { quote_id: 'runpod-l4', provider: 'RunPod', gpu: 'L4', vram_gb: 24, mode: 'on-demand', unit: 'usd_per_gpu_hour', value: 0.59, retrieved_at: '2026-10-08T09:30:00Z' },
  { quote_id: 'runpod-l40s', provider: 'RunPod', gpu: 'L40S', vram_gb: 48, mode: 'on-demand', unit: 'usd_per_gpu_hour', value: 1.09, retrieved_at: '2026-10-08T09:30:00Z' },
  { quote_id: 'runpod-a100', provider: 'RunPod', gpu: 'A100', vram_gb: 80, mode: 'on-demand', unit: 'usd_per_gpu_hour', value: 1.59, retrieved_at: '2026-10-08T09:30:00Z' },
  { quote_id: 'fireworks-lora-16b', provider: 'Fireworks', model_size_band: 'up to 16B', unit: 'usd_per_million_training_tokens', value: 0.5, retrieved_at: '2026-10-08T09:30:00Z' },
];

test('the VRAM estimate is decomposed, banded and labelled an estimate', () => {
  const small = estimateVram({ params: 7e9, batchSize: 2, sequenceLength: 2048 });
  assert.equal(small.source, 'estimate');
  assert.ok(small.total_gb > 4 && small.total_gb < 10, `7B nf4 should land in a few GB, got ${small.total_gb}`);
  assert.equal(small.band_gb[0] < small.total_gb, true);
  assert.equal(small.band_gb[1] > small.total_gb, true);
  assert.match(small.note, /ESTIMATE/);

  // the terms must move in the expected directions
  const bf16 = estimateVram({ params: 7e9, quantization: 'bf16', batchSize: 2, sequenceLength: 2048 });
  assert.ok(bf16.components_gb.base_weights > small.components_gb.base_weights * 3.5, 'bf16 base weights are ~4x nf4');
  const longer = estimateVram({ params: 7e9, batchSize: 2, sequenceLength: 8192 });
  assert.ok(longer.components_gb.activations > small.components_gb.activations * 3, 'activations scale with sequence length');
  const largerBatch = estimateVram({ params: 7e9, batchSize: 8, sequenceLength: 2048 });
  assert.ok(largerBatch.components_gb.activations > small.components_gb.activations * 3, 'activations scale with batch');

  assert.throws(() => estimateVram({ params: 1e9, quantization: 'magic' }), { code: 'BAD_QUANTIZATION' });
  assert.throws(() => estimateVram({}), { code: 'BAD_INPUT' });
});

test('fitsOn returns the cheapest GPU classes that fit, from the verified quotes only', () => {
  const small = estimateVram({ params: 7e9, batchSize: 2, sequenceLength: 2048 });
  const fits = fitsOn(Math.ceil(small.band_gb[1]), quotes);
  assert.deepEqual(fits.map((f) => f.quote_id), ['runpod-l4', 'runpod-l40s', 'runpod-a100']);

  // a 27B QLoRA at long context must not be claimed to fit a 24GB card, measured by the band's
  // upper edge rather than the point estimate
  const big = estimateVram({ params: 27e9, batchSize: 4, sequenceLength: 8192 });
  assert.ok(big.total_gb > 18 && big.total_gb < 30, `27B nf4 at 4x8192 should land in the low twenties, got ${big.total_gb}`);
  assert.ok(big.band_gb[1] > 24, 'the uncertainty band must cross a 24GB card, so the estimate cannot promise it fits');
  assert.ok(!fitsOn(Math.ceil(big.band_gb[1]), quotes).some((f) => f.quote_id === 'runpod-l4'));

  // per-token quotes must never be offered as GPUs
  assert.deepEqual(fits.filter((f) => f.quote_id === 'fireworks-lora-16b'), []);
});

test('the GPU and managed routes are costed side by side, from quotes, not from constants', () => {
  const measured = {
    tokens: 2_000_000,
    epochs: 2,
    tokensPerSecond: 1200,
    evaluationTokens: 400_000,
    evaluationTokensPerSecond: 2000,
    restartMultiplier: 1.2,
  };
  const cost = trainingCost({ measured, quotes, gpuQuoteId: 'runpod-l4', managedQuoteId: 'fireworks-lora-16b' });

  assert.equal(cost.total_training_tokens, 4_000_000);
  assert.equal(cost.gpu_route.usd_per_gpu_hour, 0.59);
  assert.equal(cost.gpu_route.retrieved_at, '2026-10-08T09:30:00Z', 'the quote date travels with the number');
  // 4M tokens at 1200 tok/s = 0.926 h train, 400k at 2000 = 0.056 h eval, x1.2 restarts = 1.178 h
  assert.equal(cost.gpu_route.billed_gpu_hours, 1.2);
  assert.equal(cost.gpu_route.compute_usd, 0.69, '1.178h x $0.59');
  assert.equal(cost.managed_route.usd_per_million_training_tokens, 0.5);
  assert.equal(cost.managed_route.compute_usd, 2.4);
  assert.equal(cost.cheaper, 'gpu_route');
  assert.ok(cost.deciding_inputs.some((input) => /tokens\/second/.test(input)));

  // The crossover is a measured input, not an assumption: at 100 tok/s the rented card spends 11 h
  // on the same tokens and the managed route wins.
  const slow = trainingCost({ measured: { ...measured, tokensPerSecond: 100 }, quotes, gpuQuoteId: 'runpod-l4', managedQuoteId: 'fireworks-lora-16b' });
  assert.equal(slow.cheaper, 'managed_route');

  // Billed setup time is what makes a short job expensive per token: 15 minutes of provisioning
  // dominates a 9-minute training run, so a small corpus flips to the managed route.
  const shortJob = trainingCost({
    measured: { ...measured, tokens: 200_000, evaluationTokens: 50_000, setupMinutes: 15 },
    quotes,
    gpuQuoteId: 'runpod-l4',
    managedQuoteId: 'fireworks-lora-16b',
  });
  assert.equal(shortJob.gpu_route.setup_hours, 0.3, '15 minutes is 0.25 h, shown rounded to one decimal');
  assert.equal(shortJob.cheaper, 'managed_route');

  // storage and bandwidth are billed separately and must be counted
  const withExtras = trainingCost({ measured, quotes, gpuQuoteId: 'runpod-l4', storageGbMonths: 50, storageUsdPerGbMonth: 0.1, bandwidthGb: 10, bandwidthUsdPerGb: 0.05, managedQuoteId: 'fireworks-lora-16b' });
  assert.equal(withExtras.gpu_route.storage_usd, 5);
  assert.equal(withExtras.gpu_route.bandwidth_usd, 0.5);
  assert.equal(withExtras.gpu_route.total_usd, Math.round((0.69 + 5 + 0.5) * 100) / 100);

  // no measuring, no GPU number: a route without a measured throughput must fail rather than guess
  assert.throws(() => trainingCost({ measured: { tokens: 1000 }, quotes, gpuQuoteId: 'runpod-l4' }), { code: 'BAD_INPUT' });
  assert.throws(() => trainingCost({ measured, quotes, gpuQuoteId: 'fireworks-lora-16b' }), { code: 'BAD_QUOTE' });
  // an unknown quote id must fail loudly rather than price nothing
  assert.throws(() => trainingCost({ measured, quotes: [], gpuQuoteId: 'nope' }), { code: 'UNKNOWN_QUOTE' });
  assert.throws(() => trainingCost({ measured, quotes, gpuQuoteId: 'runpod-l4', managedQuoteId: 'absent' }), { code: 'UNKNOWN_QUOTE' });
  assert.throws(() => trainingCost({ measured, quotes }), { code: 'BAD_INPUT' });
  assert.throws(() => trainingCost({ measured, quotes, gpuQuoteId: 'runpod-l4', managedQuoteId: 'runpod-l40s' }), { code: 'BAD_QUOTE' });
});

test('per-accepted cost separates variants from corpus size', () => {
  const per = costPerAccepted({ totalUsd: 40, attemptedPairs: 20, acceptedPairs: 8, variantsPerFamily: 3 });
  assert.equal(per.usd_per_accepted_pair, 5);
  assert.equal(per.usd_per_attempted_pair, 2);
  assert.equal(per.acceptance_rate, 0.4);
  assert.match(per.note, /not new originals/);

  const scaled = scaleToTarget({ pilot: per, targetAcceptedPairs: 200 });
  assert.equal(scaled.scale_factor_from_pilot, 25);
  assert.equal(scaled.projected_usd, 1000);
  assert.match(scaled.note, /NOT a quote/);

  assert.throws(() => costPerAccepted({ totalUsd: 1, attemptedPairs: 2, acceptedPairs: 0 }), { code: 'BAD_INPUT' });
  assert.throws(() => scaleToTarget({ pilot: { accepted_pairs: 0 } , targetAcceptedPairs: 10 }), { code: 'BAD_INPUT' });
});

test('token estimates are labelled estimates and the measurement protocol is explicit', () => {
  const est = estimateTokensFromCharacters(4000);
  assert.equal(est.tokens, 1000);
  assert.equal(est.source, 'estimate');
  assert.deepEqual(est.band, [750, 1250]);
  assert.match(est.note, /tokenizer/);

  assert.match(MEASUREMENT_PROTOCOL.warning, /no GPU/);
  assert.ok(MEASUREMENT_PROTOCOL.record.some((r) => /peak reserved VRAM/.test(r)));
  assert.ok(MEASUREMENT_PROTOCOL.replaces.includes('measured.tokensPerSecond'));
  assert.throws(() => estimateTokensFromCharacters(-1), CostError);
});
