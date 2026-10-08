import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BACKENDS,
  TrainingSeamError,
  assertComparable,
  costLines,
  runTraining,
  totalCost,
  validateArtifact,
  validateCorpusGates,
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
  base_model_id: 'qwen3-8b',
  resolved_base_revision: COMMIT,
  corpus_sha256: CORPUS,
  tokenizer: 'qwen3',
  hyperparameters: job().hyperparameters,
  tokens: { measured: 1_000_000, source: 'provider report' },
  training_log: 'runs/dry-run-1/train.log',
  adapter: { uri: 'accounts/x/models/y', sha256: ADAPTER, format: 'lora-fireworks' },
  ...overrides,
});

/**
 * Write a real, minimal, valid training corpus to a temp file and return its path, true digest and
 * row count. Families live in the `tr-` namespace by default, so the file is disjoint from the sealed
 * eval families (`cf-*`/`fam-*`) and the five A6 target families. The caller owns the temp dir and
 * must clean it up.
 */
function makeCorpusFixture({ family_id = 'tr-fixture', rows = 1 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'seam-corpus-'));
  const path = join(dir, 'corpus.jsonl');
  const corpusRows = Array.from({ length: rows }, (_, index) => ({
    brief_id: `${family_id}-${index + 1}`,
    family_id,
    split: 'train',
  }));
  const text = corpusRows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const bytes = Buffer.from(text, 'utf8');
  writeFileSync(path, bytes);
  const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const rowCount = text.split('\n').map((line) => line.trim()).filter((line) => line !== '').length;
  return { dir, path, sha256, rows: rowCount };
}

