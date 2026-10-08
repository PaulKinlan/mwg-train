# Training Corpus Token Size and Derivation

## What these projects are (and are not)

The `tr-*` corpus is **archetype-template projects with independent targets and verified harness journeys** — not brief-faithful implementations. Concretely:

- **Fields and journey come from the archetype, not the brief.** Each project is scaffolded from its family's **archetype** template (looked up in `pilot/training-archetypes.mjs`); the form fields and the journey are that archetype's, not the brief's. Only the title, story, and routes are relabelled to the brief's topic.
- **A project does not implement its brief's specific flow.** For example, the `tr-26` brief describes a coffee-subscription renewal, but its generated project is the archetype's generic `web-shop` form with `items`/`collection` fields, and its journey fills those archetype values rather than the brief's subscription fields.
- **What was verified is the harness journey, not brief conformance.** 40 of the 210 projects were driven in a real browser through the pilot's harness and passed its journeys (see `YIELD.md`); that verifies the harness journeys, not conformance to the briefs.
- The remaining 170 projects carry the status `scaffolded / unverified journey`; no project has been shown to build or serve beyond those sampled 40.
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
| **`app_sources`** | **2,886,579** | **3,022,814** | **5,909,393** | **1,477,348** | **[1,108,011, 1,846,685]** | **PRIMARY headline figure** |
| `project_manifest` | 26,190 | 26,190 | 52,380 | 13,095 | [9,821, 16,369] | `package.json` dependencies & scripts |
| `harness_metadata` | 707,706 | 707,706 | 1,415,412 | 353,853 | [265,390, 442,316] | `spec.json` harness metadata (EXCLUDED) |
| `prompt` | 0 | 0 | 0 | 0 | [0, 0] | Measured zero (documented gap; see below) |
| *full_tree (all)* | *3,620,475* | *3,756,710* | *7,377,185* | *1,844,296* | *[1,383,222, 2,305,370]* | *Total on-disk tree for comparison* |

- **Headline Characters (`app_sources`):** **5,909,393 characters** (2,886,579 original + 3,022,814 uplifted)
- **Headline Derived Tokens:** **1,477,348 tokens**
- **Uncertainty Band:** **[1,108,011, 1,846,685] tokens** (±25% margin)
- **Epoch Scaling:** 1 epoch = **1,477,348 tokens**; $N$ epochs = $N \times 1,477,348$ tokens.

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
