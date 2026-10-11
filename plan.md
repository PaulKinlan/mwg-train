# mwg-train — the project plan

> **mwg-train deterministic baseline** — deterministic output of this repository's own tooling, not an official `web-uplift` result.

<!-- snapshot: 8fbd58e 2026-10-11 -->

This is the top-level plan: what the project is for, the pipeline it runs, where it actually is today, and what the next step is. [`docs/PIPELINE.md`](docs/PIPELINE.md) stays the detailed reference — the lifecycle diagram, the trainable-model matrix and the vision/code architecture — and this file is the entry point that points at it. Every figure below was measured from this checkout; "How to check this file" at the end gives the command for each one.

## 1. What this project is for

Does training a code model on Modern Web Guidance-applied sites make it **default** to modern web practice — without being told, without guidance in the prompt, and without a deterministic lint pass afterwards? The answer would be a trained adapter compared against three controls under a preregistered protocol ([`docs/eval/PREREGISTRATION.md`](docs/eval/PREREGISTRATION.md)): **C1** bare base, **C2** base with retrieved guidance in the prompt, **C3** base plus the deterministic uplift tool, and **T** the trained adapter, with cluster-bootstrap decision rules (H1: training beats an unguided base; H2: training is non-inferior to being handed the guidance).

Today this repository is the **instrument** for that experiment rather than the answer to it. The corpora, targets, measurement code, verification checks and evaluation harness exist and are exercised; **no model has been trained and no sealed evaluation has been run** (§4). The thing that makes the eventual claim checkable is not the training run but everything here that the training run must not be able to fake.

## 2. The eight-step lifecycle (Paul, 2026-10-10)

[`docs/PIPELINE.md`](docs/PIPELINE.md) §0 carries this in full, with the diagram and the trainable-model matrix; it is Paul's lifecycle, quoted there, and this is the one-line version of each step:

1. **Select and qualify a trainable model** — open weights or verified hosted fine-tuning; a zero-shot vertical slice must build a working app before any bulk generation.
2. **Build the untouched baseline** — the base model generates sites from the training-side specs; its defects are the empirical floor to improve from.
3. **Cordon off the baseline checkpoint** — the raw outputs and the exact model revision, immutable, as the default comparator.
4. **Evaluate the baseline with MWG / web-uplift** — measure exactly which rules passed and failed.
5. **Improve the demos into the training set** — apply MWG and uplift until they meet the visual, functional and MWG criteria; this is the training set.
6. **Re-evaluate to confirm outcomes** — function, accessibility, visual match and rights clearance.
7. **Train the adapter** on the rights-cleared, disjoint `(spec -> uplifted code)` dataset.
8. **Rebuild, compare, measure** — 8a a paired diagnostic rebuild of the same demos with base vs trained model; 8b the sealed evaluation, run once, across C1/C2/C3/T.

Steps 2–6 are what the deterministic stages in §3 automate. Step 7 is the one step with no code path yet (§6), and step 8 cannot start until it exists.

## 3. The seven deterministic stages, and their state today

| # | Stage | Command | State today | Artifact |
| --- | --- | --- | --- | --- |
| 1 | **BRIEFS** | `npm run check:briefs` | **Built and active.** 79 sealed held-out briefs, validated down to a pinned seal: `sha256:89a1f47d638c5eab733074d87bc19d6615401aeb9a77ecbd86cf10b443e272b1`. | [`docs/eval/briefs/manifest.jsonl`](docs/eval/briefs/manifest.jsonl) |
| 2 | **RULES** | `npm run check:rules-pin` (pin drift); `node scripts/extract-mwg-rules.mjs` to re-extract | **Built and active.** The rule vocabulary is pinned to a Modern Web Guidance snapshot and its pin is checked. | [`docs/eval/rules.json`](docs/eval/rules.json) |
| 3 | **GENERATE** | `npm run pilot:scaffold`, `npm run scaffold:train-corpus` | **Built and active.** Two corpora: the pilot (35 planned, 34 accepted; 25 directories on disk and 10 manifest-only projects materialised at serve time) and the training corpus (210 projects = 30 families x 7 frameworks, 210 accepted). | [`pilot/CORPUS.json`](pilot/CORPUS.json), [`pilot/TRAINING_CORPUS.json`](pilot/TRAINING_CORPUS.json) |
| 4 | **MEASURE** | `npm run pilot:run` | **Built and active.** Drives each project in a real browser: journeys, rule measurements, accept/reject with the deciding detail. | run records under `pilot/out/<run>/` |
| 5 | **RECORD / VERIFY** | `npm run pilot:corpus` / `npm run check:pilot-corpus`, `npm run check:specs`, `npm run check:disjoint` | **Built and active.** The record is committed and re-derivable; every family rebuilds from its spec to the same tree hashes; the anti-leakage gate fails closed. | [`pilot/CORPUS.json`](pilot/CORPUS.json), per-family rebuild hashes, [`src/train/disjoint.mjs`](src/train/disjoint.mjs) |
| 6 | **PRICE** | `npm run price:two-backends` | **Built and active.** Every rate is read from a verified quote; Fireworks managed training is 0.5 USD per 1M training tokens, the rented A100 is 1.99 USD per GPU-hour. | [`docs/eval/two-backends.md`](docs/eval/two-backends.md) |
| 7 | **TRAIN** | *(no command runs a fine-tune)* | **Seam built, never run.** The backend-agnostic interface and both backends exist, with a comparability assertion so two adapters can only be compared when their base revision, corpus hash and tokenizer agree. **No training run has been executed and no `npm run` script drives one.** | [`src/train/seam.mjs`](src/train/seam.mjs), [`src/train/backends/`](src/train/backends), precondition `npm run check:train-evidence` |

