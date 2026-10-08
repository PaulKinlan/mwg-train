# Rights record: evaluation target designs

- **Status:** authored in this repository; rights-cleared for the evaluation use described here.
- **Provenance arm:** `A6_evaluation` (held-out evaluation material — never trainable).
- **Storage:** `data/A6_evaluation/targets/<family>/`
- **Authored source:** `docs/eval/targets/<family>/index.html` and `docs/eval/targets/base.css`
- **Licence:** `CC0-1.0` — the designs, their markup and stylesheets are ours.
- **Last verified:** 2026-10-08

## What these are

The target design for a brief family is the *achievable ideal* for that family: what a well-built page
for the family looks like using the tools and patterns the model is expected to have. It is the
"target" side of the visual conformance score; the raw build is the baseline, and the endpoint reports
the raw score, the conformance score and the delta.

## How they were made

Hand-authored HTML and CSS, written for this repository, rendered to PNG by our own headless Chrome
through the project's CDP harness (`scripts/render-targets.mjs`). No third-party page was opened,
captured or reproduced at any point.

## What they deliberately do not contain

- **No third-party material.** No screenshot, image, icon, logo, font file or copy from any other
  site. The only visual assets are CSS and inline markup; the font stack is the system font stack.
- **No owner-identifying material.** No photographs of people, no real names, addresses, phone
  numbers or email addresses, no real organisation's branding. The people and places named in the
  copy (a training centre, a council, an event) are invented.
- **No personal data.** Every value in a target is placeholder copy.

## Rights and training

The images are evaluation controls. `A6_evaluation` is quarantined: `excluded_from_training` is always
`true` and the arm can never be approved for training, because a model trained on the target would be
scored against a picture it had already seen. `data/A6_evaluation/targets/manifest.jsonl` records, per
family, the authored source it came from, when it was created, its sha256 and byte count, its licence,
and this rights record; `node scripts/render-targets.mjs --check` fails if any committed byte stops
matching its row.

## Adding a family

Author `docs/eval/targets/<family>/index.html` (linking `../base.css`), add the family to
`src/eval/targets.mjs`, and run `node scripts/render-targets.mjs`. The renderer refuses a page with no
form controls, so an empty or broken target cannot enter the manifest.
