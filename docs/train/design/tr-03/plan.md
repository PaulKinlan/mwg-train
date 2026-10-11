---
family: tr-03
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-03-v1
---

# `tr-03` functional specification — Terraform Ceramics Co-op — Kiln Firing Shelf Booking

The behaviour of the `tr-03` training family, bound to its canonical brief row
[`tr-03-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is pottery studio shared kiln firings schedule, in the `booking` archetype. The brief asks for:

> Our community ceramics collective shares two large electric kilns and needs an online firing schedule. Ceramicists should view available bisque and glaze firing cycles, reserve shelf space by height and shelf count, and provide their studio member ID. Reservations must persist on the server so refreshing the schedule shows reserved space as occupied.

The form the journey drives carries 8 fields: `member`, `kiln`, `cycle`, `cone`, `shelves`, `height`, `date`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Inspect scheduled kiln firing dates and available shelf space
- Fill out the shelf reservation form with member ID, firing type, and shelf dimensions
- Submit the reservation, inspect the confirmation reference, and verify the slot appears on the firing schedule

Out of scope, by the brief's own non-goals: membership fee payment; automated temperature controller integration.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/kilns` | supporting page declared by the brief |
| `/reserve` | write route the form submits to |
| `/reservations/:id` | read-back of one stored record by its reference |
| `/schedule` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "kiln firing reservations are saved to the server and update the public firing schedule"

The family's declared framework arm is `svelte` and its locale is `en-US`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Electric Kiln B (Back)" in `select[name=kiln]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Electric Kiln B (Back)".
3. On `/`, fill form#kiln-reservation-form: `input[name=member]` with "MEM-4820", `input[name=shelves]` with "2", `input[name=height]` with "6", `input[name=date]` with "2026-11-15", `textarea[name=notes]` with "Stoneware bowls with celadon glaze"; choose "Electric Kiln B (Back)" in `select[name=kiln]`; choose "Glaze firing" in `select[name=cycle]`; choose "Cone 04 (Low fire ~1060°C)" in `select[name=cone]`.
4. Submit; the read page shows "MEM-4820", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="MEM-4820" lists "MEM-4820" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `member` field can be changed to "MEM-4820 (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `member`, `kiln`, `cycle`, `cone`, `shelves`, `height`, `date` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `forms/required-field-feedback`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `css/responsive-design`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /reserve creates a firing reservation and returns a reference code
- GET /schedule reflects occupied shelf units after a new reservation is recorded
- submitting without choosing a firing cone temperature shows field-level error feedback

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
[`docs/train/targets/tr-03/index.html`](../../targets/tr-03/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
