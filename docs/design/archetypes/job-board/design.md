---
archetype: job-board
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/job-board/
register: docs/provenance/assets/training-reference-boards.md
---

# `job-board` — aesthetic system

The look of the `record-form` type as the `job-board` archetype implements it, expanded from the family's
single landing reference into a full multi-step journey. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**Where this system comes from.** The family is `tr-12`, CleanTech Trades Network, and the token set below is
**declared** by its generation prompt ([`prompt.txt`](../../training/tr-12/prompt.txt)): a palette under the
`ct-` prefix, chosen so the type is "recognisable by its own token prefix rather than by a shared template".
The committed landing reference ([`reference.jpg`](../../training/tr-12/reference.jpg)) is a depiction of that
declaration, and every observed use recorded here was read out of those bytes. The five journey boards this
document describes do not exist yet — see *Implementation status* in `plan.md`.

## Visual thesis

A trades apprenticeship board has to do two jobs at once: read as a **directory of real vacancies** with terms
a young applicant can act on, and read as a **form they can trust** with their details. The reference answers
both by splitting the page rather than stacking it — the board on the left, the application on the right, both
visible at once — and by giving each vacancy the terms in a labelled key/value block rather than in prose.

The words in the hero state the thesis plainly: "Launch Your Career in the Green Economy", with the board's
purpose underneath it. This archetype is not selling anything; it is matching a local employer with a local
trainee, so its credibility rests on specifics — a named employer, a named town, a wage, and a start date that
falls on a real day.

## Grammar and layout

- One page frame, `--content-frame: 1200px`, centred, with `--page-padding: 1.5rem` and
  `--control-radius: 8px` — the declared structural constants.
- The reference is a **browser viewport**: chrome along the top edge with macOS-style window controls, a single
  tab, and an address bar reading `https://cleantechtrades.site/`. That framing is declared and visible, so it
  is part of what this board depicts.
- Page structure top to bottom, as declared and as rendered: a brand header, a navigation bar, a main content
  area, one content section, the working form, and a footer.
- The reference's main area is a **two-column split**, with the board and its context taking the larger share
  and the application form a narrower column beside it: the board on the left,
  the application form and its outcome on the right. Both columns are visible without scrolling, which is what
  lets a candidate read terms and start applying in one view.
- The **board region** is a search card carrying two selects — apprenticeship trade, defaulting to all trades,
  and location — above two vacancy cards. Each card states the trade, level, employer, town, wage and start
  date as a labelled block rather than a sentence.
- The **vacancy detail** (`step2-vacancy`) is where this design earns its multi-step expansion. On the
  reference there is **no separate detail view**: the terms are compressed onto the cards so that everything
  fits one screen. A five-step flow gives a vacancy the room its terms deserve, and the cards become the index
  into it.
- The **filtered board** (`step4-filtered`) is the list region narrowed by the trade or location filter the
  search card already exposes, which is the state `plan.md`'s first assertion tests.
- The **application form** (`step3-apply`) is one column of one page, six labelled fields and a single submit —
  never a wizard, never a modal.
- The **empty state** (`step5-empty`) is a quiet panel naming the filter that matched nothing.

**A divergence recorded rather than smoothed over, because it is systematic.** The prompt instructs that the
content "runs past the left, right and bottom edges" with no visible page end, while also requiring a complete
footer. The raster resolves that contradiction the way every other board in this corpus has: the whole page is
bounded inside the viewport with a visible footer band. This is the fourth archetype where the same
contradiction resolves the same way, so a future generator should read these baselines as framed compositions.

**Two observations about this raster, recorded so they are not mistaken for rules.** First, it depicts a
**post-save state**: a confirmation banner carries a checkmark, the words "Application Saved", a reference
`CTT-2026-9842` and the note that the draft survives a reload. That is a state of the application flow rather
than the landing view the prompt asked for, and it is useful evidence that the receipt is a real screen in
this type — but it is not a picture of the five planned boards. Second, the raster fills the form with its own
invented applicant (`Oliver Bennett`) rather than the fixture the brief's journey declares (`Taylor Brooks`);
the two are unrelated, and only the brief's values are contract.

## Typography

- A system UI sans-serif stack, as declared.
- Exactly one `h1` on the reference, and it is the **hero headline** — "Launch Your Career in the Green
  Economy" — rather than the brand name in the header. The dashboard archetype's two boards split on this same
  choice, so it is an open decision for a generator rather than a rule.
- Three tiers are visible: the hero headline, the card and section headings (the form card, the vacancy
  titles, the review titles), and the metadata labels inside the cards.
- **Terms are set as labelled pairs.** Trade, level, wage and start date each carry a muted key and a stronger
  value, so a candidate can compare two vacancies by scanning the same positions in each card. This is the
  typographic expression of the thesis: specifics, in the same place every time.
- Form inputs carry visible labels above their fields, and all six are labelled on the reference.

## Token usage

All values are declared; each observed use was read out of the committed bytes.

