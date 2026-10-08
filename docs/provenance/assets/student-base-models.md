# Assets: candidate student base models (open-weight checkpoints)

The student base must be an exact checkpoint that is (a) downloadable, (b) licensed so we may train
on it, publish derived weights and use it commercially. A brand name is not an artefact: the fleet's
`deepseek-flash` / `glm-5.3-flash` model entries are API SKUs whose underlying weights had to be
looked up separately, and a model name that does not exist on the Hub returns an error rather than a
licence.

**The licence rule for the student is a permissive one (Apache-2.0 or MIT), checked on the exact
checkpoint.** A conditional licence on the student collides with whatever the corpus carries; a
permissive licence on the student leaves only the corpus-facing obligations to manage.

All metadata below was fetched 2026-10-08 through the Hugging Face API and is hash-pinned in
`../evidence/manifest.jsonl` (`hf-api-*` rows). `weights=` is the number of `.safetensors` shards in
the repo tree, which is direct evidence that a checkpoint is downloadable rather than API-only.

## Verified current-generation checkpoints

| Model | HF repo | Licence | Gated | Revision | Weights | Modified |
| --- | --- | --- | --- | --- | --- | --- |
| Gemma 4 31B IT | `google/gemma-4-31B-it` | `apache-2.0` | no | `842da3794e` | 3 | 2026-07-20 |
| Gemma 4 12B IT | `google/gemma-4-12B-it` | `apache-2.0` | no | `707f0a3b8a` | sharded | 2026-07-20 |
| Gemma 4 26B-A4B IT | `google/gemma-4-26B-A4B-it` | `apache-2.0` | no | `4d7ae4984b` | sharded | 2026-07-20 |
| Qwen3.8 27B | `Qwen/Qwen3.8-27B` | `apache-2.0` | no | `1d4bf0f2ff` | 19 | 2026-08-14 |
| Qwen3.8 Flash-Next | `Qwen/Qwen3.8-Flash-Next` | **`other`** | no | `de4b8e4d43` | 132 | 2026-08-27 |
| DeepSeek-V4.1-Flash | `deepseek-ai/DeepSeek-V4.1-Flash` | `mit` | no | `2cba9e42aa` | 49 | 2026-10-01 |
| DeepSeek-V4-Flash | `deepseek-ai/DeepSeek-V4-Flash` | `mit` | no | `60d8d70770c6` | 47 | 2026-06-22 |
| GLM-5 | `zai-org/GLM-5` | `mit` | no | `c183ef8c61` | 283 | 2026-08-11 |
| GLM-5.3-Flash | `zai-org/GLM-5.3-Flash` | `mit` | no | `eb9eb208eb0d` | 63 | 2026-09-07 |

The previous-generation candidates are still checked and still valid: `Qwen2.5-Coder-7B-Instruct`
(Apache-2.0, public), `Qwen2.5-Coder-32B-Instruct` (Apache-2.0), `Qwen3-8B` (Apache-2.0),
`Qwen3-30B-A3B` (Apache-2.0), `DeepSeek-R1-Distill-Qwen-32B` (MIT), and the Gemma 3 12B/27B pair
(which is **not** Apache-2.0 — see below).

## Correction to the earlier hub finding

A relay from `mwg-train/coord` (2026-10-08) reported that "Gemma 4, Qwen 3.8, DeepSeek V4, GLM-5
lack verified downloadable open weights (mostly API-only endpoints)". **That is contradicted by the
Hub's own API on this date**, and the difference is reproducible in one command per model:

```
curl -s https://huggingface.co/api/models/google/gemma-4-31B-it | jq -r .cardData.license   # apache-2.0
curl -s https://huggingface.co/api/models/google/gemma-4-31B-it/tree/main | grep -c safetensors
```

Findings that differ from the relay:

- **Gemma 4 is Apache-2.0**, not the restrictive Gemma Terms. The model card declares
  `license: apache-2.0` with `license_link: https://ai.google.dev/gemma/docs/gemma_4_license`
  (`hf-model-card-gemma-4-31b-it`), and that licence page is the plain Apache License 2.0 text
  (`gemma-4-license`, extracted section 234 onwards). Google's own launch blog says Gemma 4 is
  "released under a commercially permissive Apache 2.0 license".
- **Qwen3.8 has open weights**: `Qwen/Qwen3.8-27B` is Apache-2.0 with 19 safetensors shards.
  `Qwen/Qwen3.8-Flash-Next` (132 shards) declares `other` — an unresolved licence, not a usable
  default.
- **DeepSeek V4 has open weights**: `DeepSeek-V4.1-Flash` (2026-10-01, MIT) and `DeepSeek-V4-Flash`
  (MIT) are both download-able.
- **GLM-5 has open weights**: `zai-org/GLM-5` is MIT.

