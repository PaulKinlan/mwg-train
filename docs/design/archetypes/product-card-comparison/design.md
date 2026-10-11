---
archetype: product-card-comparison
type: card
boards: docs/design/archetypes/product-card-comparison/
register: docs/provenance/assets/design-reference-product-card-comparison.md
---

# `product-card-comparison` — aesthetic system

The look of the `card` type, derived from its four reference boards. This document is written in the
section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design
document (`DESIGN_SECTIONS`) so it is reviewable the way the evaluation side's design documents are.

One difference from those documents is stated up front rather than implied: they describe an authored
target board, and this describes a set of **generated** reference boards. Every value below is the set
the generation prompts declared and the pictures were made from; the boards were inspected afterwards by
a different model family and its per-board findings - including what it found wrong - are recorded in the
[register](../../../provenance/assets/design-reference-product-card-comparison.md), not tidied away here.
Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A decision surface. The type exists so that options can be laid side by side and their differences read
in a glance, so the comparison is the product and the cards are its objects. The catalogue is a **shelf of
specifications**: even, aligned, quiet, with the numbers given room to line up down the page. The
comparison screen is the same information with the columns turned outward and the differing rows marked,
and it is the one screen where the eye is meant to travel horizontally.

The accent is spent on exactly one meaning - **the option you can take** - so a `Select` action and a
checked `Compare` box are the only cyan things on a screen. Nothing about a card's *state* is carried by
the accent; availability is carried by words, because a retired option and a published one must be
distinguishable to a reader who cannot see colour at all.

The one thing the type must never look like is a brochure. A card whose attributes are prose, or whose
values are set at different heights across a row, has removed the only reason to compare: a viewer must be
able to read a **row** across three columns without the page helping them remember what they just read.

## Grammar and layout

- The catalogue is a row of cards over the fold and a grid below it, with the filter row pinned above the
  cards: search, one category control, one sort control, and the result count at the end of the row.
- Cards are the same width and the same height as each other, and their internal bands are locked to
  shared baselines - image, name, attribute rows, price, actions. A card that declares fewer attributes
  keeps the row and says so rather than shrinking.
- The comparison is a table, not a row of cards: one label column down the left and one column per
  option, with a **frozen header row** carrying each option's thumbnail and name so a reader can scroll a
  long attribute list without losing the columns' identity.
- The selection screen is a single panel at a comfortable measure with the chosen option's own attributes
  shown as they appeared in the catalogue, and a narrower panel to its side for whatever is still being
  compared. The two are different columns because they are different things: one is a decision, the other
  is work in progress.
- State panels - the empty comparison, the no-matches catalogue - are centred, at reading measure, with
  one action each, and they say which state they are.
- There is no sidebar on this type. Sections belong to a filter row; a sidebar would suggest a taxonomy
  the type does not claim.

## Typography

- UI text uses the system sans stack. Names and headings are semibold; nothing on the comparison screen is
  larger than a card's name, because the table's rows are the content.
- **Values are set in tabular figures and aligned in the same direction per column**, so that a row can be
  read as a row. Labels are smaller and muted; a value is never muted.
- Attribute labels are short noun phrases, not sentences, and the label column is a fixed width so the
  columns to its right line up across every row.
- Prices are the second-largest type on a card and the largest type in the selection panel; money is set
  with its currency symbol and never abbreviated beyond the currency's own convention.
- A marked difference in the comparison carries a symbol **with a text alternative** and a short note
  where one is needed; the difference is never signalled by weight or hue alone.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#0f172a` | The page ground on all four states |
| `--bg-surface` | `#1e293b` | Cards, the comparison table's rows, the selection panel |
| `--border` | `#334155` | Card boundaries, comparison row rules, the label column's edge |
| `--accent` | `#22d3ee` | The one takeable action: `Select`, a checked `Compare`, `Continue` |
| `--text-primary` | `#f8fafc` | Names, values, headings |
| `--text-muted` | `#94a3b8` | Attribute labels, notices, counts, the empty state's sentence |
| `--state-available` | `#22c55e` | The `Published` / available word, with its word |
| `--state-retired` | `#ef4444` | The `Retired` word and the refusal of a carried selection - with its word |

