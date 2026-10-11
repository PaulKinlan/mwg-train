---
archetype: editorial-blog
type: blog
boards: docs/design/archetypes/editorial-blog/
register: docs/provenance/assets/design-reference-editorial-blog.md
---

# `editorial-blog` — aesthetic system

The look of the `blog` type, derived from its four reference boards. This document is written in the
section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design
document (`DESIGN_SECTIONS`) so it is reviewable the way the evaluation side's design documents are.

One difference from those documents is stated up front rather than implied: they describe an authored
target board, and this describes a set of **generated** reference boards. So every value below is
*derived from the pictures*, not decreed by a designer, and the token names are the names a build of
this type should use so that a generated build and these boards describe the same system. Behaviour is
in [`plan.md`](plan.md), not here.

## Visual thesis

A publication that reads as edited rather than assembled: a serif headline face carries the authority,
one emerald accent marks what is actionable, and everything that is not the article gets out of the
way. The article page is the product; the index is a well-ordered shelf in front of it. Density is
deliberate in the index (excerpt cards with a thumbnail, a byline and a reading time so a reader can
choose quickly) and generous in the article (a single column at reading measure, 1.7 line height).

The one thing the type must never look like is a form. A reader who lands on an article and sees
labelled inputs has been shown the wrong page.

## Grammar and layout

- One page frame, `--frame: 1200px`, centred, with `--page-padding: 1.5rem` at the sides.
- The index is a single column of full-width excerpt cards; the card grid the reference boards show is
  a three-across treatment on wide screens and collapses to one column, and the same card is never
  shown twice with different contents.
- The article is a single column at a reading measure, with the figure and the "read next" links
  placed beside it on wide screens and below it on narrow ones. The reference board puts them in a
  right-hand sidebar; the prose itself is one column either way, which is the property that matters.
- The composer is two columns - the form and a live preview - and the preview is the article page's own
  markup, not a second rendering that can drift from it.
- The masthead is present on every page and is the only element allowed above the fold on all four
  states, so a reader always knows which publication they are in.

## Typography

- Headlines, the masthead and the pull quote: a serif face, with the headline at the top of the type
  scale. The reference boards render this with a transitional serif, which is the intended feel.
- Body, navigation, labels, buttons and metadata: the system sans stack, `--font-sans`, so the reading
  experience does not depend on a webfont being available.
- The byline, dates, reading time and tags are one step below body size and use `--text-muted`; they
  are metadata and must not compete with the headline.
- Body prose is at reading measure and 1.7 line height; a pull quote is the only element permitted to
  step outside it.

## Token usage

Derived from the reference boards, which use one dark system throughout:

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#0f172a` | The page ground on all four states |
| `--bg-surface` | `#1e293b` | Cards, the composer's panels, the empty-state card |
| `--border` | `#334155` | Card boundaries and dividers |
| `--accent` | `#10b981` | The active tag, the "Editor's pick" mark, the publish action, the copied-link confirmation |
| `--text-primary` | `#f8fafc` | Headline and body text |
| `--text-muted` | `#94a3b8` | Byline, dates, reading time, tag chips at rest |

The accent is a single action colour: exactly one accent-coloured control per screen region, and never
both the publish action and a secondary action in the same accent. The reference boards hold this
without prompting, so it is a property of the system rather than an accident of one board.

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 8px`, `--control-border: 1px solid var(--border)`.
- Vertical rhythm in the article is one body-line unit: the paragraph gap equals the body line height,
  so the column reads as continuous text rather than as blocks.
- Card interiors use a single inset on all sides; the gap between cards is larger than the inset, which
  is what makes the index read as a list of things rather than as a grid of cells.

## Component hierarchy

1. **Masthead** - publication name, section links, search entry point. Present on every state.
2. **Index list** - excerpt card: thumbnail, headline, two-line standfirst, byline with date and
   reading time, tags. One card may be marked as an editor's pick, by a border and a label rather than
   by colour alone.
3. **Article** - breadcrumb, headline, standfirst, byline, body, figure with caption, pull quote,
   share row with a copied confirmation, tags, related links.
4. **Composer** - labelled fields (headline, standfirst, byline, section, tags, body), a live preview,
   and a sticky action bar with save, preview and publish.
5. **State panels** - the empty index, the no-results search, and the 404 for an unknown slug. Each
   names which state it is; they are not one generic empty box.

## Anti-patterns

- A reader-facing article rendering as a form, or any labelled input on the article page.
- Metadata (byline, date, reading time, tags) competing with the headline, or a tag chip carrying the
  same weight as the primary action.
- A second accent colour competing with `--accent`, or the accent used decoratively.
- A share affordance that does not confirm the copy, leaving the reader unsure whether it worked.
- A no-results state that hides the query the reader typed, or that offers no way back to a full index.
- An empty index and a no-match search rendered as the same state.
- Colour alone carrying any meaning: an active tag, an editor's pick and a field error all need a mark
  or a message.
- A figure without a caption, or a caption that repeats the body sentence beside it.
- A reading column wider than reading measure simply because the viewport allows it.

## Rationale

The type's job is to be read, and every choice above serves that: a serif headline for authority, one
accent for action, metadata held one step down, one column at reading measure, and a share affordance
that confirms what it did. The dark ground is not a brand decision - it is what the reference boards
show, and because their tokens are the recorded values, a build of this type should reuse them rather
than invent a palette. Where the boards themselves are imperfect is recorded in the register, not
smoothed over here: the composer board carries a wizard stepper nothing asked for and several
mis-spellings in secondary labels, and those are bugs in a picture, not decisions.

## Provenance

- Boards, prompts and digests: [`README.md`](README.md) and
  [`docs/provenance/assets/design-reference-editorial-blog.md`](../../../provenance/assets/design-reference-editorial-blog.md).
  All four are `excluded_from_training: true`, `approved_for_training: false`, generated with
  `gemini-nano-banana-2.1` through an attesting gateway, and independently reviewed by a
  vision-capable model in a different family than the lane that produced them.
- Behaviour for the same type: [`plan.md`](plan.md) beside this file.
- Type axis, and the classification of this type as content-only: [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md).
- Section contract this document follows: `src/design/contract.mjs` (`DESIGN_SECTIONS`).
