import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKENDS,
  TrainingSeamError,
  assertComparable,
  costLines,
  runTraining,
  totalCost,
  validateArtifact,
  validateJob,
} from '../src/train/seam.mjs';
import { FIREWORKS_TRAINABLE, bandFor, reachability } from '../src/train/reachability.mjs';
import { plan as fireworksPlan } from '../src/train/backends/fireworks.mjs';
import { plan as clusterPlan } from '../src/train/backends/cluster.mjs';

const COMMIT = 'c03e6d358207e414f1eca0bb1891e29f1db0e242';
const CORPUS = `sha256:${'a'.repeat(64)}`;
const ADAPTER = `sha256:${'b'.repeat(64)}`;

const job = (overrides = {}) => ({
  corpus: { path: 'pilot/corpus.jsonl', sha256: CORPUS, rows: 79 },
  base: { repo: 'Qwen/Qwen3-8B', model_id: 'qwen3-8b', revision: COMMIT, licence: 'apache-2.0' },
  hyperparameters: { method: 'lora-sft', rank: 16, epochs: 2, max_seq_len: 4096, learning_rate: 0.0002 },
  output_ref: 'runs/dry-run-1',
  ...overrides,
});

const manifest = (overrides = {}) => ({
  backend: 'fireworks',
  resolved_base_revision: COMMIT,
  corpus_sha256: CORPUS,
  hyperparameters: job().hyperparameters,
  tokens: { measured: 1_000_000, source: 'provider report' },
  training_log: 'runs/dry-run-1/train.log',
  adapter: { uri: 'accounts/x/models/y', sha256: ADAPTER, format: 'lora-fireworks' },
  ...overrides,
});

test('a valid job produces no findings', () => {
  assert.deepEqual(validateJob(job()), []);
});

test('validators report findings instead of throwing, whatever they are handed', () => {
  for (const value of [null, undefined, 0, 'job', [], true, { corpus: 'no' }, { base: [] }]) {
    assert.doesNotThrow(() => validateJob(value));
    assert.doesNotThrow(() => validateArtifact(value));
    assert.ok(Array.isArray(validateJob(value)));
    assert.ok(Array.isArray(validateArtifact(value)));
  }
  assert.ok(validateJob(null).length > 0);
  assert.ok(validateArtifact(null).length > 0);
});

test('a moving revision is refused: a branch or tag can be repointed', () => {
  for (const revision of ['main', 'HEAD', 'latest', 'v1.2.3', COMMIT.slice(0, 12)]) {
    const findings = validateJob(job({ base: { ...job().base, revision } }));
    assert.ok(
      findings.some((finding) => finding.field === 'base.revision'),
      `"${revision}" should be refused because it does not name what was trained`,
    );
  }
  assert.deepEqual(validateJob(job({ base: { ...job().base, revision: COMMIT } })), []);
});

test('a checkpoint with no licence, or one we do not train on, is refused', () => {
  for (const licence of [undefined, 'other', 'proprietary', 'gemma']) {
    const findings = validateJob(job({ base: { ...job().base, licence } }));
    assert.ok(findings.some((finding) => finding.field === 'base.licence'), `licence ${licence} should be refused`);
  }
});

test('an output reference cannot escape the run', () => {
  for (const output_ref of ['/etc/passwd', '../elsewhere', 'runs/../../etc']) {
    const findings = validateJob(job({ output_ref }));
    assert.ok(findings.some((finding) => finding.field === 'output_ref'), `${output_ref} should be refused`);
  }
});

test('a corpus with no row count is not a corpus', () => {
  const findings = validateJob(job({ corpus: { path: 'x.jsonl', sha256: CORPUS } }));
  assert.ok(findings.some((finding) => finding.field === 'corpus.rows'));
});

