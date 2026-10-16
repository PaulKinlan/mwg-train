---
family: tr-16
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-16-v1
---

# `tr-16` functional specification — Heirloom Perennial Repository — Cuttings & Seed Strain Index

The behaviour of the `tr-16` training family, bound to its canonical brief row
[`tr-16-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is rare perennial cuttings and seed strain index, in the `library-catalogue` archetype. The brief asks for:

> Our botanical society maintains a living repository of heirloom perennial plant cuttings and needs a lending catalogue. Members should be able to search cultivars by sun requirements and soil type, check root cutting availability, and request a propagation stem. Stem reservations must be stored on the server so members can view their reserved cuttings on their confirmation page.

The form the journey drives carries 6 fields: `gardener`, `email`, `cultivar`, `cutting`, `quantity`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Search the cultivar repository and filter by sun tolerance and flowering season
- Inspect botanical propagation instructions and available cutting counts for a specimen
- Submit a cutting reservation request, receive a collection voucher, and reload to confirm details

Out of scope, by the brief's own non-goals: live postal parcel tracking; international phytosanitary certificate export handling.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/cultivars` | supporting page declared by the brief |
| `/cultivars/:id` | read-back of one stored record by its reference |
| `/request` | write route the form submits to |
| `/requests/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "cultivar availability counts and member cutting requests are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-16-hono`, `pilot/projects/tr-16-raw`,
`pilot/projects/tr-16-react`, `pilot/projects/tr-16-preact`,
`pilot/projects/tr-16-vue`, `pilot/projects/tr-16-svelte`, and
`pilot/projects/tr-16-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Root cutting" in `select[name=cutting]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Root cutting".
3. On `/`, fill form#cutting-request-form: `input[name=gardener]` with "Dr Linnaeus Fox", `input[name=email]` with "linnaeus.fox@botanical.test", `input[name=cultivar]` with "Salvia nemorosa Caradonna", `input[name=quantity]` with "3", `textarea[name=notes]` with "Keep moist for root propagation"; choose "Root cutting" in `select[name=cutting]`.
4. Submit; the read page shows "Salvia nemorosa Caradonna", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Salvia" lists "Salvia nemorosa Caradonna" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `cultivar` field can be changed to "Salvia nemorosa Caradonna (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-16/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-16/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-16/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-16/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `gardener`, `email`, `cultivar`, `cutting`, `quantity` - each is required in the form and re-checked on the server.
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

- GET /cultivars?sun=full-sun returns only full-sun perennial specimens
- POST /request creates a cutting reservation and redirects to /requests/:id
- GET /requests/:id displays the requested plant name and quantity after page refresh

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
[`docs/train/targets/tr-16/index.html`](../../targets/tr-16/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