Two qualifications that belong in the plan rather than in a footnote:

- **The training corpus's own verification is partial and the repository says so.** Of the 210 training projects, 40 were driven in a real browser through their journeys (384 journeys driven, 340 passed) and **170 are `scaffolded / unverified journey`** — a scaffold record says what was built, not that it runs. The token figure, **2,748,147 derived tokens** (band 2,061,110–3,435,183), is derived from characters rather than measured with a tokenizer, and is labelled an estimate where it is quoted. See [`docs/train/corpus/YIELD.md`](docs/train/corpus/YIELD.md).
- **The deterministic uplift is a control, not the training target.** For GENERATE families it is the free mechanical floor (labels, landmarks, contrast, autofill, sanitised HTML); it cannot repair a broken data model or missing persistence. The gap between that floor and the target is exactly what training is supposed to close. The per-family split is in [`docs/PIPELINE.md`](docs/PIPELINE.md).

## 4. Where it is right now

| Fact | Value | How it was measured |
| --- | --- | --- |
| `origin/main` | `8fbd58e` (2026-10-11) | `git log -1 --format='%h %ad' --date=short origin/main` |
| Last full gate on main | 793 tests, **792 pass, 0 fail, 1 skipped** | the merger's cached gate for tree `356dedf4…`, recorded in the `8fbd58e` merge commit |
| Sealed evaluation set | 5 archetype targets, each with a signature; the held-out briefs seal at `sha256:89a1f47d638c5eab733074d87bc19d6615401aeb9a77ecbd86cf10b443e272b1` | [`data/A6_evaluation/targets/manifest.jsonl`](data/A6_evaluation/targets/manifest.jsonl), the seal pinned in [`package.json`](package.json) |
| Training families | 30 families (`tr-01`..`tr-30`), 60 briefs (50 generate, 10 repair), 210 projects across 7 frameworks | `jq` over [`docs/train/briefs/manifest.jsonl`](docs/train/briefs/manifest.jsonl), [`pilot/TRAINING_CORPUS.json`](pilot/TRAINING_CORPUS.json) |
| Training-side specs | 30 `plan.md` and 30 `design.md`, checked by `npm run check:train-design` | [`docs/train/design/`](docs/train/design) |
| Designed reference boards | 30 boards, one per family, generated 2026-10-11 and registered with model, digest and prompt digest | [`docs/design/training/`](docs/design/training), [`docs/provenance/assets/training-reference-boards.md`](docs/provenance/assets/training-reference-boards.md) |
| A1 conformance instruments | 30 harness renders, served from the manifest, never from the directory listing | [`data/A1_self_generated/targets/manifest.jsonl`](data/A1_self_generated/targets/manifest.jsonl) |
| Pilot corpus | 35 planned (35 attempted), 34 accepted, yield 0.971, recorded 2026-10-08 | [`pilot/CORPUS.json`](pilot/CORPUS.json) (`generated_at`) |
| Training corpus | 210 projects, 210 accepted, recorded 2026-10-10 | [`pilot/TRAINING_CORPUS.json`](pilot/TRAINING_CORPUS.json) |
| Viewer | `npm run viewer -- --corpus pilot`, two ports: 7700 the evidence viewer, 7701 the sandboxed live origin | [`README.md`](README.md), [`src/viewer/server.mjs`](src/viewer/server.mjs) |
| Quarantine store | a private companion repo; **no promotion has ever been made** — the ledger `docs/provenance/promotions.jsonl` (absent) has never been created | [`docs/quarantine.md`](docs/quarantine.md), [`scripts/promote.mjs`](scripts/promote.mjs) |

