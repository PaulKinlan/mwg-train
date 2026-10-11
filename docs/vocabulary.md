# The vocabulary: default, ideal, and what "baseline" is not

> **mwg-train deterministic baseline** — deterministic output of this repository's own tooling, not an official `web-uplift` result.

Two artefacts are compared throughout this project, and for a while both of them were called "baseline". They are opposites: one is raw model output with no repair, the other is the repaired target. Paul named them, and this file settles the words so a reader - or a lane building a training set - cannot pick the wrong side of a pair by reading a field name.

## The two artefacts

**DEFAULT** — the raw generation, with **no Modern Web Guidance and no uplift applied**. It is what the model (or, in the deterministic pilot, the scaffolder) produced before anything repaired it. It is the comparator: the thing improvement is measured *from*.

- recorded as `original_sha` in the corpus records (`uplift_sha` is not it, `uplifted_sha` is not it)
- trees: `pilot/training-projects/<project>` and `.pilot-corpus/<run>/<project>`
- per-project evidence: `original.json`

**IDEAL** — the same project **after** the deterministic MWG uplift (`src/corpus/uplift.mjs`) has repaired what it can. This is the target, and it is the only side that may become training data.

- recorded as `uplift_sha` (pilot corpus) or `uplifted_sha` (training run records)
- trees: `.pilot-uplifted/<run>/<project>` and `.train-uplifted/<project>`
- per-project evidence: `uplifted.json`

Both are kept, always, as separate trees on disk and separate hashes in the records. Neither is derived from the other at read time: the default is not "the ideal with the reparations undone", and the ideal is not "the default with fixes hoped for". The records carry an explicit `uplift_applied` list per project, so which rules moved a given project from its default to its ideal is evidence rather than inference.

## The word "baseline" is reserved, and never means either of those

Three other things in this repository legitimately use the word, and every one of them is a different object from the two above:

1. **The attribution label.** The string `mwg-train deterministic baseline` marks every floor report we generate, so nobody reads our deterministic mechanical floor as an official `web-uplift` result (`src/eval/ruleset.mjs`, enforced by `npm run check:baseline-label`). It is an external-facing attribution and is deliberately not renamed. When you meet it, it labels *a report about the deterministic floor*, not a dataset.
2. **The cordoned checkpoint** (Paul's lifecycle step 3, `docs/PIPELINE.md`). The frozen base-model revision kept as the default comparator for the rebuild in step 8a. This is a *model checkpoint*, not a corpus side.
3. **The evaluation floor and its arms.** The preregistered comparison in `docs/eval/PREREGISTRATION.md` measures against C1 (bare base), C2 (base plus retrieved guidance) and C3 (base plus the deterministic uplift tool) - the mechanical floor. "Floor" is the better word there; "baseline" survives in prose about it.

A rule that follows, and is what this file exists to state: **`default` and `ideal` are the only words for the two sides of a corpus pair.** If a sentence or a field says "baseline" about a corpus, it is wrong or ambiguous, and it should say default or ideal instead. If it says "baseline" about the attribution string, the cordoned checkpoint or the evaluation floor, it is using a reserved sense - say which one.

## Where this is enforced rather than hoped for

- `npm run check:set-separation` asserts, from the committed records alone, that the two sides are recorded as distinct artefacts: a project with uplift applied has two different hashes and a non-empty `improved_rules`; a project with no uplift applied has one hash on both sides and was not accepted; no default tree is also some project's ideal (or vice versa); and no training-corpus tree collides with a pilot tree on either side. It also asserts the recorded `baseline_definition` still names this distinction, so the wording cannot drift back into ambiguity without a red gate.
- `npm run check:pilot-corpus --verify` re-derives both hashes by regenerating the trees and re-running the tool, so the recorded pair is what the plan and the tool actually produce.
- `npm run check:baseline-label` keeps the attribution string on every floor report, including this one.

## Related

- [plan.md](../plan.md) — the project plan, and the four roles in §8.
- [docs/PIPELINE.md](PIPELINE.md) — the lifecycle and the deterministic stages.
- [docs/train/corpus/README.md](train/corpus/README.md) — which side the token sizes cover (both, and why that matters when pricing a run).
- [docs/eval/PREREGISTRATION.md](eval/PREREGISTRATION.md) — the arms this vocabulary has to stay compatible with.
