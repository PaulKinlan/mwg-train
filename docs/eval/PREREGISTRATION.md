# Preregistration: the MWG-train evaluation

- **Status:** DRAFT — not yet sealed. The seal hash is recorded in §13 when the brief manifest is
  frozen and the run is about to start.
- **Version:** 1.0, 2026-10-08.
- **Scope:** the primary endpoint, the arms, the split protocol, the analysis plan and the decision
  rules for the first training run. Written before any training data was produced, which is the
  point of it.

This document is binding on the first run. Anything changed after the seal is a **deviation**, and
deviations are recorded with a date and a reason in §14; results may only be reported against the
sealed hash they were produced under.

The invariants this document relies on are enforced by code, not described:
`src/eval/prereg.mjs` (whole-family splits, property-set invariance, rule vocabulary) and
`scripts/validate-briefs.mjs` (the gate, plus `--seal`). The held-out briefs themselves follow
[`briefs/SCHEMA.md`](briefs/SCHEMA.md).

## 1. The question

Does supervised fine-tuning on the MWG corpus produce a model that builds a *working, modern,
accessible* web project from a brief **better than simply supplying the same guidance at inference
time**?

The programme's design brief (section 4) is explicit that this is the question. A trained adapter
that beats an unguided base but loses to "base + the applicable guides in the prompt" has learned to
imitate a style, not to apply rules, and the intervention that actually works is retrieval, not
training. So the primary comparison is against the strongest control, not the weakest.

## 2. Arms

Four arms, compared at **equal inference budget** (same prompt scaffold, same decoding parameters,
same retry policy, same token ceiling — see §5):

| arm | what runs | trained | MWG guidance at inference |
| --- | --- | --- | --- |
| **C1** bare base | frozen base model | no | none |
| **C2** base + MWG prompt | same base, applicable guides supplied in the prompt | no | retrieved guides |
| **C3** base + uplift tool | same base, then the deterministic MWG uplift applied to its output | no | deterministic tool |
| **T** trained adapter | the adapter produced by the first run | yes | none |

A fifth arm is **descriptive only and never part of the primary comparison**: the teacher model
(quarantined provenance; see `docs/provenance/README.md`). It is run to bound how much of the
teacher's ability the student reached, and its outputs are excluded from training.

Guidance in C2 is retrieved per brief from the pinned snapshot (`docs/eval/rules.json`,
`rule_set_hash`), using the same applicability map the oracle uses, so C2 is not handicapped by a
bad retriever. This is deliberately generous to the control: the comparison is "does training beat
the guidance", not "is our retrieval better than our training".

## 3. The primary endpoint

**A held-out brief passes** when all five of the following hold for the generated project:

1. **Runnable.** It installs/builds with the pinned toolchain and starts, with no manual repair.
2. **Functional task.** Every `journey` in the brief completes, and every `assertion` is true —
   including the reload that re-reads server-side state.
3. **Applicable MWG checks.** Every rule in the brief's `required_rules` is demonstrably applied.
   The rule bundle is fixed by the brief, **not** by what the model chose to build.
4. **No blocker accessibility finding.** Labels associated with inputs, keyboard operability of
   every interactive control, visible focus, no keyboard trap, accessible names, and errors
   announced and associated with their field.
5. **No blocker security finding.** Session cookie attributes, authorisation on owner-scoped
   resources, no secrets in client code, no unsanitised injection into HTML, and state-changing
   endpoints not reachable cross-site without a token.

**Primary estimand.** The proportion of held-out test briefs that pass, in each arm. Reported with
a 95% confidence interval from a **cluster bootstrap that resamples prompt families**, not
individual briefs: variants of one family are not independent observations, and resampling briefs
would produce intervals that are too narrow and decisions that are too confident.

**The applicable-rule denominator is the brief's, not the build's.** A model cannot win by omitting
the login, the form or the journey that would have carried the rule: missing a declared route or
journey is a functional failure (criterion 2), which is why `routes` and `journeys` are part of the
brief and not of the output.

Individual check denominators and applicability are published per rule id, per archetype and per
family (§7). An aggregate number without them is not a result.

## 4. Hypotheses and decision rules

Let δ(X) be the cluster-bootstrap point estimate of `pass_rate(T) − pass_rate(X)`, and let
`[lo, hi]` be its 95% interval. The minimum effect of interest is **+10 percentage points**; the
non-inferiority margin against the strong controls is **−5 percentage points**.

