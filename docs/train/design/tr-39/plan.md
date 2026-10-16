---
family: tr-39
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-39-v1
---

# `tr-39` functional specification — Rig Selection Board — GPU Benchmark Comparison & Build Selection

The behaviour of the `tr-39` training family, bound to its canonical brief row
[`tr-39-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Rig Selection Board GPU benchmark comparison and build selection, in the `product-card-comparison` archetype. The brief asks for:

> Rig Selection Board is a workstation hardware comparison tool where builders line up graphics cards side by side across memory, power draw, slot length, and warranty before locking in a card for their build. Build the card catalogue, comparison matrix, and selection form so the chosen card and builder notes are stored on the server and shown on reload.

The form the journey drives carries 4 fields: `builder_name`, `card_model`, `psu_wattage`, `rig_notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Compare graphics card memory, power draw, length, and warranty side by side on the Rig Selection Board
- Select a graphics card model, enter builder name, power supply wattage budget, and chassis thermal notes
- Save the selected card to the workstation build on the server and reload to confirm the selection persists

Out of scope, by the brief's own non-goals: automated cryptocurrency mining calculator; live retailer stock scraping.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/selections` | write route the form submits to |
| `/selections/:id` | read-back of one stored record by its reference |
| `/compare` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "saved workstation card selections and builder power-budget notes are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-39-hono`, `pilot/projects/tr-39-raw`,
`pilot/projects/tr-39-react`, `pilot/projects/tr-39-preact`,
`pilot/projects/tr-39-vue`, `pilot/projects/tr-39-svelte`, and
`pilot/projects/tr-39-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Northwind Arc A770 (16 GB)" in `select[name=card_model]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Northwind Arc A770 (16 GB)".
3. On `/`, fill form#rig-selection-form: `input[name=builder_name]` with "Gideon Park", `input[name=psu_wattage]` with "750", `textarea[name=rig_notes]` with "Paired with 280mm mesh workstation chassis; 225W TDP within quiet fan curve."; choose "Northwind Arc A770 (16 GB)" in `select[name=card_model]`.
4. Submit; the read page shows "Gideon Park", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Gideon" lists "Gideon Park" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `builder_name` field can be changed to "Gideon Park (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-39/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-39/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-39/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-39/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `builder_name`, `card_model`, `psu_wattage`, `rig_notes` - each is required in the form and re-checked on the server.
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

- POST /selections saves the selected graphics card build on the server and redirects to /selections/:id
- GET /selections/:id displays the builder name, chosen graphics card model, and power budget after reload
- comparison checkboxes and selection form fields provide visible focus rings and programmatic labels

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
[`docs/train/targets/tr-39/index.html`](../../targets/tr-39/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
