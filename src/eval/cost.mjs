/**
 * Compute for the MWG-train dry run: VRAM and throughput ESTIMATES, and a cost model that turns
 * measured numbers plus dated provider quotes into dollars.
 *
 * Two rules govern this file, both from the design brief (section 7: "procurement sheet, not
 * invented prices"):
 *
 * 1. **Nothing here invents a price.** Rates are inputs, read from docs/eval/quotes.jsonl, which
 *    only contains numbers seen in a fetched provider page (see docs/eval/pricing.md).
 * 2. **Every estimated quantity says so.** VRAM and throughput are marked `source: "estimate"` and
 *    carry an uncertainty band, because the owner decision is that no model runs on a fleet VM
 *    (Paul, 2026-10-08: "I don't want the models on these vm machines at least"), so the dry run's
 *    measured half has to happen on the rented host. `MEASUREMENT_PROTOCOL` below is the exact thing
 *    to record when it does.
 */

export const BYTES_PER_PARAM = Object.freeze({ bf16: 2, fp16: 2, int8: 1, nf4: 0.5, fp32: 4 });

/** Fixed GPU overhead the estimate cannot derive from the model: CUDA context, allocator slack. */
export const FRAMEWORK_OVERHEAD_GB = 1.5;

/** Uncertainty band on the VRAM estimate, as a fraction. Activations dominate and are heuristic. */
export const VRAM_BAND = 0.3;

export class CostError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CostError';
    this.code = code;
  }
}

function require(number, name) {
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) {
    throw new CostError('BAD_INPUT', `${name} must be a non-negative finite number, got ${number}`);
  }
  return number;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * LoRA/QLoRA VRAM ESTIMATE, in GB, decomposed so every term can be argued with.
 *
 *   base weights      params x bytesPerParam (nf4 = 0.5 B/param for QLoRA)
 *   adapter           (in+out) x rank x modules x layers params, in bf16, plus AdamW state
 *   activations       batch x seq x hidden x layers x k, where k is the checkpointing factor
 *   overhead          one CUDA context and allocator slack
 *
 * `activationBytesPerTokenPerLayer` is the honest weak point: it depends on attention
 * implementation, Flash-Attention support, sequence length and checkpointing granularity. The
 * default of 2 bytes is "one hidden-size tensor per layer stored in bf16", which is the standard
 * shape of a fully checkpointed forward/backward pass; an earlier draft used 32 and over-estimated
 * activations by an order of magnitude, which is exactly the kind of number that would have talked
 * someone into a bigger GPU than they needed. The result is reported with a band rather than as a
 * number to plan a purchase against, and the measurement protocol replaces this term with a
 * measured peak.
 */
export function estimateVram({
  params,
  quantization = 'nf4',
  loraRank = 32,
  hiddenSize = 4096,
  layers = 32,
  targetModules = 4,
  batchSize = 4,
  sequenceLength = 4096,
  activationBytesPerTokenPerLayer = 2,
  optimizerBytesPerAdapterParam = 16,
} = {}) {
  require(params, 'params');
  if (!(quantization in BYTES_PER_PARAM)) throw new CostError('BAD_QUANTIZATION', `quantization must be one of ${Object.keys(BYTES_PER_PARAM).join(', ')}`);
  const baseWeights = (params * BYTES_PER_PARAM[quantization]) / 1024 ** 3;
  const adapterParams = 2 * hiddenSize * loraRank * targetModules * layers;
  const adapter =
    (adapterParams * (BYTES_PER_PARAM.bf16 + optimizerBytesPerAdapterParam)) / 1024 ** 3;
  const activations = (batchSize * sequenceLength * hiddenSize * layers * activationBytesPerTokenPerLayer) / 1024 ** 3;
  const total = baseWeights + adapter + activations + FRAMEWORK_OVERHEAD_GB;
  return {
    source: 'estimate',
    method: 'sum of base weights, adapter and its optimizer state, a checkpointed activation heuristic, and framework overhead',
    inputs: { params, quantization, loraRank, hiddenSize, layers, targetModules, batchSize, sequenceLength, activationBytesPerTokenPerLayer, optimizerBytesPerAdapterParam },
    components_gb: {
      base_weights: round1(baseWeights),
      adapter_and_optimizer: round1(adapter),
      activations: round1(activations),
      framework_overhead: FRAMEWORK_OVERHEAD_GB,
    },
    total_gb: round1(total),
    band_gb: [round1(Math.max(0, total * (1 - VRAM_BAND))), round1(total * (1 + VRAM_BAND))],
    note: 'ESTIMATE. Replace with a measured peak using MEASUREMENT_PROTOCOL before committing to a long rental; the activations term is a heuristic and dominates the uncertainty.',
  };
}

