---
family: tr-13
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-13-v1
---

# `tr-13` functional specification — Urban Soil Collaborative — Composting Handbook & Soil Test Registry

The behaviour of the `tr-13` training family, bound to its canonical brief row
[`tr-13-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is backyard composting guidelines and soil test registry, in the `docs-site` archetype. The brief asks for:

> Our community garden network needs a documentation handbook for backyard composting alongside a community soil test registry. Gardeners should be able to navigate composting troubleshooting guides by category, search by symptom like foul odour or slow breakdown, and submit local soil pH test results. Soil test submissions must be saved on the server so neighbours can look up soil data by neighbourhood plot.

The form the journey drives carries 5 fields: `gardener`, `plot`, `ph`, `organic`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Navigate composting documentation chapters and find troubleshooting instructions for nitrogen balance
- Enter soil testing measurements including pH, organic matter percentage, and plot sector
- Submit soil test results, view the confirmation record, and reload to verify data persistence

Out of scope, by the brief's own non-goals: laboratory chemical assay file parsing; commercial fertilizer advertising.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/docs` | supporting page declared by the brief |
| `/docs/:slug` | read-back of one stored record by its reference |
| `/soil-tests` | supporting page declared by the brief |
| `/soil-tests/new` | write route the form submits to |
| `/soil-tests/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "submitted soil test records and documentation index are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-13-hono`, `pilot/projects/tr-13-raw`,
`pilot/projects/tr-13-react`, `pilot/projects/tr-13-preact`,
`pilot/projects/tr-13-vue`, `pilot/projects/tr-13-svelte`, and
`pilot/projects/tr-13-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then fill `input[name=plot]` with "Plot 14-B", then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Plot 14-B".
3. On `/`, fill form#soil-test-form: `input[name=gardener]` with "Avery Quinn", `input[name=plot]` with "Plot 14-B", `input[name=ph]` with "6.8", `input[name=organic]` with "5", `textarea[name=notes]` with "High earthworm activity and dark loamy texture".
4. Submit; the read page shows "Plot 14-B", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Plot" lists "Plot 14-B" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `plot` field can be changed to "Plot 14-B (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-13/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-13/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-13/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-13/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `gardener`, `plot`, `ph`, `organic` - each is required in the form and re-checked on the server.
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

- POST /soil-tests/new stores a soil measurement entry and redirects to /soil-tests/:id
- GET /soil-tests/:id renders the saved soil pH and plot number after a browser reload
- navigation menus and search filters are accessible via standard keyboard commands

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
[`docs/train/targets/tr-13/index.html`](../../targets/tr-13/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
