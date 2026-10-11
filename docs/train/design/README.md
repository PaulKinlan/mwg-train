# Training family specs: `plan.md` and `design.md`

Every training family (`tr-01` .. `tr-30`) has two documents under this directory, because the
functional contract and the aesthetic system have different sources of truth and different lifetimes.

| Artefact | Scope | States | Checked against |
| --- | --- | --- | --- |
| `docs/train/design/<family>/plan.md` | one family | the functional specification: use case, routes and effects, state, journey, validation, acceptance criteria | the canonical (`-v1`) brief row in [`docs/train/briefs/manifest.jsonl`](../briefs/manifest.jsonl) |
| `docs/train/design/<family>/design.md` | one family | the aesthetic system: visual thesis, grammar, typography, tokens, spacing, hierarchy, anti-patterns | the family's authored target board, [`docs/train/targets/<family>/index.html`](../targets/tr-01/index.html) |

## Why the sources of truth are where they are

`plan.md` is bound to the **brief row**, not to a scaffolded project. The brief is the durable contract
both wording variants share ([invariant 2](../briefs/SCHEMA.md)), and it is the input a project is
generated from; prose checked against a generated tree would drift the moment the tree was regenerated.
Every route, field, selector, assertion and persistence line in a `plan.md` is copied from the brief by
[`scripts/scaffold-train-design.mjs`](../../../scripts/scaffold-train-design.mjs) and re-checked against it
by `npm run check:train-design`.

`design.md` is bound to the family's **authored target board**. The scaffolded projects in
[`pilot/TRAINING_CORPUS.json`](../../../pilot/TRAINING_CORPUS.json) share one generated stylesheet, so a
token block checked against it would check the same file thirty times; the per-family aesthetic artefact
is the target board, and its inline `:root` block is what the token checks read. Like the evaluation
targets, these boards are conformance instruments - project-owned CC0 assets in the `A1_self_generated`
arm, marked `excluded_from_training` in
[`docs/provenance/assets/training-targets.md`](../../provenance/assets/training-targets.md) - not training
data.

## What the documents are not

- They are **not evidence that a project works.** They describe what the brief requires and what the
  target board looks like. Route declarations, served-route coverage and browser-verified yield are
  measured separately in [`docs/train/corpus/`](../corpus/README.md).
- They are **not the sealed evaluation schema.** Training families live in the `tr-` namespace and are
  disjoint from the evaluation families by family id
  ([`docs/train/briefs/SCHEMA.md`](../briefs/SCHEMA.md), [`check-disjoint`](../../../scripts/check-disjoint.mjs)).
- They are **not model output.** The corpus trees are deterministic scaffold templates, and no
  per-project training approval exists for them.

## Regenerating and checking

```bash
npm run scaffold:train-design     # rewrite all 30 families from the brief manifest and target boards
npm run check:train-design        # re-check every claim against those same sources (wired into check:all)
```

Rerun the scaffold after editing a brief row or a target board, then `check:train-design`. A hand edit
that a brief or a target stylesheet disagrees with is a finding, not a difference of opinion.
