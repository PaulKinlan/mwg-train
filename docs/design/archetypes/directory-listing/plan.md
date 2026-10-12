---
archetype: directory-listing
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/directory-listing/
register: docs/provenance/assets/training-reference-boards.md
---

# `directory-listing` — functional contract

A searchable index of entities: a searchable and filterable directory, detailed profile pages, and a submission form to register new listings or append comments to existing ones. This document is the contract for the `directory-listing` archetype - what an operator can read, what they can log, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow - see *Implementation status*. Nothing here should be read as describing running software.

Three families implement this archetype, and all are described together because the archetype is the contract they share rather than any one alone:

- **`tr-06`, Highland Guild of Craftsmen** — craft guild artisan profiles and studio open days.
- **`tr-14`, Stonegate Heritage Trail** — self-guided heritage walking tour stops and transcripts.
- **`fam-06`, Neighbourhood Trades** — independent trades and repair service directory (eval split: test).

## Use case

A community index mapping entities (artisans, tour stops, trade services) and collecting interaction against them.

A **visitor** searches and filters listings by category or string, views matching summary cards, and clicks through to a detailed profile to read background information and operating details. An **operator** submits a new listing (e.g. tradesperson profile) or appends data to an existing listing (e.g. visitor comments on a tour stop). The server stores the listing or comment so that when someone visits the directory or refreshes the URL, the registered details are persistent.

## Routes and effects

The families declare their own routes. The archetype's common shape is a directory view, a read-by-reference detail view, and a write producing one record.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | all | page | serves the landing page |
| `GET /makers` | `tr-06` | page | serves the filterable directory of artisans |
| `GET /makers/:id` | `tr-06` | read-by-reference | reads the detailed artisan profile |
| `GET /disciplines` | `tr-06` | list | serves the taxonomy list |
| `GET /stops` | `tr-14` | page | serves the sequential list of historical trail waypoints |
| `GET /stops/:id` | `tr-14` | read-by-reference | reads the landmark details and visitor comments |
| `POST /stops/:id/comment` | `tr-14` | write | appends a visitor comment to the stop |
| `GET /listings` | `fam-06` | page | serves the searchable and filterable directory of trade listings |
| `GET /listings/:id` | `fam-06` | read-by-reference | serves the detailed business profile |
| `POST /submit` | `fam-06` | write | inserts a new trade listing record and redirects |

**On the methods in that table.** The manifest declares routes as paths rather than methods. The methods shown are therefore only as firm as their source: `POST /stops/:id/comment` and `POST /submit` are named by the families' assertions, as are the `GET` read-backs. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: directory profiles, landmark records, and submitted visitor notes.
- **Write routes:** `POST /submit` and `POST /stops/:id/comment` store the data payload securely.
- **Read by reference:** the families read one subject's state back by its identifier to verify persistence.
- **URL Filters:** directory search queries and filter selections are shareable via URL parameters (`GET /makers?craft=woodworking` or `GET /search?q=query`).

## Journey

The declared journeys. For the evaluation family (`fam-06`), these are quoted verbatim from the manifests. For the training families, these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-06` (artisan profiles):**
- Starts at `/`, submits `form#artisan-profile-form` with `input[name=artisan]` `Rowan Ashcroft`, `input[name=location]` `The Old Mill, Stroud`, `input[name=hours]` `Thu-Sat 10:00-16:00`, `input[name=openday]` `2026-11-28`, `textarea[name=biography]` `Master woodworker crafting hand-turned bowls and shaker boxes`, selecting `select[name=discipline]` `Ceramics`.
- Expects `Master woodworker crafting hand-turned bowls and shaker boxes` echoed back and again after a reload.
- Searches via `/search?q=Master` to verify the search endpoint finds the stored record.
- Updates the `biography` to `Master woodworker crafting hand-turned bowls and shaker boxes (updated)`.
- Its intake steps submit `/intake` having selected `select[name=discipline]` `Ceramics`, and `/intake/confirm` expects `Ceramics` back.

**`tr-14` (heritage stops):**
- Starts at `/`, submits `form#heritage-comment-form` with `input[name=visitor]` `Sam Whitfield`, `textarea[name=comment]` `The timber framing on the south gable is beautifully preserved.`, selecting `select[name=stop]` `Stop 2 - Guildhall Timber Yard`, `select[name=category]` `Historical memory`.
- Expects `The timber framing on the south gable is beautifully preserved.` echoed back and again after a reload.
- Searches via `/search?q=The` to verify the search endpoint finds the stored record.
- Updates the `comment` to `The timber framing on the south gable is beautifully preserved. (updated)`.
- Its intake steps submit `/intake` having selected `select[name=stop]` `Stop 2 - Guildhall Timber Yard`, and `/intake/confirm` expects `Stop 2 - Guildhall Timber Yard` back.

**`fam-06` (neighbourhood trades):**
- search and filter local trade listings by trade category like plumbing, carpentry, or electrical repair, and view matching business summary cards
- click through to a specific trade listing to view contact details, operating hours, verified credentials, and customer reviews
- submit a new independent trade listing with business name, category, phone, postcode, and description, then confirm the listing appears on the directory
- reload the newly created listing URL directly and verify that all business details, category badges, and contact information persist from server storage

## Validation and states

- **Required fields:** Primary entity identities, descriptions, and taxonomy selects are strictly required.
- **Accessibility:** Interactive filter controls (`tr-06`, `fam-06`) must allow keyboard navigation and announce state changes to assistive technologies. Listings must provide structured semantic landmarks.
- **History state:** Filter dropdowns and search inputs must update the rendered listings without breaking browser history.
- **On a missing field:** the server refuses the submission; nothing is stored.
- **Empty state:** searching or filtering for a non-existent entity returns a zero-results state.

## Acceptance criteria

The families define specific observable assertions:

`tr-06`:
1. `GET /makers?craft=woodworking` filters maker cards to only woodworking artisans
2. `GET /makers/:id` displays biography, studio location, and upcoming open day dates
3. all interactive filter controls announce state changes to assistive technologies

`tr-14`:
4. `POST /stops/:id/comment` appends a visitor comment and reloads the stop view
5. `GET /stops/:id` displays the new comment with timestamp after a browser refresh
6. the interactive stops list supports clear keyboard focus rings and aria headings

`fam-06`:
7. `POST /submit` saves a new listing record to server storage and redirects to `/listings/:id` with HTTP 200 or 303
8. `GET /listings/:id` renders the business name, trade category, postcode, and contact phone number after a browser reload
9. category filter dropdown or search inputs allow keyboard navigation and update the rendered listings without breaking browser history
10. listings provide structured semantic landmarks and accessible buttons for expanding contact numbers

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **Two landing references exist, one for each training family:** `tr-06/reference.jpg` and `tr-14/reference.jpg`. Each depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- The single-step `tr-06`, `tr-14`, and `fam-06` targets are simple forms, but do not evaluate the full multi-step `directory-listing` catalog, profile detail, or review functionality end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (families `tr-06`, `tr-14`) and `docs/eval/briefs/manifest.jsonl` (`fam-06`). Route names, field slugs, control types, selectors, fill values, URL parameters, and all acceptance criteria are quoted from those rows rather than invented.
- **The references** are the training families' generated boards, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompts that declared them are committed beside them. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `record-form` is listed.
