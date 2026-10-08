# Training Brief Manifest

`docs/train/briefs/manifest.jsonl` contains the authored synthetic training briefs for the Modern Web Guidance (MWG) student training pipeline. Full schema specification is documented in [SCHEMA.md](SCHEMA.md).

## Overview

- **Size:** 60 briefs across 30 distinct prompt families (`tr-01` through `tr-30`), with exactly 2 variants per family (`-v1` and `-v2`).
- **Schema:** Follows its own training schema (`docs/train/briefs/SCHEMA.md`), deliberately distinct from the sealed eval schema (`docs/eval/briefs/SCHEMA.md`).
- **Split & Stratum:** Every row has `split: "train"` and `stratum: "corpus"`.
- **Tasks:**
  - 25 generation families (`tr-01` through `tr-25`, 50 briefs) with `task: "generate"` and `seeded_defects: []`.
  - 5 repair families (`tr-26` through `tr-30`, 10 briefs) with `task: "repair"` and realistic, specific `seeded_defects`.
- **Property-Set Invariance:** Within each family, variants differ ONLY in `prompt`, `brief_id`, and `variant_of` (`null` for `-v1`, pointing to canonical `${family_id}-v1` for `-v2`). All other 14 invariant fields (`archetype`, `topic`, `locale`, `framework`, `task`, `stratum`, `routes`, `journeys`, `server_persistence`, `assertions`, `applicable_rules`, `required_rules`, `non_goals`, `seeded_defects`) are identical.
- **Rules Vocabulary:** Every entry in `required_rules` and `applicable_rules` is drawn from the pinned rules catalog in `docs/eval/rules.json` (`sha256:f6301c020f138ed70287b663107033c757e11120fa87d947248ce5e4b4cdca19`), and `required_rules` is strictly a subset of `applicable_rules` with 2 to 4 rules per brief.
- **Owner-Auth Contamination Gate (PREREGISTRATION.md §8a):** Contains NO owner-identifying material — no personal names, emails, addresses, phone numbers, or Paul Kinlan's details. Uses neutral, fictional small-business and community scenarios only.

## Split Unit and Strict Disjointness

As preregistered in `docs/eval/PREREGISTRATION.md` (§6, line 133):
> *"The training corpus is a separate manifest whose family_ids must not overlap this one: scripts/validate-briefs.mjs --corpus <corpus manifest> fails on any shared family."*

- **The split unit is `family_id` on both sides:** A prompt family must never span splits. A family that both trains and tests measures memorization of phrasing and specific requirements rather than generalization to modern web practices.
- **Disjoint namespace:** The sealed evaluation manifest (`docs/eval/briefs/manifest.jsonl`) contains 44 families named `cf-01`..`cf-25`, `fam-01`..`fam-16`, and `fam-r01`..`fam-r03`. The training manifest uses strictly the `tr-` prefix (`tr-01` through `tr-30`). There is zero family overlap.
- **Fail-closed:** The disjointness checks fail closed. Any unreadable file, malformed JSONL line, missing property, or shared family_id causes an immediate error and non-zero exit code.

## Validation

The key checks for this manifest are:

### 1. Cross-Manifest Disjointness Check (Eval Gate with Training Corpus)

```bash
timeout 120 node scripts/validate-briefs.mjs docs/eval/briefs/manifest.jsonl --rules docs/eval/rules.json --corpus docs/train/briefs/manifest.jsonl
```

Validates the sealed held-out manifest (`docs/eval/briefs/manifest.jsonl`) and compares `family_id` across both manifests with `--corpus docs/train/briefs/manifest.jsonl`, reporting 0 shared families and passing with zero findings (`validate-briefs: PASS`).

### 2. Sealed Evaluation Suite Seal Verification

```bash
timeout 120 npm run check:briefs
```

Verifies that the sealed evaluation manifest hash is identical to the preregistered seal (`sha256:89a1f47d...`), confirming that the sealed evaluation set was not disturbed.

### 3. Fail-Closed Disjointness CLI

```bash
timeout 120 node scripts/check-disjoint.mjs --train docs/train/briefs/manifest.jsonl
```

Passes cleanly, verifying that 60 training rows share no family_id and no target design with the evaluation set.

## What Has NOT Been Done

These briefs are authored specification items (prompts, expected routes, journeys, assertions, and rule requirements).
- **No model-generated code or project implementations have been created yet.**
- These rows represent the inputs to the training and synthesis pipeline, not model outputs or finished web applications.