The landings that put the pipeline where it is:

| Date | What landed | Commit |
| --- | --- | --- |
| 2026-10-08 | Independent A1 target designs and the scaffolded `tr-*` project corpus | `76db446` |
| 2026-10-08 | The disjoint training corpus and the fail-closed anti-leakage gate (bead `mwg-train-0ov`) | `3bef571` |
| 2026-10-08 | The backend-agnostic training seam, Fireworks managed plus a cluster stub (bead `mwg-train-rff`) | `4b2cec7` |
| 2026-10-10 | `pilot/TRAINING_CORPUS.json` — 210 accepted projects, 2,748,147 derived tokens | — |
| 2026-10-11 | The 30 designed reference boards, regenerated and registered (bead `mwg-train-mhd`) | `88eeb13` |
| 2026-10-11 | The build key: archetype x framework x model recorded on every build (bead `mwg-train-gzi`) | `2927784` |
| 2026-10-11 | `/concepts` shows all 30 training families, designed board beside harness instrument (bead `mwg-train-0xc`) | `8fbd58e` |

## 5. What is in flight — and why it is not pipeline progress

The work in progress today is almost all **step-2 input**: the material the base model will be asked to generate from, and the corpus it will be trained on. It is not movement through stages 1–7, and reading it as progress is the mistake this plan exists to prevent.

- **Archetype type coverage** (`mwg-train-efg`, in progress): the 30 families vary mostly in *subject*, not in *type* — they are 30 flavours of one community/civic site, against the wider archetype list Paul asked for. Until that is fixed, the corpus tests one site type well and the rest thinly.
- **The archetype asset store** (`mwg-train-fom`, closed; `mwg-train-o3t`, in progress): a shared per-archetype asset set (brand, palette, typography, copy, state boards) now exists under `assets/archetypes/<archetype>/`; **nothing consumes it yet**, which is `o3t`. Paul's reason is generation, not tidiness: a build that cannot see the brand or the imagery cannot render the intended UI, and the failure then looks like a weak model rather than a missing input.
- **Corpus-record correctness** (`mwg-train-210`, open): the raw default output and the post-uplift ideal must be distinct sets, and the record currently calls the uplifted artefact "baseline", which is the opposite object.
- **Spec confirmation** (`mwg-train-qyt`, open): whether the 30 per-family `plan.md`/`design.md` specs match what Paul asked for — a check on step-2 input, not on the pipeline.

Stages 1–6, by contrast, are done: they are wired into `npm test` through `npm run check:all`, and the gate that just ran on main covers all of them.

## 6. The next step, and who owns it

**Stage 7 — run the training.** Everything it needs is in place: a 210-project, 210-accepted, rights-cleared, disjoint corpus ([`pilot/TRAINING_CORPUS.json`](pilot/TRAINING_CORPUS.json)), the prerequisite evidence check (`npm run check:train-evidence`), the seam and both backends ([`src/train/seam.mjs`](src/train/seam.mjs)), and a priced comparison of the two backends ([`docs/eval/two-backends.md`](docs/eval/two-backends.md)). What does not exist is a command that performs a fine-tune, or a bead that owns the first run.

So the next step has two parts, and only the first can be done on this VM:

1. **Decide and file it** — a bead that names the base checkpoint, the backend, the method and the budget, and that treats the first run as a *zero-shot qualification plus a small vertical slice* before any full-corpus run. No bead exists today; this is a planning decision, not an engineering one.
2. **Run it where there is a GPU.** This VM has 2 vCPU and no training GPU ([`docs/PIPELINE.md`](docs/PIPELINE.md) §1), so the run belongs on Fireworks managed training or a rented cluster, driven through the seam. The cost inputs for that decision are already priced in stage 6.

Until then, stage 8 (the sealed evaluation) cannot start, because arm **T** does not exist — and the sealed set must be run once, on the final protocol, not rehearsed.

