---
family: tr-17
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-17-v1
---

# `tr-17` functional specification — Valley & Moor Livestock Veterinary — Ambulatory Farm Visit Booking

The behaviour of the `tr-17` training family, bound to its canonical brief row
[`tr-17-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is rural farm animal vet visit scheduling, in the `booking` archetype. The brief asks for:

> Our ambulatory veterinary practice visits livestock and horses across rural parishes and needs an online visit booking tool. Farmers should specify their holding location, select species requiring examination, and choose an urgent or routine visit date. Appointments must be stored on the server so veterinarians and farmers can view confirmed calls after refreshing the schedule.

The form the journey drives carries 8 fields: `farmer`, `phone`, `species`, `address`, `parish`, `date`, `window`, `symptoms`.

The brief's own user journeys, which the harness flow below is derived from:

- Select farm animal species and describe primary medical or routine checkup symptoms
- Provide farm address, county parish number, and select preferred morning or afternoon visit window
- Submit the visit request, inspect the dispatch confirmation reference, and reload to verify

Out of scope, by the brief's own non-goals: prescription drug ordering cart; tele-health video conferencing stream.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/services` | supporting page declared by the brief |
| `/book-visit` | write route the form submits to |
| `/visits/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "veterinary visit requests and farm locations are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-17-hono`, `pilot/projects/tr-17-raw`,
`pilot/projects/tr-17-react`, `pilot/projects/tr-17-preact`,
`pilot/projects/tr-17-vue`, `pilot/projects/tr-17-svelte`, and
`pilot/projects/tr-17-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Sheep" in `select[name=species]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Sheep".
3. On `/`, fill form#visit-booking-form: `input[name=farmer]` with "Gareth Evans", `input[name=phone]` with "+44 7700 900345", `input[name=address]` with "Pen-y-Bryn Farm, Llanfair", `input[name=parish]` with "CPH 42/108/0019", `input[name=date]` with "2026-11-15", `textarea[name=symptoms]` with "Calf showing mild cough and decreased appetite"; choose "Sheep" in `select[name=species]`; choose "Afternoon (12pm - 5pm)" in `select[name=window]`.
4. Submit; the read page shows "Calf showing mild cough and decreased appetite", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Calf" lists "Calf showing mild cough and decreased appetite" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `symptoms` field can be changed to "Calf showing mild cough and decreased appetite (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-17/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-17/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-17/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-17/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `farmer`, `phone`, `species`, `address`, `parish`, `date`, `window`, `symptoms` - each is required in the form and re-checked on the server.
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

- POST /book-visit creates a visit record and redirects to /visits/:id
- GET /visits/:id shows the animal type, symptoms summary, and farm address on reload
- failing to provide an emergency contact phone number triggers an inline validation error

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
[`docs/train/targets/tr-17/index.html`](../../targets/tr-17/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
