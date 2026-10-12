---
archetype: fan-community-site
type: fan-community
boards: docs/design/archetypes/fan-community-site/
register: docs/provenance/assets/design-reference-fan-community-site.md
---

# `fan-community-site` — aesthetic system

The look of the `fan-community` type, derived from its five reference boards. This document is written
in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design
document (`DESIGN_SECTIONS`) so it is reviewable the way the evaluation side's design documents are.

One difference from those documents is stated up front rather than implied: they describe an authored
target board, and this describes a set of **generated** reference boards. Every value below is the set
the generation prompts declared and the pictures were made from; the boards were inspected afterwards by
a different model family and its per-board findings - including anything it found wrong - are recorded in
the [register](../../../provenance/assets/design-reference-fan-community-site.md), not tidied away here.
That inspection covered the **first-wave** rasters. The five were regenerated full-bleed on 2026-10-11 under
bead `mwg-train-d0zi.1` (`step1-collection.jpg`, `step2-contribution.jpg`, `step3-my-contributions.jpg`,
`step4-moderation.jpg`, `step5-visitor.jpg`), which is why the register files the earlier findings as
historical and why the regenerated boards are pending an inspection of their own. Behaviour is in
[`plan.md`](plan.md), not in this file.

## Visual thesis

A registry kept by fans, not a dashboard run by a company. The collection is a **shelf**: a dense grid of
media cards whose thumbnails carry most of the recognition, with one violet accent reserved for the thing
that can be done. The moderation queue is deliberately the opposite - denser, plainer, a worklist with
counts and decisions - because the two screens are for two different people doing two different jobs, and
a site where a moderator's queue looks like a fan's shelf is a site where the moderation boundary is
decorative.

The one thing the type must never look like is a form. A fan who opens the collection and is shown
labelled inputs has been given the composer instead of the shelf. The converse also holds: the composer
must state that a moderator sees the contribution **before** the fan submits, not after, so the review
step is part of the decision rather than a surprise.

Status is the type's second visual load: `submitted`, `held`, `needs_changes` and `published` appear as
chips that carry their **word**, so the boundary between them survives a colour-blind reader or a
greyscale print.

## Grammar and layout

- The five boards are one screen each, and the whole aesthetic system is the same system across them:
  `step1-collection.jpg` is the shelf a visitor and a fan both see, `step2-contribution.jpg` the composer,
  `step3-my-contributions.jpg` the fan's own list carrying moderation status, `step4-moderation.jpg` the
  queue, and `step5-visitor.jpg` the published-only collection seen without a session. Where this file
  names a screen, it means the board that depicts it.
- The page is a centred content column at a maximum width; the collection is **sidebar plus grid**, the composer
  is a single centred column at reading measure, and the queue is a two-column workspace with a counts
  rail on the right. Three pages, three grammars, chosen by what the page is for.
- The collection grid is three cards across on a desktop viewport, two on a tablet and one at a narrow
  width; each card is a square thumbnail, a title, a media-type chip, a contributor handle and a
  bookmark control on one baseline.
- The sidebar carries sections and never carries filters that belong above the grid: search, sort and the
  result count sit in one row over the cards, so a fan can see what is being filtered and how much is
  left.
- The composer is one column with a sticky action bar at the foot of the viewport. The moderation notice
  sits directly above the actions, in the reading path the fan takes on the way to submitting.
- The queue's decision controls live on the card being decided, never in a toolbar: approve, hold and
  needs-changes belong to the contribution in front of the moderator. The reason field is on the same
  card, because the reason is what the fan will read.
- The masthead is one row: community name at the start, navigation in the middle, the signed-in identity
  at the end. The visitor's view keeps the same masthead and replaces the identity chip with a sign-in
  link - the two views are the same page with different permissions, and they must not look like two
  products.

## Typography

- UI text uses the system sans stack for everything; there is no editorial serif here, because this is a
  registry rather than a publication and the headlines are card titles rather than article heads.
- Card titles are the largest type on the collection screen and the only element allowed to be semibold
  at scale. Contribution titles in the queue are one step smaller, because the queue is scanned rather
  than read.
- Metadata - media-type chips, handles, dates, counts, status chips - is small, uppercase where it is a
  label, and muted. A status chip is the one piece of metadata allowed a coloured ground, and it always
  contains its word.
- Long-form contribution notes are capped at a reading measure with generous line height; they are never
  set in the same measure as the cards.
