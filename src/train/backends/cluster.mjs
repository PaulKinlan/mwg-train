/**
 * The rented-cluster adapter: the same seam, the other backend. DOCUMENTED, NOT IMPLEMENTED.
 *
 * The first dry run runs on Fireworks, so this backend is specified rather than built. It is written out
 * because the seam is only real if a second backend can be described without changing anything above it,
 * and because the cluster is where the checkpoints Fireworks cannot host (the original
 * Qwen2.5-Coder-7B, and any Gemma or GLM the licence allows) can be trained.
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
import { CLUSTER_TRAINABLE } from '../reachability.mjs';

/** The command and environment this backend would run. Implemented, so the seam can be exercised. */
export function plan(job) {
  const model = CLUSTER_TRAINABLE.find((candidate) => candidate.id === job.base.repo || candidate.id === job.base.model_id);
  if (!model) {
    const known = CLUSTER_TRAINABLE.map((candidate) => candidate.id).join(', ');
    throw new TrainingSeamError('UNREACHABLE_BASE', `"${job.base.repo}" is not in the cluster's declared set (${known})`);
  }
  return {
    backend: 'cluster',
    gpu: 'a100-80gb',
    base: { repo: model.id, resolved_revision: job.base.revision },
    // Everything the seam promised, expressed as a command rather than an API call: the same job, the
    // same corpus hash, the same hyperparameters.
    command: [
      'python', '-m', 'axolotl.cli.train', '--config', 'config.yml',
      '--base_model', model.id,
      '--revision', job.base.revision,
      '--dataset', job.corpus.path,
      '--epochs', String(job.hyperparameters.epochs),
      '--sequence_len', String(job.hyperparameters.max_seq_len),
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
