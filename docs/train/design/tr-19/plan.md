---
family: tr-19
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-19-v1
---

# `tr-19` functional specification — Estuary Community Rowing Club — Skiff Outing & Tide Safety Manifest

The behaviour of the `tr-19` training family, bound to its canonical brief row
[`tr-19-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is tidal river rowing skiff safety and tide tracker, in the `booking` archetype. The brief asks for:

> Our community rowing club shares wooden coastal skiffs on an estuary with fast tidal currents and needs a safety booking system. Crew coxswains must book a skiff, declare their crew roster and safety floatation gear, and choose an outing slot aligned with safe tide times. The booking must be stored on the server so the safety officer can verify active crews on the water.

The form the journey drives carries 7 fields: `coxswain`, `skiff`, `headcount`, `lifejackets`, `slot`, `launch`, `roster`.

The brief's own user journeys, which the harness flow below is derived from:

- Check the daily tide table and inspect available rowing skiffs at the boathouse
- Fill in the outing booking form with coxswain name, crew headcount, and planned launch time
- Submit the safety booking, verify the reservation reference, and reload the safety log

Out of scope, by the brief's own non-goals: real-time VHF radio transmission relay; race regatta electronic timing gates.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/skiffs` | supporting page declared by the brief |
| `/book-outing` | write route the form submits to |
| `/outings/:id` | read-back of one stored record by its reference |
| `/safety-log` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "skiff outing bookings and crew safety manifests are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-19-hono`, `pilot/projects/tr-19-raw`,
`pilot/projects/tr-19-react`, `pilot/projects/tr-19-preact`,
`pilot/projects/tr-19-vue`, `pilot/projects/tr-19-svelte`, and
`pilot/projects/tr-19-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Sea Holly (4-oar)" in `select[name=skiff]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Sea Holly (4-oar)".
3. On `/`, fill form#outing-booking-form: `input[name=coxswain]` with "Fiona Macleod", `input[name=headcount]` with "4", `input[name=lifejackets]` with "4", `input[name=launch]` with "08:30", `textarea[name=roster]` with "Fiona Macleod (Cox), Rory Davies, Catriona Ross, Liam Smith"; choose "Sea Holly (4-oar)" in `select[name=skiff]`; choose "Afternoon ebb tide (13:00)" in `select[name=slot]`.
4. Submit; the read page shows "Fiona Macleod", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Fiona" lists "Fiona Macleod" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `coxswain` field can be changed to "Fiona Macleod (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-19/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-19/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-19/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-19/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `coxswain`, `skiff`, `headcount`, `lifejackets`, `slot`, `launch` - each is required in the form and re-checked on the server.
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

- POST /book-outing saves the safety manifest and redirects to /outings/:id
- GET /safety-log reflects all active outing reservations and launch times upon refresh
- submitting without confirming safety lifejacket count is blocked with an error prompt

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
[`docs/train/targets/tr-19/index.html`](../../targets/tr-19/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
