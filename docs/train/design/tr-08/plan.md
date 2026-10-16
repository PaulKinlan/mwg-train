---
family: tr-08
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-08-v1
---

# `tr-08` functional specification — Grain & Silver Darkroom Co-op — Equipment & Chemistry Helpdesk

The behaviour of the `tr-08` training family, bound to its canonical brief row
[`tr-08-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is community darkroom maintenance and supply requests, in the `support-helpdesk` archetype. The brief asks for:

> Our members-only analogue photography darkroom needs a maintenance ticketing tool. Photographers should be able to report equipment malfunctions like faulty enlarger timers, request chemical replenishment like fixer or developer, and track ticket status by reference code. Submitted tickets must persist on the server so darkroom managers can review open issues.

The form the journey drives carries 5 fields: `reporter`, `equipment`, `category`, `urgency`, `description`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse currently active maintenance tickets and chemical status announcements
- Open the ticket submission form, select issue category, describe the problem, and submit
- Receive a ticket tracking number and reload the page to inspect the stored ticket status

Out of scope, by the brief's own non-goals: chemical inventory supplier ordering automation; private member messaging.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/tickets` | supporting page declared by the brief |
| `/tickets/new` | write route the form submits to |
| `/tickets/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "maintenance tickets and issue statuses are stored in the server database"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-08-hono`, `pilot/projects/tr-08-raw`,
`pilot/projects/tr-08-react`, `pilot/projects/tr-08-preact`,
`pilot/projects/tr-08-vue`, `pilot/projects/tr-08-svelte`, and
`pilot/projects/tr-08-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Chemical replenishment (Fixer/Dev)" in `select[name=category]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Chemical replenishment (Fixer/Dev)".
3. On `/`, fill form#darkroom-ticket-form: `input[name=reporter]` with "Julian Alvarez", `input[name=equipment]` with "Beseler 23C II Enlarger", `textarea[name=description]` with "Timer relay sticks on exposure times over 15 seconds"; choose "Chemical replenishment (Fixer/Dev)" in `select[name=category]`; choose "Needs attention today" in `select[name=urgency]`.
4. Submit; the read page shows "Beseler 23C II Enlarger", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Beseler" lists "Beseler 23C II Enlarger" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `equipment` field can be changed to "Beseler 23C II Enlarger (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-08/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-08/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-08/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-08/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `reporter`, `equipment`, `category`, `urgency`, `description` - each is required in the form and re-checked on the server.
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

- POST /tickets/new creates a support ticket with timestamp and redirects to /tickets/:id
- GET /tickets/:id displays the logged equipment name, fault description, and current status
- submitting a ticket without selecting an issue category highlights the field with an accessible message

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
[`docs/train/targets/tr-08/index.html`](../../targets/tr-08/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
