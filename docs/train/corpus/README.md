# Training Corpus Token Size and Derivation

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

## What these projects are (and are not)

The `tr-*` corpus is **brief-authored projects**: each project's form controls are declared in its own brief, and its targets are independent of the evaluation set. All 30 families declare their schema and all 210 projects are built from it (`schema_source: "brief"`). What that does and does not establish:

- **The form is the brief's.** Each family declares its own `fields` and `journey` in `docs/train/briefs/manifest.jsonl`. The rendered project carries those controls - names and types, labels, requiredness and select options (the spec record holds slug/name/type/autocomplete; the rest is in the rendered source). The `tr-26` brief describes a coffee-subscription renewal and its project has subscription controls (`subscriber`, `beans`, `grind`, `frequency`, `bags`).
- **The journey drives the brief's form, but is still one page and one submit.** The harness fills the brief's inputs, chooses its selects, submits once, and waits for the echoed value on the read page. It does **not** span more than one page, so `tr-05`'s brief flow (register, log out, log back in) is not driven; and where a brief describes search, filtering, or updating an existing record, the journey still creates a new one. The 40/40 acceptance below is those journeys passing on those trees - it is **not** brief-flow conformance.
- **Routes: 29 of 30 families declare every route their brief lists**, checked by `npm run check:route-conformance` (comparing placeholder-insensitively, so `/bookings/:id` matches `/bookings/:ref`). `tr-05` is excused by an explicit waiver: it needs `/login` and `/volunteer/profile`, which the shared builder cannot serve at all (no login page, no login POST, no logout; the builder bead owns that). The waiver is checked both ways - a family that starts declaring its excused routes fails as a stale waiver.

  **Declaring a route is not serving it.** The emitted `spec.json` carries every route, but the generated server handles only some of them, so a declared `list` route at, say, `/courses` answers 404. `npm run check:served-routes` measures that against real servers and `docs/train/corpus/SERVED.md` records what it found. The per-project `route_conformed` field is narrower than it sounds: it compares only the **write** route, so it reads `true` for `tr-05`.
- **The archetype still supplies the server shape** (`pilot/training-archetypes.mjs`): how a record is stored and read back, and the routes' kinds. The form comes from the brief; the journey driven through it is the generic one described above, not the brief's own flow.
- **What was verified, and what was not.** 40 of the 210 projects were driven in a real browser through those journeys and passed (see `YIELD.md`). The other 170 carry `scaffolded / unverified journey`, and none has been shown to build or serve beyond the sampled 40. `npm run check:brief-schema -- --expect-all` holds the field-level claim true for all 30 families - that every family declares a buildable schema, its journey fills every non-select field its own brief marks required, and it chooses an option for every select its brief marks required (all 52 of them) - but no check establishes that a project implements its brief's whole flow.
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
| **`app_sources`** | **5,422,320** | **5,570,266** | **10,992,586** | **2,748,147** | **[2,061,110, 3,435,183]** | **PRIMARY headline figure** |
| `project_manifest` | 26,190 | 26,190 | 52,380 | 13,095 | [9,821, 16,369] | `package.json` dependencies & scripts |
| `harness_metadata` | 949,073 | 949,073 | 1,898,146 | 474,537 | [355,902, 593,171] | `spec.json` harness metadata (EXCLUDED) |
| `prompt` | 0 | 0 | 0 | 0 | [0, 0] | Measured zero (documented gap; see below) |
| *full_tree (all)* | *6,397,583* | *6,545,529* | *12,943,112* | *3,235,778* | *[2,426,834, 4,044,723]* | *Total on-disk tree for comparison* |

- **Headline Characters (`app_sources`):** **10,992,586 characters** (5,422,320 original + 5,570,266 uplifted)
- **Headline Derived Tokens:** **2,748,147 tokens**
- **Uncertainty Band:** **[2,061,110, 3,435,183] tokens** (±25% margin)
- **Epoch Scaling:** 1 epoch = **2,748,147 tokens**; $N$ epochs = $N \times 2,748,147$ tokens.

> **These figures have now moved four times, and what moved them is worth reading.** On
> 2026-10-08 the headline went 1,477,348 → 1,556,588 → 1,550,364 while all 30 families were re-authored
> to declare their own form controls (`mwg-train-p3e`); the middle figure was measured before a fix
> changed every generated server's required-field list, so it described a corpus that no longer existed.
>
> Then it went **1,550,364 → 2,615,747**, and that is not another generator bug: the measurement was last
> re-run on 2026-10-08 and the generator changed repeatedly afterwards - draft prefill carried into form
> fields, an explicit `next` override on the step POST, multi-step journeys, search and update flows -
> without anyone re-running it. Nothing recomputed it, so it drifted silently. `train:tokens` is defined
> in `package.json` but was wired into no gate, unlike the corpus tree hash, which a hard-requirement test
> does guard. A test now re-measures the corpus and fails when the committed record disagrees.
>
> The fourth move is this one: **2,615,747 → 2,748,147**, and its cause is a fix rather than a drift. The
> fifteen training families that declare a `list` route now opt in to the derived list-page handlers
> (`mwg-train-ndr`), so each of their generated servers carries a handler and a page renderer it previously
> did not - the honest cost of serving the route the brief declares instead of four hardcoded paths. The
> trees grew by about 5% and the measurement moved with them, which is what the gate added in the previous
> move is for: the record and the figures quoted from it move together, or the test fails.
>
> A cost projection built from the pre-2026-10-10 figure is off by up to 68.7% at the headline. The
> figures remain derived from characters rather than tokenizer-measured, so the ±25% band is the residual
> uncertainty, not a correction for this.
>
> The `full_tree` and `harness_metadata` scopes moved again on `mwg-train-7d6` (`harness_metadata`
> 395,899 → **408,572**, `full_tree` 1,959,357 → **1,972,031**) because the scaffold now declares each
> brief's listing-detail route rather than dropping it. The **headline is unchanged**: `app_sources`
> excludes `spec.json`, which is the only thing that grew.

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
> The spend boundary and preregistration discipline require that any price sheet presented to the owner state its derivation and uncertainty band plainly. An estimate cannot be cited as a measured fact. While these character-derived figures reliably anchor the order of magnitude (~1.55M tokens for `tr-*`, ~237k tokens for pilot), they must be replaced by a token count from the training tokenizer for the pinned base model (e.g. Qwen BPE tokenizer for `Qwen/Qwen2.5-Coder-7B-Instruct` or `Qwen/Qwen3.8-27B`) before treating any per-token price as a committed quote.

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
