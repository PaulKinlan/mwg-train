/**
 * The training seam: one backend-agnostic interface, two implementations behind it.
 *
 * Two backends are in play - Fireworks' managed training (per training token, priced by parameter band)
 * and a rented GPU cluster (per GPU-second) - and they differ in almost every operational detail. The
 * point of this module is that nothing downstream has to know which one produced an adapter. A backend
 * is selected by configuration, and everything that reads an adapter (the four-arm control, the held-out
 * briefs, the acceptance gates) reads the same manifest.
 *
 * The invariant that makes backend-independent evaluation more than a claim is in `assertComparable`:
 * two adapters may only be compared when their RESOLVED base revision, corpus hash and tokenizer agree.
 * Without that, a comparison measures the model and the backend together while claiming to measure one
 * of them.
 */

export const BACKENDS = ['fireworks', 'cluster'];

/** Licences we will train on. A checkpoint whose licence is unknown is not a checkpoint. */
export const PERMISSIVE_LICENCES = ['apache-2.0', 'mit', 'bsd-3-clause'];

export const METHODS = ['lora-sft', 'lora-dpo'];

/** Values that move. A manifest must name the commit, because a tag can be repointed. */
const MOVING_REVISIONS = new Set(['main', 'master', 'latest', 'head', 'stable', 'dev', 'nightly']);

const COMMIT = /^[a-f0-9]{40}$/;

export class TrainingSeamError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TrainingSeamError';
    this.code = code;
  }
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * A rate that is a real price. Zero and negative are not prices: a rate we do not know must be an
 * UNVERIFIED line, and `0 > 0` is false so `0` and `-1` fall through to the same refusal path as a
 * missing rate instead of quietly multiplying a quantity by nothing.
 */
const isPositiveRate = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** A billed quantity that may legitimately be zero (an empty window), but never negative or NaN. */
const isNonNegativeQuantity = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The hyperparameters that make a training recipe; two runs differing in any of these are not the same run. */
const RECIPE_KEYS = ['method', 'epochs', 'rank', 'learning_rate', 'max_seq_len'];

/**
 * Check a job description. Reports findings; never throws, so a malformed job cannot take down a sweep.
 */
export function validateJob(job) {
  // A getter or a Proxy trap can throw while a field is being read, and a validator whose contract is
  // "reports findings; never throws" has to survive that. Nothing below escapes this wrapper.
  try {
    return inspectJob(job);
  } catch (error) {
    return [{ field: 'job', message: `the job could not be read (${error?.message ?? error}), so it is refused rather than crashed on` }];
  }
}