- The community name appears once, in the masthead, and is never repeated as a page heading.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#0f172a` | The page ground on all five states |
| `--bg-surface` | `#1e293b` | Cards, the composer panel, the queue's contribution cards |
| `--border` | `#334155` | Card boundaries, list dividers, the reason panel's edge |
| `--accent` | `#8b5cf6` | The one actionable control on a screen: bookmark, submit, record decision |
| `--text-primary` | `#f8fafc` | Titles and body text |
| `--text-muted` | `#94a3b8` | Handles, dates, counts, chip labels |
| `--status-pending` | `#f59e0b` | The `submitted` chip - with its word, never alone |
| `--status-published` | `#22c55e` | The `published` chip - with its word |
| `--status-changes` | `#ef4444` | The `needs_changes` chip and the returned-contribution reason - with its word |

These are the names a build of this type should use, so that a generated build and these boards describe
the same system. A build may substitute its own values; it may not substitute its own status semantics,
which are the contract in [`plan.md`](plan.md).

## Spacing rhythm

- One outer page inset, and one smaller inset inside every card, so a card's contents share a single
  rhythm regardless of which screen it is on.
- One vertical step between cards, one larger step between sections of a page, and a visible gap between
  a contribution's body and its decision controls so that a decision cannot be made by mis-clicking the
  text.
- Controls are one height, with a small radius; the primary action is filled and every secondary action
  is an outline or a text link, never a second filled control on the same screen.
- Lists are separated by borders rather than by alternating grounds; the accent is never used as a
  background for a large area.

## Component hierarchy

1. **Masthead** - community name, section navigation (Collection, Contributions, Moderators), and either
   the signed-in identity chip or a sign-in link.
2. **Collection controls** - search field, sort control, and the result count, in one row.
3. **Collection grid** - media cards: thumbnail, title, media-type chip, contributor handle, bookmark
   control with its filled and outline states distinguished by both shape and label.
4. **Artefact detail** - the artefact's own fields, its contributor, and this fan's bookmark state.
5. **Composer** - labelled fields (title, section, media link, notes, tags), the moderation notice, and
   the sticky action bar (primary submit, secondary save).
6. **Own-contributions list** - one row per contribution: title, section chip, submitted date, status
   chip, and the quoted reason beneath any row that was returned.
7. **Bookmarks panel** - the fan's bookmarked artefacts with a remove control.
8. **Moderation queue** - filter chips, contribution cards carrying their submitted notes and the
   approve / hold / needs-changes controls with a reason field, and the counts rail.
9. **State panels** - the empty collection, the no-search-matches panel (which quotes the query back),
   and the permission refusal, each with one clear action.
10. **Status chip** - the single component that carries a moderation state's word and ground, reused on
    the own-contributions list, the queue and (for a moderator only) the collection.

## Anti-patterns

- A moderation control, a pending row or a status chip visible to a visitor: hiding the control is not
  the boundary, and showing it is worse than useless.
- Status carried by colour alone, or a chip whose word is replaced by an icon.
- A bookmark that does not survive a reload, or that another fan can see.
- A queue that looks and reads like the shelf, so that a moderator cannot tell the two screens apart.
- Two filled accent controls on one screen; the accent marks one thing.
- Inputs on the reading view, or a collection screen that begins with a form.
- A contribution that appears to its author as if it were public, with no status shown on their own list.
- A reason field on the moderator's decision that is optional, and a page that then shows the fan nothing.

## Rationale

The violet accent was chosen because it is the one hue in the wave's palette that reads as neither a
success nor a failure, which matters when the same screen carries both: the accent marks actions, and
green, amber and red mark **states**, so an action can never be mistaken for a verdict. The three status
grounds exist because the type's whole claim is a state machine - a submission, a decision and a
published result - and a state machine that is only visible in its happy path teaches nothing.

The density difference between the shelf and the queue is the same decision as the permission difference,
expressed visually: the fan's screen is for choosing what to look at, the moderator's is for getting
through the list. The boards are generated references and their depicted prose is invented; where the
generation introduced artefacts, they are recorded in the register with the decision taken about them,
rather than edited out of the record.

## Provenance

- Reference boards, the exact generation prompts and their byte and prompt digests:
  [`README.md`](README.md) beside this file and the
  [register](../../../provenance/assets/design-reference-fan-community-site.md).
- Model and attestation: `gemini-nano-banana-2.1`, explicitly requested, at 16:9; the generator fails
  closed on any other model. Rights boundary and the `excluded_from_training` policy: the
  [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md).
- Functional contract for the same type: [`plan.md`](plan.md).
- Type axis and coverage: [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md); archetype
  roles: [`docs/train/briefs/expansion-matrix.json`](../../../train/briefs/expansion-matrix.json).
- Work: bead `mwg-train-efg`.
