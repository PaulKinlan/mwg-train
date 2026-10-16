---
family: tr-02
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-02-v1
---

# `tr-02` functional specification — Foxhill Orchard & Press — Seasonal Cider Pre-Orders

The behaviour of the `tr-02` training family, bound to its canonical brief row
[`tr-02-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is seasonal cider pre-orders and local pickup, in the `web-shop` archetype. The brief asks for:

> Our heritage orchard produces small-batch seasonal cider that sells out quickly every autumn. We need a simple web store where local buyers can view current pressing varieties, add bottles to an order, and choose a weekend farm gate pickup date. Orders must persist on the server so that reopening the confirmation link displays their allocated pickup slot and summary.

The form the journey drives carries 7 fields: `customer`, `email`, `variety`, `quantity`, `collection`, `slot`, `summary`.

The brief's own user journeys, which the harness flow below is derived from:

- View available cider varieties, adjust bottle quantities, and add items to cart
- Proceed to checkout, enter customer contact information, and choose a collection date
- Submit the pre-order, see the confirmation reference, and reload to ensure the order is intact

Out of scope, by the brief's own non-goals: online credit card payment; home delivery shipping options.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/ciders` | supporting page declared by the brief |
| `/cart` | supporting page declared by the brief |
| `/checkout` | write route the form submits to |
| `/orders/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "orders and chosen pickup slots are saved on the server and retrievable by order ID"

The family's declared framework arm is `react` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-02-hono`, `pilot/projects/tr-02-raw`,
`pilot/projects/tr-02-react`, `pilot/projects/tr-02-preact`,
`pilot/projects/tr-02-vue`, `pilot/projects/tr-02-svelte`, and
`pilot/projects/tr-02-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Dabinett Heritage" in `select[name=variety]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Dabinett Heritage".
3. On `/`, fill form#cider-order-form: `input[name=customer]` with "Hannah Bailey", `input[name=email]` with "hannah@example.test", `input[name=quantity]` with "6", `input[name=collection]` with "2026-10-17", `input[name=summary]` with "6 bottles Kingston Black Reserve"; choose "Dabinett Heritage" in `select[name=variety]`; choose "Saturday afternoon (12pm - 4pm)" in `select[name=slot]`.
4. Submit; the read page shows "6 bottles Kingston Black Reserve", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="bottles" lists "6 bottles Kingston Black Reserve" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `summary` field can be changed to "6 bottles Kingston Black Reserve (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`web-shop` plan](../../../design/archetypes/web-shop/plan.md)
and [`web-shop` design](../../../design/archetypes/web-shop/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-02/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `customer`, `email`, `variety`, `quantity`, `collection`, `slot`, `summary` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `css/css-layout`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /checkout creates an order record and redirects to /orders/:id
- GET /orders/:id displays the order summary, total quantity, and collection slot after reload
- empty cart checkout is prevented with an accessible alert message

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
[`docs/train/targets/tr-02/index.html`](../../targets/tr-02/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
