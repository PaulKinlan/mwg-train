---
family: tr-20
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-20-v1
---

# `tr-20` functional specification — Ceilidh & Session Tune Vault — Folk Music Archive & Tempo Notes

The behaviour of the `tr-20` training family, bound to its canonical brief row
[`tr-20-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is traditional tune tune-sheet repository and tempo notes, in the `community-forum` archetype. The brief asks for:

> Our weekly pub folk music session needs a shared digital tune repository and discussion board. Musicians should be able to look up traditional jigs and reels, view key signatures and ABC notation snippets, and post tempo notes or regional tune variations. Posted notes must be stored on the server so session players can review discussion threads after reloading the tune page.

The form the journey drives carries 6 fields: `author`, `tune`, `rhythm`, `key`, `tempo`, `note`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse the tune library and filter by dance rhythm such as reel, jig, or hornpipe
- Inspect a tune's musical key, standard notation snippet, and historical background
- Post a tempo suggestion or variation note, submit, and reload to confirm the note appears

Out of scope, by the brief's own non-goals: MIDI synthesis sound playback engine; copyrighted sheet music commerce.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/tunes` | supporting page declared by the brief |
| `/tunes/:id` | read-back of one stored record by its reference |
| `/tunes/:id/notes` | write route the form submits to |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "traditional tune records and musician discussion comments are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-20-hono`, `pilot/projects/tr-20-raw`,
`pilot/projects/tr-20-react`, `pilot/projects/tr-20-preact`,
`pilot/projects/tr-20-vue`, `pilot/projects/tr-20-svelte`, and
`pilot/projects/tr-20-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Jig" in `select[name=rhythm]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Jig".
3. On `/`, fill form#note-form: `input[name=author]` with "Mairead O'Connor", `input[name=tune]` with "The Silver Spear", `textarea[name=note]` with "Play briskly with lift on the second beat"; choose "Jig" in `select[name=rhythm]`; choose "G major" in `select[name=key]`.
4. Submit; the read page shows "Play briskly with lift on the second beat", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Play" lists "Play briskly with lift on the second beat" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `note` field can be changed to "Play briskly with lift on the second beat (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, this family's unified 4-step
Light and Dark UI/UX journey boards (`docs/design/training/tr-20/step1-overview.jpg`..`step4-validation.jpg`
and `docs/design/training/tr-20/dark/step1-overview.jpg`..`step4-validation.jpg`), context-chained
from [`reference.jpg`](../../../design/training/tr-20/reference.jpg) and [`design.md`](design.md)
([`journey-prompts.json`](../../../design/training/tr-20/journey-prompts.json)), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `author`, `tune`, `rhythm`, `key`, `note` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `forms/forms`, drawn from the
  applicable set `accessibility/accessibility`, `forms/forms`, `forms/required-field-feedback`, `css/responsive-design` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /tunes/:id/notes stores a comment and refreshes the discussion view
- GET /tunes/:id renders previously contributed musician notes with author names on reload
- all tune filter tags and comment input fields provide accessible labels and keyboard focus

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
[`docs/train/targets/tr-20/index.html`](../../targets/tr-20/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
