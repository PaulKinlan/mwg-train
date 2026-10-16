---
family: tr-38
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-38-v1
---

# `tr-38` functional specification — Lantern Works Fan Registry — Stop-Motion Craft Archive & Moderation Queue

The behaviour of the `tr-38` training family, bound to its canonical brief row
[`tr-38-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Lantern Works stop-motion craft archive and moderated contribution registry, in the `fan-community-site` archetype. The brief asks for:

> Lantern Works Fan Registry is a community-curated archive of stop-motion animation puppets, miniature sets, and production ephemera where fan contributions pass through a moderator queue. Build the collection browser and contribution submission form so members can submit an artefact entry to the server and verify its recorded status after reloading.

The form the journey drives carries 4 fields: `artefact_title`, `contributor`, `canon_section`, `provenance_notes`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse the Lantern Works stop-motion canon collection by section (Characters, Sets and Props, Ephemera, Interviews)
- Complete the contribution composer with artefact title, contributor handle, canon section, and archival notes
- Submit the contribution for moderation and reload the contribution status page to confirm it is saved on the server

Out of scope, by the brief's own non-goals: cryptocurrency NFT minting; unmoderated anonymous image hosting.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/contributions` | write route the form submits to |
| `/contributions/:id` | read-back of one stored record by its reference |
| `/collection` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "fan-submitted canon artefact entries and moderation queue records are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-38-hono`, `pilot/projects/tr-38-raw`,
`pilot/projects/tr-38-react`, `pilot/projects/tr-38-preact`,
`pilot/projects/tr-38-vue`, `pilot/projects/tr-38-svelte`, and
`pilot/projects/tr-38-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Sets and Props" in `select[name=canon_section]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Sets and Props".
3. On `/`, fill form#lantern-contribution-form: `input[name=artefact_title]` with "Harbour Street miniature sodium lamp rig", `input[name=contributor]` with "brasslamp", `textarea[name=provenance_notes]` with "Wired with 3V grain-of-wheat bulbs beneath hand-soldered brass hoods for Scene 14."; choose "Sets and Props" in `select[name=canon_section]`.
4. Submit; the read page shows "Harbour Street miniature sodium lamp rig", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Harbour" lists "Harbour Street miniature sodium lamp rig" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `artefact_title` field can be changed to "Harbour Street miniature sodium lamp rig (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`fan-community-site` plan](../../../design/archetypes/fan-community-site/plan.md)
and [`fan-community-site` design](../../../design/archetypes/fan-community-site/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-38/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `artefact_title`, `contributor`, `canon_section`, `provenance_notes` - each is required in the form and re-checked on the server.
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

- POST /contributions submits the fan artefact entry to the server moderation queue and redirects to /contributions/:id
- GET /contributions/:id displays the artefact title, contributor handle, canon section, and notes after reload
- collection filters and contribution form controls are keyboard navigable with accessible error announcements

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
[`docs/train/targets/tr-38/index.html`](../../targets/tr-38/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