## 7. Open questions with owners

| Question | State | Owner |
| --- | --- | --- |
| Does the corpus cover the archetype **types** Paul asked for, not just 30 subjects? | Open. `mwg-train-efg` is defining the type axis and mapping the existing 30 onto it. | `mwg-train-efg` (in progress) |
| Does every framework build draw on its archetype's asset set? | Half open. The store landed; the consumption half is `mwg-train-o3t`. | `mwg-train-o3t` (in progress) |
| Per-archetype, per-framework, or per-model keying? | Answered for *measurement*, open for *assets*. A build is keyed archetype x framework x model in code (bead `mwg-train-gzi`, `2927784`), so two builds of one archetype in different frameworks, or by different models, are never confused. What is still open is whether the shared asset set is keyed per archetype alone or per archetype *and* framework where the framework genuinely changes the resource — a question `mwg-train-fom` recorded for its owner and left unanswered, and one that bites again in `mwg-train-o3t`. | `mwg-train-o3t` / `mwg-train-fom` (mhd) |
| Which brand is the booking archetype? Its boards say "Evening Class Studio" and its demo page says "Learning Hub". | Open, and a product decision rather than a code bug — the existing adjudication in the tree is marked PROVISIONAL. Carries the `needs-paul` label. | **Paul** (via `mwg-train-4xg`) |
| What is the **rollback** if a quarantined asset is promoted into the public tree? | **Open, and unowned.** Promotion is explicit and append-only: [`scripts/promote.mjs`](scripts/promote.mjs) appends to `docs/provenance/promotions.jsonl` (absent) and refuses a target that already exists, so a promotion can only ever add. No promotion has been made — the ledger has never been created — `grep -rniE 'roll.?back' docs/ scripts/ src/` returns nothing, and a public commit cannot be unpublished. The cordon is well built on the way in and undocumented on the way back. | **unassigned** |
| What does the first training run cost, per backend, per accepted pair? | Deferred. `mwg-train-f92` holds the projection. | `mwg-train-f92` (deferred) |

## 8. The four roles

Straight from [`docs/PIPELINE.md`](docs/PIPELINE.md), because a plan that cannot say which artefact is an instrument and which is training data is how a training set gets contaminated:

- **EVAL INSTRUMENT** — the sealed briefs, the pinned rules and the measured pairs (stages 1–2, 4–5). It measures; it is **never** consumed as training data. The A6 targets in [`data/A6_evaluation/`](data/A6_evaluation) are the sealed design hashes training must never see.
- **BASELINE** — the raw generated sites (stage 3). What the model produces today, kept to measure improvement **from**.
- **TRAINING SOURCE** — the disjoint corpus generated for stage 7. Accepted pairs from this corpus, and only these, may become training data.
- **COST INPUT** — the pricing evidence (stage 6), which decides where generation runs.

One more artefact needs naming because it is easy to misread: the 30 designed reference boards under [`docs/design/training/`](docs/design/training) are **planning references, not training data and not evaluation targets**. They are teacher-generated (`A3_teacher_generated`), quarantined from training and registered as such in [`docs/provenance/assets/training-reference-boards.md`](docs/provenance/assets/training-reference-boards.md). The A1 conformance instrument beside each family is a different file — a render of the family's authored board.

## 9. How to check this file

```bash
node --test test/plan.test.mjs      # this file's own checks: sections, commands, paths, seal, snapshot
git log -1 --format='%h %ad' --date=short origin/main
npm run check:briefs                # the seal quoted in stage 1
jq '.summary' pilot/TRAINING_CORPUS.json    # 30 families, 7 frameworks, 210 projects
jq '.summary' pilot/CORPUS.json             # 35 attempted, 34 accepted, yield 0.971
ls docs/design/training/*/reference.jpg | wc -l
npm run check:train-design
npm run viewer -- --corpus pilot    # stages 3-5 as a page, on :7700
```

The test fails if this file cites an `npm run` script that does not exist, a repository path that is not there (or calls a path absent when it now exists), a relative link that does not resolve, a commit sha that is not in history or a landings row whose date disagrees with its commit, a seal that has moved, or a snapshot commit that is not in history — and if a training command ever appears in `package.json` while stage 7 still claims none exists. When a stage's state changes, change its row and move the snapshot marker at the top of this file; do not add a second copy of the state anywhere else.
