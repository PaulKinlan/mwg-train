---
family: tr-37
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-37-v1
---

# `tr-37` functional specification — The Kiln Chronicle — Ceramics Literary Journal & Article Composer

The behaviour of the `tr-37` training family, bound to its canonical brief row
[`tr-37-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is The Kiln Chronicle ceramics literary journal and article composer, in the `editorial-blog` archetype. The brief asks for:

> The Kiln Chronicle is an independent ceramics and material-arts journal publishing long-form essays on glaze chemistry, wood firing, and studio practice. Build the editorial index, reading view, and article composer so authors can publish new essays with headline, byline, section, and Markdown prose to the server and read them at their permanent URL after reload.

The form the journey drives carries 4 fields: `headline`, `byline`, `section`, `body_markdown`.

The brief's own user journeys, which the harness flow below is derived from:

- Browse The Kiln Chronicle issue index, section tags, and long-form ceramics essays
- Open the article composer and enter a headline, author byline, journal section, and Markdown essay body
- Publish the article to the server and reload the article page to verify the essay is preserved

Out of scope, by the brief's own non-goals: programmatic ad-network bidding scripts; paywall subscription billing gateway.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/articles` | write route the form submits to |
| `/articles/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "published journal articles, bylines, and section assignments are stored on the server"

The family's declared framework arm is `vanilla-ts` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-37-hono`, `pilot/projects/tr-37-raw`,
`pilot/projects/tr-37-react`, `pilot/projects/tr-37-preact`,
`pilot/projects/tr-37-vue`, `pilot/projects/tr-37-svelte`, and
`pilot/projects/tr-37-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Glaze Chemistry" in `select[name=section]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Glaze Chemistry".
3. On `/`, fill form#kiln-article-form: `input[name=headline]` with "What a reduction firing does to a copper glaze", `input[name=byline]` with "Marguerite Ash", `textarea[name=body_markdown]` with "At cone 10 in a heavy reduction atmosphere, copper carbonate shifts from celadon green to oxblood red."; choose "Glaze Chemistry" in `select[name=section]`.
4. Submit; the read page shows "What a reduction firing does to a copper glaze", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="reduction" lists "What a reduction firing does to a copper glaze" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `headline` field can be changed to "What a reduction firing does to a copper glaze (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`editorial-blog` plan](../../../design/archetypes/editorial-blog/plan.md)
and [`editorial-blog` design](../../../design/archetypes/editorial-blog/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-37/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `headline`, `byline`, `section`, `body_markdown` - each is required in the form and re-checked on the server.
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

- POST /articles publishes the essay to the server and redirects to /articles/:id
- GET /articles/:id renders the article headline, author byline, journal section, and body prose after reload
- article headings, pull quotes, and composer fields maintain semantic hierarchy and accessible labels

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
[`docs/train/targets/tr-37/index.html`](../../targets/tr-37/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
