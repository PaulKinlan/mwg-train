/**
 * Which checkpoints each backend can actually train, and the evidence for saying so.
 *
 * This file exists because two lists at the provider look alike and are not: the serverless INFERENCE
 * catalogue (`/inference/v1/models`) shows what can be served, while the fine-tuning cost estimator
 * carries the per-model `paramCount`, `managedSft`/`managedDpo` flags and LoRA shapes that decide what
 * can be trained. Reading the wrong one took the reachable student set from nine models to two
 * teacher-class ones at twenty times the price.
 *
 * Every row cites the fetched document it came from, and every claim in this file is quoted from that
 * document rather than paraphrased from memory. The raw documents are gitignored (we do not redistribute
 * provider pages); their URLs, retrieval times, byte counts and full sha256 digests are recorded here so
 * anyone can fetch them again and compare. `scripts/check-train-evidence.mjs` does exactly that, and
 * `test/reachability.test.mjs` checks the records are internally complete and that each row's quoted
 * evidence actually contains the row's numbers.
 *
 * Two earlier records in this file were wrong and are the reason the check exists: a cost-estimator
 * digest whose first 16 hex characters were real and whose remaining 48 were invented, and a
 * serving-fees digest truncated to 16 hex characters. A 64-character digest is now required, and the
 * shapes of both records are asserted in a test.
 */

export const EVIDENCE = {
  'fireworks.cost-estimator': {
    url: 'https://docs.fireworks.ai/fine-tuning/cost-estimator.md',
    fetched_at: '2026-10-08T11:32:00Z',
    http_status: 200,
    // Full 64-character digest. The previous value shared this record's first 16 characters and
    // invented the other 48, which is the failure mode a short or copied digest hides.
    sha256: 'sha256:ff6f3b30919fe51a8017bbb0314d8a309fe1d1a1c597a13134e35427355e0a22',
    bytes: 67062,
    quote: '"managedRates": [{ "maxParams": 16000000000, "sft": 0.5, "dpo": 1 }, { "maxParams": 80000000000, "sft": 3, "dpo": 6 }, { "maxParams": 300000000000, "sft": 6, "dpo": 12 }, { "maxParams": null, "sft": 10, "dpo": 20 }]',
    model_quotes: {
      'qwen3-8b': '"id": "qwen3-8b", "label": "Qwen 3 8B", "paramCount": 8190735360, "managed": true, "managedSft": true, "managedDpo": true',
      'qwen3p5-9b': '"id": "qwen3p5-9b", "label": "Qwen 3.5 9B", "paramCount": 9409813744, "managed": true, "managedSft": true, "managedDpo": true',
      'qwen3-14b': '"id": "qwen3-14b", "label": "Qwen 3 14B", "paramCount": 14768307200, "managed": true, "managedSft": true, "managedDpo": true',
      'gemma-4-26b-a4b-it': '"id": "gemma-4-26b-a4b-it", "label": "Gemma 4 26B A4B IT", "paramCount": 26000000000, "managed": true, "managedSft": true, "managedDpo": true',
      'gemma-4-31b-it': '"id": "gemma-4-31b-it", "label": "Gemma 4 31B IT", "paramCount": 32216731964, "managed": true, "managedSft": true, "managedDpo": true',
    },
    note: 'The same rate bands as the pricing page, from the per-model data that also carries paramCount and the managedSft/managedDpo flags. Per-model quotes are whitespace-normalised excerpts; the checker compares them against the fetched body the same way.',
  },
  'fireworks.fine-tuning-catalogue': {
    url: 'https://docs.fireworks.ai/fine-tuning/models.md',
    fetched_at: '2026-10-08T11:32:00Z',
    http_status: 200,
    sha256: 'sha256:4c383b3a3fb67c64fc32d9c1fab8147b4b468c732452422eca0c1c4eb44362b5',
    bytes: 90422,
    quote: '"generatedAt": "2026-10-04 17:24 UTC"',
    model_count: 44,
    note: 'The trainable-model catalogue: 44 distinct ids at this revision (the checker counts them). It lists qwen2p5-32b-instruct and no Qwen2.5-Coder-7B-Instruct, which is why the preregistered student had to change; the absence is a fact about this fetched revision, not an assumption.',
  },
  'fireworks.inference-models': {
    url: 'https://fireworks.int.exe.xyz/inference/v1/models',
    fetched_at: '2026-10-08T11:35:00Z',
    http_status: 200,
    sha256: 'sha256:b188fec175ff857c8decb35433a33f809743ece53d5e93e3a84e15f720444b9e',
    bytes: 4475,
    quote: '"kind":"HF_BASE_MODEL"',
    note: 'The serverless inference list for this account: 20 models. It answers "what can we serve", not "what can we train", and must not be used for the latter. It does not carry a per-trainability field.',
  },
  'fireworks.serving-fees': {
    url: 'https://docs.fireworks.ai/faq-new/billing-pricing/are-there-extra-fees-for-serving-fine-tuned-models.md',
    fetched_at: '2026-10-08T11:32:00Z',
    http_status: 200,
    // Was recorded as 'sha256:589d38640de8545d' - 16 hex characters, not a digest.
    sha256: 'sha256:589d38640de8545d9f65ae36067a5633ea68ad0bce1e0423874a976668b8ee88',
    bytes: 1493,
    quote: "Trained (LoRA) models require a dedicated deployment to serve. Here's what you need to know: **What you pay for**: * **Deployment costs** on a per-GPU-second basis for hosting the model",
    note: 'This is the pinned record for the serving claim coord asked for: a trained LoRA cannot be served serverlessly, and the deployment is billed per GPU-second while it is up. Both backends are therefore priced for serving, never zero.',
  },
};

