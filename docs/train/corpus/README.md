# Training Corpus Token Size and Derivation

## What these projects are (and are not)

The `tr-*` corpus is **brief-authored projects**: each project's form fields and journey are declared in its own brief, and its targets are independent of the evaluation set. All 30 families declare their schema and all 210 projects are built from it (`schema_source: "brief"`). Concretely:

- **Fields and journey come from the brief.** Each family declares its own `fields` and `journey` in `docs/train/briefs/manifest.jsonl`, authored from that brief's `topic`, `prompt`, `journeys` and `assertions`. The `tr-26` brief describes a coffee-subscription renewal and its project has subscription fields (`subscriber`, `beans`, `grind`, `frequency`, `bags`) with a journey that fills them.
- **The archetype still supplies the server shape.** `pilot/training-archetypes.mjs` decides how a record is stored and read back, and the routes' kinds - the plumbing around the form. The form and the journey it is driven through are the brief's.
- **What was verified, and what was not.** 40 of the 210 projects were driven in a real browser through their harness journeys and passed (see `YIELD.md`). That verifies those journeys against those trees; the remaining 170 carry `scaffolded / unverified journey`, and none has been shown to build or serve beyond the sampled 40. A project rendering its brief's fields is a field-level claim, held true for all 30 families by `npm run check:brief-schema -- --expect-all`, not a claim that every brief's flow was exercised.
- The token figures below are **derived from characters** (`characters / 4`), not tokenizer-measured.

## Overview
This directory records empirical character measurements and derived training token sizing for the code corpora in this repository, produced by `scripts/train-corpus-tokens.mjs`:
1. **The `tr-*` Training Corpus:** 210 project pairs across 30 synthetic families and 7 frameworks, recorded in `pilot/TRAINING_CORPUS.json`.
2. **The Pilot Corpus:** 34 accepted template project pairs across 5 archetypes and 7 frameworks, recorded in `pilot/CORPUS.json`.

Fine-tuning on paired code examples (such as modern web uplift tasks) is dominated by project source files. Measuring only brief prompts severely undercounts corpus volume (by roughly 35×), while measuring the entire written filesystem tree inflates the figure by including generator/harness metadata that models are never trained to produce. This measurement establishes an anchored, reproducible character baseline categorized explicitly by scope.

## Headline Scope: Application Sources, Both Sides of the Pair
The headline training token sizing covers **application sources only** (`app_sources`: server logic, client runtime, markup, styles, and enhance code), and it covers **both sides of every pair** — the input side (the original, pre-uplift tree) plus the output side (the uplifted tree).

That sum is a **serialized pair-volume estimate, not a measurement of generated output**. It is the right figure to price only if a training recipe supplies both sides of each pair once, as the pairing corpus does. A recipe that trains on the uplifted side alone, or that trains on one example per pair rather than two, would be priced at roughly half of it. The input and output characters are therefore reported separately in `tokens.json` (`characters.original`, `characters.uplifted`) so either framing can be derived from the measurement rather than guessed at.

`spec.json` is generator and harness metadata written so runs can be recorded and re-scored; because a model is never asked to generate harness metadata, it is not a training target and is strictly excluded from headline training token sizing.

---

## 1. The `tr-*` Training Corpus (210 Pairs)
Recorded in `pilot/TRAINING_CORPUS.json`, spanning 30 synthetic families (`tr-01` to `tr-30`) across all 7 frameworks (`hono`, `raw`, `react`, `preact`, `vue`, `webcomponents`, `svelte`), with 25 generate families and 5 repair families (`tr-26` to `tr-30`) with injected defects.

| Scope | Original (chars) | Uplifted (chars) | Total (chars) | Derived Tokens | Band (±25%) | Role in Sizing |
|---|---:|---:|---:|---:|---|---|
| **`app_sources`** | **3,029,071** | **3,197,281** | **6,226,352** | **1,556,588** | **[1,167,441, 1,945,735]** | **PRIMARY headline figure** |
| `project_manifest` | 26,190 | 26,190 | 52,380 | 13,095 | [9,821, 16,369] | `package.json` dependencies & scripts |
| `harness_metadata` | 814,218 | 814,218 | 1,628,436 | 407,109 | [305,332, 508,886] | `spec.json` harness metadata (EXCLUDED) |
| `prompt` | 0 | 0 | 0 | 0 | [0, 0] | Measured zero (documented gap; see below) |
| *full_tree (all)* | *3,869,479* | *4,037,689* | *7,907,168* | *1,976,792* | *[1,482,594, 2,470,990]* | *Total on-disk tree for comparison* |

- **Headline Characters (`app_sources`):** **6,226,352 characters** (3,029,071 original + 3,197,281 uplifted)
- **Headline Derived Tokens:** **1,556,588 tokens**
- **Uncertainty Band:** **[1,167,441, 1,945,735] tokens** (±25% margin)
- **Epoch Scaling:** 1 epoch = **1,556,588 tokens**; $N$ epochs = $N \times 1,556,588$ tokens.

> **These figures moved on 2026-10-08** when all 30 families were re-authored to declare their own
> form fields and journeys (`mwg-train-p3e`). The headline went from 1,477,348 to 1,556,588 derived
> tokens, so any cost projection computed from the earlier figure understates the corpus by about
> 5.4%. They are still **derived from characters**, not tokenizer-measured.

---