| # | hypothesis | decided |
| --- | --- | --- |
| H1 | training beats an unguided base | `lo(δ(C1)) > 0` **and** the point estimate ≥ +10pp |
| H2 | training adds value *over supplying guidance* | `lo(δ(C2)) > −5pp` **and** `lo(δ(C3)) > −5pp` (non-inferior), and the primary decision is reported for both comparisons |
| H3 | it is not merely style | rule-application rate on `required_rules` rises with the functional pass rate, and the already-modern briefs do not regress (§7) |

- **Null.** The interval for δ(C1) is compatible with no useful improvement (it overlaps zero, or
  its upper bound is below the +10pp minimum effect).
- **Negative.** Any of: the functional pass rate falls below C1 with an interval excluding zero; a
  **rise** in blocker security or accessibility findings; increased over-application or regression
  on the already-modern briefs; or worse cost-adjusted performance (passes per million inference
  tokens or per GPU-minute). A prettier screenshot or a higher frequency of rule-sounding names is
  not evidence against a negative; it is the shape a negative often takes.

The study is powered for a **large** effect only. With 32 sealed test families (see §6: 10
in-family, 20 out-of-family, 2 repair) the interval on δ is dominated by between-family variance; a
genuine +5pp improvement is not resolvable here and will not be claimed. This is a limitation, not a
detail (§15). The effective sample size is families, not briefs: the three variants of a family
share their phrasing-independent content, so they are one cluster, and `pairedDifference` resamples
families for exactly that reason.

## 5. Equal inference budget

All arms are run with: the same prompt scaffold; the same decoding parameters (temperature, top_p,
max tokens, stop conditions) frozen before the run verbatim in the run record; the same number of
attempts (`best-of-one` for the primary endpoint, with an equal-*cost* retry analysis reported
separately); the same build/validation toolchain; and the same evaluator. C3's uplift tool is the
same deterministic tool in every arm that uses it, with the same pinned guidance snapshot.

Cost is recorded per arm as inference tokens, wall-clock, and (for T) training GPU-hours, so
cost-adjusted performance can be reported even where raw pass rates tie.

## 6. Splits

**Split by prompt family, whole.** Every variant of a family lands in the same split; that rule is
enforced by `validate-briefs.mjs`, not by convention.

| split | in-family families | out-of-family | repair families | use |
| --- | --- | --- | --- | --- |
| `dev` | 6 (18 briefs) | 5 | 1 | prompt wording, judge rubric, thresholds — everything tunable |
| `test` | 10 (30 briefs) | 20 | 2 | **sealed**; touched once, at the end |

Authored independently of the corpus and of each other: the 48 in-family briefs were written by two
authors (24 each) and the 25 out-of-family plus 6 repair briefs by a third, each validating against
the pinned rule set before the three files were merged by prompt family. Variants of a family differ
only in `prompt`, `brief_id` and `variant_of` — that invariance is a check in `validate-briefs.mjs`.

The training corpus is a **separate manifest** whose `family_id`s must not overlap this one:
`scripts/validate-briefs.mjs --corpus <corpus manifest>` fails on any shared family. Near-duplicate
project structures are capped in the corpus itself; a paraphrase of a training brief is not new
training data, it is a contaminated test.

Strata (design brief §4):

- **A_familiar** — familiar archetypes and rules, unfamiliar businesses and phrasings.
- **B_heldout_combination** — a combination the corpus never contained as a unit (e.g. session auth
  *and* a reload-safe password reset; threads *and* server-side identity). Tests composition, not
  recall.
- **C_out_of_family** — novel briefs **and already-modern sites**, measuring regression and
  over-application.
- **R_repair** — the same defect must be fixed however the request is phrased; a **separate
  adapter** and a secondary endpoint, never part of the primary one.

## 7. Reporting

Mandatory in every reported result:

- The primary endpoint per arm with the cluster bootstrap interval, and the paired difference
  against each control.
- **Per-family outcomes** — every family's pass rate in every arm. A family that passes in every
  arm and one that fails in every arm are both findings; an aggregate hides both.
- Per-archetype and per-rule-id outcome tables, with the applicable denominator for each.
- The already-modern briefs reported separately, as a change count (edits made, regressions
  introduced), not folded into the pass rate.
- Failure taxonomy per brief: build failure, missing route, failing journey, failing assertion,
  missing required rule, blocker accessibility, blocker security.
