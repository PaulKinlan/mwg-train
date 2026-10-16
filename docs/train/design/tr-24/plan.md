---
family: tr-24
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-24-v1
---

# `tr-24` functional specification — Market Cross Farmers Market — Stallholder Pitch & Power Booking

The behaviour of the `tr-24` training family, bound to its canonical brief row
[`tr-24-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is weekend farmers market pitch booking and power requirements, in the `booking` archetype. The brief asks for:

> Our town council organizes a bi-weekly farmers market and needs a vendor pitch reservation system. Stallholders should be able to view available outdoor and covered market pitches, specify refrigeration and electrical supply needs, and book a pitch for upcoming market days. Bookings must be stored on the server so the market master can review the stall layout after refreshing the master plan.

The form the journey drives carries 7 fields: `vendor`, `email`, `phone`, `pitch`, `produce`, `power`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Inspect the market pitch layout map and find available stalls for an upcoming Saturday
- Fill out vendor reservation details including produce category and electrical hookup requests
- Submit the pitch booking, receive a vendor confirmation permit, and reload to confirm persistence

Out of scope, by the brief's own non-goals: daily trading fee merchant processing; food hygiene inspection certificate uploads.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/pitches` | supporting page declared by the brief |
| `/pitches/book` | write route the form submits to |
| `/bookings/:id` | read-back of one stored record by its reference |
| `/market-layout` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "market pitch reservations and vendor equipment requirements are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-24-hono`, `pilot/projects/tr-24-raw`,
`pilot/projects/tr-24-react`, `pilot/projects/tr-24-preact`,
`pilot/projects/tr-24-vue`, `pilot/projects/tr-24-svelte`, and
`pilot/projects/tr-24-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Stall 2 (Covered)" in `select[name=pitch]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Stall 2 (Covered)".
3. On `/`, fill form#pitch-booking-form: `input[name=vendor]` with "Cotswold Farm Dairy", `input[name=email]` with "market@cotswoldfarm.test", `input[name=phone]` with "+44 7700 900512", `textarea[name=notes]` with "Bringing 3m gazebo and display chiller"; choose "Stall 2 (Covered)" in `select[name=pitch]`; choose "Bakery and bread" in `select[name=produce]`; choose "16A outdoor hookup" in `select[name=power]`.
4. Submit; the read page shows "Cotswold Farm Dairy", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Cotswold" lists "Cotswold Farm Dairy" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `vendor` field can be changed to "Cotswold Farm Dairy (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-24/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-24/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-24/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-24/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `vendor`, `email`, `phone`, `pitch`, `produce`, `power` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `accessibility/accessible-error-announcement`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /pitches/book reserves the pitch and redirects to /bookings/:id
- GET /market-layout displays the reserved pitch as occupied upon page refresh
- attempting to book an already reserved pitch shows an error and prompts selection of another pitch

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
[`docs/train/targets/tr-24/index.html`](../../targets/tr-24/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