| Token | Value | Observed use |
| --- | --- | --- |
| `ct-slate` | `#0f172a` | The darkest value: primary ink on the light ground, and the ground of the vacancy cards and the footer |
| `ct-surface` | `#1e293b` | The vacancy cards' background, carrying white text |
| `ct-teal` | `#0d9488` | The single accent: the submit action, the search action, the outlined "Post a Vacancy" control, and half of the brand mark |
| `ct-amber` | `#f59e0b` | Rating stars and the logo's second tone — emphasis, not the primary action |
| `ct-border` | `#334155` | Hairlines on cards, inputs and dividers |
| `ct-text` | `#f8fafc` | Text inside the dark cards and the footer band |
| `ct-muted` | `#94a3b8` | Labels, metadata keys and secondary copy |

**That the palette is light is a declaration, not an inference.** The prompt says "in a light palette", and the
raster agrees: the page ground is light, the cards and form are white, and the dark values appear as the ink on
that ground and as the two dark surfaces (the vacancy cards and the footer). Reading `ct-slate` and
`ct-surface` as a dark theme would be a misreading of names that denote the darkest values in the set, so it is
recorded here in both directions.

**One observed colour that is not a declared token.** The confirmation banner's green — a pale fill with a
matching border — is not in the declared palette. The prompt's own rule is that the accent is the only
chromatic colour and carries the single primary action, so a success state introduced in a second hue is worth
naming as an exception the board makes rather than a pattern to copy. A success state should be carried by the
declared set plus text.

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 8px`, `--control-border: 1px solid var(--ct-border)` — the
  declared constants.
- Vacancy cards are spaced as a pair so they can be compared side by side, and their internal key/value rows
  keep a uniform rhythm so the same term sits at the same height in both.
- The form's fields are separated enough for field-level feedback to appear without moving the fields below,
  which matters because the confirmation appears directly beneath the form on this board.
- The reference is **densely packed** in order to fit hero copy, a search card, two vacancies, two reviews, a
  six-field form and a confirmation into one 1376 × 768 frame. That density is a consequence of the single
  board, not a spacing rule: with a multi-step flow each region gets its own screen and the rhythm can relax.

## Component hierarchy

1. **Brand header** — the mark, the wordmark, the section navigation and the employer-facing control.
2. **Search and filter card** — the trade and location selects that scope the board.
3. **Hero** — the headline stating the board's purpose, its supporting sentence, and an editorial photograph
   of the trade it advertises.
4. **Vacancy card** — one listing: title, employer, town, and the trade, level, wage and start date as
   labelled terms.
5. **Application form** — the identified vacancy, the applicant's name, email and telephone, their trade and
   level, and their qualifications note.
6. **Confirmation** — the receipt: a checkmark, the words naming the outcome, and a reference the applicant can
   return to.
7. **Attribution row** — employer voices with portraits and ratings.
8. **Footer** — contact details, a statement of purpose, and the date the board was read.
9. **State panels** — the empty result state and any refusal feedback.

## Anti-patterns

- **A posting with no stated location or terms.** The prompt names this first, because a vacancy board whose
  listings cannot be acted on is not a board.
- A posting or apply control offered to a reader who cannot use it.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.
- A wage, date or level presented without its unit or weekday where the reader has to infer it.
- An empty result rendered as a blank region rather than naming the filter that matched nothing.

These are the prompt's own prohibitions, kept as the archetype's rules. On the committed reference none is
violated: all six controls carry visible labels, teal is the only action colour, the form is inline, and the
listed dates are real weekdays rather than arbitrary. The one exception worth carrying is the confirmation
banner's undeclared green, noted under *Token usage*.

## Rationale

The subject is local: a heat pump and solar installer network, matching employers in Bristol and Bath with
trainees who live near them. Local means specific, and specific means terms — a named employer, a wage, a start
date, an apprenticeship level. So the design's work is to make those terms comparable at a glance and to make
applying to them feel like a transaction with a receipt rather than a message into a void.

That argues for the split layout: the board and the form side by side, so a candidate can see what they are
applying to while they write. It also argues for the confirmation being a first-class element of the screen —
the raster's own post-save banner with its reference number is the clearest statement in the whole corpus of
what this type's value is. An application a candidate cannot return to is a form submission; an application
with a reference is a record.

## Provenance

- **The declaration:** [`prompt.txt`](../../training/tr-12/prompt.txt), sha256 `033175a6…`, which names the
  palette, the structural constants, the page structure, the six control labels and the prohibited patterns.
- **The depiction:** [`reference.jpg`](../../training/tr-12/reference.jpg), 1376 × 768, 633801 bytes, sha256
  `ab796689…`. Each token's observed use, the split layout, the single `h1` placement, the post-save
  confirmation banner, the absent detail view and the framing divergence were read out of those bytes. Both
  files are pinned in
  [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl`, family `tr-12`, and the train-side
  pair `docs/train/design/tr-12/`.
- **Not yet depicted:** the five journey states named in this document and in `plan.md`. They are planned and
  ungenerated, so this document is the declared system those boards will be generated against.
