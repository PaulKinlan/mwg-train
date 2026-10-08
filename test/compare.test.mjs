import test from 'node:test';
import assert from 'node:assert/strict';

import { backendCostPerAccepted, compareBackends, renderComparison } from '../src/train/compare.mjs';

const COMMIT = 'c03e6d358207e414f1eca0bb1891e29f1db0e242';
const CORPUS = `sha256:${'a'.repeat(64)}`;
const ADAPTER = `sha256:${'b'.repeat(64)}`;

const manifest = (overrides = {}) => ({
  backend: 'fireworks',
  base_model_id: 'qwen3-8b',
  resolved_base_revision: COMMIT,
  corpus_sha256: CORPUS,
  tokenizer: 'qwen3',
  hyperparameters: { method: 'lora-sft', rank: 16, epochs: 2, max_seq_len: 4096 },
  tokens: { measured: 1_000_000 },
  training_log: 'run/train.log',
  adapter: { uri: 'run/adapter', sha256: ADAPTER, format: 'lora-fireworks' },
  ...overrides,
});

const RATES = {
  fireworks: { usd_per_million_training_tokens: 0.5, usd_per_gpu_hour: 8.0, quote_ids: ['fireworks.training-pricing'] },
  cluster: { usd_per_million_training_tokens: null, usd_per_gpu_hour: 1.99, quote_ids: ['lambda.gpu-h100'] },
};

const pair = () => [
  {
    name: 'fireworks',
    manifest: manifest({ backend: 'fireworks' }),
    // Managed: training tokens + a dedicated deployment billed while it is up.
    rates: RATES.fireworks,
    serving: { gpuHours: 2, measured: true },
  },
  {
    name: 'cluster',
    manifest: manifest({ backend: 'cluster' }),
    // Cluster: training is host time, so it is the same GPU-hours with the setup included.
    rates: { ...RATES.cluster, usd_per_million_training_tokens: 0.5 },
    serving: { gpuHours: 4, measured: true },
  },
];

test('one backend costs per accepted pair, from pinned rates', () => {
  const result = backendCostPerAccepted({ name: 'fireworks', manifest: manifest(), rates: RATES.fireworks, serving: { gpuHours: 2, measured: true }, measured: { attempted_pairs: 25, accepted_pairs: 24 } });
  assert.equal(result.status, 'PINNED');
  // 1M tokens at $0.50/1M plus 2 GPU-hours at $8, over 24 accepted pairs.
  assert.equal(result.partial_total_usd, 0.5 + 16);
  assert.equal(result.usd_per_accepted_pair, 0.69);
  assert.equal(result.acceptance_rate, 0.96);
});

test('an unpriced line means no cost per accepted pair at all, not a smaller one', () => {
  const result = backendCostPerAccepted({ name: 'fireworks', manifest: manifest(), rates: {}, serving: { gpuHours: 2 }, measured: { attempted_pairs: 25, accepted_pairs: 24 } });
  assert.equal(result.usd_per_accepted_pair, null);
  assert.equal(result.total_usd, null);
  assert.deepEqual(result.unverified_items, ['training', 'serving']);
  assert.match(result.note, /not a zero/);
});

test('a comparison names a cheaper backend only when both sides are priced and comparable', () => {
  const comparison = compareBackends({ yield: { attempted_pairs: 25, accepted_pairs: 24 }, backends: pair() });
  assert.equal(comparison.verdict, 'COMPARABLE');
  assert.equal(comparison.confidence, 'PINNED');
  // The arithmetic, stated so it is checkable: managed training is 1M tokens at $0.50 plus 2 GPU-hours of
  // dedicated deployment at $8.00 ($16.50 over 24 pairs = $0.69); the cluster is 4 GPU-hours at $1.99
  // including setup, with the same token rate ($8.46 over 24 = $0.35). The cluster wins here, and the
  // point of the test is that both numbers came from pinned lines rather than from an assumption.
  assert.deepEqual(
    Object.fromEntries(comparison.results.map((result) => [result.backend, result.usd_per_accepted_pair])),
    { fireworks: 0.69, cluster: 0.35 },
  );
  assert.equal(comparison.cheaper_backend, 'cluster');
  assert.equal(comparison.problems.length, 0);
});

