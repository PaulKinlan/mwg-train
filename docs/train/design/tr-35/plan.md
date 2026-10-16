---
family: tr-35
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-35-v1
---

# `tr-35` functional specification — Atelier Velo — Solstice Ti Custom Titanium Gravel Bike Configurator

The behaviour of the `tr-35` training family, bound to its canonical brief row
[`tr-35-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Atelier Velo Solstice Ti custom titanium gravel bike configurator and build reservation, in the `interactive-product-configurator` archetype. The brief asks for:

> Atelier Velo hand-builds the Solstice Ti titanium gravel bicycle and needs an interactive workshop configurator with a live bill of materials. Riders should be able to choose their frame geometry, titanium finish, and carbon or dynamo wheelset, add fit and internal routing notes, and save a build reservation that persists on the server across page reloads.

The form the journey drives carries 5 fields: `rider`, `frame_size`, `finish`, `wheelset`, `build_notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Inspect the Atelier Velo Solstice Ti frame geometry table, finish swatches, and live bill of materials
- Select frame size, titanium surface finish, and gravel wheelset, and enter rider fit notes
- Save the custom build sheet to the server and reload the build URL to confirm the specification is preserved

Out of scope, by the brief's own non-goals: 3D CAD STEP file export; third-party bike-fit motion-capture upload.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/builds` | write route the form submits to |
| `/builds/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "custom bicycle build specifications and workshop slot reservations are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-35-hono`, `pilot/projects/tr-35-raw`,
`pilot/projects/tr-35-react`, `pilot/projects/tr-35-preact`,
`pilot/projects/tr-35-vue`, `pilot/projects/tr-35-svelte`, and
`pilot/projects/tr-35-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "56cm Endurance" in `select[name=frame_size]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "56cm Endurance".
3. On `/`, fill form#atelier-build-form: `input[name=rider]` with "Jules Moreau", `textarea[name=build_notes]` with "Internal dynamo wire routing through fork crown; 90mm stem."; choose "56cm Endurance" in `select[name=frame_size]`; choose "Anodised Bronze" in `select[name=finish]`; choose "40mm Deep Carbon Gravel" in `select[name=wheelset]`.
4. Submit; the read page shows "Jules Moreau", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Jules" lists "Jules Moreau" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `rider` field can be changed to "Jules Moreau (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-35/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-35/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-35/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-35/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `rider`, `frame_size`, `finish`, `wheelset` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `forms/forms`, drawn from the
  applicable set `accessibility/accessibility`, `forms/forms`, `forms/required-field-feedback`, `css/responsive-design`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /builds saves the custom bicycle build specification on the server and redirects to /builds/:id
- GET /builds/:id renders the rider name, frame geometry, titanium finish, and wheelset after reload
- accordion build steps and option selectors remain keyboard accessible with clear validation feedback

## Implementation status

Task: `generate`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-35/index.html`](../../targets/tr-35/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