/** The band table, from fireworks.cost-estimator (per 1M training tokens, USD). */
export const MANAGED_RATES = [
  { max_params: 16_000_000_000, lora_sft: 0.5, lora_dpo: 1.0, quote_id: 'fireworks-lora-sft-up-to-16b' },
  { max_params: 80_000_000_000, lora_sft: 3.0, lora_dpo: 6.0, quote_id: 'fireworks-lora-sft-16-1b-80b' },
  { max_params: 300_000_000_000, lora_sft: 6.0, lora_dpo: 12.0, quote_id: 'fireworks-lora-sft-80b-300b-e-g-qwen3-235b-gpt-oss-120b-' },
  { max_params: null, lora_sft: 10.0, lora_dpo: 20.0, quote_id: 'fireworks-lora-sft--300b-e-g-deepseek-v3-kimi-k2-' },
];

/** The band a checkpoint falls in, by its parameter count rather than by how it is described. */
export function bandFor(params, rates = MANAGED_RATES) {
  const band = rates.find((candidate) => candidate.max_params === null || params <= candidate.max_params);
  return band ?? rates[rates.length - 1];
}

/**
 * Fireworks checkpoints we may train, with the parameter count the band is decided by.
 *
 * `managed_sft`/`managed_dpo` and the parameter counts are quoted from `fireworks.cost-estimator`
 * (`EVIDENCE['fireworks.cost-estimator'].model_quotes[id]`), and `lora_shapes` counts the `dedicated`
 * entries whose method is LoRA in the same document. A model is only listed when both say it can be
 * trained. The counts are exact rather than rounded to a billion, because the band boundary is decided
 * by the exact value.
 *
 * The licence is NOT in the cost-estimator, so each row cites the Hugging Face model API separately:
 * `cardData.license` at a pinned revision. An uncited licence is the one field on this table that can
 * silently make a run unlawful, so it is checked rather than assumed.
 */
