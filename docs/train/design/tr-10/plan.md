---
family: tr-10
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-10-v1
---

# `tr-10` functional specification — Greenwood Safe Streets — Community Crosswalk & Traffic Survey

The behaviour of the `tr-10` training family, bound to its canonical brief row
[`tr-10-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is residential street safety and crosswalk feedback survey, in the `survey-form` archetype. The brief asks for:

> Our neighbourhood association is gathering community input on speeding and pedestrian crossings near the elementary school. We need an accessible survey form where neighbours select their street block, rate pedestrian safety concerns, and propose crosswalk improvements. Responses must be saved on the server so that duplicate submissions are tracked and summary statistics can be reviewed.

The form the journey drives carries 5 fields: `respondent`, `location`, `hazard`, `rating`, `proposals`.

The brief's own user journeys, which the harness flow below is derived from:

- Read survey introduction and complete the multi-question street safety questionnaire
- Provide street location, select hazard categories, and submit the survey
- View the response confirmation receipt and reload the page to ensure submission integrity

Out of scope, by the brief's own non-goals: GPS geolocation tracking of respondents; municipal council voting binding auth.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/survey` | write route the form submits to |
| `/survey/complete/:id` | read-back of one stored record by its reference |
| `/results` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "completed survey responses are stored on the server and aggregate into results"

The family's declared framework arm is `react` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-10-hono`, `pilot/projects/tr-10-raw`,
`pilot/projects/tr-10-react`, `pilot/projects/tr-10-preact`,
`pilot/projects/tr-10-vue`, `pilot/projects/tr-10-svelte`, and
`pilot/projects/tr-10-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Poor crossing visibility" in `select[name=hazard]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Poor crossing visibility".
3. On `/`, fill form#street-safety-survey-form: `input[name=respondent]` with "Jo Delgado", `input[name=location]` with "Oak Avenue at 2nd Street", `textarea[name=proposals]` with "Install a raised zebra crossing and flashing beacon"; choose "Poor crossing visibility" in `select[name=hazard]`; choose "2 - Moderate concern" in `select[name=rating]`.
4. Submit; the read page shows "Jo Delgado", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Delgado" lists "Jo Delgado" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `respondent` field can be changed to "Jo Delgado (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-10/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-10/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-10/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-10/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `respondent`, `location`, `hazard`, `rating` - each is required in the form and re-checked on the server.
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

- POST /survey persists response data and redirects to /survey/complete/:id
- GET /results displays aggregate percentage responses across recorded hazard categories
- all rating scales and radio groups have programmatic labels and keyboard navigation support

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
[`docs/train/targets/tr-10/index.html`](../../targets/tr-10/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
