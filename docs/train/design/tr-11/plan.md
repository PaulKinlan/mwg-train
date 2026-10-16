---
family: tr-11
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-11-v1
---

# `tr-11` functional specification — Crust & Crumb Micro-Bakery — Friday Bake Loaf Pre-Orders

The behaviour of the `tr-11` training family, bound to its canonical brief row
[`tr-11-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is sourdough cottage bakery weekly loaf orders, in the `restaurant-ordering` archetype. The brief asks for:

> I bake artisanal sourdough from a micro-bakery at home and need a weekly pre-order system for neighbours. Customers should choose loaf styles such as country white or seeded rye, select a Friday pickup time window, and submit their order with their contact phone. Orders must be stored on the server so reopening the order confirmation URL displays their bread allocation.

The form the journey drives carries 6 fields: `customer`, `phone`, `style`, `quantity`, `window`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse the weekly bake menu and select desired quantities of bread varieties
- Fill out contact information and choose an afternoon collection time window
- Submit the bread reservation, check the pickup reference code, and reload to confirm details

Out of scope, by the brief's own non-goals: credit card processing; courier home delivery logistics.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/menu` | supporting page declared by the brief |
| `/order` | write route the form submits to |
| `/orders/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "bread orders and collection time slots are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-11-hono`, `pilot/projects/tr-11-raw`,
`pilot/projects/tr-11-react`, `pilot/projects/tr-11-preact`,
`pilot/projects/tr-11-vue`, `pilot/projects/tr-11-svelte`, and
`pilot/projects/tr-11-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Seeded Rye Sourdough" in `select[name=style]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Seeded Rye Sourdough".
3. On `/`, fill form#bread-order-form: `input[name=customer]` with "Nadia Rossi", `input[name=phone]` with "+44 7700 900888", `input[name=quantity]` with "2", `textarea[name=notes]` with "Please slice if possible"; choose "Seeded Rye Sourdough" in `select[name=style]`; choose "Friday 14:00 - 16:00" in `select[name=window]`.
4. Submit; the read page shows "Nadia Rossi", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Nadia" lists "Nadia Rossi" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `customer` field can be changed to "Nadia Rossi (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`restaurant-ordering` plan](../../../design/archetypes/restaurant-ordering/plan.md)
and [`restaurant-ordering` design](../../../design/archetypes/restaurant-ordering/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-11/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `customer`, `phone`, `style`, `quantity`, `window` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `css/responsive-design`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /order saves the customer's bread order and redirects to /orders/:id
- GET /orders/:id renders the ordered items, total quantity, and collection window on reload
- submitting an order with zero total loaves displays an error message and stops submission

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
[`docs/train/targets/tr-11/index.html`](../../targets/tr-11/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