test('a manifest must record what was trained on', () => {
  assert.deepEqual(validateArtifact(manifest()), []);
  const bare = validateArtifact({});
  assert.ok(bare.length >= 5, 'an empty manifest should fail everything rather than defaulting');
  assert.ok(validateArtifact(manifest({ resolved_base_revision: 'main' })).some((finding) => finding.field === 'resolved_base_revision'));
  assert.ok(validateArtifact(manifest({ corpus_sha256: 'nope' })).some((finding) => finding.field === 'corpus_sha256'));
  assert.ok(validateArtifact(manifest({ tokens: undefined })).some((finding) => finding.field === 'tokens'));
  assert.ok(validateArtifact(manifest({ adapter: { uri: 'x', format: 'lora' } })).some((finding) => finding.field === 'adapter.sha256'));
});

test('an unknown token count is UNVERIFIED, never zero', () => {
  const rates = { usd_per_million_training_tokens: 0.5, quote_ids: ['fireworks.training-pricing'] };
  const known = costLines({ manifest: manifest(), rates, serving: { gpuHours: 0 } });
  const unpriced = costLines({ manifest: manifest({ tokens: { measured: null, source: 'not reported' } }), rates, serving: { gpuHours: 0 } });

  const knownTraining = known.find((line) => line.item === 'training');
  assert.equal(knownTraining.status, 'PINNED');
  assert.equal(knownTraining.cost, 0.5, 'one million tokens at half a dollar per million');

  const unpricedTraining = unpriced.find((line) => line.item === 'training');
  assert.equal(unpricedTraining.status, 'UNVERIFIED');
  assert.equal(unpricedTraining.cost, null, 'an unknown product must not be priced as zero');
  assert.equal(unpricedTraining.quantity, null);
});

test('a rate that cannot be pinned is UNVERIFIED, and the total says so', () => {
  const lines = costLines({ manifest: manifest(), rates: { usd_per_million_training_tokens: 0.5 }, serving: null });
  const serving = lines.find((line) => line.item === 'serving');
  assert.equal(serving.status, 'UNVERIFIED');
  const total = totalCost(lines);
  assert.equal(total.complete, false, 'a total containing an unpriced line must not claim to be complete');
  assert.deepEqual(total.unverified_items, ['serving']);
});

test('a pinned rate over an estimated wall-clock is labelled an estimate', () => {
  const rates = { usd_per_million_training_tokens: 0.5, usd_per_gpu_hour: 8.0, quote_ids: ['fireworks.training-pricing'] };
  const estimated = costLines({ manifest: manifest(), rates, serving: { gpuHours: 2 } });
  const measured = costLines({ manifest: manifest(), rates, serving: { gpuHours: 2, measured: true } });
  assert.equal(estimated.find((line) => line.item === 'serving').status, 'ESTIMATE');
  assert.equal(estimated.find((line) => line.item === 'serving').cost, 16);
  assert.equal(measured.find((line) => line.item === 'serving').status, 'PINNED');
});

test('two adapters are comparable only when the modelling held still', () => {
  const left = manifest({ backend: 'fireworks' });
  const right = manifest({ backend: 'cluster' });
  assert.equal(assertComparable(left, right).comparable, true, 'same base, corpus and tokenizer: the difference is the backend');

  const otherBase = assertComparable(left, manifest({ backend: 'cluster', resolved_base_revision: 'f'.repeat(40) }));
  assert.equal(otherBase.comparable, false);
  assert.match(otherBase.problems.join(' '), /base revisions differ/);

  const otherCorpus = assertComparable(left, manifest({ backend: 'cluster', corpus_sha256: `sha256:${'c'.repeat(64)}` }));
  assert.equal(otherCorpus.comparable, false);

  const otherTokenizer = assertComparable({ ...left, tokenizer: 'qwen3' }, { ...right, tokenizer: 'qwen2.5' });
  assert.equal(otherTokenizer.comparable, false);
  assert.match(otherTokenizer.problems.join(' '), /tokenizers differ/);
});

