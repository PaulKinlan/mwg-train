---
family: tr-05
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-05-v1
---

# `tr-05` functional specification — Meadowbrook Wildlife Hospital — Volunteer Onboarding & Credentials

The behaviour of the `tr-05` training family, bound to its canonical brief row
[`tr-05-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is wildlife rehabilitation volunteer intake and credentials, in the `onboarding-auth` archetype. The brief asks for:

> Our regional wildlife rehabilitation hospital needs an onboarding portal for prospective volunteers. Applicants should register with contact details, specify vaccination status and handling experience, and create a volunteer login. The server must securely persist application state so volunteers can log back in later and see their approval status.

The form the journey drives carries 8 fields: `name`, `email`, `phone`, `password`, `vaccination`, `experience`, `species`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Fill out the multi-field volunteer onboarding form with contact and experience details
- Submit registration credentials and view the pending onboarding confirmation page
- Log out and log back in to review the stored volunteer profile information

Out of scope, by the brief's own non-goals: criminal record background check automation; SMS two-factor verification.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/register` | write route the form submits to |
| `/login` | write route the form submits to |
| `/volunteer/profile` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "volunteer profiles and authentication credentials survive server restarts and reloads"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-05-hono`, `pilot/projects/tr-05-raw`,
`pilot/projects/tr-05-react`, `pilot/projects/tr-05-preact`,
`pilot/projects/tr-05-vue`, `pilot/projects/tr-05-svelte`, and
`pilot/projects/tr-05-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Tetanus only" in `select[name=vaccination]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Tetanus only".
3. On `/`, fill form#volunteer-registration-form: `input[name=name]` with "Morgan Reed", `input[name=email]` with "morgan.reed@example.test", `input[name=phone]` with "+44 7700 900456", `input[name=password]` with "Str0ng#Passw0rd!2026", `textarea[name=notes]` with "Wildlife first aid certified, 3 years mammal rescue experience"; choose "Tetanus only" in `select[name=vaccination]`; choose "1 to 2 years experience" in `select[name=experience]`; choose "Small mammals and hedgehogs" in `select[name=species]`.
4. Submit; the read page shows "Morgan Reed", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Morgan" lists "Morgan Reed" inside `#search-results` and does not list "zzz-decoy".

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-05/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-05/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-05/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-05/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `name`, `email`, `phone`, `password`, `vaccination`, `experience`, `species` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `security/security`, drawn from the
  applicable set `forms/forms`, `forms/autofill-sign-up-form`, `forms/autofill-sign-in-form`, `accessibility/accessibility`, `security/security` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /register creates a volunteer account and redirects to /volunteer/profile
- POST /login with valid credentials establishes a session and renders the saved profile
- passwords must meet strength criteria and display accessible inline feedback if invalid

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
[`docs/train/targets/tr-05/index.html`](../../targets/tr-05/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
