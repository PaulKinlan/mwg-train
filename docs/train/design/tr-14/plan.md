---
family: tr-14
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-14-v1
---

# `tr-14` functional specification — Stonegate Heritage Trail — Historical Stops & Audio Transcripts

The behaviour of the `tr-14` training family, bound to its canonical brief row
[`tr-14-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is self-guided heritage walking tour stops and transcripts, in the `directory-listing` archetype. The brief asks for:

> Our town civic trust has created a self-guided historic walking tour and needs a web directory of tour stops. Walkers should browse stops along the route, read historical background and audio transcripts, and leave a visitor comment for each landmark. Comments must be saved on the server so that refreshing the landmark page shows all previously left remarks.

The form the journey drives carries 4 fields: `visitor`, `stop`, `category`, `comment`.

The brief's own user journeys, which the harness flow below is derived from:

- Explore the sequential list of historical trail waypoints and select a specific building
- Read historical architectural notes, inspect landmark photos, and open the comment form
- Submit a visitor note, inspect the updated comments list, and reload to ensure persistence

Out of scope, by the brief's own non-goals: real-time GPS location tracking; turn-by-turn spoken audio streaming engine.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/stops` | supporting page declared by the brief |
| `/stops/:id` | read-back of one stored record by its reference |
| `/stops/:id/comment` | write route the form submits to |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "submitted visitor notes and landmark records are stored on the server"

The family's declared framework arm is `react` and its locale is `en-GB`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Stop 2 - Guildhall Timber Yard" in `select[name=stop]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Stop 2 - Guildhall Timber Yard".
3. On `/`, fill form#heritage-comment-form: `input[name=visitor]` with "Sam Whitfield", `textarea[name=comment]` with "The timber framing on the south gable is beautifully preserved."; choose "Stop 2 - Guildhall Timber Yard" in `select[name=stop]`; choose "Historical memory" in `select[name=category]`.
4. Submit; the read page shows "The timber framing on the south gable is beautifully preserved.", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="The" lists "The timber framing on the south gable is beautifully preserved." inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `comment` field can be changed to "The timber framing on the south gable is beautifully preserved. (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `visitor`, `stop`, `category`, `comment` - each is required in the form and re-checked on the server.
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

- POST /stops/:id/comment appends a visitor comment and reloads the stop view
- GET /stops/:id displays the new comment with timestamp after a browser refresh
- the interactive stops list supports clear keyboard focus rings and aria headings

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
[`docs/train/targets/tr-14/index.html`](../../targets/tr-14/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
