---
family: tr-23
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-23-v1
---

# `tr-23` functional specification — Civic Warm Homes Partnership — Home Retrofit Grant & Heat Pump Subsidy Calculator

The behaviour of the `tr-23` training family, bound to its canonical brief row
[`tr-23-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is home energy retrofit subsidy eligibility check, in the `survey-form` archetype. The brief asks for:

> Our municipal climate transition office needs a simple self-assessment questionnaire to help homeowners check eligibility for insulation and heat pump grants. Residents should enter their home build decade, heating fuel type, and existing wall insulation to receive a tailored list of grant schemes. Completed assessments must be saved on the server so applicants can retrieve their assessment report by reference ID.

The form the journey drives carries 7 fields: `applicant`, `email`, `address`, `era`, `heating`, `insulation`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Answer sequential questions regarding property construction era, current boiler, and loft insulation
- Provide contact details and submit the questionnaire to compute eligible retrofit subsidies
- Review the customized grant eligibility report and reload the page to confirm stored results

Out of scope, by the brief's own non-goals: official certified energy assessor sign-off; contractor quote bidding engine.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/calculator` | supporting page declared by the brief |
| `/calculator/submit` | write route the form submits to |
| `/reports/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "home energy assessment answers and generated grant recommendations are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-23-hono`, `pilot/projects/tr-23-raw`,
`pilot/projects/tr-23-react`, `pilot/projects/tr-23-preact`,
`pilot/projects/tr-23-vue`, `pilot/projects/tr-23-svelte`, and
`pilot/projects/tr-23-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "1930-1965" in `select[name=era]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "1930-1965".
3. On `/`, fill form#eligibility-form: `input[name=applicant]` with "Fiona Gallagher", `input[name=email]` with "fiona.gallagher@example.test", `input[name=address]` with "42 Orchard Way, Lincoln", `textarea[name=notes]` with "Drafty bay windows on ground floor"; choose "1930-1965" in `select[name=era]`; choose "Heat pump" in `select[name=heating]`; choose "Cavity uninsulated" in `select[name=insulation]`.
4. Submit; the read page shows "42 Orchard Way, Lincoln", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Orchard" lists "42 Orchard Way, Lincoln" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `address` field can be changed to "42 Orchard Way, Lincoln (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-23/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-23/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-23/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-23/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `applicant`, `email`, `address`, `era`, `heating`, `insulation` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `accessibility/accessible-error-announcement`, `css/responsive-design` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /calculator/submit computes subsidy eligibility and redirects to /reports/:id
- GET /reports/:id returns the saved property characteristics and qualifying grant list on reload
- incomplete form sections display accessible warning messages and prevent submission

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
[`docs/train/targets/tr-23/index.html`](../../targets/tr-23/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
