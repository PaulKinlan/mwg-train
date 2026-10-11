---
family: tr-07
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-07-v1
---

# `tr-07` functional specification — Starlight Ridge Dark Sky Observatory — Public Viewing Pass

The behaviour of the `tr-07` training family, bound to its canonical brief row
[`tr-07-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is dark sky observatory public viewing night sign-up, in the `event-registration` archetype. The brief asks for:

> Our rural dark-sky observatory holds weekly public telescope viewing sessions with strict capacity limits. We need a registration page where stargazers select a date, enter the number of adult and child attendees, and reserve their telescope passes. Reservations must be saved on the server so reloading the confirmation ticket page retains the attendee count and gate pass code.

The form the journey drives carries 9 fields: `attendees`, `email`, `phone`, `date`, `session`, `party`, `adults`, `children`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- View upcoming observatory viewing night dates and remaining ticket capacity
- Select an open night, fill in visitor names, party headcount, and submit registration
- View the gate pass ticket with registration reference and reload the browser to verify persistence

Out of scope, by the brief's own non-goals: ticket sales or credit card checkout; weather forecast satellite integration.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/events` | supporting page declared by the brief |
| `/register/:eventId` | write route the form submits to |
| `/passes/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "viewing night registrations and remaining capacity quotas are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-US`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Late Session (22:30 - 01:00)" in `select[name=session]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Late Session (22:30 - 01:00)".
3. On `/`, fill form#observatory-registration-form: `input[name=attendees]` with "Cassiopeia Vance", `input[name=email]` with "cassiopeia@example.test", `input[name=phone]` with "+44 7700 900789", `input[name=date]` with "2026-10-24", `input[name=party]` with "3", `input[name=adults]` with "2", `input[name=children]` with "1", `textarea[name=notes]` with "First-time telescope viewers"; choose "Late Session (22:30 - 01:00)" in `select[name=session]`.
4. Submit; the read page shows "Cassiopeia Vance", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Cassiopeia" lists "Cassiopeia Vance" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `attendees` field can be changed to "Cassiopeia Vance (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `attendees`, `email`, `phone`, `date`, `session`, `party`, `adults`, `children` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `accessibility/accessible-error-announcement` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /register/:eventId decrements available capacity and redirects to /passes/:id
- GET /passes/:id displays the confirmed attendee names, party size, and visit date
- attempting to book more tickets than remaining capacity triggers an error and prevents booking

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
[`docs/train/targets/tr-07/index.html`](../../targets/tr-07/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
