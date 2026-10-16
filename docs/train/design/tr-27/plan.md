---
family: tr-27
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-27-v1
---

# `tr-27` functional specification — St. Jude’s Chamber Music — Acoustic Concert Pew Reservation

The behaviour of the `tr-27` training family, bound to its canonical brief row
[`tr-27-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is parish church acoustic concert seat selection, in the `booking` archetype. The brief asks for:

> Our parish church holds acoustic chamber music evenings with allocated pew seating, but our booking form loses reservations upon refresh and cannot be navigated without a mouse. Repair the booking application so reservations are saved on the server, interactive pew seats are accessible by keyboard with visible focus rings, and empty submissions are caught with clear feedback.

The form the journey drives carries 5 fields: `attendee`, `email`, `phone`, `guests`, `pew`.

The brief's own user journeys, which the harness flow below is derived from:

- View church seating layout and choose an available pew section for an upcoming concert
- Enter attendee name and contact details, and submit the seat reservation
- Receive the booking voucher with pew reference and reload the browser to ensure the seat is preserved

Out of scope, by the brief's own non-goals: commercial ticketing gateway fees; assigned choir vocal audition scheduling.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/concerts` | supporting page declared by the brief |
| `/concerts/:id/reserve` | write route the form submits to |
| `/reservations/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "pew reservations and seat allocation maps are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-27-hono`, `pilot/projects/tr-27-raw`,
`pilot/projects/tr-27-react`, `pilot/projects/tr-27-preact`,
`pilot/projects/tr-27-vue`, `pilot/projects/tr-27-svelte`, and
`pilot/projects/tr-27-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Nave right" in `select[name=pew]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Nave right".
3. On `/`, fill form#reservation-form: `input[name=attendee]` with "Rev Helen Marsh", `input[name=email]` with "helen.marsh@example.test", `input[name=guests]` with "3"; choose "Nave right" in `select[name=pew]`.
4. Submit; the read page shows "Rev Helen Marsh", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Rev" lists "Rev Helen Marsh" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `attendee` field can be changed to "Rev Helen Marsh (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`booking` plan](../../../design/archetypes/booking/plan.md)
and [`booking` design](../../../design/archetypes/booking/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-27/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `attendee`, `email`, `guests`, `pew` - each is required in the form and re-checked on the server.
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

- POST /concerts/:id/reserve saves the pew booking to the server and returns a booking ID
- GET /reservations/:id renders the allocated pew number and attendee name after reload
- all seat selection buttons receive keyboard focus with a visible focus outline

## Implementation status

Task: `repair`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

Seeded defects the repair must remove, quoted from the brief:

- the client form omits the required attribute and per-field error messages, so a user is not told up front which fields are required; the server still rejects an empty submission with a 422 error page listing the missing fields

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-27/index.html`](../../targets/tr-27/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