test('with one side unpriced the comparison refuses to name a winner', () => {
  const [fireworks, cluster] = pair();
  const comparison = compareBackends({
    yield: { attempted_pairs: 25, accepted_pairs: 24 },
    // The cluster's GPU rate is missing: the expensive-looking side is the one we could not price.
    backends: [fireworks, { ...cluster, rates: { usd_per_million_training_tokens: 0.5 } }],
  });
  assert.equal(comparison.verdict, 'INCOMPLETE');
  assert.equal(comparison.cheaper_backend, null);
  assert.equal(comparison.confidence, 'INCOMPLETE');
  assert.match(comparison.note, /no cheaper backend is named/);
});

test('a comparison over different base checkpoints is refused, whatever the cost says', () => {
  const [fireworks, cluster] = pair();
  const comparison = compareBackends({
    yield: { attempted_pairs: 25, accepted_pairs: 24 },
    backends: [fireworks, { ...cluster, manifest: manifest({ backend: 'cluster', resolved_base_revision: 'f'.repeat(40) }) }],
  });
  assert.equal(comparison.verdict, 'NOT_COMPARABLE');
  assert.equal(comparison.cheaper_backend, null);
  assert.match(comparison.problems.join(' '), /base revisions differ/);
});

test('an estimated token count propagates to the comparison as an estimate', () => {
  const [fireworks, cluster] = pair();
  const comparison = compareBackends({
    yield: { attempted_pairs: 25, accepted_pairs: 24 },
    backends: [
      { ...fireworks, manifest: manifest({ tokens: { measured: null, estimate: 1_000_000 } }) },
      cluster,
    ],
  });
  assert.equal(comparison.verdict, 'COMPARABLE');
  assert.equal(comparison.confidence, 'ESTIMATE', 'a winner chosen on an estimated token count is not a pinned finding');
});

test('zero accepted pairs has no denominator, so it is refused rather than divided by zero', () => {
  assert.throws(
    () => backendCostPerAccepted({ name: 'fireworks', manifest: manifest(), rates: RATES.fireworks, serving: { gpuHours: 1 }, measured: { attempted_pairs: 25, accepted_pairs: 0 } }),
    (error) => error.code === 'NO_ACCEPTED',
  );
  assert.throws(
    () => backendCostPerAccepted({ name: 'fireworks', manifest: manifest(), rates: RATES.fireworks, serving: { gpuHours: 1 }, measured: {} }),
    (error) => error.code === 'NO_YIELD',
  );
});

test('two backends that price the same are a tie, not a win for whichever is listed first', () => {
  const [fireworks, cluster] = pair();
  const comparison = compareBackends({
    yield: { attempted_pairs: 25, accepted_pairs: 24 },
    // 0.5 training + 4 GPU-hours at $4.00 = $16.50, exactly the managed total, over the same yield.
    backends: [fireworks, { ...cluster, rates: { ...cluster.rates, usd_per_gpu_hour: 4.0 } }],
  });
  assert.equal(comparison.verdict, 'COMPARABLE');
  assert.equal(comparison.tie, true);
  assert.equal(comparison.cheaper_backend, null, 'a tie names no cheaper backend');
  assert.match(comparison.note, /tie/i);
  assert.match(renderComparison(comparison), /tied/);
});