function inspectJob(job) {
  const findings = [];
  if (!isPlainObject(job)) return [{ field: 'job', message: 'the job is not an object' }];

  if (!isPlainObject(job.corpus)) findings.push({ field: 'corpus', message: 'no corpus was declared' });
  else {
    if (typeof job.corpus.path !== 'string' || job.corpus.path === '') {
      findings.push({ field: 'corpus.path', message: 'the corpus has no path' });
    }
    if (typeof job.corpus.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(job.corpus.sha256)) {
      findings.push({ field: 'corpus.sha256', message: 'the corpus hash is missing or not a sha256:hex digest' });
    }
    if (!isPositiveInteger(job.corpus.rows)) {
      findings.push({ field: 'corpus.rows', message: 'the corpus row count is missing; a corpus of unknown size is not a corpus' });
    }
  }

  if (!isPlainObject(job.base)) findings.push({ field: 'base', message: 'no base checkpoint was declared' });
  else {
    if (typeof job.base.repo !== 'string' || !job.base.repo.includes('/')) {
      findings.push({ field: 'base.repo', message: 'the base checkpoint needs an owner/repo' });
    }
    const revision = job.base.revision;
    if (typeof revision !== 'string' || revision === '') {
      findings.push({ field: 'base.revision', message: 'the base checkpoint has no revision' });
    } else if (MOVING_REVISIONS.has(revision.toLowerCase()) || !COMMIT.test(revision)) {
      // A tag or branch name can be repointed after the run, so a manifest naming one does not say what
      // was trained. The resolved commit is what the evaluation gate compares.
      findings.push({
        field: 'base.revision',
        message: `the revision must be a resolved 40-character commit, not "${revision}", because a branch or tag can be repointed`,
      });
    }
    const licence = typeof job.base.licence === 'string' ? job.base.licence.toLowerCase() : null;
    if (!licence) findings.push({ field: 'base.licence', message: 'the base checkpoint has no licence' });
    else if (!PERMISSIVE_LICENCES.includes(licence)) {
      findings.push({ field: 'base.licence', message: `"${licence}" is not one of the licences this project trains on (${PERMISSIVE_LICENCES.join(', ')})` });
    }
  }

  if (!isPlainObject(job.hyperparameters)) findings.push({ field: 'hyperparameters', message: 'no hyperparameters were declared' });
  else {
    const params = job.hyperparameters;
    if (!METHODS.includes(params.method)) {
      findings.push({ field: 'hyperparameters.method', message: `method must be one of ${METHODS.join(', ')}` });
    }
    if (!isPositiveInteger(params.epochs)) findings.push({ field: 'hyperparameters.epochs', message: 'epochs must be a positive integer' });
    if (!isPositiveInteger(params.max_seq_len)) findings.push({ field: 'hyperparameters.max_seq_len', message: 'max_seq_len must be a positive integer' });
    if (params.method === 'lora-sft' && !isPositiveInteger(params.rank)) {
      findings.push({ field: 'hyperparameters.rank', message: 'a LoRA run needs a positive rank' });
    }
    if (params.learning_rate !== undefined && !(isFiniteNumber(params.learning_rate) && params.learning_rate > 0)) {
      findings.push({ field: 'hyperparameters.learning_rate', message: 'learning_rate must be a positive number when given' });
    }
  }

  if (typeof job.output_ref !== 'string' || job.output_ref === '') {
    findings.push({ field: 'output_ref', message: 'no output reference was declared' });
  } else if (job.output_ref.startsWith('/') || job.output_ref.split('/').includes('..')) {
    // An output that can name an absolute path or walk upwards is an output that can overwrite something
    // nobody intended to overwrite, and the two backends would resolve it differently.
    findings.push({ field: 'output_ref', message: 'output_ref must be a relative path inside the run, without ".."' });
  }

  return findings;
}

/**
 * Check an artifact manifest. Reports findings; never throws.
 *
 * A manifest is the only thing downstream reads, so an absent field is a missing fact rather than a
 * default: `tokens.measured` of null is recorded as UNVERIFIED by `costLines` and never as zero.
 */
export function validateArtifact(manifest) {
  try {
    return inspectArtifact(manifest);
  } catch (error) {
    return [{ field: 'manifest', message: `the manifest could not be read (${error?.message ?? error}), so it is refused rather than crashed on` }];
  }
}

