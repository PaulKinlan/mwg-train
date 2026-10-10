# The mwg-train pipeline

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Seven stages, each with a nameable input and output. To guarantee the eval remains honest and the training
data attributable, stages that measure or price prior work consume only their recorded output, and
the measurement step generates its corpus fresh to ensure it measures exactly what the generator produces today.

| # | Stage | Command | Consumes | Produces |
|---|-------|---------|----------|----------|
| 1 | **BRIEFS** | `npm run check:briefs` | `docs/eval/briefs/manifest.jsonl` | zero-exit-code validation of the sealed eval inputs (seal `sha256:89a1f47d…`) |
| 2 | **RULES** | `node scripts/extract-mwg-rules.mjs --skill-dir <installed skill dir> --out docs/eval/rules.json` | Modern Web Guidance (the skill, installed locally) | `docs/eval/rules.json` — the required MWG rules per brief |
| 3 | **GENERATE** | `npm run pilot:scaffold` | `pilot/plan.json` (archetypes × frameworks × seeded defects) | `pilot/projects/` — the reviewable on-disk baseline sites |
| 4 | **MEASURE** | `npm run pilot:run` | `pilot/plan.json` (regenerated fresh into `.pilot-corpus/<runId>`) + the determinism rules | run records under `pilot/out/<run>/`: browser journeys, rule measurements, accept/reject decisions, and the yield report |
| 5 | **RECORD / VERIFY** | `npm run pilot:corpus` / `npm run check:pilot-corpus` | a completed run under `pilot/out/<run>/` | `pilot/CORPUS.json` — the committed record of what was measured (tree SHAs, acceptance, improved rules); `--verify` re-derives all of it |
| 6 | **PRICE** | `npm run price:two-backends` | `docs/eval/quotes.jsonl` + `docs/pilot/yield.json` | cost per accepted pair, Fireworks vs the cluster (`docs/eval/two-backends.md`) |
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