/** Which of the quotes' GPU classes this estimate fits, cheapest first. */
export function fitsOn(vram, quotes) {
  const gpus = new Map();
  for (const quote of quotes) {
    if (typeof quote.vram_gb !== 'number' || typeof quote.value !== 'number') continue;
    if (!['usd_per_gpu_hour'].includes(quote.unit)) continue;
    const key = `${quote.provider} ${quote.gpu} ${quote.vram_gb}GB ${quote.mode}`;
    if (!gpus.has(key) || gpus.get(key).value > quote.value) gpus.set(key, { ...quote, label: key });
  }
  return [...gpus.values()]
    .filter((gpu) => gpu.vram_gb >= vram)
    .sort((a, b) => a.value - b.value)
    .map((gpu) => ({ label: gpu.label, vram_gb: gpu.vram_gb, usd_per_gpu_hour: gpu.value, quote_id: gpu.quote_id }));
}

/**
 * Tokens in a corpus, from character counts, when no tokenizer is available locally.
 * ~4 characters per token for English prose and code; the band says how much to distrust it.
 */
export function estimateTokensFromCharacters(characters) {
  require(characters, 'characters');
  const tokens = characters / 4;
  return {
    source: 'estimate',
    tokens: Math.round(tokens),
    band: [Math.round(tokens * 0.75), Math.round(tokens * 1.25)],
    note: 'ESTIMATE from characters/4. Replace with an exact count from the training tokenizer before quoting a per-token price.',
  };
}

/**
 * Cost of one training run, both ways, so the choice between them is explicit.
 *
 * measured: { tokens, examples, epochs, tokensPerSecond (GPU route), epochsPerHour (optional),
 *             restartMultiplier, setupMinutes, evaluationTokens, evaluationTokensPerSecond }
 * quotes:   rows from docs/eval/quotes.jsonl
 *
 * `setupMinutes` is billed on the GPU route: provisioning plus model download happens on the clock
 * and happens again after every restart. It is what makes a short job expensive per token, and it
 * is a real input rather than a constant, so it has to be measured on the rented host.
 */
export function trainingCost({ measured, quotes, gpuQuoteId, managedQuoteId, storageGbMonths = 0, storageUsdPerGbMonth = 0, bandwidthGb = 0, bandwidthUsdPerGb = 0 }) {
  if (!measured || !Array.isArray(quotes)) throw new CostError('BAD_INPUT', 'measured and quotes are required');
  const totalTokens = require(measured.tokens, 'measured.tokens') * (measured.epochs ?? 1);
  const restarts = measured.restartMultiplier ?? 1;
  if (restarts < 1) throw new CostError('BAD_INPUT', 'restartMultiplier must be at least 1');
  const setupHours = require(measured.setupMinutes ?? 0, 'measured.setupMinutes') / 60;

  const gpuQuote = quotes.find((q) => q.quote_id === gpuQuoteId);
  const managedQuote = quotes.find((q) => q.quote_id === managedQuoteId);
  // Fail closed on a quote id that is not in the file: silently pricing nothing would read as "no
  // cost" rather than "we could not find the rate".
  if (gpuQuoteId && !gpuQuote) throw new CostError('UNKNOWN_QUOTE', `no quote with id '${gpuQuoteId}' in the quote set`);
  if (managedQuoteId && !managedQuote) throw new CostError('UNKNOWN_QUOTE', `no quote with id '${managedQuoteId}' in the quote set`);
  if (!gpuQuote && !managedQuote) throw new CostError('BAD_INPUT', 'name at least one quote id to price a route');
  const out = { source: 'model', epochs: measured.epochs ?? 1, total_training_tokens: totalTokens, restart_multiplier: restarts };

  if (gpuQuote) {
    if (gpuQuote.unit !== 'usd_per_gpu_hour') throw new CostError('BAD_QUOTE', `${gpuQuoteId} is not a per-GPU-hour quote`);
    const tps = require(measured.tokensPerSecond, 'measured.tokensPerSecond');
    if (tps === 0) throw new CostError('BAD_INPUT', 'measured.tokensPerSecond must be greater than zero for the GPU route');
    const trainHours = totalTokens / tps / 3600;
    const evalHours = measured.evaluationTokens ? measured.evaluationTokens / (measured.evaluationTokensPerSecond ?? tps) / 3600 : 0;
    const gpuHours = (trainHours + evalHours + setupHours) * restarts;
    const gpuCost = gpuHours * gpuQuote.value;
    const storageCost = storageGbMonths * storageUsdPerGbMonth;
    const bandwidthCost = bandwidthGb * bandwidthUsdPerGb;
    out.gpu_route = {
      label: gpuQuote.label ?? `${gpuQuote.provider} ${gpuQuote.gpu}`,
      quote_id: gpuQuote.quote_id,
      retrieved_at: gpuQuote.retrieved_at,
      usd_per_gpu_hour: gpuQuote.value,
      train_hours: round1(trainHours),
      eval_hours: round1(evalHours),
      setup_hours: round1(setupHours),
      billed_gpu_hours: round1(gpuHours),
      compute_usd: Math.round(gpuCost * 100) / 100,
      storage_usd: Math.round(storageCost * 100) / 100,
      bandwidth_usd: Math.round(bandwidthCost * 100) / 100,
      total_usd: Math.round((gpuCost + storageCost + bandwidthCost) * 100) / 100,
      note: 'GPU hours are linear in measured tokens/second and in measured setup time; both are estimates until measured on the rented host. Setup is billed per attempt, so restarts pay for it again.',
    };
  }

  if (managedQuote) {
    if (managedQuote.unit !== 'usd_per_million_training_tokens') {
      throw new CostError('BAD_QUOTE', `${managedQuoteId} is not a per-million-training-token quote`);
    }
    const managedCost = (totalTokens / 1_000_000) * managedQuote.value * restarts;
    out.managed_route = {
      label: managedQuote.label ?? `${managedQuote.provider} ${managedQuote.model_size_band}`,
      quote_id: managedQuote.quote_id,
      retrieved_at: managedQuote.retrieved_at,
      usd_per_million_training_tokens: managedQuote.value,
      compute_usd: Math.round(managedCost * 100) / 100,
      total_usd: Math.round(managedCost * 100) / 100,
      note: 'Managed per-token pricing needs no GPU hours, no idle cost and no checkpoint plumbing; verify minimum charges per job on the provider page.',
    };
  }

  if (out.gpu_route && out.managed_route) {
    out.cheaper = out.gpu_route.total_usd <= out.managed_route.total_usd ? 'gpu_route' : 'managed_route';
    out.deciding_inputs = [
      'total training tokens',
      'measured tokens/second on the rented GPU',
      'measured setup minutes per attempt (billed, and paid again on restart)',
    ];
  }
  return out;
}

