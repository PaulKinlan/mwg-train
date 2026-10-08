/**
 * The rented-cluster adapter: the same seam, the other backend. DOCUMENTED, NOT IMPLEMENTED.
 *
 * The first dry run runs on Fireworks, so this backend is specified rather than built. It is written out
 * because the seam is only real if a second backend can be described without changing anything above it,
 * and because the cluster is where the checkpoints Fireworks cannot host (the original
 * Qwen2.5-Coder-7B, and any Gemma or GLM the licence allows) can be trained.
 *
 * The shape it must return, exactly as the seam checks it (`runTraining`):
 *
 *   {
 *     artifact: { uri, sha256, format },            // format names the loader, e.g. "lora-peft"
 *     manifest: {
 *       base_model_id,                              // the canonical id the JOB declared, not vLLM's path
 *       resolved_base_revision,                     // 40-character commit actually fetched
 *       corpus_sha256,                              // the corpus manifest hash it trained on
 *       hyperparameters,                            // method, rank, epochs, max_seq_len, learning_rate
 *       tokens: { measured },                       // a positive number, or null (null => UNVERIFIED)
 *       adapter: { uri, sha256, format },           // sha256 is a sha256:hex digest
 *       training_log,                               // where the log was written
 *       backend_job_id, started_at, finished_at,
 *     },
 *   }
 *
 * A missing or malformed field is refused by the seam as INVALID_ARTIFACT rather than defaulted, and an
 * adapter that records a base_model_id other than the one the job declared is refused too.
 *
 * What the implementation has to do, in order, when it is built:
 *   1. provision a GPU (the rates are pinned in docs/eval/quotes.jsonl as usd_per_gpu_hour),
 *   2. fetch the base checkpoint at the resolved revision and verify its hash,
 *   3. materialise the corpus from its manifest and hash it,
 *   4. run LoRA SFT/DPO (an axolotl or peft recipe) with the declared hyperparameters,
 *   5. write the adapter, its sha256 and the training log, and record the GPU-seconds consumed,
 *   6. release the GPU, and report the wall-clock INCLUDING setup and idle, because charging idle to only
 *      one of the two backends is how a comparison comes out flattering.
 */
import { TrainingSeamError } from '../seam.mjs';
import { CLUSTER_TRAINABLE, resolveBackendModel } from '../reachability.mjs';

/** The command and environment this backend would run. Implemented, so the seam can be exercised. */
export function plan(job) {
  // Resolved through the shared-checkpoint table, because the two providers name the same weights
  // differently and the job may carry either the canonical id or this backend's.
  const canonical = resolveBackendModel('cluster', job.base.model_id) ?? job.base.model_id;
  const model = CLUSTER_TRAINABLE.find((candidate) => candidate.id === resolveBackendModel('cluster', job.base.repo) || candidate.id === resolveBackendModel('cluster', canonical));
  if (!model) {
    const known = CLUSTER_TRAINABLE.map((candidate) => candidate.id).join(', ');
    throw new TrainingSeamError('UNREACHABLE_BASE', `"${job.base.repo}" is not in the cluster's declared set (${known})`);
  }
  const hyperparameters = job.hyperparameters;
  return {
    backend: 'cluster',
    gpu: 'a100-80gb',
    base: { model_id: model.id, canonical_model_id: job.base.model_id ?? job.base.repo, resolved_revision: job.base.revision },
    // Everything the seam promised, expressed as a command rather than an API call: the same job, the
    // same corpus hash, and EVERY declared hyperparameter. Method, rank and learning rate were dropped
    // here once; an implementer following that plan would have built an adapter the seam then rejected.
    hyperparameters,
    command: [
      'python', '-m', 'axolotl.cli.train', '--config', 'config.yml',
      '--base_model', model.id,
      '--revision', job.base.revision,
      '--dataset', job.corpus.path,
      '--method', hyperparameters.method,
      '--num_epochs', String(hyperparameters.epochs),
      '--sequence_len', String(hyperparameters.max_seq_len),
      ...(hyperparameters.rank === undefined ? [] : ['--lora_rank', String(hyperparameters.rank)]),
      ...(hyperparameters.learning_rate === undefined ? [] : ['--learning_rate', String(hyperparameters.learning_rate)]),
    ],
    env: { CORPUS_SHA256: job.corpus.sha256, HF_HUB_REVISION: job.base.revision },
    serving: {
      endpoint: 'openai-compatible',
      server: 'vllm',
      note: 'the adapter is served by vLLM so both backends present the same endpoint to the evaluation',
    },
  };
}

export async function run() {
  throw new TrainingSeamError('NOT_IMPLEMENTED', 'the cluster backend is documented but not implemented; the first dry run uses Fireworks, and no cluster is rented by this repository');
}

export const adapter = { plan, run };
