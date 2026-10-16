---
family: tr-26
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-26-v1
---

# `tr-26` functional specification — Atlas Roasters — Single-Origin Coffee Subscription Manager

The behaviour of the `tr-26` training family, bound to its canonical brief row
[`tr-26-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is single-origin coffee subscription renewal and grind preference, in the `web-shop` archetype. The brief asks for:

> Our independent coffee roastery has an online subscription renewal page where subscribers update their roast selections and grind preferences, but customers report that updates vanish on refresh. Repair the app so customer selections are saved to the server, form errors are announced properly to assistive technologies, and pressing enter does not trigger an accidental early submit.

The form the journey drives carries 6 fields: `subscriber`, `beans`, `grind`, `frequency`, `bags`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Open existing coffee subscription profile and review currently selected beans and grind level
- Modify grind preference to espresso and update bag delivery frequency
- Save updated subscription preferences and reload the page to verify settings remain stored

Out of scope, by the brief's own non-goals: payment card details collection; international shipping tariff calculation.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/subscriptions` | supporting page declared by the brief |
| `/subscriptions/:id` | read-back of one stored record by its reference |
| `/subscriptions/:id/edit` | write route the form submits to |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "updated subscription preferences and delivery frequencies are saved on the server"

The family's declared framework arm is `react` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-26-hono`, `pilot/projects/tr-26-raw`,
`pilot/projects/tr-26-react`, `pilot/projects/tr-26-preact`,
`pilot/projects/tr-26-vue`, `pilot/projects/tr-26-svelte`, and
`pilot/projects/tr-26-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Colombia Huila" in `select[name=beans]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Colombia Huila".
3. On `/`, fill form#subscription-form: `input[name=subscriber]` with "Nadia Okonjo", `input[name=bags]` with "2", `textarea[name=notes]` with "Leave with the concierge"; choose "Colombia Huila" in `select[name=beans]`; choose "Espresso" in `select[name=grind]`; choose "Fortnightly" in `select[name=frequency]`.
4. Submit; the read page shows "Nadia Okonjo", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Nadia" lists "Nadia Okonjo" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `subscriber` field can be changed to "Nadia Okonjo (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`web-shop` plan](../../../design/archetypes/web-shop/plan.md)
and [`web-shop` design](../../../design/archetypes/web-shop/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-26/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `subscriber`, `beans`, `grind`, `frequency`, `bags` - each is required in the form and re-checked on the server.
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

- POST /subscriptions/:id/edit updates the subscriber preferences on the server
- GET /subscriptions/:id displays the updated grind and frequency settings after a page reload
- form validation announces missing required choices to screen readers

## Implementation status

Task: `repair`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

Seeded defects the repair must remove, quoted from the brief:

- in-page validation messages do appear as visible text and change the field styling, but the fields' aria-invalid is never synchronised and no live region announces them, so the error state is conveyed visually only (the server's own incomplete-form response does carry role="alert")
- pressing Enter inside any text input submits the form immediately, before the remaining required fields have been completed

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-26/index.html`](../../targets/tr-26/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
