---
family: tr-22
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-22-v1
---

# `tr-22` functional specification — Canopy Guardian — Urban Street Tree Health & Watering Monitor

The behaviour of the `tr-22` training family, bound to its canonical brief row
[`tr-22-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is urban forestry street tree health reporting, in the `dashboard` archetype. The brief asks for:

> Our neighbourhood urban forestry committee monitors newly planted street trees and needs a community health dashboard. Residents should be able to view a map-aligned table of street trees, check species and watering frequency, and log a watering event or report insect damage. Logged maintenance actions must be saved on the server and immediately update the tree health dashboard.

The form the journey drives carries 6 fields: `tree`, `steward`, `timestamp`, `action`, `litres`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Search street trees by neighbourhood block and check recent watering dates
- Open a specific tree profile to view species, planting year, and drought risk rating
- Submit a tree watering confirmation, view the updated status, and reload the summary page

Out of scope, by the brief's own non-goals: satellite remote sensing imagery analysis; municipal chainsaw work orders.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/trees` | supporting page declared by the brief |
| `/trees/:id` | read-back of one stored record by its reference |
| `/trees/:id/log` | write route the form submits to |
| `/canopy-summary` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "tree health reports and volunteer watering logs are persisted on the server"

The family's declared framework arm is `react` and its locale is `en-US`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Insect damage observed" in `select[name=action]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Insect damage observed".
3. On `/`, fill form#tree-log-form: `input[name=tree]` with "Maple #104", `input[name=steward]` with "Rowan Thorne", `input[name=timestamp]` with "2026-05-18 10:15", `input[name=litres]` with "20", `textarea[name=notes]` with "Bag emptied and sapling thriving"; choose "Insect damage observed" in `select[name=action]`.
4. Submit; the read page shows "2026-05-18 10:15", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="2026-05-18" lists "2026-05-18 10:15" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `timestamp` field can be changed to "2026-05-18 10:15 (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `tree`, `steward`, `timestamp`, `action` - each is required in the form and re-checked on the server.
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

- POST /trees/:id/log records a watering event and updates the tree's last-watered date
- GET /trees/:id shows the updated maintenance timestamp following a page reload
- all status tables and action forms meet accessibility standards with proper aria labels

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
[`docs/train/targets/tr-22/index.html`](../../targets/tr-22/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
