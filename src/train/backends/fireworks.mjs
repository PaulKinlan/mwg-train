/**
 * The Fireworks managed-training adapter. Implemented; the other backend is documented only.
 *
 * Managed training is priced per training token by parameter band, so the plan states which band the
 * checkpoint falls in and where that rate came from. No request is made here: `run` requires a client,
 * and the hub injects the key server side, so this module never needs one to be correct.
 */
import { TrainingSeamError } from '../seam.mjs';
import { FIREWORKS_TRAINABLE, bandFor, EVIDENCE } from '../reachability.mjs';

/** Resolve the base model, the band and the rate. A checkpoint that is not trainable here is refused. */
export function plan(job) {
  const model = FIREWORKS_TRAINABLE.find((candidate) => candidate.id === job.base.model_id || candidate.id === job.base.repo);
  if (!model) {
    const known = FIREWORKS_TRAINABLE.map((candidate) => candidate.id).join(', ');
    throw new TrainingSeamError(
      'UNREACHABLE_BASE',
      `"${job.base.repo}" is not a checkpoint this backend can train (trainable: ${known}). The serverless inference list is not the training list.`,
    );
  }
  const band = bandFor(model.params);
  const rate = job.hyperparameters.method === 'lora-dpo' ? band.lora_dpo : band.lora_sft;
  return {
    backend: 'fireworks',
    endpoint: 'managed-training',
    base: { model_id: model.id, repo: job.base.repo, resolved_revision: job.base.revision },
    params: model.params,
    band_max_params: band.max_params,
    method: job.hyperparameters.method,
    rate: {
      usd_per_million_training_tokens: rate,
      band: band.max_params === null ? 'above 300B' : `up to ${band.max_params / 1e9}B`,
      // The rate row in docs/eval/quotes.jsonl (verified by verify-quotes.mjs). The reachability
      // document the band and the per-model flags come from is cited separately in `evidence`.
      quote_ids: [band.quote_id],
    },
    payload: {
      base_model: model.id,
      dataset: job.corpus.path,
      epochs: job.hyperparameters.epochs,
      max_seq_len: job.hyperparameters.max_seq_len,
      lora_rank: job.hyperparameters.rank ?? null,
      learning_rate: job.hyperparameters.learning_rate ?? null,
    },
    evidence: [EVIDENCE['fireworks.cost-estimator']],
  };
}

/**
 * Run the job. Deliberately requires a client: with no key the run fails loudly rather than producing an
 * artifact nobody can account for.
 */
export async function run(job, context = {}) {
  const client = context.client ?? context.fetch;
  if (typeof client !== 'function') {
    throw new TrainingSeamError('NO_CLIENT', 'no Fireworks client was supplied; the key is injected server side, so a run without one cannot proceed');
  }
  const planned = plan(job);
  const response = await client('https://api.fireworks.ai/v1/accounts/fireworks/fine_tuning/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(planned.payload),
  });
  const jobRecord = await response.json();
  const outputModel = jobRecord.output_model ?? jobRecord.outputModel ?? '';
  return {
    artifact: { uri: outputModel, format: 'lora-fireworks' },
    manifest: {
      backend: 'fireworks',
      // The canonical base identity the job declared, not the provider's own name for it: this is the
      // field a cross-backend comparison reads, and the two providers spell the same weights differently.
      base_model_id: job.base.model_id ?? job.base.repo,
      resolved_base_revision: job.base.revision,
      corpus_sha256: job.corpus.sha256,
      hyperparameters: job.hyperparameters,
      // Recorded as null when the provider did not report it: null becomes UNVERIFIED in the cost sheet,
      // never zero.
      tokens: {
        measured: jobRecord.training_tokens ?? jobRecord.trainingTokens ?? null,
        source: jobRecord.training_tokens === undefined && jobRecord.trainingTokens === undefined ? 'not reported by the provider' : 'provider report',
      },
      training_log: jobRecord.log_url ?? jobRecord.logUrl ?? '',
      adapter: {
        uri: outputModel,
        sha256: jobRecord.adapter_sha256 ?? jobRecord.adapterSha256 ?? '',
        format: 'lora-fireworks',
      },
      backend_job_id: jobRecord.id ?? jobRecord.name ?? null,
      started_at: jobRecord.started_at ?? null,
      finished_at: jobRecord.finished_at ?? null,
    },
  };
}

export const adapter = { plan, run };
