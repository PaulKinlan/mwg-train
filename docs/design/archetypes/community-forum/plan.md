---
archetype: community-forum
type: fan-community
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/community-forum/
register: docs/provenance/assets/training-reference-boards.md
---

# `community-forum` — functional contract

The behaviour of the `fan-community` type as this archetype implements it. This document is the archetype's contract: what a member and a moderator can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow - see *Implementation status*. Nothing here should be read as describing running software.

Two families implement this archetype, and both are described together because the archetype is the contract they share rather than either one alone:

- **`tr-20`, Ceilidh & Session Tune Vault** — traditional tune tune-sheet repository and tempo notes.
- **`fam-14`, Urban Gardening Forum** — allotment holders discussion forum and moderation queue (eval split: test).

## Use case

A community space where individuals discuss, share, and collaborate around specialized topics, requiring persistence and moderation.

A **member** browses a library of tunes or topics, filters by category, opens a thread, reads the existing replies, and contributes a note or response of their own. Contributed notes are stored on the server, so anyone who reloads the thread sees the whole discussion nested correctly. A **moderator** (`fam-14`) signs in, accesses a moderation queue, reviews flagged items, and can hide inappropriate contributions from the public thread. 

The flow differs from a typical `record-form` because the contributed object is attached to a parent record (a tune or a topic) and builds a durable threaded conversation, and it introduces distinct role-based access for moderation.

## Routes and effects

The families declare their own routes. The archetype's common shape is an index view, a thread view, a reply write, and a moderation view.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | both | page | serves the landing view and its entry points into the library |
| `GET /tunes` | `tr-20` | page | serves the tune library, filterable by dance rhythm |
| `GET /tunes/:id` | `tr-20` | read-by-reference | serves one tune's key, background and discussion thread |
| `POST /tunes/:id/notes` | `tr-20` | write | stores one comment on that tune and refreshes the discussion view |
| `GET /topics` | `fam-14` | page | serves the discussion forum index |
| `GET /topics/:id` | `fam-14` | read-by-reference | serves a discussion thread and its nested replies |
| `GET /new-topic` | `fam-14` | page | serves the topic creation form |
| `GET /login` | `fam-14` | page | serves the authentication portal for session identity |
| `POST /topics/:id/reply` | `fam-14` | write | persists a reply with session credentials and redirects |
| `GET /admin/moderation` | `fam-14` | page | serves the moderator queue of flagged posts |
| `POST /admin/moderation/:id/hide` | `fam-14` | write | removes or masks the flagged post on the public topic view |

**On the methods in that table.** The manifest declares routes as paths rather than methods. The methods shown are therefore derived from their source: `POST /tunes/:id/notes`, `POST /topics/:id/reply`, and `POST /admin/moderation/:id/hide` are named by the families' assertions, as are the `GET` read-backs. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: topics, threaded replies, session-scoped user identities, and moderation flags.
- **Write routes:** `POST /tunes/:id/notes` and `POST /topics/:id/reply` store comments against parent records. `POST /admin/moderation/:id/hide` mutates the visibility state of a reply.
- **Read route:** `GET /tunes/:id` and `GET /topics/:id` read the parent and its nested replies, ensuring a reload reproduces the thread.

## Journey

The declared journeys. For the evaluation family (`fam-14`), these are quoted verbatim from the manifests. For the training family (`tr-20`), these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-20` (folk tune archive):**
- Starts at `/`, submits `form#note-form` with `input[name=author]` `Mairead O'Connor`, `input[name=tune]` `The Silver Spear`, `textarea[name=note]` `Play briskly with lift on the second beat`, and selects `Jig` and `G major`.
- Expects the note text echoed back to confirm the write.
- Updates the note field to test amendment.
- Searches via `/search?q=Play` to verify the search endpoint finds the stored note.

**`fam-14` (urban gardening forum):**
- sign in with a demo session identity, start a new discussion topic on soil composting, post a reply with advice, and observe the threaded response nested under the topic
- reload `/topics/:id` in a clean tab, verify the discussion thread, replies, and author identities persist from server storage, and flag an inappropriate reply for moderator review
- sign in as a moderator, navigate to `/admin/moderation` solely using the keyboard (Tab and Enter), review flagged items, apply a hide action, and verify the hidden post is removed from public view on `/topics/:id`

Mapped to the five planned boards: step 1 browse → `step1-browse`, step 2 thread → `step2-thread`, step 3 composer → `step3-composer`, step 4 moderation → `step4-moderation`, step 5 empty → `step5-empty`.

## Validation and states

- **Required fields:** Primary identities, parent associations, and comment bodies are strictly required.
- **On a missing required field:** the server refuses the submission returning HTTP `400` with an inline validation alert (`fam-14`); nothing is stored.
- **Accessibility:** `fam-14` asserts that all interactive buttons, reply links, and moderation toggles are operable via keyboard Tab and Enter key sequences with visible focus indicators.
- **Moderation state:** a hidden contribution exists on the server but is not rendered to a standard visitor on the public topic view (`fam-14`).

## Acceptance criteria

The families define specific observable assertions:

`tr-20`:
1. `POST /tunes/:id/notes` stores a comment and refreshes the discussion view
2. `GET /tunes/:id` renders previously contributed musician notes with author names on reload
3. all tune filter tags and comment input fields provide accessible labels and keyboard focus

`fam-14`:
4. `POST /topics/:id/reply` with session credentials persists a reply and returns HTTP 201 or 303
5. `GET /topics/:id` after reload displays all existing replies with correct nesting hierarchy and author tags
6. `POST /admin/moderation/:id/hide` removes or masks the flagged post on the public topic view
7. all interactive buttons, reply links, and moderation toggles are operable via keyboard Tab and Enter key sequences with visible focus indicators
8. posting a topic or reply without required content returns HTTP 400 with an inline validation alert

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **One landing reference exists:** `tr-20/reference.jpg`. It depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- The single-step `tr-20` and `fam-14` targets are simple pages containing a form, but do not evaluate the full multi-step `community-forum` topic nesting or administrative moderation queues end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-20`) and `docs/eval/briefs/manifest.jsonl` (`fam-14`). Route names, field slugs, control types, selectors, fill values, URL parameters, and all acceptance criteria are quoted from those rows rather than invented.
- **The reference** is the training family's generated board, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `community-forum` is recorded as a partial member of the `blog` and `fan-community` axes.