- Seed variability for T (the same evaluation against at least two training seeds) and inference
  token/time per arm.
- The human ratings (§9) on the stratified sample, with inter-rater agreement and adjudications.
- Every arm's cost, and cost per pass.

## 8. Instrumentation: automated

Each brief carries its own oracle (`routes`, `journeys`, `assertions`, `required_rules`). The
automated bundle is: install/build/typecheck; browser-driven journeys with assertions on **state and
server persistence**, not just navigation; form validation and error recovery; keyboard navigation
and focus order; semantic DOM and label checks; responsive snapshots; cookie/session attributes and
cross-site request checks; rule-applicability coverage; and template similarity.

Every measured property is linked to a test artefact. An automated accessibility pass or a
performance score is **not** proof that a site is good or secure, and neither can carry the primary
endpoint on its own: the primary endpoint needs the functional journey to pass as well.

Execution happens in sandboxed, network-limited containers with no real secrets.

**One entry point produces a verdict.** `analyseSealed()` in `src/eval/endpoint.mjs` checks the
sealed universe (every brief in the `test` split, task `generate`, and the set hashing to the seal
in §13) and a complete design before it computes anything, and returns the problems instead of a
number when either fails. `pairedDifference()` and `decide()` are primitives that compute over
whatever brief list they are given — useful for exploration, and not the preregistered analysis.
Calling them directly over the dev split produces a decision that looks reportable and is not, which
is why the checked path exists and `test/endpoint.test.mjs` proves it refuses that case.

## 9. Instrumentation: human

A **blinded two-rater** assessment on a stratified sample of the sealed test briefs (at least 20%,
stratified across families and strata): task completion, appropriateness, and whether the MWG rules
that apply were actually applied. Raters do not see the arm, the model identity or the training
provenance; disagreements are adjudicated by a third rater and the adjudications are reported.

A model judge may **triage** (flag candidates, order the sample) but is never the sole arbiter of
any endpoint, and never sees provenance. Functional checks dominate: where the automated oracle and
a rater disagree, both are reported.

## 10. Sanity checks that must pass before any result is interpreted

- **Shuffled-target control:** a small adapter trained on shuffled target→output pairs must not
  reproduce the pass-rate gain. A gain that survives shuffling is an artefact of the harness.
- **Judge-invariance probe:** the model judge is run on the same output twice, and on outputs from
  two arms in shuffled order, to measure its own instability.
- **Rule-name frequency is not a pass.** Outputs that mention MWG terminology without satisfying
  the check are recorded as failures, and the frequency of rule-sounding language is reported
  separately as a diagnostic next to the real rate.

## 11. Threats to validity, stated in advance

- Variants within a family share a property set, so the effective sample is the **family**, which
  is small (32 sealed test families). Intervals will be wide.
- The corpus does not exist yet; the acceptance yield used for costing is from the pilot, and the
  pilot's acceptance rate is an upper bound on the corpus's.
- Guidance applicability is assigned by us, per brief, before seeing outputs. Where a rule is
  arguably applicable and we did not list it, the brief under-credits; this is fixed before the
  seal and cannot be adjusted afterwards without a deviation.
- Compute is external by owner decision (no model runs on fleet VMs), so VRAM and throughput are
  measured on the rented host, not here — see [`pricing.md`](pricing.md).

## 12. Freezing checklist (before the first run)

- [ ] brief manifest validated and **sealed**; hash recorded in §13 and on the bead
- [ ] judge rubric, prompt scaffold, decoding parameters and build toolchain versions frozen and
      recorded in the run record
- [ ] the applicability map and the check implementation tagged with the same commit as the seal
- [ ] the corpus manifest validated, with `--corpus` confirming no family crosses into the held-out
      set
- [ ] arms C1–C3 and T run on the same evaluator build, in a random order per brief, with the
      evaluator blind to the arm label

## 13. Seal

```
brief manifest: docs/eval/briefs/manifest.jsonl
rule set:       docs/eval/rules.json  (sha256:f6301c020f138ed70287b663107033c757e11120fa87d947248ce5e4b4cdca19)
seal hash:      sha256:89a1f47d638c5eab733074d87bc19d6615401aeb9a77ecbd86cf10b443e272b1
seal form:      v2 (sorted keys, NFC, sorted rows, sha256 of newline-joined rows)
sealed at:      computed 2026-10-08; the freeze is taken at the start of the first run
composition:    79 briefs / 44 families (dev 12 families, test 32 families)
                A_familiar 36, B_heldout_combination 12, C_out_of_family 25, R_repair 6
                already-modern rows inside C: 8
```

