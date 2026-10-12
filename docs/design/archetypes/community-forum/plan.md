---
archetype: community-forum
type: fan-community
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/community-forum/
register: docs/provenance/assets/training-reference-boards.md
---

# `community-forum` — functional contract

The behaviour of the `fan-community` type as this archetype implements it. This document is the archetype's
contract: what a player and a moderator can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan documents
are. It is **not** checked against a generated demo, because there is no generated demo for the five-step
flow and no evaluation spec for this archetype — see *Implementation status*. Nothing here should be read as
describing running software.

## Use case

A weekly pub folk session needs a shared digital tune repository and discussion board. Musicians look up
traditional jigs, reels, hornpipes and polkas, inspect a tune's musical key and its background, and post
tempo suggestions or regional variations so that the thread survives a reload.

A **player** browses the tune library and filters it by dance rhythm, opens one tune's thread, reads the
notes earlier players left, and contributes a note or variation of their own. Contributed notes are stored
on the server, so a session player who reloads the thread sees the whole discussion rather than only their
own comment. A **moderator** can hold a contribution back from the public thread.

The flow differs from `editorial-blog` because contributions are stored rows attached to a parent record
rather than authored articles with stable deep links, and from the evaluated `fan-community-site` because
the contributed object is a first-class domain record — a tune with a key and a rhythm, carrying a notation
snippet — rather than a contribution to a collection of media. `TYPE-AXIS.md` currently records this
archetype as a **partial** member of the `blog` and `fan-community` axes: it has the index and thread routes,
and the gaps the axis names are the contribution-editing and moderation boundary this document specifies.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the session's landing view and its entry points into the library |
| `GET /tunes` | page | serves the tune library, filterable by dance rhythm |
| `GET /tunes/:id` | read-by-reference | serves one tune's key, background and discussion thread, including notes stored on earlier visits |
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
  `key` (D major, G major, A dorian or E minor) — the values the journey filters and selects by.
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
step 3 composer → `step3-composer`, step 4 moderation → `step4-moderation`, step 5 empty → `step5-empty`.

## Validation and states

- **Required fields:** `author`, `tune`, `rhythm`, `key` and `note`. `tempo` is declared optional.
- **On a missing required field:** the server refuses the submission and re-renders the form with feedback
  naming the field. The brief carries `forms/required-field-feedback` among its applicable rules, so this is
  an assertion about the target rather than an optional nicety.
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

**Not implemented as a multi-step flow.** Being precise about what does exist, because "tr-20 already exists"
is exactly the half-truth this axis was written to stop:

- **The landing reference does exist.** The family's single reference board is
  [`docs/design/training/tr-20/reference.jpg`](../../training/tr-20/reference.jpg) — 1376 × 768, 659761 bytes,
  sha256 `3e000d4f2c68620c312a99ad…`, generated by `gemini-nano-banana-2.1` and pinned in the
  [training reference register](../../../provenance/assets/training-reference-boards.md) alongside its
  declared prompt, [`prompt.txt`](../../training/tr-20/prompt.txt). It depicts a **landing page**: the
  library, one selected tune's thread, the note form and the community row all on one screen at one scroll
  position. It demonstrates no behaviour whatsoever, and it is not a picture of the five states below.
- **The five-step boards are planned, not generated.** `step1-browse`, `step2-thread`, `step3-composer`,
  `step4-moderation` and `step5-empty` do not exist as bytes in any ref, and this directory has no committed
  board of its own. When they are generated they will be pinned in the same training register.
- **What the engine offers is capability, not implementation.** The shared engine
  (`pilot/frameworks.mjs`) can render a list, a read-by-reference page and a write, and the training families
  use those for record lists and receipts. No family in the corpus has a moderation route, and no family has
  a note whose visibility depends on who is reading.
- **Artefacts that do exist** for this archetype today: the train-side pair
  `docs/train/design/tr-20/plan.md` and `docs/train/design/tr-20/design.md`, and its authored single-step
  target `docs/train/targets/tr-20/index.html`. There is no `docs/eval/specs/community-forum.json` — that
  directory is the sealed A6 evaluation set — so this contract is validated by section order and internal
  consistency, not against an evaluation spec.
- **The brief:** two rows, `tr-20-v1` and `tr-20-v2`, which differ only in their prompt text and variant
  linkage.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl`, family `tr-20` (`tr-20-v1`,
  `tr-20-v2`). Route names, field slugs, options, selectors, fill values, assertions and the intake steps are
  quoted from those rows rather than invented.
- **The landing reference** is the family's generated board, digest-pinned in
  `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it.
  The five-step boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `community-forum` is recorded
  as a partial member of the `blog` and `fan-community` axes.