/** A job whose corpus is the fixture's real path, digest and row count. */
function jobWithCorpus(fixture, overrides = {}) {
  return job({ corpus: { path: fixture.path, sha256: fixture.sha256, rows: fixture.rows }, ...overrides });
}

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
  const rates = { usd_per_million_training_tokens: 0.5, quote_ids: ['fireworks-lora-sft-up-to-16b'] };
  const known = costLines({ manifest: manifest(), rates, serving: { gpuHours: 0 } });
  const unpriced = costLines({ manifest: manifest({ tokens: { measured: null, source: 'not reported' } }), rates, serving: { gpuHours: 0 } });
  // Both lines priced, so the only thing left that is not a measurement is the token count.
  const estimated = costLines({ manifest: manifest({ tokens: { measured: null, estimate: 1_000_000 } }), rates: { ...rates, usd_per_gpu_hour: 8 }, serving: { gpuHours: 0 } });

  const knownTraining = known.find((line) => line.item === 'training');
  assert.equal(knownTraining.status, 'PINNED');
  assert.equal(knownTraining.cost, 0.5, 'one million tokens at half a dollar per million');

  const unpricedTraining = unpriced.find((line) => line.item === 'training');
  assert.equal(unpricedTraining.status, 'UNVERIFIED');
  assert.equal(unpricedTraining.cost, null, 'an unknown product must not be priced as zero');
  assert.equal(unpricedTraining.quantity, null);

  // An estimate may carry a number, but never as a measurement.
  const estimatedTraining = estimated.find((line) => line.item === 'training');
  assert.equal(estimatedTraining.cost, 0.5, 'an estimated token count is still multipled by the pinned rate');
  assert.equal(estimatedTraining.status, 'ESTIMATE');
  assert.match(estimatedTraining.reason, /not counted by the training tokenizer/);
  assert.equal(totalCost(estimated).status, 'ESTIMATE', 'a total containing an estimate is an estimate');
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
  const fixture = makeCorpusFixture();
  try {
    await assert.rejects(() => runTraining({ backend: 'somewhere-else', job: job(), adapters: {} }), (error) => error.code === 'UNKNOWN_BACKEND');
    await assert.rejects(() => runTraining({ backend: 'fireworks', job: job(), adapters: {} }), (error) => error.code === 'NO_ADAPTER');
    await assert.rejects(
      () => runTraining({ backend: 'fireworks', job: job(), adapters: { fireworks: { plan: 'not a function', run() {} } } }),
      (error) => error.code === 'BAD_ADAPTER',
    );
    // An adapter that returns nothing is a refusal, not a crash.
    await assert.rejects(
      () => runTraining({ backend: 'fireworks', job: jobWithCorpus(fixture), adapters: { fireworks: { plan() {}, run() {} } } }),
      (error) => error.code === 'INVALID_ARTIFACT' && /not an object with a manifest/.test(error.message),
    );
    await assert.rejects(
      () => runTraining({ backend: 'cluster', job: job({ base: { ...job().base, revision: 'main' } }), adapters: { cluster: { plan() {}, run() {} } } }),
      (error) => error.code === 'INVALID_JOB',
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('an adapter that produces an unusable manifest is refused, not trusted', async () => {
  const fixture = makeCorpusFixture();
  try {
    const adapters = {
      cluster: {
        plan: () => ({ backend: 'cluster' }),
        // No resolved revision, no corpus hash, no token counts: the shape the seam exists to insist on.
        run: async () => ({ artifact: { uri: 'x' }, manifest: { backend: 'cluster' } }),
      },
    };
    await assert.rejects(() => runTraining({ backend: 'cluster', job: jobWithCorpus(fixture), adapters }), (error) => error.code === 'INVALID_ARTIFACT');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('a well-formed adapter result passes the seam', async () => {
  const fixture = makeCorpusFixture();
  try {
    const adapters = { cluster: { plan: () => ({ backend: 'cluster' }), run: async () => ({ artifact: { uri: 'out' }, manifest: manifest({ backend: 'cluster' }) }) } };
    const result = await runTraining({ backend: 'cluster', job: jobWithCorpus(fixture), adapters });
    assert.equal(result.manifest.backend, 'cluster');
    assert.equal(result.artifact.uri, 'out');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
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

test('a serving quantity that is missing, NaN or negative is UNVERIFIED, and the total is never NaN and PINNED', () => {
  const rates = { usd_per_million_training_tokens: 0.5, usd_per_gpu_hour: 8, quote_ids: ['fireworks-lora-sft-up-to-16b'] };
  for (const serving of [null, {}, { gpuHours: undefined }, { gpuHours: Number.NaN }, { gpuHours: -1 }, { gpuHours: '2' }]) {
    const lines = costLines({ manifest: manifest(), rates, serving });
    const servingLine = lines.find((line) => line.item === 'serving');
    assert.equal(servingLine.cost, null, `serving ${JSON.stringify(serving)} must not be priced`);
    assert.equal(servingLine.status, 'UNVERIFIED');
    const total = totalCost(lines);
    assert.equal(total.complete, false, 'a total over an unknown serving quantity must not claim to be complete');
    assert.equal(total.status, 'UNVERIFIED');
    assert.ok(Number.isFinite(total.total), 'the total is a finite number, not NaN');
  }
});

test('a zero or negative rate is a missing rate, not a free one', () => {
  for (const rate of [0, -0.5, Number.NaN, undefined, '0.5']) {
    const lines = costLines({ manifest: manifest(), rates: { usd_per_million_training_tokens: rate, usd_per_gpu_hour: 8 }, serving: { gpuHours: 1 } });
    const training = lines.find((line) => line.item === 'training');
    assert.equal(training.status, 'UNVERIFIED', `rate ${String(rate)} must not price a line`);
    assert.equal(training.cost, null);
  }
});

test('a zero or negative token count is refused, and never priced as $0.00 PINNED', () => {
  for (const measured of [0, -5]) {
    assert.ok(validateArtifact(manifest({ tokens: { measured } })).some((finding) => finding.field === 'tokens.measured'), `${measured} tokens must be refused by the manifest`);
    const training = costLines({ manifest: manifest({ tokens: { measured } }), rates: { usd_per_million_training_tokens: 0.5 }, serving: { gpuHours: 1 } }).find((line) => line.item === 'training');
    assert.equal(training.status, 'UNVERIFIED');
    assert.equal(training.cost, null);
  }
});

test('validators survive a getter or a Proxy trap that throws while a field is read', () => {
  const throwingGetter = {};
  Object.defineProperty(throwingGetter, 'corpus', { get() { throw new Error('getter exploded'); }, enumerable: true });
  const throwingProxy = new Proxy({}, { get() { throw new Error('proxy trap exploded'); } });
  for (const value of [throwingGetter, throwingProxy]) {
    assert.doesNotThrow(() => validateJob(value));
    assert.doesNotThrow(() => validateArtifact(value));
    assert.ok(validateJob(value).length > 0, 'a job that cannot be read is refused');
    assert.ok(validateArtifact(value).length > 0, 'a manifest that cannot be read is refused');
  }
});

test('a comparison over different recipes, bases or a missing tokenizer is refused', () => {
  const left = manifest({ backend: 'fireworks' });
  const right = manifest({ backend: 'cluster' });
  const recipe = assertComparable(left, manifest({ backend: 'cluster', hyperparameters: { ...job().hyperparameters, method: 'lora-dpo', epochs: 10, rank: 64 } }));
  assert.equal(recipe.comparable, false);
  assert.match(recipe.problems.join(' '), /training recipes differ/);
  const base = assertComparable(left, manifest({ backend: 'cluster', base_model_id: 'qwen3-14b' }));
  assert.equal(base.comparable, false);
  assert.match(base.problems.join(' '), /base models differ/);
  const noBase = assertComparable(left, manifest({ backend: 'cluster', base_model_id: undefined }));
  assert.equal(noBase.comparable, false);
  assert.match(noBase.problems.join(' '), /does not name the base model/);
  const noTokenizer = assertComparable({ ...left, tokenizer: undefined }, { ...right, tokenizer: undefined });
  assert.equal(noTokenizer.comparable, false);
  assert.match(noTokenizer.problems.join(' '), /records no tokenizer/);
  // Two manifests that both omit the recipe are silent, not identical - found in review.
  const noRecipe = assertComparable({ ...left, hyperparameters: undefined }, { ...right, hyperparameters: undefined });
  assert.equal(noRecipe.comparable, false);
  assert.match(noRecipe.problems.join(' '), /does not record its hyperparameters/);
});

test('an adapter that records a different base than the job declared is refused', async () => {
  const fixture = makeCorpusFixture();
  try {
    const adapters = { fireworks: { plan: () => ({}), run: async () => ({ artifact: { uri: 'x' }, manifest: manifest({ base_model_id: 'qwen3-14b' }) }) } };
    await assert.rejects(
      () => runTraining({ backend: 'fireworks', job: jobWithCorpus(fixture), adapters }),
      (error) => error.code === 'INVALID_ARTIFACT' && /base_model_id/.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('the cluster plan carries every declared hyperparameter, not only the ones with obvious flags', () => {
  const planned = clusterPlan(job());
  const command = planned.command.join(' ');
  assert.match(command, /--method lora-sft/);
  assert.match(command, /--lora_rank 16/);
  assert.match(command, /--learning_rate 0.0002/);
  assert.match(command, /--num_epochs 2/);
  assert.equal(planned.hyperparameters.rank, 16);
  assert.equal(planned.base.canonical_model_id, 'qwen3-8b');
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
  assert.equal(reachability('qwen3-14b').params, 14_768_307_200);
  assert.equal(bandFor(8_190_000_000).lora_sft, 0.5);
  assert.equal(bandFor(26_000_000_000).lora_sft, 3.0);
  assert.equal(bandFor(552_000_000_000).lora_sft, 10.0, 'the probed teacher-class model is twenty times the price per token');
  assert.ok(
    FIREWORKS_TRAINABLE.every((model) => model.managed_sft && model.managed_dpo && model.lora_shapes > 0),
    'every listed checkpoint is trainable by both methods, with a LoRA shape',
  );
  assert.ok(!FIREWORKS_TRAINABLE.some((model) => model.params > 80_000_000_000), 'nothing teacher-class is listed as a student');
});

test('validateCorpusGates reports findings instead of throwing, whatever it is handed', () => {
  for (const value of [null, undefined, 0, 'job', [], true, {}, { corpus: 'no' }, { corpus: { path: '' } }]) {
    assert.doesNotThrow(() => validateCorpusGates(value));
    const findings = validateCorpusGates(value);
    assert.ok(Array.isArray(findings));
    assert.ok(findings.length > 0, 'an uncheckable corpus is refused, not passed');
  }
});

test('validateCorpusGates passes a real, valid, disjoint corpus', () => {
  const fixture = makeCorpusFixture();
  try {
    assert.deepEqual(validateCorpusGates(jobWithCorpus(fixture)), []);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('a corpus sharing a held-out family is refused, naming FAMILY_IN_BOTH_MANIFESTS', async () => {
  // 'cf-01' is a real family in the sealed eval manifest, so this corpus is not disjoint.
  const fixture = makeCorpusFixture({ family_id: 'cf-01' });
  try {
    await assert.rejects(
      () => runTraining({ backend: 'cluster', job: jobWithCorpus(fixture), adapters: { cluster: { plan() {}, run() {} } } }),
      (error) => error.code === 'CORPUS_NOT_DISJOINT' && /FAMILY_IN_BOTH_MANIFESTS/.test(error.message) && error.message.includes("'cf-01'"),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('a corpus whose declared hash does not match its bytes is refused, naming both digests', async () => {
  const fixture = makeCorpusFixture();
  try {
    const wrongSha = `sha256:${'0'.repeat(64)}`;
    const badJob = job({ corpus: { path: fixture.path, sha256: wrongSha, rows: fixture.rows } });
    await assert.rejects(
      () => runTraining({ backend: 'cluster', job: badJob, adapters: { cluster: { plan() {}, run() {} } } }),
      (error) => error.code === 'INVALID_JOB' && error.message.includes(wrongSha) && error.message.includes(fixture.sha256),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('a corpus whose declared row count is wrong is refused', async () => {
  const fixture = makeCorpusFixture({ rows: 2 });
  try {
    const badJob = job({ corpus: { path: fixture.path, sha256: fixture.sha256, rows: fixture.rows + 1 } });
    await assert.rejects(
      () => runTraining({ backend: 'cluster', job: badJob, adapters: { cluster: { plan() {}, run() {} } } }),
      (error) => error.code === 'INVALID_JOB' && /corpus\.rows/.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('a missing or unreadable corpus path is refused, failing closed', async () => {
  const fixture = makeCorpusFixture();
  try {
    const missing = join(fixture.dir, 'does-not-exist.jsonl');
    await assert.rejects(
      () => runTraining({ backend: 'cluster', job: job({ corpus: { path: missing, sha256: fixture.sha256, rows: fixture.rows } }), adapters: { cluster: { plan() {}, run() {} } } }),
      (error) => error.code === 'INVALID_JOB' && /corpus\.path/.test(error.message),
    );

    // A directory is not readable as a corpus file either, and must be refused the same way.
    await assert.rejects(
      () => runTraining({ backend: 'cluster', job: job({ corpus: { path: fixture.dir, sha256: fixture.sha256, rows: fixture.rows } }), adapters: { cluster: { plan() {}, run() {} } } }),
      (error) => error.code === 'INVALID_JOB' && /corpus\.path/.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('a valid disjoint corpus passes the gate and the adapter is reached', async () => {
  const fixture = makeCorpusFixture();
  try {
    let planned = false;
    const adapters = {
      cluster: {
        plan: () => { planned = true; return { backend: 'cluster' }; },
        run: async () => ({ artifact: { uri: 'out' }, manifest: manifest({ backend: 'cluster' }) }),
      },
    };
    const result = await runTraining({ backend: 'cluster', job: jobWithCorpus(fixture), adapters });
    assert.equal(planned, true, 'the adapter must be reached for a proven-disjoint corpus');
    assert.equal(result.artifact.uri, 'out');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
