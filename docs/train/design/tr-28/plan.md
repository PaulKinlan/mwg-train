---
family: tr-28
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-28-v1
---

# `tr-28` functional specification — Trailhead Youth Gear Locker — Equipment Repair & Maintenance Tickets

The behaviour of the `tr-28` training family, bound to its canonical brief row
[`tr-28-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is outdoor equipment loan repair and missing part tickets, in the `support-helpdesk` archetype. The brief asks for:

> Our outdoor club lends tents, camp stoves, and backpacks to youth groups, but our equipment damage ticketing app has critical bugs that lose repair reports on page refresh. Repair the application so damage reports are persisted on the server, the priority dropdown is accessible to screen readers, and invalid serial numbers display clear field validation.

The form the journey drives carries 5 fields: `reporter`, `serial`, `gear`, `issue`, `urgency`.

The brief's own user journeys, which the harness flow below is derived from:

- Check equipment inventory and identify a tent or backpack needing zipper or pole repair
- Fill out the damage ticket form with gear serial number, issue description, and urgency
- Submit the ticket, review the confirmation reference number, and reload the ticket page to verify

Out of scope, by the brief's own non-goals: warranty claim manufacturer API integration; automatic replacement gear purchase orders.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/gear` | supporting page declared by the brief |
| `/tickets` | supporting page declared by the brief |
| `/tickets/new` | write route the form submits to |
| `/tickets/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "gear damage tickets and status history are saved on the server"

The family's declared framework arm is `vue` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-28-hono`, `pilot/projects/tr-28-raw`,
`pilot/projects/tr-28-react`, `pilot/projects/tr-28-preact`,
`pilot/projects/tr-28-vue`, `pilot/projects/tr-28-svelte`, and
`pilot/projects/tr-28-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Backpack" in `select[name=gear]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Backpack".
3. On `/`, fill form#ticket-form: `input[name=reporter]` with "Dara Whitfield", `input[name=serial]` with "TENT-4417-KX", `textarea[name=issue]` with "Zipper teeth missing on the inner door"; choose "Backpack" in `select[name=gear]`; choose "Normal" in `select[name=urgency]`.
4. Submit; the read page shows "Dara Whitfield", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Dara" lists "Dara Whitfield" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `reporter` field can be changed to "Dara Whitfield (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`support-helpdesk` plan](../../../design/archetypes/support-helpdesk/plan.md)
and [`support-helpdesk` design](../../../design/archetypes/support-helpdesk/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-28/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `reporter`, `serial`, `gear`, `issue`, `urgency` - each is required in the form and re-checked on the server.
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

- POST /tickets/new saves the maintenance ticket to the server and redirects to /tickets/:id
- GET /tickets/:id shows the gear item, defect description, and urgency rating after a refresh
- form inputs provide programmatic labels and accessible error feedback when invalid

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
[`docs/train/targets/tr-28/index.html`](../../targets/tr-28/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