export const FIREWORKS_TRAINABLE = [
  { id: 'qwen3-8b', params: 8_190_735_360, family: 'Qwen 3', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator', licence_source: { url: 'https://huggingface.co/api/models/Qwen/Qwen3-8B', field: 'cardData.license', revision: 'b968826d9c46dd6066d109eabc6255188de91218', fetched_at: '2026-10-08T11:37:00Z', http_status: 200 } },
  { id: 'qwen3p5-9b', params: 9_409_813_744, family: 'Qwen 3.5', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 2, source: 'fireworks.cost-estimator', licence_source: { url: 'https://huggingface.co/api/models/Qwen/Qwen3.5-9B', field: 'cardData.license', revision: 'c202236235762e1c871ad0ccb60c8ee5ba337b9a', fetched_at: '2026-10-08T11:37:00Z', http_status: 200 } },
  { id: 'qwen3-14b', params: 14_768_307_200, family: 'Qwen 3', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator', licence_source: { url: 'https://huggingface.co/api/models/Qwen/Qwen3-14B', field: 'cardData.license', revision: '40c069824f4251a91eefaf281ebe4c544efd3e18', fetched_at: '2026-10-08T11:37:00Z', http_status: 200 } },
  { id: 'gemma-4-26b-a4b-it', params: 26_000_000_000, family: 'Gemma 4', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator', licence_source: { url: 'https://huggingface.co/api/models/google/gemma-4-26B-A4B-it', field: 'cardData.license', revision: '4d7ae4984b7db7de8f8457170b3f1a419ee76d52', fetched_at: '2026-10-08T11:37:00Z', http_status: 200 } },
  { id: 'gemma-4-31b-it', params: 32_216_731_964, family: 'Gemma 4', licence: 'apache-2.0', managed_sft: true, managed_dpo: true, lora_shapes: 1, source: 'fireworks.cost-estimator', licence_source: { url: 'https://huggingface.co/api/models/google/gemma-4-31B-it', field: 'cardData.license', revision: '842da3794eaa0b77d5f08bae87a17459d91ff475', fetched_at: '2026-10-08T11:37:00Z', http_status: 200 } },
];

/**
 * The rented cluster can hold any open-weight checkpoint, so its reachability is a licence question
 * rather than a hosting one. These are the candidates the project declared an interest in.
 *
 * Each row now cites its own source: the Hugging Face model API at a pinned revision, from which the
 * exact `safetensors.total` parameter count and the licence are read. The endpoint is dynamic (download
 * counters move), so the source pins the immutable parts - the revision sha and the parameter total -
 * rather than a body hash, and `scripts/check-train-evidence.mjs` re-reads them.
 */
export const CLUSTER_TRAINABLE = [
  {
    id: 'Qwen/Qwen2.5-Coder-7B-Instruct',
    params: 7_615_616_512,
    family: 'Qwen 2.5 Coder',
    licence: 'apache-2.0',
    revision: 'c03e6d358207e414f1eca0bb1891e29f1db0e242',
    source: { url: 'https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-7B-Instruct', field: 'safetensors.total', fetched_at: '2026-10-08T11:35:00Z', http_status: 200 },
  },
  {
    id: 'Qwen/Qwen3-8B',
    params: 8_190_735_360,
    family: 'Qwen 3',
    licence: 'apache-2.0',
    revision: 'b968826d9c46dd6066d109eabc6255188de91218',
    source: { url: 'https://huggingface.co/api/models/Qwen/Qwen3-8B', field: 'safetensors.total', fetched_at: '2026-10-08T11:35:00Z', http_status: 200 },
  },
  {
    id: 'Qwen/Qwen3-14B',
    params: 14_768_307_200,
    family: 'Qwen 3',
    licence: 'apache-2.0',
    revision: '40c069824f4251a91eefaf281ebe4c544efd3e18',
    source: { url: 'https://huggingface.co/api/models/Qwen/Qwen3-14B', field: 'safetensors.total', fetched_at: '2026-10-08T11:35:00Z', http_status: 200 },
  },
  {
    id: 'google/gemma-4-12B-it',
    params: 11_959_730_224,
    family: 'Gemma 4',
    licence: 'apache-2.0',
    revision: '707f0a3b8a3c7ad586ed01e27eafbad8a27dd0f7',
    source: { url: 'https://huggingface.co/api/models/google/gemma-4-12b-it', field: 'safetensors.total', fetched_at: '2026-10-08T11:35:00Z', http_status: 200 },
  },
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
