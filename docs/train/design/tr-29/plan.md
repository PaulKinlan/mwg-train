---
family: tr-29
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-29-v1
---

# `tr-29` functional specification — Community Woodland Trust — Memorial Tree Fund & Dedication Ledger

The behaviour of the `tr-29` training family, bound to its canonical brief row
[`tr-29-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is memorial tree fund contributions and planting site tracker, in the `expense-tracker` archetype. The brief asks for:

> Our community park trust collects voluntary contributions for planting memorial trees, but our donation ledger tool corrupts running totals on reload and lacks basic form validation. Fix the tool so contributions are saved on the server, negative contribution amounts are rejected with clear error feedback, and the ledger table is accessible to screen readers.

The form the journey drives carries 4 fields: `contributor`, `amount`, `message`, `site`.

The brief's own user journeys, which the harness flow below is derived from:

- View current community tree fund progress and memorial tree planting sites
- Enter donor name, dedication message, and contribution dollar amount to submit
- View the donation confirmation receipt and reload the public ledger to verify the new contribution

Out of scope, by the brief's own non-goals: credit card processing merchant accounts; tree nursery vendor invoicing.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/funds` | supporting page declared by the brief |
| `/contribute` | write route the form submits to |
| `/contributions/:id` | read-back of one stored record by its reference |
| `/ledger` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "tree fund contributions and total fund balances are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-US`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Church Lane Green" in `select[name=site]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Church Lane Green".
3. On `/`, fill form#contribution-form: `input[name=contributor]` with "Marta Vidal", `input[name=amount]` with "75", `textarea[name=message]` with "In memory of Rosa Vidal"; choose "Church Lane Green" in `select[name=site]`.
4. Submit; the read page shows "Marta Vidal", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Marta" lists "Marta Vidal" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `contributor` field can be changed to "Marta Vidal (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `contributor`, `amount`, `site` - each is required in the form and re-checked on the server.
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

- POST /contribute records the contribution on the server and redirects to /contributions/:id
- GET /ledger calculates and displays accurate total funds including all saved contributions after reload
- submitting a negative or blank contribution amount displays an accessible validation error

## Implementation status

Task: `repair`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

Seeded defects the repair must remove, quoted from the brief:

- a direct POST with a negative or non-numeric amount is accepted and stored as-is, with no server-side numeric bound (the rendered form uses type="number", so this is reachable only by posting to the endpoint directly)
- the contribution form lacks associated label elements for the contributor and amount inputs
- the client form omits the required attribute and per-field error messages, so a user is not told up front which fields are required; the server still rejects an empty submission with a 422 error page listing the missing fields

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-29/index.html`](../../targets/tr-29/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
