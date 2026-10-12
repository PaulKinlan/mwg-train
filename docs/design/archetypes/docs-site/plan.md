---
archetype: docs-site
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/docs-site/
register: docs/provenance/assets/training-reference-boards.md
---

# `docs-site` — functional contract

A documentation portal with an integrated data submission flow: reading long-form guides or structured archives, navigating via a table of contents or search, and submitting associated records (feedback, measurements, or annotations). This document is the contract for the `docs-site` archetype - what a reader can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow - see *Implementation status*. Nothing here should be read as describing running software.

Three families implement this archetype, and all are described together because the archetype is the contract they share rather than any one alone:

- **`tr-13`, Urban Soil Collaborative** — backyard composting guidelines and soil test registry.
- **`tr-25`, Voices of the Mill Valley** — community elder oral history recordings and transcript index.
- **`fam-13`, Environmental Sensor Network** — developer documentation and API reference (eval split: test).

## Use case

A community portal distributing deep, structured knowledge while collecting structured feedback or field observations.

A **reader** (a gardener, an historian, a developer) navigates technical guides, archival transcripts, or API references using hierarchical navigation or search. They locate a specific article or topic, and submit associated data using an intake form — logging a local soil measurement, annotating an interview transcript, or submitting documentation feedback. The server stores this submission so that reloading the specific record confirms the data is durable and public.

## Routes and effects

The families declare their own routes. The archetype's common shape is an index view, a hierarchical content view (`/:slug` or `/:id`), and a write producing one associated record.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | all | page | serves the landing page |
| `GET /docs` | `tr-13`, `fam-13` | list | serves the documentation index or table of contents |
| `GET /docs/:slug` | `tr-13`, `fam-13` | page | serves a structured article |
| `GET /api-reference` | `fam-13` | list | serves developer API endpoint references |
| `GET /interviews` | `tr-25` | list | serves the searchable index of oral history transcripts |
| `GET /interviews/:id` | `tr-25` | page | serves a specific interview transcript |
| `POST /interviews/:id/notes` | `tr-25` | write | appends a biographical note or footnote and redirects |
| `GET /soil-tests` | `tr-13` | list | serves the community soil test registry |
| `GET /soil-tests/new` | `tr-13` | page | serves the soil test intake form |
| `POST /soil-tests/new` | `tr-13` | write | inserts a test record and redirects |
| `GET /soil-tests/:id` | `tr-13` | read-by-reference | reads the soil test receipt |
| `GET /feedback` | `fam-13` | page | serves the documentation feedback intake form |
| `POST /feedback` | `fam-13` | write | inserts a feedback record and redirects |
| `GET /feedback/confirmation/:id` | `fam-13` | read-by-reference | reads the feedback receipt by reference |

**On the methods in that table.** The manifest declares routes as paths rather than methods. The methods shown are therefore only as firm as their source: `POST /soil-tests/new`, `POST /interviews/:id/notes`, and `POST /feedback` are named by the families' assertions, as are the `GET` read-backs. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: submitted soil test records, user-submitted biographical notes, and documentation feedback submissions.
- **Write routes:** `POST /soil-tests/new`, `POST /interviews/:id/notes`, and `POST /feedback` store the payloads securely.
- **Read by reference:** the families read the submitted state back by its identifier to verify persistence.
- **URL Filters:** search queries and filters (e.g., `GET /interviews?decade=1950s`) drive the index views.

## Journey

The declared journeys. For the evaluation family (`fam-13`), these are quoted verbatim from the manifests. For the training families, these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-13` (composting handbook):**
- Starts at `/`, submits `form#soil-test-form` with `input[name=gardener]` `Avery Quinn`, `input[name=plot]` `Plot 14-B`, `input[name=ph]` `6.8`, `input[name=organic]` `5`, and `textarea[name=notes]` `High earthworm activity and dark loamy texture`.
- Expects `Plot 14-B` echoed back to confirm the write.
- Updates the plot field to test amendment.
- Searches via `/search?q=Plot` to verify the stored soil test record.

**`tr-25` (oral history archive):**
- Starts at `/`, submits `form#footnote-form` with `input[name=contributor]` `Dr Arthur Prendergast`, `input[name=email]` `arthur.prendergast@countyhistory.test`, `input[name=passage]` `00:14:32 (Weaving shed)`, `textarea[name=footnote]` `The cotton mill closed in 1968, not 1972 as recalled in the recording.`, and selects `Biographical note`.
- Expects the footnote text echoed back to confirm the write.
- Updates the footnote field to test amendment.
- Searches via `/search?q=The` to find the annotated transcript note.

**`fam-13` (developer documentation):**
- navigate documentation sections from table of contents, jump to REST ingest endpoints, inspect code snippets, copy an endpoint sample, and submit documentation feedback with rating and notes
- submit documentation feedback, receive a feedback receipt ID, and reload `/feedback/confirmation/:id` to verify feedback data persists server-side
- search the documentation index using an in-page query for "calibration", observe matching section links, select a result, and navigate to the anchored heading

## Validation and states

- **Required fields:** Primary identities, transcript references, and numeric ratings/pH values are strictly required.
- **Accessibility:** `tr-13` and `tr-25` explicitly assert that navigation menus, search filters, and transcript sections provide full keyboard navigation and accessible headings. `fam-13` asserts that the active link uses `aria-current="page"`.
- **Snippet Blocks:** Code examples must include accessible markup and contrast-compliant styling (`fam-13`).
- **On a missing field:** the server refuses the submission; nothing is stored.
- **Empty state:** searching for a non-existent documentation article or transcript returns a zero-results search state.

## Acceptance criteria

The families define specific observable assertions:

`tr-13`:
1. `POST /soil-tests/new` stores a soil measurement entry and redirects to `/soil-tests/:id`
2. `GET /soil-tests/:id` renders the saved soil pH and plot number after a browser reload
3. navigation menus and search filters are accessible via standard keyboard commands

`tr-25`:
4. `POST /interviews/:id/notes` records a footnote and renders it under the transcript on reload
5. `GET /interviews?decade=1950s` returns only matching historical era interview entries
6. all transcript sections and footnote forms provide full keyboard navigation and accessible headings

`fam-13`:
7. `GET /docs/:slug` returns HTTP 200 with structured documentation content and hierarchical navigation links
8. `POST /feedback` with page slug, rating, and comment stores feedback and redirects to `/feedback/confirmation/:id` with HTTP 303
9. `GET /feedback/confirmation/:id` after browser reload returns HTTP 200 with the submitted rating and page reference
10. active documentation navigation link has `aria-current="page"` corresponding to the current section
11. code snippet blocks include accessible markup and contrast compliant styling

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **Two landing references exist, one for each training family:** `tr-13/reference.jpg` and `tr-25/reference.jpg`. Each depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- The single-step `tr-13`, `tr-25`, and `fam-13` targets are simple pages containing a form, but do not evaluate the full multi-step `docs-site` article hierarchy, semantic code tabs, or dedicated search functionality end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (families `tr-13`, `tr-25`) and `docs/eval/briefs/manifest.jsonl` (`fam-13`). Route names, field slugs, control types, selectors, fill values, URL parameters, and all acceptance criteria are quoted from those rows rather than invented.
- **The references** are the training families' generated boards, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompts that declared them are committed beside them. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `record-form` is listed.
