---
archetype: directory-listing
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/directory-listing/
---

# `directory-listing` — functional contract

A local neighbourhood trades directory: a searchable index of independent repair services and artisans, filterable by trade category, with detailed profile pages and a submission form to register new listings. This document is the contract for the `directory-listing` archetype - what a resident or tradesperson can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

A community directory for independent local repair specialists and trades. 

A **householder** searches and filters trade listings by category (e.g. plumbing, carpentry, electrical), views matching business summary cards, and clicks through to a detailed profile to view verified contact information, operating hours, and customer reviews. 
A **tradesperson** submits a new listing with their business name, category, phone, postcode, and description. The server stores the listing so that when someone visits the directory or refreshes the URL, the newly registered details are present and correct.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing page |
| `GET /listings` | page | serves the searchable and filterable directory of trade listings |
| `GET /listings/:id` | read-by-reference | serves the detailed business profile, including contact numbers, operating hours, and reviews |
| `POST /submit` | write | inserts a new trade listing record and answers `303` with the reference in the `Location` header |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `listings`, with `id` (TEXT, primary key), `business_name` (TEXT, not null), `category` (TEXT, not null), `phone` (TEXT, not null), `postcode` (TEXT, not null), and `description` (TEXT).
- **Write route:** `/submit` stores the listing.
- **Read route:** `/listings/:id` reads the listing by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, expanding the `tr-06`, `tr-14` and `fam-06` specs:

- it starts at `/listings` (directory);
- it filters local trade listings by trade category like plumbing or carpentry;
- it navigates to `/listings/:id` to view contact details, operating hours, verified credentials, and customer reviews;
- it navigates to the submission form and submits the new listing with fills - `input[name=business]` `Oak & Iron Carpentry`, `select[name=category]` `Carpentry`, `input[name=phone]` `07700 900123`, `input[name=postcode]` `GL5 4RD`, and `textarea[name=description]` `Bespoke joinery and timber repairs`;
- and it expects to find `Oak & Iron Carpentry` on what the submit returns at `/listings/:id`.

## Validation and states

- **Required fields:** `business_name`, `category`, `phone`, `postcode`.
- **On a missing field:** the server refuses the submission and re-renders the form with an accessible error message; nothing is stored.
- **On success:** insert one row into listings and answer 303 with Location: /listings/<id>.
- **Empty state:** searching or filtering for a non-existent trade returns a clear, accessible zero-results state.

## Acceptance criteria

1. after a successful submit the browser lands on /listings/<id> and the echoed business name is present
2. reloading that URL still shows it, proving server-side persistence
3. category filter dropdown or search inputs allow keyboard navigation and update the rendered listings without breaking browser history
4. listings provide structured semantic landmarks and accessible buttons for expanding contact numbers

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist:
- The single-step `tr-06`, `tr-14`, and `fam-06` targets are simple forms, but do not evaluate the full multi-step `directory-listing` catalog, profile detail, or review functionality.
- The reference boards for the full multi-step journey are planned (`step1-landing`, `step2-directory`, `step3-profile`, `step4-submit`, `step5-empty`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-directory-listing.md`.
- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (families `tr-06`, `tr-14`) and `docs/eval/briefs/manifest.jsonl` (family `fam-06`, `directory-listing`). The `fam-06` route spelling (`/listings`, `/submit`) governs the multi-step contract; `tr-06` and `tr-14` contribute the artisan and heritage tour domains.