test('the seam refuses an unknown backend, a missing adapter and an invalid job', async () => {
  await assert.rejects(() => runTraining({ backend: 'somewhere-else', job: job(), adapters: {} }), (error) => error.code === 'UNKNOWN_BACKEND');
  await assert.rejects(() => runTraining({ backend: 'fireworks', job: job(), adapters: {} }), (error) => error.code === 'NO_ADAPTER');
  await assert.rejects(
    () => runTraining({ backend: 'fireworks', job: job(), adapters: { fireworks: { plan: 'not a function', run() {} } } }),
    (error) => error.code === 'BAD_ADAPTER',
  );
  // An adapter that returns nothing is a refusal, not a crash.
  await assert.rejects(
    () => runTraining({ backend: 'fireworks', job: job(), adapters: { fireworks: { plan() {}, run() {} } } }),
    (error) => error.code === 'INVALID_ARTIFACT' && /not an object with a manifest/.test(error.message),
  );
  await assert.rejects(
    () => runTraining({ backend: 'cluster', job: job({ base: { ...job().base, revision: 'main' } }), adapters: { cluster: { plan() {}, run() {} } } }),
    (error) => error.code === 'INVALID_JOB',
  );
});

test('an adapter that produces an unusable manifest is refused, not trusted', async () => {
  const adapters = {
    cluster: {
      plan: () => ({ backend: 'cluster' }),
      // No resolved revision, no corpus hash, no token counts: the shape the seam exists to insist on.
      run: async () => ({ artifact: { uri: 'x' }, manifest: { backend: 'cluster' } }),
    },
  };
  await assert.rejects(() => runTraining({ backend: 'cluster', job: job(), adapters }), (error) => error.code === 'INVALID_ARTIFACT');
});

test('a well-formed adapter result passes the seam', async () => {
  const adapters = { cluster: { plan: () => ({ backend: 'cluster' }), run: async () => ({ artifact: { uri: 'out' }, manifest: manifest({ backend: 'cluster' }) }) } };
  const result = await runTraining({ backend: 'cluster', job: job(), adapters });
  assert.equal(result.manifest.backend, 'cluster');
  assert.equal(result.artifact.uri, 'out');
});

test('both adapters plan the same job to the same declared facts', () => {
  const fireworks = fireworksPlan(job());
  const cluster = clusterPlan(job());
  for (const planned of [fireworks, cluster]) {
    assert.equal(planned.base.resolved_revision, COMMIT, 'both name the resolved revision');
    assert.ok(planned.backend in Object.fromEntries(BACKENDS.map((name) => [name, true])));
  }
  assert.equal(fireworks.rate.usd_per_million_training_tokens, 0.5, 'the 8B checkpoint is in the half-dollar band');
  assert.ok(cluster.command.includes('--revision') && cluster.command.includes(COMMIT));
  assert.equal(cluster.env.CORPUS_SHA256, CORPUS, 'the command carries the corpus hash it was planned for');
});

test('a checkpoint the backend cannot train is refused with the reason', () => {
  assert.throws(
    () => fireworksPlan(job({ base: { repo: 'Qwen/Qwen2.5-Coder-7B-Instruct', revision: COMMIT, licence: 'apache-2.0' } })),
    (error) => error instanceof TrainingSeamError && error.code === 'UNREACHABLE_BASE' && /inference list is not the training list/.test(error.message),
  );
});

test('the reachability map says which checkpoints a comparison may use', () => {
  const shared = reachability('qwen3-8b');
  assert.equal(shared.fireworks, true);
  assert.equal(shared.cluster, false, 'the cluster list names owner/repo ids, so a bare fireworks id is not a cluster id');
  assert.equal(reachability('qwen3-14b').params, 14_770_000_000);
  assert.equal(bandFor(8_190_000_000).lora_sft, 0.5);
  assert.equal(bandFor(26_000_000_000).lora_sft, 3.0);
  assert.equal(bandFor(552_000_000_000).lora_sft, 10.0, 'the probed teacher-class model is twenty times the price per token');
  assert.ok(
    FIREWORKS_TRAINABLE.every((model) => model.managed_sft && model.managed_dpo && model.lora_shapes > 0),
    'every listed checkpoint is trainable by both methods, with a LoRA shape',
  );
  assert.ok(!FIREWORKS_TRAINABLE.some((model) => model.params > 80_000_000_000), 'nothing teacher-class is listed as a student');
});
