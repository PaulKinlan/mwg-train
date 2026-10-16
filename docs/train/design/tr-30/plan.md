---
family: tr-30
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-30-v1
---

# `tr-30` functional specification — Shoreline Marine Stewardship — Coastal Beach Cleanup & Kit Pass

The behaviour of the `tr-30` training family, bound to its canonical brief row
[`tr-30-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is low-tide beach cleanup zone assignment and kit allocation, in the `event-registration` archetype. The brief asks for:

> Our marine conservation group coordinates low-tide beach cleanups with allocated beach sectors and litter kit pickups, but our registration app loses registrations on reload and submits accidentally on Enter. Repair the registration tool so volunteer assignments persist on the server, required fields indicate errors clearly, and pressing Enter does not trigger premature submission.

The form the journey drives carries 3 fields: `volunteer`, `phone`, `zone`.

The brief's own user journeys, which the harness flow below is derived from:

- Review beach cleanup event details, safety briefing times, and available coastal zones
- Select a cleanup sector, provide volunteer name and contact number, and submit registration
- Receive the zone assignment pass and reload the browser to ensure the volunteer slot is preserved

Out of scope, by the brief's own non-goals: marine debris weighbridge digital scale telemetry; tide height sensor automation.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/cleanups` | supporting page declared by the brief |
| `/cleanups/:id/register` | write route the form submits to |
| `/passes/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "cleanup volunteer registrations and sector capacity allocations are stored on the server"

The family's declared framework arm is `react` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-30-hono`, `pilot/projects/tr-30-raw`,
`pilot/projects/tr-30-react`, `pilot/projects/tr-30-preact`,
`pilot/projects/tr-30-vue`, `pilot/projects/tr-30-svelte`, and
`pilot/projects/tr-30-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Harbour Wall" in `select[name=zone]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Harbour Wall".
3. On `/`, fill form#registration-form: `input[name=volunteer]` with "Priya Raman", `input[name=phone]` with "+44 7700 900654"; choose "Harbour Wall" in `select[name=zone]`.
4. Submit; the read page shows "Priya Raman", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Priya" lists "Priya Raman" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `volunteer` field can be changed to "Priya Raman (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-30/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-30/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-30/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-30/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `volunteer`, `phone`, `zone` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `forms/forms`, `accessibility/accessibility`, drawn from the
  applicable set `forms/forms`, `forms/required-field-feedback`, `forms/ime-safe-enter-submit`, `accessibility/accessibility`, `accessibility/accessible-error-announcement` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /cleanups/:id/register saves the volunteer registration to the server and returns a pass ID
- GET /passes/:id displays the volunteer's assigned beach zone and safety briefing time after reload
- form submission requires choosing a valid beach zone and displays accessible error feedback if omitted

## Implementation status

Task: `repair`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

Seeded defects the repair must remove, quoted from the brief:

- pressing Enter inside the volunteer name input submits the form immediately, before the remaining fields have been completed
- the in-page required-field error is not announced to assistive technology; the page does display required-field text and the server's rejection page carries role="alert", but the client-side indication adds no announcement of its own

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-30/index.html`](../../targets/tr-30/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
