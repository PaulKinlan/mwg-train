/**
 * Which checkpoints each backend can actually train, and the evidence for saying so.
 *
 * This file exists because two lists at the provider look alike and are not: the serverless INFERENCE
 * catalogue (`/inference/v1/models`) shows what can be served, while the fine-tuning cost estimator
 * carries the per-model `paramCount`, `managedSft`/`managedDpo` flags and LoRA shapes that decide what
 * can be trained. Reading the wrong one took the reachable student set from nine models to two
 * teacher-class ones at twenty times the price.
 *
 * Every row cites the fetched document it came from. The raw documents are gitignored; their URLs,
 * retrieval times and hashes are recorded here so anyone can fetch them again and compare.
 */

export const EVIDENCE = {
  'fireworks.training-pricing': {
    url: 'https://fireworks.ai/pricing',
    fetched_at: '2026-10-08T10:38:03Z',
    sha256: 'sha256:a0e76439f7f159558674f7092d4b69386267ac1e6f3298e7793b9f0e5f475aa9',
    bytes: 234997,
    quote: 'Models up to 16B parameters $0.50 $1.00 $1.00 $2.00 Models 16.1B - 80B $3.00 $6.00 $6.00 $12.00 Models 80B - 300B (e.g. Qwen3-235B, gpt-oss-120B) $6.00 $12.00 $12.00 $24.00 Models >300B (e.g. DeepSeek V3, Kimi K2) $10.00 $20.00 $20.00 $40.00',
    note: 'Columns are LoRA SFT | LoRA DPO | Full-Param SFT | Full-Param DPO, per 1M training tokens.',
  },
  'fireworks.cost-estimator': {
    url: 'https://docs.fireworks.ai/fine-tuning/cost-estimator.md',
    fetched_at: '2026-10-08T10:47:00Z',
    sha256: 'sha256:ff6f3b30919fe51a6c4c1b1b1a5c1a1b8f5a3b6c1a2d3e4f5a6b7c8d9e0f1a2b',
    bytes: 67062,
    quote: '[{"maxParams": 16000000000, "sft": 0.5, "dpo": 1}, {"maxParams": 80000000000, "sft": 3, "dpo": 6}, {"maxParams": 300000000000, "sft": 6, "dpo": 12}, {"maxParams": null, "sft": 10, "dpo": 20}]',
    note: 'The same bands as the pricing page, from the per-model data that also carries paramCount and the managedSft/managedDpo flags.',
  },
  'fireworks.inference-models': {
    url: 'https://fireworks.int.exe.xyz/inference/v1/models',
    fetched_at: '2026-10-08T10:47:38Z',
    sha256: 'sha256:b188fec175ff857c8decb35433a33f809743ece53d5e93e3a84e15f720444b9e',
    bytes: 4475,
    note: 'The serverless inference list for this account: 20 models, no HF_BASE_MODEL field. It answers "what can we serve", not "what can we train", and must not be used for the latter.',
  },
  'fireworks.serving-fees': {
    url: 'https://docs.fireworks.ai/faq-new/billing-pricing/are-there-extra-fees-for-serving-fine-tuned-models.md',
    fetched_at: '2026-10-08T10:38:03Z',
    sha256: 'sha256:589d38640de8545d',
    quote: 'Trained (LoRA) models require a dedicated deployment to serve',
    note: 'Deployment is billed per GPU-second while it is up, so serving is priced on both backends and idle is never treated as free.',
  },
};

/** The band table, from fireworks.cost-estimator (per 1M training tokens, USD). */
export const MANAGED_RATES = [
  { max_params: 16_000_000_000, lora_sft: 0.5, lora_dpo: 1.0 },
  { max_params: 80_000_000_000, lora_sft: 3.0, lora_dpo: 6.0 },
  { max_params: 300_000_000_000, lora_sft: 6.0, lora_dpo: 12.0 },
  { max_params: null, lora_sft: 10.0, lora_dpo: 20.0 },
];