The likely cause of the relay's error is name resolution: the names that were looked up
(`google/gemma-4-27b-it`, `Qwen/Qwen3.8-8B`, `Qwen/Qwen3.8-30B-A3B`,
`deepseek-ai/DeepSeek-V4`) are **not** the names that exist — the real ones are
`gemma-4-12B-it` / `gemma-4-31B-it`, `Qwen3.8-27B`, `Qwen3.8-Flash-Next`,
`DeepSeek-V4-Flash` / `DeepSeek-V4.1-Flash`. (`zai-org/GLM-5` does exist and is MIT, so the relay's
error there is a different one.) An unauthenticated Hub API request returns 401 both for a repo that
does not exist *and* for one that is gated, so a 401 is not evidence of "API-only": enumerate with
`https://huggingface.co/api/models?author=<org>&search=<name>` before concluding anything.

## The Gemma 3 case (not Gemma 4), and why it still matters

Gemma 3 uses the Gemma Terms of Use, and one clause changes the shape of a teacher/student arm.
`gemma-terms.txt` (sha256 `3344b876639e8f94`, last modified April 1, 2026), definition 1.1(e),
extracted lines 254-260:

> "Model Derivatives" means all (i) modifications to Gemma, (ii) works based on Gemma, or (iii) any
> other machine learning model which is created by transfer of patterns of the weights, parameters,
> operations, or Output of Gemma, to that model in order to cause that model to perform similarly to
> Gemma, including distillation methods that use intermediate data representations or methods based
> on the generation of synthetic data Outputs by Gemma for training that model. For clarity, Outputs
> are not deemed Model Derivatives.

So a model trained on **synthetic data generated by Gemma 3** is itself a Gemma Model Derivative, and
a model fine-tuned *from* Gemma 3 weights is one for the simpler reason that it modifies Gemma.
Section 3.1 (extracted lines 284-292) then conditions distribution: include the Section 3.2 use
restrictions "as an enforceable provision" in the agreement governing the model, give recipients the
Agreement, and mark modified files. Section 3.3 (line 317) adds:

> Google claims no rights in Outputs you generate using Gemma. You and your users are solely
> responsible for Outputs and their subsequent uses.

**None of that applies to Gemma 4**, whose licence page is Apache-2.0. The Gemma 3 record is kept
because the same trap is easy to walk into: Gemma 3 12B/27B remain on the old terms, and the two
families sit next to each other on the Hub.

One question stays open for Gemma 4: Google's site publishes a **Prohibited Use Policy** page
(`gemma-prohibited-use`, captured). Whether that policy is incorporated into the Apache-2.0 licence
for Gemma 4 is NOT STATED on the licence page — it is a policy statement, and the licence page
carries only the Apache text.

## Recommendation

**Student base: a permissive, code-capable checkpoint, pinned by revision sha.**

1. `Qwen2.5-Coder-7B-Instruct` (`c03e6d358207e414f1eca0bb1891e29f1db0e242`) remains the right *first*
   base: 7B keeps a QLoRA feasibility run on one rented GPU, it is a code model, and Apache-2.0 has
   no pass-through.
2. If the pilot wants a current-generation base at the same cost profile, `Qwen3.8-27B`
   (Apache-2.0) is the direct upgrade path, and `google/gemma-4-12B-it` is now a genuine
   Apache-2.0 alternative rather than a licence-encumbered one.
3. Do **not** pick `Qwen3.8-Flash-Next` (`other`) or Gemma 3 as the student without a licence review.
4. The scale-up comparator is `Qwen2.5-Coder-32B-Instruct` or `Qwen3.8-27B`; the DeepSeek-V4/GLM-5.x
   checkpoints are MIT but very large (47-283 shards) and are better suited to serving a teacher than
   to being a student in a pilot.

## Consequence for the teacher arm

Both teacher SKUs this fleet runs resolve to MIT-licensed, publicly downloadable checkpoints:
`deepseek-flash` → `deepseek-ai/DeepSeek-V4-Flash` (MIT) and `glm-5.3-flash` → `zai-org/GLM-5.3-Flash`
(MIT). Serving one of those from our own copy changes which terms apply — the MIT licence governs the
weights and the provider's API terms stop applying — which remains the cheapest route to a
defensible teacher arm (`../accounts/deepseek-api.md`).

## Re-verify at run time

A licence can change and a repo can be re-tagged. Every training run must record the revision sha it
actually loaded, the licence declared on that date, and the licence text captured on that date.

## Open questions for a human reviewer

- Is Google's Gemma **Prohibited Use Policy** incorporated into the Apache-2.0 Gemma 4 licence, or a
  non-binding policy page?
- What licence does `Qwen/Qwen3.8-Flash-Next` declare? (`other` — the card needs to be read, and it
  is a default-off candidate until then.)
- Does serving our own copy of a DeepSeek-V4 or GLM-5 checkpoint trigger any *website* term (as
  opposed to the API terms)? MIT covers the weights; the site terms are separate.
