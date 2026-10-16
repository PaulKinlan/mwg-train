---
family: tr-15
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-15-v1
---

# `tr-15` functional specification — Oakridge Tenant Co-operative — Maintenance Ledger & Expenses

The behaviour of the `tr-15` training family, bound to its canonical brief row
[`tr-15-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is tenant collective maintenance expense logging, in the `expense-tracker` archetype. The brief asks for:

> Our tenant cooperative manages a twelve-unit apartment building and needs a shared ledger for communal repair expenses. Tenants should be able to log out-of-pocket costs for hallway lightbulbs, winter salt, or plumbing washers, providing date, amount, and receipt vendor. All logged items must persist on the server so the monthly balance total is accurate upon reload.

The form the journey drives carries 6 fields: `tenant`, `vendor`, `category`, `amount`, `date`, `description`.

The brief's own user journeys, which the harness flow below is derived from:

- Review the running ledger of building maintenance costs and total collective spend
- Fill out the expense logging form with purchase category, vendor, amount, and date
- Submit the entry, observe the ledger total update, and reload the browser to verify data

Out of scope, by the brief's own non-goals: bank account ACH transfers; receipt optical character recognition scanning.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/expenses` | supporting page declared by the brief |
| `/expenses/new` | write route the form submits to |
| `/expenses/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "expense records and calculated aggregate balances are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-15-hono`, `pilot/projects/tr-15-raw`,
`pilot/projects/tr-15-react`, `pilot/projects/tr-15-preact`,
`pilot/projects/tr-15-vue`, `pilot/projects/tr-15-svelte`, and
`pilot/projects/tr-15-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Winter Salt and Grounds" in `select[name=category]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Winter Salt and Grounds".
3. On `/`, fill form#maintenance-expense-form: `input[name=tenant]` with "Casey Duval", `input[name=vendor]` with "City Hardware Supply", `input[name=amount]` with "42", `input[name=date]` with "2026-03-15", `input[name=description]` with "Hallway LED lightbulbs"; choose "Winter Salt and Grounds" in `select[name=category]`.
4. Submit; the read page shows "Hallway LED lightbulbs", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Hallway" lists "Hallway LED lightbulbs" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `description` field can be changed to "Hallway LED lightbulbs (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-15/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-15/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-15/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-15/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `tenant`, `vendor`, `category`, `amount`, `date`, `description` - each is required in the form and re-checked on the server.
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

- POST /expenses/new records the expense and updates the cumulative total
- GET /expenses renders all previously recorded items and correct running balance after reload
- submitting a negative or non-numeric amount displays an accessible validation error

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
[`docs/train/targets/tr-15/index.html`](../../targets/tr-15/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
