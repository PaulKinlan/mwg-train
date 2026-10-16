---
family: tr-09
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-09-v1
---

# `tr-09` functional specification — Forage & Fern Botanical School — Wild Edibles Field Course Booking

The behaviour of the `tr-09` training family, bound to its canonical brief row
[`tr-09-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is wild edibles identification field course booking, in the `course-enrolment` archetype. The brief asks for:

> We offer seasonal woodland foraging workshops and need a course enrolment website. Participants should browse beginner mushroom identification and wild greens masterclasses, check available weekend dates, and submit an enrolment form with dietary or mobility notes. Enrolments must be stored on the server so reloading the enrolment confirmation page retains their roster place.

The form the journey drives carries 5 fields: `student`, `contact`, `course`, `session`, `dietary`.

The brief's own user journeys, which the harness flow below is derived from:

- View course listings including syllabus, duration, terrain difficulty, and available dates
- Complete the enrolment form with participant name, emergency contact, and dietary considerations
- Submit the form, view the enrolment voucher page, and reload to confirm persistence

Out of scope, by the brief's own non-goals: course fee payment gateway; downloadable PDF textbook generation.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/courses` | supporting page declared by the brief |
| `/courses/:id` | read-back of one stored record by its reference |
| `/enrol` | write route the form submits to |
| `/enrolments/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "course enrolments and attendee rosters are persisted on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-09-hono`, `pilot/projects/tr-09-raw`,
`pilot/projects/tr-09-react`, `pilot/projects/tr-09-preact`,
`pilot/projects/tr-09-vue`, `pilot/projects/tr-09-svelte`, and
`pilot/projects/tr-09-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Wild Greens Masterclass" in `select[name=course]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Wild Greens Masterclass".
3. On `/`, fill form#course-enrolment-form: `input[name=student]` with "Maya Soren", `input[name=contact]` with "+44 7700 300456", `textarea[name=dietary]` with "No nuts; wheelchair access required"; choose "Wild Greens Masterclass" in `select[name=course]`; choose "Sunday 18 May" in `select[name=session]`.
4. Submit; the read page shows "Maya Soren", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Maya" lists "Maya Soren" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `student` field can be changed to "Maya Soren (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-09/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-09/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-09/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-09/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `student`, `contact`, `course`, `session` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `accessibility/accessibility`, `css/responsive-design` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /enrol registers the student and redirects to /enrolments/:id
- GET /enrolments/:id shows the course title, enrolled student name, and session date after reload
- submitting without an emergency contact number halts submission and shows field validation

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
[`docs/train/targets/tr-09/index.html`](../../targets/tr-09/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
