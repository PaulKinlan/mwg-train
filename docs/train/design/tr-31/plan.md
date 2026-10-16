---
family: tr-31
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-31-v1
---

# `tr-31` functional specification — Aether Audio — Aether One Planar Magnetic Headphone Launch & Pre-Order

The behaviour of the `tr-31` training family, bound to its canonical brief row
[`tr-31-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Aether Audio Aether One planar magnetic headphone launch and pre-order, in the `scroll-storytelling-launch` archetype. The brief asks for:

> Our acoustic engineering studio, Aether Audio, is launching the Aether One open-back planar magnetic headphones and needs a scroll-driven product launch and pre-order site. Visitors should be able to step through the acoustic architecture chapters, compare finishes and ear-pad materials, and submit a pre-order reservation that persists on the server and remains visible after reloading the confirmation page.

The form the journey drives carries 5 fields: `buyer`, `email`, `finish`, `earpads`, `engraving`.

The brief's own user journeys, which the harness flow below is derived from:

- Explore the sticky chapter navigation, exploded planar driver anatomy, and acoustic specifications
- Select a milled chassis finish and ear-pad material, enter buyer contact details, and submit a pre-order
- View the persisted pre-order voucher and reload the page to verify the reservation remains stored

Out of scope, by the brief's own non-goals: WebGL 60fps shader requirement; live card payment gateway integration.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/preorders` | write route the form submits to |
| `/preorders/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "headphone pre-order reservations and selected finish configurations are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-31-hono`, `pilot/projects/tr-31-raw`,
`pilot/projects/tr-31-react`, `pilot/projects/tr-31-preact`,
`pilot/projects/tr-31-vue`, `pilot/projects/tr-31-svelte`, and
`pilot/projects/tr-31-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Warm Brushed Copper" in `select[name=finish]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Warm Brushed Copper".
3. On `/`, fill form#aether-preorder-form: `input[name=buyer]` with "Clara Vance", `input[name=email]` with "clara.vance@aether-acoustics.example", `textarea[name=engraving]` with "Studio Reference Batch 04"; choose "Warm Brushed Copper" in `select[name=finish]`; choose "Acoustic Micro-Suede" in `select[name=earpads]`.
4. Submit; the read page shows "Clara Vance", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Clara" lists "Clara Vance" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `buyer` field can be changed to "Clara Vance (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`scroll-storytelling-launch` plan](../../../design/archetypes/scroll-storytelling-launch/plan.md)
and [`scroll-storytelling-launch` design](../../../design/archetypes/scroll-storytelling-launch/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-31/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `buyer`, `email`, `finish`, `earpads` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `forms/forms`, drawn from the
  applicable set `accessibility/accessibility`, `forms/forms`, `forms/required-field-feedback`, `css/responsive-design`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /preorders records the headphone pre-order on the server and redirects to /preorders/:id
- GET /preorders/:id displays the buyer name, selected finish, and ear-pad material after reload
- chapter navigation and finish selectors provide full keyboard focus and reduced-motion support

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
[`docs/train/targets/tr-31/index.html`](../../targets/tr-31/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