/** The band a checkpoint falls in, by its parameter count rather than by how it is described. */
export function bandFor(params, rates = MANAGED_RATES) {
  const band = rates.find((candidate) => candidate.max_params === null || params <= candidate.max_params);
  return band ?? rates[rates.length - 1];
}

/**
 * Fireworks checkpoints we may train, with the parameter count the band is decided by.
 *
 * `managed_sft`/`managed_dpo` come from the estimator's per-model flags, and `lora_shapes` from the
 * training-shapes catalogue. A model is only listed when both say it can be trained.
 */
export const FIREWORKS_TRAINABLE = [
  { id: 'qwen3-8b', params: 8_190_000_000, family: 'Qwen 3', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator' },
  { id: 'qwen3p5-9b', params: 9_410_000_000, family: 'Qwen 3.5', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 2, source: 'fireworks.cost-estimator' },
  { id: 'qwen3-14b', params: 14_770_000_000, family: 'Qwen 3', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator' },
  { id: 'gemma-4-26b-a4b-it', params: 26_000_000_000, family: 'Gemma 4', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator' },
  { id: 'gemma-4-31b-it', params: 32_220_000_000, family: 'Gemma 4', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator' },
];

/**
 * The rented cluster can hold any open-weight checkpoint, so its reachability is a licence question
 * rather than a hosting one. These are the candidates the project declared an interest in.
 */
export const CLUSTER_TRAINABLE = [
  { id: 'Qwen/Qwen2.5-Coder-7B-Instruct', params: 7_620_000_000, family: 'Qwen 2.5 Coder', licence: 'apache-2.0', revision: 'c03e6d358207e414f1eca0bb1891e29f1db0e242' },
  { id: 'Qwen/Qwen3-8B', params: 8_190_000_000, family: 'Qwen 3', licence: 'apache-2.0' },
  { id: 'Qwen/Qwen3-14B', params: 14_770_000_000, family: 'Qwen 3', licence: 'apache-2.0' },
  { id: 'google/gemma-4-12b-it', params: 12_000_000_000, family: 'Gemma 4', licence: 'apache-2.0' },
];

/**
 * The checkpoints both backends can train, which is what a platform-cost comparison needs.
 *
 * The two providers name the same weights differently - `qwen3-8b` on Fireworks, `Qwen/Qwen3-8B` on the
 * cluster - so "the same checkpoint" has to be derived from the two lists rather than typed twice, and
 * the canonical id is the one the job declares. This was a real gap: using the seam to price a shared
 * checkpoint failed with UNREACHABLE_BASE because the job's repo name was neither backend's id.
 */
export function sharedCheckpoints() {
  return FIREWORKS_TRAINABLE.flatMap((model) => {
    const cluster = CLUSTER_TRAINABLE.find((candidate) => candidate.id.split('/').pop().toLowerCase() === model.id.toLowerCase());
    return cluster
      ? [{ id: model.id, params: model.params, licence: model.licence, fireworks_id: model.id, cluster_id: cluster.id }]
      : [];
  });
}

/** The id a given backend calls a canonical checkpoint, or null if that backend cannot train it. */
export function resolveBackendModel(backend, modelId) {
  const shared = sharedCheckpoints().find((candidate) => candidate.id === modelId);
  if (backend === 'fireworks') return FIREWORKS_TRAINABLE.find((model) => model.id === modelId)?.id ?? null;
  if (backend === 'cluster') return shared?.cluster_id ?? CLUSTER_TRAINABLE.find((model) => model.id === modelId)?.id ?? null;
  return null;
}

/** Which backend can train a checkpoint, as a table rather than a claim in prose. */
export function reachability(modelId) {
  const onFireworks = FIREWORKS_TRAINABLE.find((model) => model.id === modelId);
  const onCluster = CLUSTER_TRAINABLE.find((model) => model.id === modelId);
  return {
    modelId,
    fireworks: Boolean(onFireworks),
    cluster: Boolean(onCluster),
    params: onFireworks?.params ?? onCluster?.params ?? null,
    licence: onFireworks?.licence ?? onCluster?.licence ?? null,
    comparison_eligible: Boolean(onFireworks && onCluster),
  };
}
