---
family: tr-21
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-21-v1
---

# `tr-21` functional specification — Good Neighbour Community Transit — Volunteer Hospital Lift Booking

The behaviour of the `tr-21` training family, bound to its canonical brief row
[`tr-21-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is volunteer driver hospital appointment lift coordination, in the `booking` archetype. The brief asks for:

> Our village charity coordinates volunteer drivers taking elderly neighbours to entirely fictional health clinics such as 'Elmwood Community Hospital'. Schedulers must be able to log ride requests with pickup address, hospital destination, mobility aid needs, and appointment time. Ride requests must be stored on the server so volunteer drivers can view and accept pending journeys after reloading the dispatch board. Do not use Leicester Royal Infirmary, Macclesfield, or any real NHS site.

The form the journey drives carries 7 fields: `passenger`, `phone`, `pickup`, `destination`, `time`, `mobility`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Fill in patient transport request with pickup location, destination hospital, and appointment time
- Specify wheelchair or folding walker mobility requirements and emergency contact details
- Submit the ride request, receive a dispatch reference ID, and reload the dispatch board to verify

Out of scope, by the brief's own non-goals: GPS live vehicle telematics tracking; automated fare meter calculation.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/rides` | supporting page declared by the brief |
| `/book-ride` | write route the form submits to |
| `/rides/:id` | read-back of one stored record by its reference |
| `/dispatch` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "patient ride requests and driver assignments are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-21-hono`, `pilot/projects/tr-21-raw`,
`pilot/projects/tr-21-react`, `pilot/projects/tr-21-preact`,
`pilot/projects/tr-21-vue`, `pilot/projects/tr-21-svelte`, and
`pilot/projects/tr-21-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Folding walker" in `select[name=mobility]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Folding walker".
3. On `/`, fill form#ride-booking-form: `input[name=passenger]` with "Arthur Pendelton", `input[name=phone]` with "+44 7700 900345", `input[name=pickup]` with "14 Church Lane, Oakhaven", `input[name=destination]` with "Elmwood Community Hospital", `input[name=time]` with "10:30", `textarea[name=notes]` with "Front step has handrail"; choose "Folding walker" in `select[name=mobility]`.
4. Submit; the read page shows "Arthur Pendelton", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Arthur" lists "Arthur Pendelton" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `passenger` field can be changed to "Arthur Pendelton (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-21/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-21/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-21/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-21/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `passenger`, `phone`, `pickup`, `destination`, `time`, `mobility` - each is required in the form and re-checked on the server.
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

- POST /book-ride creates a transport booking and redirects to /rides/:id
- GET /dispatch lists all unassigned journey requests with destination and required time on reload
- omitting the hospital appointment time triggers an inline error and halts submission

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
[`docs/train/targets/tr-21/index.html`](../../targets/tr-21/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
