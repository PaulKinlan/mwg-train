# The mwg-train pipeline

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Seven stages, each with a nameable input and output. Nothing downstream of a stage may use
anything except that stage's recorded output — that is what makes the eval honest and the training
data attributable.

| # | Stage | Command | Consumes | Produces |
|---|-------|---------|----------|----------|
| 1 | **BRIEFS** | `npm run check:briefs` | the eval brief manifest, sealed | `docs/eval/briefs/manifest.jsonl` — sealed eval inputs (seal `sha256:91d75f29…`) |
| 2 | **RULES** | `node scripts/extract-mwg-rules.mjs --skill-dir <installed skill dir> --out docs/eval/rules.json` | the sealed briefs + Modern Web Guidance | `docs/eval/rules.json` — the required MWG rules per brief |
| 3 | **GENERATE** | `npm run pilot:scaffold` | the plan (`pilot/plan.json`) over archetypes × frameworks × seeded defects | `pilot/projects/` — the on-disk corpus of original (BASELINE) sites |
| 4 | **MEASURE** | `npm run pilot:run` | the generated corpus + the rules | run records under `pilot/out/<run>/`: browser journeys, rule measurements, accept/reject decisions (drives headless journeys, verifies yield) |
| 5 | **RECORD / VERIFY** | `npm run pilot:corpus` / `npm run check:pilot-corpus` | a completed run | `pilot/CORPUS.json` — the committed record of what was measured (tree SHAs, acceptance, improved rules); `--verify` re-derives all of it |
| 6 | **PRICE** | `npm run price:two-backends` | the accepted pairs + provenance-checked quotes | cost per accepted pair, Fireworks vs the cluster (`docs/eval/two-backends.md`) |
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