test('a yield that cannot be a yield is refused rather than divided', () => {
  const base = { name: 'fireworks', manifest: manifest(), rates: RATES.fireworks, serving: { gpuHours: 1 } };
  assert.throws(
    () => backendCostPerAccepted({ ...base, measured: { attempted_pairs: 0, accepted_pairs: 0 } }),
    (error) => error.code === 'NO_YIELD',
  );
  // An acceptance rate above 1 means the counters are wrong, not that the run was excellent.
  assert.throws(
    () => backendCostPerAccepted({ ...base, measured: { attempted_pairs: 25, accepted_pairs: 26 } }),
    (error) => error.code === 'IMPOSSIBLE_YIELD',
  );
});

test('the rendered table shows UNVERIFIED where a line could not be priced', () => {
  const comparison = compareBackends({ yield: { attempted_pairs: 25, accepted_pairs: 24 }, backends: [pair()[0], { ...pair()[1], rates: {} }] });
  const table = renderComparison(comparison);
  assert.match(table, /UNVERIFIED/);
  assert.match(table, /no pinned positive GPU-hour rate was supplied/);
  assert.match(table, /\| Backend \| USD per accepted pair \|/);
});

test('the sheet prices only from pinned quotes, and refuses a rate it cannot point at', async () => {
  const { buildSheet, loadQuotes, corpusCharacters, pilotYield } = await import('../scripts/price-two-backends.mjs');
  const quotes = loadQuotes();
  assert.throws(() => quotes.require('fireworks-gpu-hour-imaginary'), (error) => error.code === 'UNKNOWN_QUOTE');

  const sheet = await buildSheet({ servingGpuHours: 2 });
  const used = sheet.comparison.results.flatMap((result) => result.cost_lines.flatMap((line) => line.quote_ids ?? []));
  const known = new Set(quotes.rows.map((row) => row.quote_id));
  for (const quoteId of used) assert.ok(known.has(quoteId), quoteId + ' is not a row in quotes.jsonl');

  // Both sides are priced now that the Fireworks dedicated-deployment GPU rows are pinned, so the sheet
  // names a winner - at ESTIMATE confidence, because the token count and the serving wall-clock are
  // estimates even though every rate is pinned. This assertion previously required the fireworks side to
  // be unpriced and went stale the moment that rate was extracted; the refusal path is covered below by
  // the case constructed with a missing rate, which is where it belongs.
  const fireworks = sheet.comparison.results.find((result) => result.backend === 'fireworks');
  assert.equal(typeof fireworks.usd_per_accepted_pair, 'number');
  assert.equal(sheet.comparison.verdict, 'COMPARABLE');
  assert.equal(sheet.comparison.confidence, 'ESTIMATE');
  assert.equal(sheet.comparison.cheaper_backend, 'cluster');
  assert.equal(fireworks.status, 'ESTIMATE', 'pinned rates over an estimated token count and wall-clock');

  assert.equal(sheet.yield.accepted_pairs, 24, 'the denominator is the measured pilot yield');
  assert.equal(sheet.yield.attempted_pairs, 25);
  assert.ok(sheet.corpus.characters > 0, 'the token estimate needs a corpus to come from');
  assert.equal(corpusCharacters().rows, 79);
  assert.ok(pilotYield().accepted_pairs > 0, 'the denominator is a measurement, not a placeholder');
});

test('the same checkpoints are reachable on both backends, under each backend own name', async () => {
  const { sharedCheckpoints, resolveBackendModel } = await import('../src/train/reachability.mjs');
  const shared = sharedCheckpoints();
  assert.ok(shared.length >= 1, 'a platform comparison needs at least one shared checkpoint');
  for (const checkpoint of shared) {
    assert.equal(resolveBackendModel('fireworks', checkpoint.id), checkpoint.fireworks_id);
    assert.equal(resolveBackendModel('cluster', checkpoint.id), checkpoint.cluster_id);
    assert.ok(checkpoint.params <= 16_000_000_000, checkpoint.id + ' must sit in the band the sheet prices with');
  }
  assert.equal(resolveBackendModel('cluster', 'qwen3p5-9b'), null, 'a checkpoint only Fireworks can train is not shared');
});