function inspectArtifact(manifest) {
  const findings = [];
  if (!isPlainObject(manifest)) return [{ field: 'manifest', message: 'the manifest is not an object' }];

  if (!BACKENDS.includes(manifest.backend)) {
    findings.push({ field: 'backend', message: `backend must be one of ${BACKENDS.join(', ')}` });
  }
  if (typeof manifest.base_model_id !== 'string' || manifest.base_model_id === '') {
    // A commit hash alone does not name the repository the weights came from; a manifest that records
    // only the revision cannot show it trained the same weights as another backend's manifest.
    findings.push({ field: 'base_model_id', message: 'the manifest must name the base model it trained, not only the commit' });
  }
  if (typeof manifest.resolved_base_revision !== 'string' || !COMMIT.test(manifest.resolved_base_revision)) {
    findings.push({ field: 'resolved_base_revision', message: 'the manifest must record the resolved base commit' });
  }
  if (typeof manifest.corpus_sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(manifest.corpus_sha256)) {
    findings.push({ field: 'corpus_sha256', message: 'the manifest must record the corpus hash it was trained on' });
  }
  if (!isPlainObject(manifest.hyperparameters)) {
    findings.push({ field: 'hyperparameters', message: 'the manifest must record the hyperparameters used' });
  }
  if (!isPlainObject(manifest.adapter)) {
    findings.push({ field: 'adapter', message: 'no adapter was produced' });
  } else {
    if (typeof manifest.adapter.uri !== 'string' || manifest.adapter.uri === '') {
      findings.push({ field: 'adapter.uri', message: 'the adapter has no location' });
    }
    if (typeof manifest.adapter.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(manifest.adapter.sha256)) {
      findings.push({ field: 'adapter.sha256', message: 'the adapter needs a sha256:hex digest' });
    }
    if (typeof manifest.adapter.format !== 'string' || manifest.adapter.format === '') {
      findings.push({ field: 'adapter.format', message: 'the adapter has no format, so nothing can load it' });
    }
  }
  if (manifest.tokens === undefined) {
    findings.push({ field: 'tokens', message: 'the manifest records no token counts, so no training cost can be derived from it' });
  } else if (!isPlainObject(manifest.tokens)) {
    findings.push({ field: 'tokens', message: 'token counts must be an object' });
  } else if (manifest.tokens.measured !== null && !isPositiveRate(manifest.tokens.measured)) {
    // Zero tokens is not a small run, it is a run that did not happen: pricing it as $0.00 PINNED is a
    // missing fact reading as a measurement.
    findings.push({ field: 'tokens.measured', message: 'measured tokens must be a positive number or null; a zero-token run did not train, and null is recorded as UNVERIFIED, never as zero' });
  } else if (manifest.tokens.estimate !== undefined && manifest.tokens.estimate !== null && !isPositiveRate(manifest.tokens.estimate)) {
    findings.push({ field: 'tokens.estimate', message: 'an estimated token count must be a positive number when it is given' });
  }
  if (typeof manifest.training_log !== 'string' || manifest.training_log === '') {
    findings.push({ field: 'training_log', message: 'the manifest must point at the training log' });
  }
  return findings;
}

/**
 * Cost lines for an artifact, from the rates handed in rather than from any rate of its own.
 *
 * A rate whose product is unknown is not priced at all: the line is emitted as UNVERIFIED. That is the
 * difference between a comparison and a guess, and it is the reason this function takes `tokens` and a
 * `serving` argument rather than assuming them.
 */
export function costLines({ manifest, rates, serving = null }) {
  const lines = [];
  if (!isPlainObject(rates)) throw new TrainingSeamError('NO_RATES', 'cost lines need rates');

  const measured = manifest?.tokens?.measured ?? null;
  // An estimate is allowed to carry a number as long as it is labelled one. What is not allowed is a
  // number presented as a measurement, or an unknown presented as zero.
  const estimated = measured === null ? (manifest?.tokens?.estimate ?? null) : null;
  const tokens = measured ?? estimated;
  const trainingRate = rates.usd_per_million_training_tokens;
  if (!isPositiveRate(tokens)) {
    lines.push({
      item: 'training', quantity: null, unit: 'training_tokens', rate: null, currency: rates.currency ?? 'USD', cost: null, status: 'UNVERIFIED',
      reason: tokens === null
        ? 'the manifest records no token count, measured or estimated'
        : `the token count is ${tokens}, which is not a positive number of tokens to price`,
    });
  } else if (!isPositiveRate(trainingRate)) {
    // A missing, negative or zero rate is the same missing fact: we do not know the rate, so the line
    // is not priced. Treating a zero rate as real would print a $0.00 PINNED line.
    lines.push({ item: 'training', quantity: tokens, unit: 'training_tokens', rate: null, currency: rates.currency ?? 'USD', cost: null, status: 'UNVERIFIED', reason: `no pinned positive per-token rate was supplied (got ${trainingRate === undefined ? 'nothing' : trainingRate})` });
  } else {
    const cost = (tokens / 1_000_000) * trainingRate;
    lines.push({
      item: 'training',
      quantity: tokens,
      unit: 'training_tokens',
      rate: trainingRate,
      currency: rates.currency ?? 'USD',
      cost,
      status: measured === null ? 'ESTIMATE' : 'PINNED',
      reason: measured === null ? 'estimated from characters, not counted by the training tokenizer' : undefined,
      quote_ids: rates.quote_ids ?? [],
    });
  }

  // The serving quantity is validated before it is multiplied. It used to be read straight off the
  // argument, so a missing or NaN gpuHours produced a NaN cost, and because `NaN !== null` the total
  // then reported `complete: true` and `PINNED` over an arithmetic hole.
  const gpuHours = isPlainObject(serving) ? serving.gpuHours : undefined;
  const gpuRate = rates.usd_per_gpu_hour;
  if (!isNonNegativeQuantity(gpuHours)) {
    lines.push({ item: 'serving', quantity: null, unit: 'gpu_hours', rate: null, currency: rates.currency ?? 'USD', cost: null, status: 'UNVERIFIED', reason: 'no usable serving time was supplied; a missing, negative or non-numeric GPU-hour quantity is not zero' });
  } else if (!isPositiveRate(gpuRate)) {
    lines.push({ item: 'serving', quantity: gpuHours, unit: 'gpu_hours', rate: null, currency: rates.currency ?? 'USD', cost: null, status: 'UNVERIFIED', reason: `no pinned positive GPU-hour rate was supplied (got ${gpuRate === undefined ? 'nothing' : gpuRate})` });
  } else {
    const cost = gpuHours * gpuRate;
    lines.push({
      item: 'serving',
      quantity: gpuHours,
      unit: 'gpu_hours',
      rate: gpuRate,
      currency: rates.currency ?? 'USD',
      cost,
      // The rate is pinned; the wall-clock it is multiplied by is an estimate, and saying so is the
      // difference between an estimate and a measurement.
      status: serving.measured === true ? 'PINNED' : 'ESTIMATE',
      quote_ids: rates.quote_ids ?? [],
    });
  }

  return lines;
}

