---
archetype: docs-site
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/docs-site/
---

# `docs-site` — functional contract

A documentation portal with an integrated data submission flow: reading long-form technical guides, navigating via a table of contents, and submitting feedback or records associated with the documentation. This document is the contract for the `docs-site` archetype - what a reader can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

A developer documentation and API reference for an environmental sensor telemetry network.

A **developer** navigates technical documentation sections using a table of contents or sidebar, jumps to specific REST ingest endpoints, inspects code snippets, and submits documentation feedback (rating and notes) for an article. The server stores the feedback submission so that the developer receives a confirmation reference that survives a page refresh, proving server-side persistence.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing page |
| `GET /docs` | list | serves the documentation index or table of contents |
| `GET /docs/:slug` | page | serves a structured documentation article with hierarchical navigation links |
| `POST /feedback` | write | inserts a feedback record and answers `303` with the reference in the `Location` header |
| `GET /feedback/confirmation/:id` | read-by-reference | reads the feedback receipt by reference, showing the submitted rating and page reference |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `feedback`, with `id` (TEXT, primary key), `slug` (TEXT, not null), `rating` (INTEGER, not null), and `comment` (TEXT).
- **Write route:** `/feedback` stores the feedback.
- **Read route:** `/feedback/confirmation/:id` reads the feedback by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, derived from the `fam-13` spec:

- it starts at `/docs` (index);
- it navigates to `/docs/calibration` to read specific API documentation;
- it scrolls the content, observing the active section reflected in the navigation (scrollspy);
- it submits the feedback form on the page with fills - `input[name=slug]` `calibration`, `select[name=rating]` `5`, and `textarea[name=comment]` `Very helpful code examples`;
- and it expects to find the rating `5` on what the submit returns at `/feedback/confirmation/:id`.

## Validation and states

- **Required fields:** `slug`, `rating`.
- **On a missing field:** the server refuses the submission and re-renders the form with an accessible error message; nothing is stored.
- **On success:** insert one row into feedback and answer 303 with Location: `/feedback/confirmation/<id>`.
- **Empty state:** searching for a non-existent documentation article returns a helpful "not found" search state.

## Acceptance criteria

1. after a successful submit the browser lands on `/feedback/confirmation/<id>` and the echoed rating is present
2. reloading that URL still shows it, proving server-side persistence
3. `GET /docs/:slug` returns HTTP 200 with structured documentation content and hierarchical navigation links
4. active documentation navigation link has `aria-current="page"` corresponding to the current section
5. code snippet blocks include accessible markup and contrast compliant styling

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist:
- The single-step `tr-13`, `tr-25`, and `fam-13` targets are simple pages containing a form, but do not evaluate the full multi-step `docs-site` article hierarchy, search, or dedicated confirmation views.
- The reference boards for the full multi-step journey are planned (`step1-landing`, `step2-index`, `step3-article`, `step4-feedback`, `step5-empty`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-docs-site.md`.
- **The behaviour** is derived from the A1 training families (`tr-13`, `tr-25`) and the A6 evaluation spec (`fam-13`, `docs-site`). The `fam-13` route spelling (`/feedback` -> `/feedback/confirmation/:id`) governs the multi-step contract; `tr-13` and `tr-25` contribute the environmental telemetry and archival contexts.