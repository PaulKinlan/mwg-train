---
family: tr-06
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-06-v1
---

# `tr-06` functional specification — Highland Guild of Craftsmen — Artisan Directory & Open Studios

The behaviour of the `tr-06` training family, bound to its canonical brief row
[`tr-06-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is craft guild artisan profiles and studio open days, in the `directory-listing` archetype. The brief asks for:

> Our county guild of makers needs an online artisan directory showcasing woodworkers, weavers, and glassblowers. Visitors should be able to filter makers by craft discipline, view individual studio opening hours, and search by maker name or town. All directory search queries and filter selections must be shareable via URL parameters.

The form the journey drives carries 6 fields: `artisan`, `discipline`, `location`, `hours`, `openday`, `biography`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse the artisan directory, select a craft filter such as ceramics, and see matching makers
- Search for a specific artisan by surname and view their detailed workshop profile
- Copy and reload a filtered directory URL and observe the same filtered maker list

Out of scope, by the brief's own non-goals: e-commerce cart for purchasing craft items; direct messaging between visitors and makers.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/makers` | supporting page declared by the brief |
| `/makers/:id` | read-back of one stored record by its reference |
| `/disciplines` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "artisan directory profiles and scheduled studio open day dates are stored on the server"

The family's declared framework arm is `react` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-06-hono`, `pilot/projects/tr-06-raw`,
`pilot/projects/tr-06-react`, `pilot/projects/tr-06-preact`,
`pilot/projects/tr-06-vue`, `pilot/projects/tr-06-svelte`, and
`pilot/projects/tr-06-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Ceramics" in `select[name=discipline]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Ceramics".
3. On `/`, fill form#artisan-profile-form: `input[name=artisan]` with "Rowan Ashcroft", `input[name=location]` with "The Old Mill, Stroud", `input[name=hours]` with "Thu-Sat 10:00-16:00", `input[name=openday]` with "2026-11-28", `textarea[name=biography]` with "Master woodworker crafting hand-turned bowls and shaker boxes"; choose "Ceramics" in `select[name=discipline]`.
4. Submit; the read page shows "Master woodworker crafting hand-turned bowls and shaker boxes", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Master" lists "Master woodworker crafting hand-turned bowls and shaker boxes" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `biography` field can be changed to "Master woodworker crafting hand-turned bowls and shaker boxes (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-06/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-06/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-06/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-06/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `artisan`, `discipline`, `location`, `hours`, `openday`, `biography` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `forms/forms`, drawn from the
  applicable set `accessibility/accessibility`, `css/responsive-design`, `forms/forms`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- GET /makers?craft=woodworking filters maker cards to only woodworking artisans
- GET /makers/:id displays biography, studio location, and upcoming open day dates
- all interactive filter controls announce state changes to assistive technologies

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
[`docs/train/targets/tr-06/index.html`](../../targets/tr-06/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