These are the names a build of this type should use, so that a generated build and these boards describe
the same system. A build may substitute its own values; it may not substitute its own alignment rules or
state words, which are the contract in [`plan.md`](plan.md).

## Spacing rhythm

- One outer page inset, one card inset, and one **row height** shared by every attribute row in a card
  and every row in the comparison table. The shared row height is the type's one non-negotiable spacing
  decision: alignment across columns is a rhythm, not a per-screen adjustment.
- The gap between a value and its label is fixed; the gap between two attribute rows is smaller than the
  gap between two cards, so a card reads as a unit and a row reads as a row.
- Actions sit on one baseline per card, at the same height on every card in a row, so the `Select`
  buttons line up even when the cards' names wrap to different line counts.
- The comparison table's header row is visually separated from its body, and the marked rows are given a
  slightly stronger rule rather than a different ground.
- Controls are one height with a small radius; one filled control per screen, everything else outline or
  text.

## Component hierarchy

1. **Filter row** - search field, category control, sort control, result count.
2. **Card** - product image, name, subtitle, attribute rows (label and value, shared baselines), price,
   score, and the action row with `Select` and the `Compare` toggle.
3. **Attribute row** - the label, the value, and the *not declared* state that replaces a blank when a
   card does not carry the key.
4. **Comparison table** - frozen header row of option columns, fixed-width label column, one row per
   attribute key in the catalogue's declared order, difference marks with text alternatives, and a
   `Select this card` action at the foot of each column.
5. **Selection panel** - the carried option's name, price and attribute rows, the confirmation line, and
   the change-selection action.
6. **Retained-comparison panel** - the options still being compared, each with its remove action, and the
   note that the comparison is transient.
7. **State panel** - the empty comparison (`Choose two cards to compare` with its one action) and the
   no-matches catalogue, each naming which state it is.
8. **Difference mark** - the single component that says two values differ, always with text.

## Anti-patterns

- A row of cards used *as* the comparison, so values cannot be read across options.
- Attribute values set at different heights between cards, or attributes ordered differently on different
  cards: the alignment is the feature.
- A card that omits an attribute silently, so a missing value looks like a winning one.
- Colour or weight as the only difference signal, or a `Select` action on a **retired** option.
- The accent used for anything other than a takeable action - a badge, a heading, an illustration.
- A selection that appears to be saved to an account when it is session state, or a comparison that
  claims to persist.
- Money formatted from a float, or a price abbreviated into a rounded figure on the comparison screen.
- A `Compare` toggle that permits a fourth option without a word about the limit.

## Rationale

Cyan was chosen because it reads as neither a success nor a failure, which matters on a screen that must
carry the availability of an option *and* the action you can take on it without the two being confused:
available and retired are words with green and red grounds, while the one thing you can **do** is cyan.
The table, rather than a wider row of cards, is the comparison screen because the type's whole claim is
that attributes line up by name; a layout that cannot line them up is a gallery, and the axis exists to
separate those two things. The catalogue's own count and sort controls are shown on the board with their
state visible - the vision review noticed that the board's displayed prices descend while its sort control
says `Price low to high`, which is a property of a generated picture rather than of the design: a build
must sort, and the board is not evidence that it does.

The boards are generated references and their depicted names, prices and values are invented; where the
generation introduced artefacts, they are recorded in the register with the decision taken about them,
rather than edited out of the record.

## Provenance

- Reference boards, the exact generation prompts and their byte and prompt digests:
  [`README.md`](README.md) beside this file and the
  [register](../../../provenance/assets/design-reference-product-card-comparison.md).
- Model and attestation: `gemini-nano-banana-2.1`, explicitly requested, at 16:9; the generator fails
  closed on any other model. Rights boundary and the `excluded_from_training` policy: the
  [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md).
- Functional contract for the same type: [`plan.md`](plan.md).
- Type axis and coverage: [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md); archetype
  roles and the observable: [`docs/train/briefs/expansion-matrix.json`](../../../train/briefs/expansion-matrix.json).
- Work: bead `mwg-train-efg`.
