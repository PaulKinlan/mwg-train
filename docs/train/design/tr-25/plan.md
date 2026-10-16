---
family: tr-25
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-25-v1
---

# `tr-25` functional specification — Voices of the Oakhaven Valley — Elder Oral History Archive & Transcript Index

The behaviour of the `tr-25` training family, bound to its canonical brief row
[`tr-25-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is community elder oral history recordings and transcript index, in the `docs-site` archetype. The brief asks for:

> Our county historical society has recorded oral histories from local factory workers, farmers, and nurses and needs an archival listening portal. Visitors should browse interviewees by decade and occupation, read synchronized text transcripts, and submit search queries across transcript passages. Users must also be able to submit corrections or footnotes, which must be saved on the server for curator review.

The form the journey drives carries 5 fields: `contributor`, `email`, `category`, `passage`, `footnote`.

The brief's own user journeys, which the harness flow below is derived from:

- Search the oral history archive by keyword or filter interviews by work sector and decade
- Open an interview record to read the complete biographical transcript and historical context
- Submit an annotated footnote, receive an acceptance notice, and reload to verify the note is preserved

Out of scope, by the brief's own non-goals: automated speech-to-text machine learning pipeline; full uncompressed FLAC audio file downloads.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/interviews` | supporting page declared by the brief |
| `/interviews/:id` | read-back of one stored record by its reference |
| `/interviews/:id/notes` | write route the form submits to |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "oral history transcripts and user-submitted biographical notes are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-25-hono`, `pilot/projects/tr-25-raw`,
`pilot/projects/tr-25-react`, `pilot/projects/tr-25-preact`,
`pilot/projects/tr-25-vue`, `pilot/projects/tr-25-svelte`, and
`pilot/projects/tr-25-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Biographical note" in `select[name=category]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Biographical note".
3. On `/`, fill form#footnote-form: `input[name=contributor]` with "Dr Arthur Prendergast", `input[name=email]` with "arthur.prendergast@countyhistory.test", `input[name=passage]` with "00:14:32 (Weaving shed)", `textarea[name=footnote]` with "The cotton mill closed in 1968, not 1972 as recalled in the recording."; choose "Biographical note" in `select[name=category]`.
4. Submit; the read page shows "The cotton mill closed in 1968, not 1972 as recalled in the recording.", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="The" lists "The cotton mill closed in 1968, not 1972 as recalled in the recording." inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `footnote` field can be changed to "The cotton mill closed in 1968, not 1972 as recalled in the recording. (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`docs-site` plan](../../../design/archetypes/docs-site/plan.md)
and [`docs-site` design](../../../design/archetypes/docs-site/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-25/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `contributor`, `email`, `category`, `footnote` - each is required in the form and re-checked on the server.
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

- POST /interviews/:id/notes records a footnote and renders it under the transcript on reload
- GET /interviews?decade=1950s returns only matching historical era interview entries
- all transcript sections and footnote forms provide full keyboard navigation and accessible headings

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
[`docs/train/targets/tr-25/index.html`](../../targets/tr-25/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
