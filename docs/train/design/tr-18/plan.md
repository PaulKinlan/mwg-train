---
family: tr-18
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-18-v1
---

# `tr-18` functional specification — Weigh & Refill Zero Waste Pantry — Click & Collect Bulk Staples

The behaviour of the `tr-18` training family, bound to its canonical brief row
[`tr-18-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is bring-your-own-container bulk dry goods orders, in the `web-shop` archetype. The brief asks for:

> Our zero-waste grocery cooperative sells bulk grains, pulses, and olive oils where customers bring their own reusable jars. We need a pre-pack ordering app where shoppers choose dry goods by weight in grams, select jar drop-off times, and receive an order slip. Orders must be stored on the server so that reloading the checkout confirmation route retains the jar refill list.

The form the journey drives carries 6 fields: `shopper`, `email`, `staple`, `grams`, `slot`, `items`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse bulk staples, specify desired gram weight, and add items to the refill basket
- Review the basket totals, enter shopper contact information, and select a collection window
- Complete checkout, view the order pickup number, and reload the page to verify persistence

Out of scope, by the brief's own non-goals: digital scale hardware serial connection; postal shipping outside the city.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/products` | supporting page declared by the brief |
| `/basket` | supporting page declared by the brief |
| `/checkout` | write route the form submits to |
| `/orders/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "bulk food orders and scheduled jar collection slots are stored on the server"

The family's declared framework arm is `react` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-18-hono`, `pilot/projects/tr-18-raw`,
`pilot/projects/tr-18-react`, `pilot/projects/tr-18-preact`,
`pilot/projects/tr-18-vue`, `pilot/projects/tr-18-svelte`, and
`pilot/projects/tr-18-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Brown lentils" in `select[name=staple]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Brown lentils".
3. On `/`, fill form#checkout-form: `input[name=shopper]` with "Amina Yusuf", `input[name=email]` with "amina.yusuf@example.test", `input[name=grams]` with "500", `textarea[name=items]` with "500g organic rolled oats"; choose "Brown lentils" in `select[name=staple]`; choose "Afternoon (1pm - 4pm)" in `select[name=slot]`.
4. Submit; the read page shows "500g organic rolled oats", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="500g" lists "500g organic rolled oats" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `items` field can be changed to "500g organic rolled oats (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`web-shop` plan](../../../design/archetypes/web-shop/plan.md)
and [`web-shop` design](../../../design/archetypes/web-shop/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-18/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `shopper`, `email`, `staple`, `grams`, `slot`, `items` - each is required in the form and re-checked on the server.
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

- POST /checkout creates a bulk goods order and redirects to /orders/:id
- GET /orders/:id displays the itemized gram weights and total price after a page reload
- entering zero or negative weight values is prevented with clear accessible feedback

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
[`docs/train/targets/tr-18/index.html`](../../targets/tr-18/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
