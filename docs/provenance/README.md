# Rights and provenance: what may be trained on

**Bead:** `mwg-train-fih` (first of the design brief's "first three things").
**Status:** teacher arms are quarantined and stay quarantined until this record is countersigned by a
named human reviewer. Nothing below is legal advice; it is a hash-pinned evidence pack plus the
policy this repository enforces in code.
**Captured:** 2026-10-08. Evidence: `evidence/manifest.jsonl`.

## 1. The answer

| Corpus material | May it reach a training run? | Condition |
| --- | --- | --- |
| Original projects generated or written by us from synthetic briefs, with rights-cleared dependencies (`A1_self_generated`) | **Yes** | per-row: `excluded_from_training: false` **and** `approved_for_training: true` with `approved_by` / `approved_at` |
| Deterministic, rights-cleared MWG uplift of such an original (`A2_mwg_uplift_deterministic`) | **Yes** | same per-row approval, plus no quarantined ancestor |
| Modern Web Guidance guide text itself | **Yes** for use, storage and training | guides are CC-BY-4.0 and code is Apache-2.0 — attribution and notice conditions apply to anything we *redistribute*: `assets/mwg-modern-web-guidance.md` |
| Anything authored or uplifted by a hosted teacher model (`A3_teacher_generated`) | **No** | quarantined. Comes back only with prior authorization for the specific account — see per-provider records below |
| Clean-room reproduction study (`A4_clean_room_reproduction`) | **No** | quarantined — `assets/reproduction-studies.md` |
| Black-box reproduction study (`A5_black_box_reproduction`) | **No** | quarantined — `assets/reproduction-studies.md` |
| Held-out evaluation material (`A6_evaluation`) | **Never** | training on the test set destroys the primary endpoint |
| A model trained on Gemma outputs or Gemma weights | allowed, but **viral** | the result is a Gemma "Model Derivative" and must carry Gemma's use restrictions — `assets/student-base-models.md` |

The student base itself is cleared: the recommended initial base is
`Qwen/Qwen2.5-Coder-7B-Instruct` at revision `c03e6d358207e414f1eca0bb1891e29f1db0e242`,
Apache-2.0, no gating, train/publish/commercial all YES. Current-generation alternatives verified on
2026-10-08: `Qwen/Qwen3.8-27B` (Apache-2.0), `google/gemma-4-12B-it` and `google/gemma-4-31B-it`
(**Apache-2.0** — Gemma 4 dropped the old Gemma Terms), and the MIT-licensed
`deepseek-ai/DeepSeek-V4.x` / `zai-org/GLM-5.x` checkpoints. Note `Qwen/Qwen3.8-Flash-Next` declares
`other` and is off the list until its licence is read. `assets/student-base-models.md`

## 2. Teacher accounts: the decisive clause per provider

The question this section answers is narrow and decisive: *may a model's outputs be used to train
another model?* Each row quotes the clause that decides it, from a captured document whose hash is
in `evidence/manifest.jsonl` and whose full record is under `accounts/`.

| Account / endpoint | Governing document (effective) | Decisive text | Position |
| --- | --- | --- | --- |
| Anthropic Claude Max (Claude Code CLI, `claude-code` provider) | Consumer Terms (2025-10-08) + **Usage Policy (2025-09-15)** | “Utilization of inputs and outputs to train an AI model (e.g., “model scraping” or “model distillation”) without prior authorization from Anthropic” | **Prohibited** without prior authorization — applies to a Max subscription just as to an API key, and is not limited to competing models. `accounts/anthropic-claude-max.md` |
| Google consumer account (Antigravity) | Google Terms of Service (2026-07-30) | "using AI-generated content from our services to develop machine learning models or related AI technology" | **Prohibited**. The Generative AI Additional Terms were retired for ordinary consumers on 2024-05-22, so the Google Terms clause is the operative one. `accounts/google-antigravity-consumer.md` |
| Google Gemini API (developer key) | Gemini API Additional Terms (2026-03-23) | "You may not use the Services to develop models that compete with the Services" + "may not attempt to reverse engineer, extract or replicate any component of the Services" | Competitor-scoped: **UNVERIFIED**, needs a decision, not covered by the consumer record. Same file |
| DeepSeek open platform API (`deepseek-flash`) | Open Platform ToS (2026-04-29) + Terms of Use | "You may apply the Inputs and Outputs of the Services to a wide range of use cases, including personal use, academic research, derivative product development, training other models (such as model distillation), etc." | **Expressly permitted** — the only provider captured whose terms allow it. Still quarantined pending sign-off. `accounts/deepseek-api.md` |
| OpenAI (`openai-codex` provider) | Terms of Use (2026-01-01) | "Automatically or programmatically extract data or Output" and "Use Output to develop models that compete with OpenAI" | **Prohibited** on the subscription: the automation clause blocks the harness, the competitor clause blocks the training, and nothing grants either. API/business route is **UNVERIFIED** (prohibited for competing models, silent for others). `accounts/openai-codex.md` |
| Z.ai (`zai` provider, glm-5.3) | Terms of Use incl. Additional Terms for API Services (2026-04-14) | "any use of the Z.ai's models, prompts, or model-generated content for the development, training, labeling, fine-tuning, optimization, iteration, or similar activities related to external models is strictly prohibited" | **Prohibited** — broader than the competitor clauses elsewhere: it bars training *any* external model, subject only to a negotiated "authorized integration" carve-out. `accounts/zai-api.md` |

Three findings sit outside the table but matter operationally:

- Anthropic's consumer terms also forbid accessing the services "through automated or non-human
  means" without an API key, and OpenAI's Terms of Use forbid "Automatically or programmatically
  extract[ing] data or Output". Even a corpus harness that is only *automated* — training nothing —
  is in those clauses' target.
- The competitor qualifier varies by provider *and by document*, so the same activity is prohibited on
  one surface and merely unaddressed on another. Unqualified prohibitions: Anthropic's Usage Policy,
  Google's consumer Terms of Service, Z.ai's API additional terms. Competition-scoped only:
  Anthropic's and OpenAI's commercial/API terms, the Gemini API terms, Z.ai's general terms. Reading
  the wrong document gives the wrong answer — a Claude Max subscription looks permitted if you read
  only Anthropic's commercial terms, and Google's consumer account looks permitted if you read only
  the Gemini API terms.
- The teacher SKUs the fleet runs **have released open weights**:
  `deepseek-ai/DeepSeek-V4-Flash` and `zai-org/GLM-5.3-Flash` are both public and MIT-licensed
  (verified through the Hugging Face API on 2026-10-08). Self-hosting one of those checkpoints, so
  that the MIT licence governs instead of an API contract, is the cheapest route to a defensible
  teacher arm, and it should be priced in the pilot (`assets/student-base-models.md`).
- **Gemma 4 is Apache-2.0**, not the conditional Gemma Terms that cover Gemma 3. The Gemma 3
  "Model Derivative" clause — a model trained on Gemma 3 outputs inherits the Gemma terms — does not
  apply to Gemma 4. Both facts are in `assets/student-base-models.md`, because the two families sit
  next to each other on the Hub.

## 3. What "approved for training" means, mechanically

A corpus row is trainable when all of these hold, and the check lives in code rather than in a
document (`src/provenance/record.mjs`):

1. its `arm` is an eligible arm (`A1` or `A2`);
2. `excluded_from_training` is `false` — for the quarantined arms the validator rejects `false`
   outright (`QUARANTINE_NOT_ENFORCED`);
3. `approved_for_training` is `true` with named `approved_by` and `approved_at`
   (`INCOMPLETE_APPROVAL` otherwise);
4. its `storage_path` sits inside its own arm root (`CROSS_ARM_PATH` otherwise);
5. no ancestor in its `parents` chain is quarantined (`QUARANTINED_ANCESTOR` — this is the check that
   stops a teacher-written original from being "cleaned" by a later approved uplift);
6. `generator.type === "hosted-api"` forces the row into `A3_teacher_generated`
   (`HOSTED_GENERATOR_OUTSIDE_QUARANTINE`), so a teacher-authored row cannot be relabelled.

Run `node scripts/validate-provenance.mjs <manifest.jsonl>` before any training run; it exits
non-zero on any error.

## 4. Data handling: arms may not touch

Storage is arm-scoped, with the arm id as the first path segment under `data/`, so a directory
listing or a diff shows the rights class of every byte:

```
data/A1_self_generated/
data/A2_mwg_uplift_deterministic/
data/A3_teacher_generated/
data/A4_clean_room_reproduction/
data/A5_black_box_reproduction/
data/A6_evaluation/
```

- `assertArmRootsDistinct()` refuses a layout where two arms share or nest a root; that is what makes
  "an approved arm and a quarantined arm must not share a storage path" enforceable rather than
  aspirational.
- `moveToArm()` throws `CROSS_ARM_MOVEMENT_PROHIBITED`. Relocating bytes is not how provenance
  changes: restricted material is regenerated under the approved arm with its own record, and the
  regeneration is what gets reviewed.
- The actor is reminded of the rule at the moment of the mistake, not in a policy document nobody
  reads.

## 5. Evidence, and how to check it

- `scripts/capture-rights-evidence.sh` fetches every source, records URL, final URL, HTTP status,
  content type, byte count, sha256 and fetch time into `evidence/manifest.jsonl`, and writes text
  extractions for grepping. It is re-runnable; one row per source.
- The captured raw bytes are **not** committed — this repository does not redistribute other
  people's terms pages. The manifest is the anchor: re-fetch the URL, hash it, compare. If the page
  has changed since the review, the review is stale and the record says so by date.
- Every quotation in `accounts/` and `assets/` is followed by the extracted-text line number, so
  `sed -n '<line>p' evidence/text/<slug>.txt` prints it.
- `test/` covers the enforcement rules end to end (`node --test`).

## 6. Open items

Ordered by what unblocks the most work:

1. **A named human reviewer countersigns the DeepSeek record.** It is the only teacher whose terms
   permit distillation, and it is the shortest path to a first approved teacher arm. Everything
   needed is in `accounts/deepseek-api.md`.
2. **OpenAI and Z.ai are resolved** (both prohibited; see their records). The remaining capture gap
   is that the OpenAI clauses came through a text proxy because the origin returns 403 to curl, so a
   reviewer must reproduce at least one clause from a browser before countersigning.
3. **Who is the actual account holder** for each subscription (personal vs employer-provisioned)?
   Negotiated or enterprise terms may supersede the public pages, in either direction.
4. **Antigravity-specific terms**, if any exist; the Google record covers the consumer Google Terms
   only.
5. **The Gemma share-alike question for guide text**: the MWG README says portions of the
   documentation derive from MDN (CC-BY-SA 2.5+). Which portions, and does share-alike attach?
   `assets/mwg-modern-web-guidance.md`.
6. **The bundled MiniLM weights** in the MWG npm package carry no licence statement and no notice
   entry anywhere in the package.
7. **CC-BY-4.0 and trained weights**: nothing in the licence restricts them, but whether weights are
   "Adapted Material" is a question for a lawyer, and the answer changes what attribution a released
   model needs.
