---
family: tr-01
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-01-v1
---

# `tr-01` functional specification — VeloFix Mobile Mechanic — Doorstep Bicycle Tuning & Repair

The behaviour of the `tr-01` training family, bound to its canonical brief row
[`tr-01-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is mobile bicycle mechanic service booking, in the `booking` archetype. The brief asks for:

> I operate a mobile bicycle repair van visiting customers at their homes or offices. I need a straightforward booking application where cyclists select a tune-up package, enter their location and preferred time slot, and receive a confirmed appointment reference. The booking must be stored on the server so reloading the confirmation route preserves their booking details, and all form controls must announce validation errors clearly.

The form the journey drives carries 6 fields: `customer`, `phone`, `address`, `package`, `slot`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse available tune-up packages, choose a service, and proceed to booking
- Enter contact details, service address, and select a time slot to submit
- View the booking confirmation reference and reload the page to confirm persistence

Out of scope, by the brief's own non-goals: payment processing; user account creation.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/services` | supporting page declared by the brief |
| `/book` | write route the form submits to |
| `/bookings/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "confirmed appointments are stored on the server and retrieved by booking ID"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-01-hono`, `pilot/projects/tr-01-raw`,
`pilot/projects/tr-01-react`, `pilot/projects/tr-01-preact`,
`pilot/projects/tr-01-vue`, `pilot/projects/tr-01-svelte`, and
`pilot/projects/tr-01-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Full service" in `select[name=package]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Full service".
3. On `/`, fill form#service-booking-form: `input[name=customer]` with "Ada Lovelace", `input[name=phone]` with "+44 7700 900123", `input[name=address]` with "14 Alder Road, Bristol", `textarea[name=notes]` with "Gate code 4471"; choose "Full service" in `select[name=package]`; choose "Afternoon (12-5)" in `select[name=slot]`.
4. Submit; the read page shows "Ada Lovelace", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Ada" lists "Ada Lovelace" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `customer` field can be changed to "Ada Lovelace (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-01/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-01/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-01/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-01/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `customer`, `phone`, `address`, `package`, `slot` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `accessibility/accessible-error-announcement`, `css/responsive-design` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /book creates a new booking record and redirects to /bookings/:id
- GET /bookings/:id returns the saved customer name, address, and selected tune-up package
- submitting without a required contact phone number displays an inline error message and creates no booking

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
[`docs/train/targets/tr-01/index.html`](../../targets/tr-01/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
