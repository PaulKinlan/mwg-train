# The mwg-train pipeline

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

## 0. Owner-Directed Model-to-Model Training Lifecycle (Paul, 2026-10-10)

The overarching training pipeline implements a closed-loop, model-to-model empirical uplift workflow:

```
[Trainable Vision Model] 
       │
       ▼ (Step 2: Generate against training-side plan.md + design.md + visual target)
[Raw Base Output] ──► (Step 3: Cordon off immutable baseline comparator checkpoint)
       │
       ▼ (Step 4: Measure baseline with Modern Web Guidance & web-uplift evaluation)
[Pre-Uplift MWG Score]
       │
       ▼ (Step 5: Apply MWG & Web Uplift until meeting all visual + functional criteria)
[Uplifted Approved Training Set]
       │
       ▼ (Step 6: Re-evaluate to confirm accuracy, contract completeness & rights clearance)
[Verified Dataset Manifest]
       │
       ▼ (Step 7: Train adapter / fine-tune model)
[Trained Model Checkpoint]
       │
       ├─────────────────────────────────────────┐
       ▼ (Step 8a: Diagnostic Rebuild)           ▼ (Step 8b: Single-Run Preregistered Eval)
[Rebuild Same Training/Dev Demos]         [Sealed Evaluation: C1, C2, C3, T]
       │                                         │
       ▼                                         ▼
[Measure Training Distribution Delta]     [Measure Generalization & Preregistered Endpoints]
```

### The 8-Step Closed-Loop Pipeline:
1. **Select and Qualify a Trainable Model**:
   - Select a verified trainable base model (open downloadable weights or verified hosted fine-tuning; e.g. Qwen 2.5 VL 7B / Qwen3-VL-8B-Instruct via Fireworks or dedicated GPU; DeepSeek / GLM).
   - Verify image-conditioning support (vision-language input capable of taking the high-fidelity design screenshot directly).
   - Run a zero-shot vertical slice (`image + plan.md + design contract → working app`) before generating bulk data. Reject any base that cannot build functional applications.
2. **Build the Untouched Baseline**:
   - Use the qualified base model to attempt generating web applications from training-side `plan.md` functional specs and `design.md` visual design contracts.
   - The raw base output is intended to target the authored high-fidelity reference image and functional routes/state described in `plan.md`. Imperfections, semantic gaps, accessibility issues, and MWG defects in this raw generation are expected and preserved—they establish the empirical baseline to measure improvement *from*.
3. **Cordon Off Baseline Checkpoint**:
   - Store the initial raw model outputs and exact model/revision checkpoint, cordoned off and immutable.
   - This frozen checkpoint serves as the default model / baseline comparator.
4. **Evaluate Baseline with MWG / Web Uplift**:
   - Run the Modern Web Guidance (MWG) and `web-uplift` evaluation framework across the baseline builds.
   - Quantify exactly which MWG rules passed, which failed, and where mechanical vs architectural defects exist.
5. **Improve Demos into the Training Set**:
   - Apply Modern Web Guidance and Web Uplift transformations, iteratively fixing defects, styling, semantic structure, accessibility, and server resilience until the demo meets all visual, functional, and MWG criteria.
   - This improved, verified target set becomes **the training set**.
6. **Re-Evaluate to Confirm Outcomes**:
   - Evaluate the improved demos again through the full test suite and browser acceptance checks.
   - Confirm functional correctness, accessibility compliance, visual match, and rights clearance (`excluded_from_training` flags).
7. **Train the Model**:
   - Fine-tune the qualified base model on the approved, rights-cleared, disjoint `(prompt + reference image -> uplifted code)` dataset.
   - Retain the trained adapter weights separately from the cordoned base model.
8. **Rebuild, Compare, and Measure Uplift**:
   - **8a. Paired Diagnostic Rebuild (Training/Dev Distribution)**: Rebuild the *same* training-side demos with both the cordoned base model and the newly trained model under matched budgets. Compare the UI, functional execution, and MWG adherence to measure exactly how much the eval + training loop uplifted the model.
   - **8b. Sealed Evaluation (Generalization)**: Separately, execute the preregistered sealed evaluation (`docs/eval/`) exactly once across the four preregistered arms (**C1** bare base, **C2** base + guidance prompt, **C3** base + deterministic uplift, **T** trained student adapter) to measure true out-of-distribution generalization without data leakage.