/** Total a set of cost lines, refusing to add an unpriced line into a total that looks complete. */
export function totalCost(lines) {
  // Belt and braces: a line whose cost is NaN or Infinity is not a priced line, whatever its status
  // field says. `NaN !== null` was how a NaN slipped into a total marked complete and PINNED.
  const priced = (line) => typeof line.cost === 'number' && Number.isFinite(line.cost);
  const unverified = lines.filter((line) => !priced(line));
  const estimated = lines.filter((line) => line.status === 'ESTIMATE');
  const total = lines.filter(priced).reduce((sum, line) => sum + line.cost, 0);
  return {
    total,
    currency: lines[0]?.currency ?? 'USD',
    unverified_items: unverified.map((line) => line.item),
    // The total is only as good as its weakest line, and a total that hides an estimate behind a
    // measurement is the number someone will quote.
    estimated_items: estimated.map((line) => line.item),
    status: unverified.length > 0 ? 'UNVERIFIED' : estimated.length > 0 ? 'ESTIMATE' : 'PINNED',
    complete: unverified.length === 0,
  };
}

/**
 * May these two adapters be compared as backends, holding the modelling constant?
 *
 * This is the gate that makes a backend comparison mean what it says. Two adapters trained on different
 * base checkpoints differ in their model as well as their backend, whatever the cost sheet claims.
 */