## 2. The Pilot Corpus (34 Accepted Pairs)
Recorded in `pilot/CORPUS.json` from `pilot/plan.json`, covering 34 accepted template project pairs (omitting `catalogue-vue` which required no warranted changes).

| Scope | Original (chars) | Uplifted (chars) | Total (chars) | Derived Tokens | Band (±25%) | Role in Sizing |
|---|---:|---:|---:|---:|---|---|
| **`app_sources`** | **442,187** | **504,527** | **946,714** | **236,679** | **[177,509, 295,848]** | **PRIMARY headline figure** |
| `project_manifest` | 4,498 | 4,498 | 8,996 | 2,249 | [1,687, 2,811] | `package.json` dependencies & scripts |
| `harness_metadata` | 113,458 | 113,458 | 226,916 | 56,729 | [42,547, 70,911] | `spec.json` harness metadata (EXCLUDED) |
| `prompt` | 0 | 0 | 0 | 0 | [0, 0] | Measured zero (documented gap; see below) |
| *full_tree (all)* | *560,143* | *622,483* | *1,182,626* | *295,657* | *[221,742, 369,571]* | *Total on-disk tree for comparison* |

- **Headline Characters (`app_sources`):** **946,714 characters** (442,187 original + 504,527 uplifted)
- **Headline Derived Tokens:** **236,679 tokens**
- **Uncertainty Band:** **[177,509, 295,848] tokens** (±25% margin)
- **Epoch Scaling:** 1 epoch = **236,679 tokens**; $N$ epochs = $N \times 236,679$ tokens.

---

## Documented Gap: Brief Prompts (Measured Zero)
The `prompt` scope is currently measured as **0 characters** for both corpora. This is an explicit, documented gap:
- For the pilot corpus, `pilot/plan.json` defines template scaffolding targets by archetype and framework without prompt text.
- For the `tr-*` training corpus, authored brief prompts exist in `docs/train/briefs/manifest.jsonl` (disjoint from eval), but they are not compiled into the filesystem trees measured here.
- When dataset formatting serializes brief prompts alongside training code pairs, that prompt text will be incorporated under the `prompt` scope.

---

## How the Headline Token Figures are Derived
Token counts are derived using the repository's single canonical derivation function:
- **Function:** `estimateTokensFromCharacters(characters)` in `src/eval/cost.mjs`
- **Method:** `characters / 4` (~4 characters per token for English prose and code)
- **Margin:** Standard ±25% uncertainty band (`[tokens * 0.75, tokens * 1.25]`)

---

## IMPORTANT: Derived Estimate vs. True Tokenizer Measurement

> **NOTICE:** Every token figure in `tokens.json` and this document is a **DERIVED ESTIMATE** computed from raw character counts (`characters / 4`), **NOT a true tokenizer measurement**.
>
> As explicitly stated in `src/eval/cost.mjs`:
> *"ESTIMATE from characters/4. Replace with an exact count from the training tokenizer before quoting a per-token price."*
>
> The spend boundary and preregistration discipline require that any price sheet presented to the owner state its derivation and uncertainty band plainly. An estimate cannot be cited as a measured fact. While these character-derived figures reliably anchor the order of magnitude (~1.48M tokens for `tr-*`, ~237k tokens for pilot), they must be replaced by a token count from the training tokenizer for the pinned base model (e.g. Qwen BPE tokenizer for `Qwen/Qwen2.5-Coder-7B-Instruct` or `Qwen/Qwen3.8-27B`) before treating any per-token price as a committed quote.

---

## Running the Measurement Tool
`scripts/train-corpus-tokens.mjs` measures either corpus or both, keeping the two sections distinct in `tokens.json`:

```bash
# Measure the pilot corpus (default, backwards-compatible):
node scripts/train-corpus-tokens.mjs

# Measure the tr-* training corpus (all 210 projects):
node scripts/train-corpus-tokens.mjs --corpus training

# Measure both corpora:
node scripts/train-corpus-tokens.mjs --corpus all

# Deterministic run without timestamps:
node scripts/train-corpus-tokens.mjs --corpus training --no-timestamp --out /tmp/t2.json

# Record an exact tokenizer measurement:
node scripts/train-corpus-tokens.mjs --corpus training --tokens <measured_token_count>
```

When `--tokens <integer>` is supplied:
1. `tokens.source` is recorded as `"supplied"`.
2. The supplied count becomes the active figure for `tokens.tokens` and `total_training_tokens`.
3. The derived character estimate and its band are preserved alongside the supplied count for transparency and provenance.

---

## What is NOT Measured / NOT Covered
The figures recorded in `tokens.json` measure the raw application codebase pairs and do **NOT** cover:
1. **Functional / Behavioral Verification (Text-Only):** This measurement is strictly filesystem text. It does **NOT** establish that the projects run, build, or pass tests; browser journeys, server verification, and acceptance outcomes are recorded separately in `records.json` and `YIELD.md`.
2. **Model-Generated Projects:** These are template/synthetic reference pairs, not model-generated candidate outputs.
3. **Evaluation / Holdout Material:** The measured corpora are strictly disjoint from all sealed evaluation manifests (`docs/eval/briefs/manifest.jsonl`, `data/A6_evaluation/targets/manifest.jsonl`).
4. **Uplift-vs-Original Alignment Tokens:** Diff markers, edit sequences, or patch syntax if structured as an edit-prediction task.
5. **Instruction-Format Overhead:** Chat templates, system prompts, role headers (`<|im_start|>user`, `<|im_end|>`), or tool-call framing introduced during dataset serialization.