/** Cost per accepted project, the number that scales to the full corpus. */
export function costPerAccepted({ totalUsd, attemptedPairs, acceptedPairs, variantsPerFamily = 1 }) {
  require(totalUsd, 'totalUsd');
  require(attemptedPairs, 'attemptedPairs');
  if (acceptedPairs <= 0) throw new CostError('BAD_INPUT', 'acceptedPairs must be greater than zero to compute a per-accepted cost');
  const acceptanceRate = acceptedPairs / attemptedPairs;
  return {
    attempted_pairs: attemptedPairs,
    accepted_pairs: acceptedPairs,
    acceptance_rate: Math.round(acceptanceRate * 1000) / 1000,
    usd_per_accepted_pair: Math.round((totalUsd / acceptedPairs) * 100) / 100,
    usd_per_attempted_pair: Math.round((totalUsd / attemptedPairs) * 100) / 100,
    variants_per_family: variantsPerFamily,
    note: 'Variants of one brief are evaluation items, not new originals: the original counts once toward the corpus, so variant cost is reported separately and never as corpus size (owner protocol).',
  };
}

/** Scale a pilot to a target: hours and dollars, with the acceptance rate carried across. */
export function scaleToTarget({ pilot, targetAcceptedPairs }) {
  if (!pilot || pilot.accepted_pairs <= 0) throw new CostError('BAD_INPUT', 'pilot must report accepted_pairs');
  require(targetAcceptedPairs, 'targetAcceptedPairs');
  const factor = targetAcceptedPairs / pilot.accepted_pairs;
  return {
    target_accepted_pairs: targetAcceptedPairs,
    scale_factor_from_pilot: Math.round(factor * 100) / 100,
    projected_usd: pilot.usd_per_accepted_pair ? Math.round(pilot.usd_per_accepted_pair * targetAcceptedPairs * 100) / 100 : null,
    note: 'Linear projection of measured per-accepted cost. NOT a quote: generation, failures, longer examples, checks and repeated hyperparameter runs may dominate at scale (design brief §7), so re-measure the pilot before committing.',
  };
}

/**
 * What to record on the rented host, so the estimate can be replaced by a measurement. This is the
 * "dry run" the brief asks for: ~10-20 examples, then read these numbers out.
 */
export const MEASUREMENT_PROTOCOL = Object.freeze({
  scope: '10-20 briefs from the training corpus, the same ones across arms',
  record: [
    'peak allocated and peak reserved VRAM (torch.cuda.max_memory_allocated / max_memory_reserved)',
    'training tokens per second, and examples per second, at the pinned batch/sequence length',
    'examples per hour for generation, and acceptance yield per 20 examples',
    'GPU model, VRAM, provider, region, billing unit, and the quote_id from docs/eval/quotes.jsonl',
    'wall-clock per phase (setup, training, evaluation) and every restart that was billed',
    'storage GB-month and egress GB actually consumed',
  ],
  replaces: ['estimateVram.total_gb', 'measured.tokensPerSecond', 'measured.evaluationTokensPerSecond', 'acceptance yield'],
  warning: 'These VMs have no GPU and, by owner decision, do not run models: this protocol is executed on the rented host and its output is copied back as a record, not run here.',
});
