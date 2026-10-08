# Training Corpus Token Size and Derivation

## Overview
This directory records the empirical character measurements and derived training token sizing for the training corpus, produced by `scripts/train-corpus-tokens.mjs`.

Fine-tuning on paired code examples (such as modern web uplift tasks) is dominated by the project source files. Measuring only brief prompts severely undercounts corpus volume (by roughly 35×), while measuring the entire written filesystem tree inflates the figure by including harness/generator metadata that models are never trained to produce. This measurement establishes an anchored, reproducible character baseline categorized explicitly by scope.

## Headline Scope: Application Sources, Both Sides of the Pair
The headline training token sizing covers **application sources only** (`app_sources`: server logic, client runtime, markup, styles, and enhance code), and it covers **both sides of every accepted pair** - the input side (the original, pre-uplift tree) plus the output side (the uplifted tree).

That sum is a **serialized pair-volume estimate, not a measurement of generated output**. It is the right figure to price only if a recipe supplies both sides of each pair once, as the pairing corpus does. A recipe that trains on the uplifted side alone, or that trains on one example per pair rather than two, would be priced at roughly half of it. The input and output characters are therefore reported separately in `tokens.json` (`characters.original`, `characters.uplifted`) so either framing can be derived from the measurement rather than guessed at.

`spec.json` is generator and harness metadata written by the pilot so runs can be recorded and re-scored; because a model is never asked to generate harness metadata, it is not a training target and is strictly excluded from headline training token sizing.

## Measurement by Scope
Across the 34 accepted project pairs from `pilot/plan.json` (filtered against `pilot/CORPUS.json`, omitting `catalogue-vue` which required no warranted changes):

| Scope | Original (chars) | Uplifted (chars) | Total (chars) | Derived Tokens | Band (±25%) | Role in Sizing |
|---|---:|---:|---:|---:|---|---|
| **`app_sources`** | **442,187** | **504,527** | **946,714** | **236,679** | **[177,509, 295,848]** | **PRIMARY headline figure** |
| `project_manifest` | 4,498 | 4,498 | 8,996 | 2,249 | [1,687, 2,811] | `package.json` dependencies & scripts |
| `harness_metadata` | 113,458 | 113,458 | 226,916 | 56,729 | [42,547, 70,911] | `spec.json` harness metadata (EXCLUDED) |
| `prompt` | 0 | 0 | 0 | 0 | [0, 0] | Measured zero (documented gap; see below) |
| *full_tree (all)* | *560,143* | *622,483* | *1,182,626* | *295,657* | *[221,742, 369,571]* | *Total on-disk tree for comparison* |

### Documented Gap: Brief Prompts (Measured Zero)
The `prompt` scope is currently measured as **0 characters**. This is a known gap: `pilot/plan.json` defines template scaffolding targets by archetype and framework rather than text prompts. While authored brief prompts exist in `docs/train/briefs/manifest.jsonl` for the synthetic `tr-*` families, those briefs are strictly disjoint and not tied to these template pilot projects. When brief prompts accompany training pairs, they will be incorporated under the `prompt` scope.

## How the Headline Token Figure is Derived
Token counts are derived using the repository's single canonical derivation function:
- **Function:** `estimateTokensFromCharacters(characters)` in `src/eval/cost.mjs`
- **Method:** `characters / 4` (~4 characters per token for English prose and code)
- **Primary Characters:** **946,714 characters** (`app_sources` + `prompt`)
- **Headline Derived Tokens:** **236,679 tokens**
- **Uncertainty Band:** **[177,509, 295,848] tokens** (the standard ±25% margin defined by `estimateTokensFromCharacters`)
- **Epoch Scaling:** For 1 epoch, total training tokens equal **236,679**. For $N$ epochs, total training tokens scale as $N \times 236,679$.

---

## IMPORTANT: Derived Estimate vs. True Tokenizer Measurement

> **NOTICE:** The token figure in `tokens.json` is a **DERIVED ESTIMATE** computed from raw character counts (`characters / 4`), **NOT a true tokenizer measurement**.
>
> As explicitly stated in `src/eval/cost.mjs`:
> *"ESTIMATE from characters/4. Replace with an exact count from the training tokenizer before quoting a per-token price."*
>
> The spend boundary and preregistration discipline require that any price sheet presented to the owner state its derivation and uncertainty band plainly. An estimate cannot be cited as a measured fact. While this character-derived figure reliably anchors the order of magnitude (~237k tokens, range 178k–296k for application sources), it must be replaced by a token count from the training tokenizer for the pinned base model (e.g. Qwen BPE tokenizer for `Qwen/Qwen2.5-Coder-7B-Instruct` or `Qwen/Qwen3.8-27B`) before treating any per-token price as a committed quote.

---

## Replacing with a Pinned Tokenizer Count
When an exact token count is obtained by running the training tokenizer across the materialized training pairs, supply the measured integer to the CLI:

```bash
# Record an exact tokenizer measurement:
node scripts/train-corpus-tokens.mjs --tokens <measured_token_count>
```

When `--tokens <integer>` is supplied:
1. `tokens.source` is recorded as `"supplied"`.
2. The supplied count becomes the active figure for `tokens.tokens` and `total_training_tokens`.
3. The derived character estimate and its band are preserved alongside the supplied count for transparency and provenance.

## What is NOT Covered
The figures recorded in `tokens.json` measure the raw application codebase pairs and do **NOT** cover:
1. **Model-Generated Projects:** These are template-scaffolded and deterministically uplifted reference pairs, not model-generated candidate outputs.
2. **Evaluation / Holdout Material:** The measured corpus is strictly disjoint from all sealed evaluation manifests (`docs/eval/briefs/manifest.jsonl`, `data/A6_evaluation/targets/manifest.jsonl`).
3. **Uplift-vs-Original Alignment Tokens:** Diff markers, edit sequences, or patch syntax if structured as an edit-prediction task.
4. **Instruction-Format Overhead:** Chat templates, system prompts, role headers (`<|im_start|>user`, `<|im_end|>`), or tool-call framing introduced during dataset serialization.
