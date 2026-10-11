---
family: tr-12
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-12-v1
---

# `tr-12` functional specification — CleanTech Trades Network — Heat Pump & Solar Apprenticeships

The behaviour of the `tr-12` training family, bound to its canonical brief row
[`tr-12-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is local heat pump and solar installer apprenticeships, in the `job-board` archetype. The brief asks for:

> Our regional green economy council is launching an apprenticeship board connecting clean energy contractors with trainee heat pump technicians and solar installers. Candidates must be able to search openings by trade category, read job descriptions and wage rates, and submit an application with an introduction note. Applications must be saved on the server so applicants can check their submission status.

The form the journey drives carries 6 fields: `applicant`, `email`, `phone`, `trade`, `experience`, `qualifications`.

The brief's own user journeys, which the harness flow below is derived from:

- Search clean energy apprenticeship vacancies and filter by technical discipline
- View apprenticeship details, wage standards, and entry requirement qualifications
- Fill in the apprenticeship application form, submit, and verify the confirmation reference survives a reload

Out of scope, by the brief's own non-goals: resume file uploading or virus scanning; automated interview video recording.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/jobs` | supporting page declared by the brief |
| `/jobs/:id` | read-back of one stored record by its reference |
| `/jobs/:id/apply` | write route the form submits to |
| `/applications/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "job vacancy listings and submitted candidate applications are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Solar PV Installer" in `select[name=trade]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Solar PV Installer".
3. On `/`, fill form#apprenticeship-application-form: `input[name=applicant]` with "Taylor Brooks", `input[name=email]` with "taylor.brooks@example.test", `input[name=phone]` with "+44 7700 900543", `textarea[name=qualifications]` with "Level 2 plumbing diploma with hands-on electrical basics"; choose "Solar PV Installer" in `select[name=trade]`; choose "Level 3 Apprentice" in `select[name=experience]`.
4. Submit; the read page shows "Taylor Brooks", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Taylor" lists "Taylor Brooks" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `applicant` field can be changed to "Taylor Brooks (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `applicant`, `email`, `phone`, `trade`, `experience`, `qualifications` - each is required in the form and re-checked on the server.
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

- GET /jobs?trade=heat-pumps returns only heat pump apprenticeship listings
- POST /jobs/:id/apply saves the applicant's submission and redirects to /applications/:id
- GET /applications/:id returns the submitted application details upon page refresh

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
[`docs/train/targets/tr-12/index.html`](../../targets/tr-12/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