export function assertComparable(left, right) {
  const problems = [];
  if (left.resolved_base_revision !== right.resolved_base_revision) {
    problems.push(`base revisions differ (${left.resolved_base_revision} vs ${right.resolved_base_revision}), so a difference between them is not a backend difference`);
  }
  const baseModelOf = (manifest) => (typeof manifest.base_model_id === 'string' && manifest.base_model_id !== '' ? manifest.base_model_id : null);
  const leftBase = baseModelOf(left);
  const rightBase = baseModelOf(right);
  if (leftBase === null || rightBase === null) {
    problems.push('a manifest does not name the base model it trained, so the two runs cannot be shown to be the same weights');
  } else if (leftBase !== rightBase) {
    problems.push(`base models differ (${leftBase} vs ${rightBase}), so a difference between them is not a backend difference`);
  }
  if (left.corpus_sha256 !== right.corpus_sha256) {
    problems.push('the training corpora differ, so a difference between them is not a backend difference');
  }
  const tokenizerOf = (manifest) => manifest.tokenizer ?? manifest.base_tokenizer ?? null;
  const leftTokenizer = tokenizerOf(left);
  const rightTokenizer = tokenizerOf(right);
  // Two manifests that both omit the tokenizer are not equal, they are both silent: `null === null`
  // used to declare such a pair comparable, which is a missing fact treated as a matching one.
  if (leftTokenizer === null || rightTokenizer === null) {
    problems.push('a manifest records no tokenizer, so the same corpus cannot be shown to be the same tokens');
  } else if (leftTokenizer !== rightTokenizer) {
    problems.push('the tokenizers differ, so the same corpus is not the same tokens');
  }
  const leftRecipe = isPlainObject(left.hyperparameters) ? left.hyperparameters : {};
  const rightRecipe = isPlainObject(right.hyperparameters) ? right.hyperparameters : {};
  const recipeDifferences = RECIPE_KEYS.filter((key) => leftRecipe[key] !== rightRecipe[key]);
  if (recipeDifferences.length > 0) {
    // A 1-epoch rank-8 LoRA-SFT run and a 10-epoch rank-64 LoRA-DPO run differ in cost because of the
    // recipe, not the platform, and calling that a backend comparison would be wrong twice over.
    problems.push(`the training recipes differ (${recipeDifferences.map((key) => `${key}: ${leftRecipe[key] ?? 'unset'} vs ${rightRecipe[key] ?? 'unset'}`).join(', ')}), so a cost difference is the recipe and not the platform`);
  }
  return { comparable: problems.length === 0, problems };
}

/**
 * Run a job on a backend. The adapter is looked up rather than imported here, so a backend can be added
 * without editing this file - but it must present the same shape, which is checked before it runs.
 */
export async function runTraining({ backend, job, adapters, context = {} }) {
  if (!BACKENDS.includes(backend)) {
    throw new TrainingSeamError('UNKNOWN_BACKEND', `unknown backend "${backend}" (known: ${BACKENDS.join(', ')})`);
  }
  const adapter = adapters?.[backend];
  if (!adapter) throw new TrainingSeamError('NO_ADAPTER', `no adapter is registered for backend "${backend}"`);
  for (const name of ['plan', 'run']) {
    if (typeof adapter[name] !== 'function') {
      throw new TrainingSeamError('BAD_ADAPTER', `the "${backend}" adapter has no ${name}() to implement the seam`);
    }
  }

  const findings = validateJob(job);
  if (findings.length > 0) {
    throw new TrainingSeamError('INVALID_JOB', `the job is not runnable: ${findings.map((finding) => `${finding.field}: ${finding.message}`).join('; ')}`);
  }

  const planned = await adapter.plan(job, context);
  const result = await adapter.run(job, context);
  // Shape before dereference: reading `.manifest` off whatever an adapter returned threw a TypeError
  // from inside the seam, which is a crash rather than a refusal, and a crash in a seam is a seam that
  // cannot be trusted to fail closed.
  if (!isPlainObject(result)) {
    throw new TrainingSeamError('INVALID_ARTIFACT', `the "${backend}" adapter returned ${result === null ? 'null' : typeof result}, not an object with a manifest`);
  }
  if (!isPlainObject(result.manifest)) {
    throw new TrainingSeamError('INVALID_ARTIFACT', `the "${backend}" adapter returned no manifest object`);
  }
  if (!isPlainObject(result.artifact)) {
    throw new TrainingSeamError('INVALID_ARTIFACT', `the "${backend}" adapter returned no artifact object`);
  }
  const manifest = { ...result.manifest, backend };
  const artifactFindings = validateArtifact(manifest);
  if (artifactFindings.length > 0) {
    throw new TrainingSeamError('INVALID_ARTIFACT', `the "${backend}" adapter produced an unusable manifest: ${artifactFindings.map((finding) => `${finding.field}: ${finding.message}`).join('; ')}`);
  }
  // The manifest must name the base the JOB declared. An adapter that records a different model than it
  // was asked to train is exactly the silent substitution the seam exists to catch.
  const declaredBase = job.base.model_id ?? job.base.repo;
  if (manifest.base_model_id !== declaredBase) {
    throw new TrainingSeamError('INVALID_ARTIFACT', `the "${backend}" adapter recorded base_model_id "${manifest.base_model_id}", not the declared "${declaredBase}"`);
  }
  return { planned, artifact: result.artifact, manifest };
}
