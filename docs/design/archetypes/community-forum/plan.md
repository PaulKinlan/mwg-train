---
archetype: community-forum
type: fan-community
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/community-forum/
---

# `community-forum` — functional contract

A traditional-music session archive with a discussion board: a library of tunes to browse and filter by
dance rhythm, a tune thread carrying comments from earlier sessions, a composer for a tempo note or a
regional variation, a moderation boundary, and an empty state. This document is the contract for the
`community-forum` archetype — what a player can do, what the server does about it, and what a journey can
assert.

It is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires
of a plan (`PLAN_SECTIONS`). What it describes is the full canonical journey expanded from the training
target `tr-20`. **No reference boards exist for this archetype yet** — the five named under Implementation
status are planned, and this document describes the system they will depict rather than bytes that exist.

## Use case

A weekly pub folk session needs a shared digital tune repository and discussion board. Musicians look up
traditional jigs, reels, hornpipes and polkas, inspect a tune's musical key and background, and post tempo
suggestions or regional variations so the thread survives a reload.

A **player** browses the tune library and filters it by dance rhythm, opens one tune's thread, reads the
notes earlier players left, and contributes a note or variation of their own. Contributed notes are stored
on the server, so a session player who reloads the thread sees the whole discussion rather than only their
own comment. A **moderator** can hold a contribution back from the public thread.

The flow differs from `editorial-blog` because contributions are stored rows attached to a parent record
rather than authored articles with stable deep links, and from the evaluated `fan-community-site` because
the contributed object is a first-class domain record — a tune with a key and a rhythm — rather than a
comment on media. `TYPE-AXIS.md` currently records this archetype as a **partial** member of the `blog` and
`fan-community` axes: it has the index and thread routes, and the gaps it names are the contribution-editing
and moderation boundary this document specifies.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the session's landing view and its entry points into the library |
| `GET /tunes` | page | serves the tune library, filterable by dance rhythm |
| `GET /tunes/:id` | read-by-reference | serves one tune's key, background and its discussion thread, including notes stored on earlier visits |
| `POST /tunes/:id/notes` | write | stores one comment on that tune and refreshes the discussion view |
| `GET /search` | page | serves the full-text search result view, addressed by the `q` query parameter |
| `GET /intake` | page | serves the declared intake step, whose rhythm selection carries into the next step |
| `GET /intake/confirm` | page | serves the confirmation step, echoing the value selected at `/intake` |

**Proposed expansion, not yet in the brief.** The five-step flow includes a moderation boundary, and the
brief's declared routes do not carry one. This document specifies the state as part of the archetype's
canonical shape — a held contribution is stored but not rendered to a signed-out visitor — while marking
plainly that acting on it requires a **brief amendment** in `docs/train/briefs/manifest.jsonl` (a moderation
route plus a status field on the note row). Nothing here should be read as a route the corpus already has.

## Data and state

- **Stored on the server**, per the brief's `server_persistence`: traditional tune records, and the musician
  discussion comments attached to them. The brief does not name a storage engine, so none is claimed here.
- **The tune record** carries the library's identifiers: `tune`, `rhythm` (Reel, Jig, Hornpipe or Polka), and
  `key` (D major, G major, A dorian or E minor) — the three values the journey filters and selects by.
- **The comment row** carries `author` (with `name` autocomplete), an optional `tempo` in BPM, and the `note`
  body, which is the field the journey posts and later updates.
- **Write route:** `POST /tunes/:id/notes` stores one comment against its tune.
- **Read route:** `GET /tunes/:id` reads the tune and its comments by reference, so a reload reproduces the
  thread rather than replaying the submitter's own view.

## Journey

The declared journey, expanding the `tr-20` brief row:

- it starts at `/`;
- it filters the library by dance rhythm — `Reel`, `Jig` or `Hornpipe` — and opens one tune at `/tunes/:id`;
- it reads the notes earlier musicians left on that tune;
- it submits `form#note-form` with fills — `input[name=author]` `Mairead O'Connor`,
  `input[name=tune]` `The Silver Spear`, `textarea[name=note]` `Play briskly with lift on the second beat` —
  and selects `select[name=rhythm]` `Jig` and `select[name=key]` `G major`;
- and it expects to find `Play briskly with lift on the second beat` echoed back by what the submit returns,
  then again after a reload, which is what proves the note was stored rather than rendered once.
- The journey also declares a search leg at `/search?q=Play`, expecting the posted note among the results and
  `zzz-decoy` absent, and an update leg that rewrites the same note to
  `Play briskly with lift on the second beat (updated)`.
- The brief's `journey.steps` add the two intake legs: `/intake` submits the form having selected
  `select[name=rhythm]` `Jig`, and `/intake/confirm` expects to read `Jig` back.

Mapped to the five planned boards: step 1 browse → `step1-browse`, step 2 thread → `step2-thread`,
step 3 composer → `step3-composer`, step 4 moderation → `step4-moderation`, step 5 empty →
`step5-empty`.

## Validation and states

- **Required fields:** `author`, `tune`, `rhythm`, `key` and `note`. `tempo` is declared optional.
- **On a missing required field:** the server refuses the submission and re-renders the form with feedback
  naming the field. The brief carries `forms/required-field-feedback` among its applicable rules, so this is
  an assertion about the target, not an optional nicety.
- **Accessibility:** every filter tag and comment input field is labelled and keyboard-focusable; the brief
  carries `accessibility/accessibility` among its required rules.
- **Empty state:** a search or filter with no match renders an empty result state rather than an error page.
- **Moderation state:** a held contribution exists on the server but is not rendered to a signed-out visitor.
  Proposed, per the note under Routes and effects.

## Acceptance criteria

1. `POST /tunes/:id/notes` stores a comment and refreshes the discussion view.
2. `GET /tunes/:id` renders previously contributed musician notes with author names on reload.
3. All tune filter tags and comment input fields provide accessible labels and keyboard focus.
4. A contribution survives a reload as server state, not as a replayed client view.
5. An unmatched search or filter renders an empty state that names the absence rather than failing.

Criteria 1–3 are the brief's own assertions, quoted from `docs/train/briefs/manifest.jsonl`. Criteria 4 and
5 restate the journey and empty-state behaviour above.

## Implementation status

- **The reference boards:** expanding from the single `tr-20` landing board, five full multi-step visual flow
  boards are planned (`step1-browse`, `step2-thread`, `step3-composer`, `step4-moderation`, `step5-empty`).
  They are **pending generation**; when created they will be recorded in a register under
  `docs/provenance/assets/`.
- **Artefacts that do exist** for this archetype today: the train-side canonical pair
  `docs/train/design/tr-20/plan.md` and `docs/train/design/tr-20/design.md`, and its authored target
  `docs/train/targets/tr-20/index.html`. There is no `docs/eval/specs/community-forum.json`, so this contract
  is validated by section order and internal consistency, not against an evaluation spec.
- **The brief:** two rows, `tr-20-v1` and `tr-20-v2`, which differ only in their prompt text and variant
  linkage.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl`, family `tr-20` (`tr-20-v1`,
  `tr-20-v2`). Route names, field slugs, options, selectors, fill values, assertions and the intake steps are
  quoted from that row rather than invented.
- **The boards** are pending generation; nothing here depicts bytes that exist, and the register that will
  pin them does not yet exist.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `community-forum` is recorded
  as a partial member of two axes.
