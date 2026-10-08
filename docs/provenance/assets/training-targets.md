# Rights record: training target designs

- **Status:** authored in this repository; project-owned; rights-cleared for conformance scoring.
- **Provenance arm:** `A1_self_generated` (self-generated originals authored in this repository).
- **Storage:** `data/A1_self_generated/targets/<family>/`
- **Authored source:** `docs/train/targets/<family>/index.html`
- **Licence:** `CC0-1.0 (authored in this repository; project-owned)`
- **Last verified:** 2026-10-10

## What these are

The target design for a training brief family is the achievable visual and structural ideal
for that family: what a well-built, accessible modern web application looks like using the
tools and patterns the model is trained to emulate. It serves as the reference against which
training-side conformance and visual similarity can be evaluated.

There are 30 training families (`tr-01` through `tr-30`), corresponding to the synthetic
training briefs recorded in `docs/train/briefs/manifest.jsonl`.

## How they were made

Hand-authored HTML and CSS, designed independently for this repository and rendered to PNG
at viewport 1280x900 by headless Chrome through the repository's CDP harness
(`scripts/render-training-targets.mjs`).

Each design is tailored to its specific archetype, topic, and route structure. No third-party
page was opened, captured, or reproduced at any point. Furthermore, these designs are
strictly distinct and independent from the five held-out evaluation target designs in
`docs/eval/targets/` (A6 arm): they use independent markup, layouts, color schemes, and
typography, verified by hash and family disjointness checks.

## What they deliberately do not contain

- **No third-party material.** No screenshots, external fonts, remote stylesheets, CDN scripts,
  stock photography, or third-party brand assets. All styles and SVG indicators are inline or local.
- **No owner-identifying material.** No real personal names, emails, physical addresses, phone
  numbers, or credentials. All individuals, organisations, and domains in placeholder content are
  fictitious (`.test` domains, sample street names).
- **No personal data.** All data shown in forms, tables, and cards is synthetic placeholder content.

## Rights and training eligibility

In `data/A1_self_generated/targets/manifest.jsonl`, every row declares:
- `arm: "A1_self_generated"`
- `excluded_from_training: true`
- `approved_for_training: false`

**Why they are excluded from training:**
These designs are conformance INSTRUMENTS for the training families, serving as visual scoring
anchors. Promoting them to training inputs is the owner's decision under this repository's spend
boundary. Therefore, under repository policy, no training target design is marked approved for
training (`approved_for_training: false`, `excluded_from_training: true`).

`data/A1_self_generated/targets/manifest.jsonl` records, per family:
- authored source path
- creation timestamp
- image sha256 and byte count
- signature sha256 and path
- CC0-1.0 licence
- rights reference to this document

The integrity of these assets is verified via `node scripts/render-training-targets.mjs --check`,
which re-hashes committed bytes and validates byte counts fail-closed without re-rendering.
Disjointness against the sealed A6 evaluation targets is verified by asserting that no training
target shares an image sha256 hash or family ID with any evaluation target.