---

## 1. Trainable Models & Backend Feasibility Matrix

| Model Family | Local / Rented GPU (Open Weights) | Hosted Fine-Tuning | Vision Modality (Image -> App) | Feasibility Assessment |
|---|---|---|---|---|
| **DeepSeek V4.1 Flash (Paul's Selected Student)** | MIT open weights. Deployable to private GPU clusters. | **Supported on Fireworks** (LoRA on Dedicated Training API launched 2026-09-28 with up to 262K context). | Code/Text primary. If deployed for image-conditioned training, requires verified multimodal ingestion or paired VL front-end stage. | **DEFAULT SELECTED STUDENT MODEL (Paul, 2026-10-10).** Primary code-producing training target. Replaces earlier student recommendations. |
| **Qwen 2.5 VL (3B / 7B / 32B / 72B)** | Apache-2.0 open weights. 7B runs LoRA on 24GB VRAM GPU. | Supported on Fireworks (SFT V2 vision-language fine-tuning launched 2025-07-29, JSONL base64, up to 64K context). Also Alibaba DashScope / Model Studio. | **Yes** (Native Vision-Language). Directly consumes design screenshot. | **Primary Vision Candidate / VL Ingestion Stage.** Available as end-to-end vision student or front-end image descriptor for V4.1 Flash. |
| **Qwen3-VL-8B-Instruct** | Apache-2.0 open weights. High coding and vision capability. | Open weights deployable to private GPU / Fireworks Dedicated. `Tunable` flag on shared Fireworks endpoint to be confirmed. | **Yes** (Native Vision-Language). | Alternate multimodal candidate; requires exact-checkpoint qualification under Gate 0. |
| **GLM (GLM-4.5, GLM-5.3-Flash)** | Open weight releases. | Z.ai BigModel training API; Fireworks Dedicated Training API (GLM 5.3 Flash LoRA with vision training added 2026-09-13). | **Yes** (Multimodal vision training available on GLM 5.3 Flash). | Strong candidate; note that Z.ai API outputs remain quarantined under current data provenance rules. |
| **Llama (Llama 3.2-Vision, Llama 4 MoE)** | Community licensed open weights. | Supported on Fireworks (Llama SFT V2). | Multimodal on 3.2-Vision. | Viable alternative; verify licence compliance for commercial distillation. |
| **Proprietary APIs (OpenAI, Anthropic, Google)** | Weights cannot be downloaded or self-hosted. | OpenAI (GPT-4o fine-tuning); Google (Gemini tuning); Claude (Bedrock only). No weight export. | Mixed. | Consumer coding subscriptions (ChatGPT, Claude Max, Antigravity) provide **inference only**, not fine-tuning compute. Outputs carry training restrictions (`docs/provenance/accounts/`). |

### Vision vs Code Generation Pipeline Architecture (Paul's V4.1 Flash Directive)
Under Paul's decision designating **DeepSeek V4.1 Flash** as the default student model:
- **Image Reading & Interpretation**: If V4.1 Flash operates as a text/code-only model, image ingestion is handled either by a verified multimodal adapter on Fireworks or by an explicit Vision-Language (VL) front-end stage (e.g. Qwen 2.5 VL) that converts the high-fidelity design screenshot into structured visual tokens, layout semantics, and aesthetic constraints.
- **Code Generation & Uplift Training**: DeepSeek V4.1 Flash consumes the functional `plan.md`, design contract, and visual layout representation to generate and iteratively refine the modern web application code across frameworks.
- **Zero-Shot Base Qualification**: The base V4.1 Flash model must be evaluated zero-shot before data collection to confirm it can produce runnable, functional applications from the design inputs.

*Infrastructure Constraint*: The fleet's 2-vCPU / 8GB VM has no training GPU. Local VM execution handles dataset orchestration, evaluation, and gate enforcement; model training requires rented GPU compute (RunPod/Lambda) or hosted training endpoints (Fireworks SFT).

---

## 2. Existing Deterministic Instrumentation and Current Status

The seven stages below describe today's deterministic pilot baseline and evaluation pipeline. They represent the reproducible scaffolding tooling, **not** an executed model-training run.

| # | Stage | Command | Consumes | Produces |
|---|-------|---------|----------|----------|
| 1 | **BRIEFS** | `npm run check:briefs` | `docs/eval/briefs/manifest.jsonl` + `docs/eval/rules.json` | zero-exit-code validation of the sealed eval inputs (seal `sha256:89a1f47d…`) |
| 2 | **RULES** | `node scripts/extract-mwg-rules.mjs --skill-dir <installed skill dir> --out docs/eval/rules.json` | Modern Web Guidance (the skill, installed locally) | `docs/eval/rules.json` — the pinned MWG rule vocabulary and hash |
| 3 | **GENERATE** | `npm run pilot:scaffold` | `pilot/plan.json` (archetypes × frameworks × seeded defects) | `pilot/projects/` — the reviewable on-disk baseline sites |
| 4 | **MEASURE** | `npm run pilot:run` | `pilot/plan.json` (regenerated fresh into `.pilot-corpus/<runId>`) + the determinism rules | run records under `pilot/out/<run>/`: browser journeys, rule measurements, accept/reject decisions, and the yield report |
| 5 | **RECORD / VERIFY** | `npm run pilot:corpus` / `npm run check:pilot-corpus` | `pilot:corpus`: `pilot/out/<run>/` + `pilot/plan.json` + `.pilot-uplifted/<runId>/`<br>`check:pilot-corpus`: `pilot/CORPUS.json` + `pilot/plan.json` | `pilot/CORPUS.json` — the committed record of what was measured (tree SHAs, acceptance, improved rules); `--verify` re-derives all of it |
| 6 | **PRICE** | `npm run price:two-backends` | `docs/eval/quotes.jsonl` + `docs/pilot/yield.json` + `docs/eval/briefs/manifest.jsonl` | cost per accepted pair, Fireworks vs the cluster (`docs/eval/two-backends.md`) |
| 7 | **TRAIN** | *(training command not implemented yet — queued behind bead `mwg-train-0ov`)*; the prerequisite evidence check is `npm run check:train-evidence` | a **disjoint** generated corpus (never the sealed eval set) | the training set the model is improved with |

## Current position

- Stages **1–6 are built, measured, and active**: the pilot corpus is generated, driven, recorded
  (`pilot/CORPUS.json`), and priced, and the corpus viewer serves it for inspection.
- Stage **7 (TRAIN) is queued** behind disjoint training-set generation (bead `mwg-train-0ov`).
  **The sealed eval set is never trained on** — it exists only to measure.

## The role of Uplift / MWG

The uplift (`src/corpus/uplift.mjs`) is a **deterministic** transform of a baseline site using the
Modern Web Guidance rules. Its role depends on the family:

- **For GENERATE families** it is a *deterministic control & measurement* — the free floor. It
  measures the mechanical repair delta between raw model output and mechanical linting, and it is
  **NOT** the training target.
- **For REPAIR families** it *is* the reference target: the known-good fix for the seeded defects,
  which the model's repair is measured against.
- **Ceiling:** uplift handles mechanical rules (labels, landmarks, contrast, autofill, sanitised
  HTML). It cannot repair a broken data model or missing server persistence — anything above the
  mechanical floor is the model's job, and the gap between the floor and the target is what
  training exists to close.

## The four roles

- **EVAL INSTRUMENT** — the sealed briefs + rules + measured pairs (stages 1–2, 4–5). It measures;
  it is never consumed as training data.
- **BASELINE** — the raw generated sites (stage 3). What the model produces today, kept to measure
  improvement FROM.
- **TRAINING SOURCE** — the disjoint corpus generated for stage 7 (bead `mwg-train-0ov`).
  Accepted pairs from this corpus — and only these — may become training data.
- **COST INPUT** — the pricing evidence (stage 6). What an accepted pair costs to produce on each
  backend; decides where generation runs.
