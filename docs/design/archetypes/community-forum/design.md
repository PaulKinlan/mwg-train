---
archetype: community-forum
type: fan-community
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/community-forum/
---

# `community-forum` — aesthetic system

The look of the `fan-community` type as this archetype implements it, expanded from the single `tr-20`
landing board into a full multi-step journey. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**This system is authored, not derived.** No reference boards exist for this archetype yet, so the palette,
the type scale and the tokens below are decisions this document makes and the five planned boards will be
generated against. That is the opposite of the evaluated archetypes, whose designs were read back out of
committed board bytes. Nothing here should be quoted as an observation about an image.

## Visual thesis

A working tune archive for people who play together in person. It should read like a well-kept session
notebook rather than a social feed: warm paper, dark ink, one green accent for the actions that move the
session forward, and generous room around the things musicians actually read — a tune's key, its rhythm, and
the notes other players left about it.

The unit of the page is the tune, not the post. A comment is apparatus attached to a tune, so it is set
quieter than the tune it belongs to and never competes with the key, the rhythm filter or the library
listing. Moderation is present as a state, not as a control surface: a held note simply is not part of the
thread a visitor reads.

## Grammar and layout

- One page frame, `--cf-frame: 1120px`, centred, with `--cf-padding: 1.5rem` at the sides.
- The library (`step1-browse`) leads with the rhythm filter, because filtering by reel, jig, hornpipe or
  polka is the first thing a player does. Tunes are listed as rows carrying title, key and rhythm, not as
  image cards — there is no photography in a tune sheet.
- The thread (`step2-thread`) is a reading page: the tune's title, key and rhythm stated at the top, then
  its discussion as a chronological column of notes, each naming its author.
- The composer (`step3-composer`) is the note form itself, `form#note-form`, treated as an ordinary part of
  the thread rather than a modal, so the context of the conversation stays visible while writing.
- The moderation view (`step4-moderation`) is the same thread with held notes visible to the moderator and
  a stated reason on each hold, so the decision is legible after the fact.
- The empty state (`step5-empty`) is a quiet panel naming what did not match — the searched term or the
  selected rhythm — never an apology and never a bare blank region.

## Typography

- A system UI sans-serif stack for the interface, and the same stack for tune titles: no display face, so a
  metre or a key signature never has to survive a decorative typeface.
- Exactly one `h1` per page, naming the screen — the library, the tune, or the moderation queue.
- A strict document outline inside a thread: the tune is the heading, each note a subheading with its author
  and time, so a screen reader can move between contributions without reading every body.
- ABC notation and tempo values are set in a monospace stack, because they are read character by character.
- Form inputs carry visible labels placed directly above their fields. Placeholder text is never the label.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--cf-page` | `#faf7f0` | The warm paper ground of every screen |
| `--cf-surface` | `#ffffff` | Tune rows, note bodies and form backgrounds |
| `--cf-border` | `#e2dccd` | Quiet structural rules between tune rows and notes |
| `--cf-accent` | `#1f6f4a` | Session green: the filter's selected state, the submit action, and the tune's key badge |
| `--cf-text` | `#1c1917` | Ink for tune titles and note bodies |
| `--cf-muted` | `#6b6154` | Author names, timestamps and secondary metadata |
| `--cf-hold` | `#9a3412` | A held note's status, always with text naming the reason and never alone |

The palette targets WCAG AA contrast on every pairing above. Because this system is authored rather than
measured from boards, those ratios are to be verified when the boards are generated, not asserted here.

## Spacing rhythm

- `--cf-padding: 1.5rem`, `--cf-radius: 8px`, `--cf-border-width: 1px`.
- Notes in a thread are separated by a full step of vertical rhythm, so a long thread stays scannable and an
  author byline never reads as part of the previous note's body.
- The filter row keeps its own row height consistent whether a tag is selected or not, so selecting a rhythm
  does not shift the library beneath it.

## Component hierarchy

1. **Session header** — the archive's name, and the search entry point.
2. **Rhythm filter** — the row of selectable rhythm tags that scopes the library.
3. **Tune row** — title, key badge and rhythm, each row a link to its thread.
4. **Tune header** — the tune's title, key, rhythm and background on the thread page.
5. **Note form** — `form#note-form`: author, tune, rhythm, key, optional tempo and the note body.
6. **Note** — one contribution, with its author, tempo and body.
7. **State panels** — the empty result state and the moderation view's stated hold reason.

## Anti-patterns

- A note composer that hides the thread it is contributing to.
- Author names rendered as bare text with no distinction from the note body.
- An empty result that renders as a blank page rather than naming the search or filter that matched nothing.
- A rhythm filter that shows its selected state by colour alone.
- A held note silently vanishing from the thread instead of being visible to a moderator with a reason.
- Key or tempo values set in the body face, where `A dorian` and a bar of prose cannot be told apart.

## Rationale

The use case is a pub session: the same people, in the same room, building a repertoire over months. That
argues for a notebook, not a feed. A player arrives with a tune in mind or a rhythm in mind, and leaves
either having read what others played or having written a variant down. Everything the design does is in
service of those two acts: finding a tune, and leaving a note that a stranger will still find legible next
week.

The archive's own authority is the record, so the design keeps the tune visually primary and the discussion
subordinate but present. Moderation is deliberately a state rather than a control surface because the
boundary matters more than the apparatus: what a visitor must be able to rely on is that what they read is
what was published.

## Provenance

- **Derived from:** `docs/train/briefs/manifest.jsonl`, family `tr-20` (`tr-20-v1`, `tr-20-v2`) for the
  fields this system has to accommodate, and `docs/train/targets/tr-20/index.html` for the train-side target
  already authored against it.
- **Not derived from:** board bytes. The five boards named in `plan.md` are planned and ungenerated, so this
  document is authored ahead of them and will be reconciled against them once they exist.
- **Axis position:** quoted from `docs/train/briefs/TYPE-AXIS.md`, where `community-forum` is a partial
  member of the `blog` and `fan-community` axes.