Results are only reportable against this hash. Editing the briefs after the seal invalidates it: a
new seal, dated, with the edit recorded in §14. The hash is computed by
`node scripts/validate-briefs.mjs docs/eval/briefs/manifest.jsonl --seal`, and `test/briefs.test.mjs`
compares the computed seal against the hash written here, so a hand-edited manifest fails the suite
rather than leaving a stale seal standing. The canonical form is stated above so the hash can be
recomputed by a reader without this repository: sort rows by `brief_id`, serialise each row as JSON
with object keys sorted at every depth and strings normalised to NFC, join with `\n`, sha256.

## 14. Deviations log

| date | deviation | reason | recorded by |
| --- | --- | --- | --- |
| 2026-10-08 | **the student is a checkpoint both backends can train**, not `Qwen/Qwen2.5-Coder-7B-Instruct` as first proposed | the decided training route is Fireworks managed training, and that checkpoint is **not trainable there**: it is absent from the provider's 44-model fine-tuning catalogue (`docs.fireworks.ai/fine-tuning/models.md`, fetched and hash-pinned in `src/train/reachability.mjs`). The headline platform comparison also needs a checkpoint available on *both* backends, or the comparison measures the model and the platform together. Candidates in the same parameter band, all Apache-2.0: `qwen3-8b`, `qwen3p5-9b`, `qwen3-14b`. No run has happened and no outcome has been seen; this is recorded before the dry run, not after | author mwg-train-prov, from the Fireworks reconciliation |
| 2026-10-08 | the seal moved from `sha256:91d75f29…` to `sha256:89a1f47d…`, before any training run and before any outcome was seen | `existing_site` was added to the 8 already-modern rows and the 4 sealed repair rows, naming the baseline or starter project each is written against (`docs/eval/projects/`, tree and page-content hashes committed in `docs/eval/projects/index.json`). This closes the two §15 limitations below. No prompt, route, journey, assertion, rule, split or stratum changed; the only edit to a row is the new field | author mwg-train-rff, from the `mwg-train-011` follow-up |
| 2026-10-08 | the seal moved from `sha256:8791ebcc…` to `sha256:91d75f29…`, before any training run and before any outcome was seen | two changes, both required by adversarial review: (1) the canonical form now sorts object keys and normalises Unicode, because the first form let a re-serialised manifest hash differently (`SEAL_FORM` v2); (2) `fam-09-v2` asked for an address that its siblings and the shared oracle never mention, so the paraphrase added a deliverable — the phrase was removed | rev: gpt-6-sol + gemini-3.8-flash (adversarial passes), author mwg-train-prov |

## 15. Limitations

Small family count; large-effect-only power; judge-based secondary endpoints are noisy and are
advisory; the corpus's acceptance yield is unmeasured until the pilot runs; the teacher arm is
descriptive and quarantined; and this preregistration cannot make the training data's provenance
clean — that is a separate gate, in `docs/provenance/`.

Both limitations found by adversarial review on 2026-10-08 have since been closed by `mwg-train-011`, which shipped the control projects and the oracles they need:

- **The already-modern items are now measurable.** Every one of the eight already-modern briefs names
  its baseline project in `existing_site`, and the projects live under `docs/eval/projects/already-modern/`.
  `src/eval/baseline.mjs` snapshots a project as per-file content hashes and as per-route `<main>`
  content (the navigation is kept separate, because adding a page legitimately changes the nav on every
  route), and `diffPages` reports the routes whose content actually changed. The residual caveat: the
  per-brief allowlist in `assessDiff` is advisory and has to be supplied by the harness that renders a
  candidate's routes; without it the oracle reports changes rather than judging them.
- **The repair endpoint is executable.** The two sealed repair families point at defective starters
  under `docs/eval/projects/repair/`, and `src/eval/defects.mjs` drives each starter and proves that the
  audited defect set equals the family's `seeded_defects` exactly - present and no others. The residual
  caveat: `fam-r01` is a `dev` family and intentionally ships no starter, so the audit covers the two
  sealed families only, and the defect vocabulary is the fixed catalog in `defects.mjs`.

Neither changes the primary endpoint; the secondary endpoints are no longer reported as unmeasured for
lack of a control, only for lack of a run.
