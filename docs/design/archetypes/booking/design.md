---
archetype: booking
type: record-form
boards: docs/design/archetypes/booking/
register: docs/provenance/assets/design-reference-booking.md
---

# `booking` — aesthetic system

The look of the `booking` archetype: a night-class studio rendered in dark slate, with one emerald
accent doing the work of saying *this is the way forward*. This document describes the accepted target
at `docs/design/archetypes/booking/` - its demo and its five reference boards - in the section order the
evaluation side requires of a design (`DESIGN_SECTIONS`).

## Visual thesis

A booking page is a decision with a receipt. The thesis follows from that: **a calm dark ground, cards
that carry one thing each, and a single emerald accent that marks the forward action**, with a full red
scale held in reserve for the moment the form pushes back.

The ground is deep slate (`#0f172a` in the target's dark scheme) and every surface above it is a card
(`#1e293b`) with a one-pixel border. Surfaces are drawn with borders and a single soft shadow: `.card`
carries a two-stop elevation shadow, and everything else is a bordered plane. That is what lets a
schedule grid and a two-column form sit on the same page without either reading as decoration. The
accent is emerald (`#10b981`), and it is used for the primary action of
a state - *Book*, *Confirm Booking*, *Add to Calendar*, *Reset Filters* - and for the one or two marks
that mean the same thing, such as the completion tick on a step or the seat that is selected.

Because the type is a form that can be refused, the palette is not just ground-and-accent: it carries a
complete error scale (surface, background, border, text) and a matching success scale, all built from the
same emerald and a red (`#ef4444`) so that a failure is legible at a glance without introducing a third
hue family.

## Grammar and layout

- **The page** is `min-height: 100vh` and its content sits in a `.container` no wider than `68rem`.
  Nothing about the scale is fluid except the display heading: the container stops growing at `68rem` and
  the layout changes its column count at its breakpoints, while the spacing and the body type stay fixed.
- **The booking workbench** is a two-column grid - a summary column of `minmax(18rem, 21rem)` beside the
  form - which collapses to a single column below its breakpoint. The summary is deliberately pinned to a
  minimum width: it is the thing that tells the student *what they are booking*, and a summary that can
  shrink to a caption stops doing that job.
- **The receipt** is a narrower column, and at `680px` and up the ticket card becomes a `1fr 240px` grid,
  which is how the perforated stub is laid out beside the body of the ticket rather than under it.
- **The empty state** is a centred card, capped at `38rem`, holding one icon, one heading, one sentence
  that says what is missing and why, and one way out.
- **Corners** carry the hierarchy: cards and tickets at `--radius-lg` (16px), inputs at `--radius-md`
  (12px), small controls at `--radius-sm` (8px), and anything that is a status rather than a container -
  the filter pills, the badges, the ticket's reference badge and the payment chip - fully rounded
  (`9999px`).

The five boards are laid out on this grammar but not always inside it: four of them are consumer pages
with a top bar and no sidebar, while the empty-state board switches to an authenticated dashboard with a
left sidebar. The target has no such sidebar anywhere, so that board describes a different application
from the other four.

## Typography

Two families, both from the system: `--font-sans` (the `system-ui` stack) for everything a person reads,
and `--font-mono` for the things a machine issued, which in this target is exactly two places - the echoed
record content (`.record-echo-content`) and the ticket's reference badge (`.ticket-ref-badge`). Both are
system fonts, so no font is downloaded and the type never shifts after first paint.

The display heading is the only large type on the page and it scales with the viewport:
`clamp(1.5rem, 1.25rem + 1.25vw, 2.25rem)`. Body text is `1rem` at `1.5` line height. Card headings -
*Order Summary*, *Guest Information*, *Seat Selection* - are left-aligned inside their own cards, which
keeps them attached to the content they label; the one exception the boards show is the confirmation
ticket, whose title and metadata are centred because the ticket itself is a centred object.

## Token usage

The target defines its surfaces, borders and text as `light-dark()` pairs, so one stylesheet serves both
schemes; the accent, error and success families are single-valued, and the table gives the same value in
both columns for those. Measured from `demo/styles.css`:

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg-page` | `#f1f5f9` | `#0f172a` | the page ground |
| `--surface-card` | `#ffffff` | `#1e293b` | the ordinary card |
| `--surface-card-subtle` | `#f8fafc` | `#162032` | inset panels inside a card |
| `--surface-card-elevated` | `#ffffff` | `#243248` | the card above a card, e.g. a popover |
| `--surface-input` | `#ffffff` | `#0f172a` | field backgrounds |
| `--surface-pill` | `#e2e8f0` | `#1e293b` | pills and status badges |
| `--border-subtle` | `#cbd5e1` | `#334155` | the default one-pixel border |
| `--border-highlight` | `#94a3b8` | `#475569` | hovered or emphasised borders |
| `--border-focus` | `#10b981` | `#10b981` | the focus ring |
| `--text-primary` | `#0f172a` | `#f8fafc` | body and headings |
| `--text-muted` | `#64748b` | `#94a3b8` | secondary text, hints, metadata |
| `--text-inverse` | `#ffffff` | `#ffffff` | text on the accent |
| `--accent` | `#10b981` | `#10b981` | the forward action |
| `--accent-hover` / `--accent-active` | `#059669` / `#047857` | same | its interactive states |
| `--accent-subtle` / `--accent-glow` | `rgba(16,185,129,.12)` / `rgba(16,185,129,.25)` | `.18` / same | tinted fills and rings |
| `--error` `--error-surface` `--error-bg` `--error-border` `--error-text` | `#ef4444` `#fef2f2` `#fee2e2` `#f87171` `#991b1b` | `rgba(239,68,68,.15)` `rgba(239,68,68,.5)` `#fca5a5` | refusals, in field borders, banner and text |
| `--success` `--success-bg` `--success-border` | `#10b981` `#ecfdf5` `#10b981` | `rgba(16,185,129,.15)` `#10b981` | the confirmation, built from the accent |

The accent family and the success family are the same emerald, which is a deliberate economy: a
confirmation is not a new colour, it is the accent arriving.

## Spacing rhythm

The scale is rem-based and tight at the bottom. Measured frequency across the stylesheet, the gap
between sibling elements is `0.5rem` more often than anything else, then `0.35rem`, then `1.25rem` and
`1rem`; card padding runs `1.25rem` to `2rem`, with the widest surfaces using `3rem 2rem`. Small controls
- pills, badges, the state switcher - use a compact `0.25rem 0.65rem` inset, which is what keeps them
pill-shaped rather than button-shaped. Form controls sit slightly larger, around `0.7rem 0.85rem`, so a
field never reads as a chip.

The rhythm's job is to make the two-column workbench and the single-column receipt feel like the same
page at different widths: the vertical spacing inside a card is the same in both, and only the number of
columns changes.

## Component hierarchy

Read from `demo/index.html`:

- `header.top-bar` with `nav.top-nav` (`aria-label="Main Navigation"`, `aria-current="page"` on the
  current item) - the persistent chrome.
- A **demo state switcher** (`role="region"`, `aria-label="Demo State Switcher"`, with `#btn-state-default`,
  `#btn-state-error`, `#btn-state-fill`). This is a verification control, not part of the archetype: it
  exists so a person can see the error and filled states without a server, and a rebuild should not ship
  it as product UI.
- `nav.stepper-nav` (`aria-label="Booking Progress"`) holding three `li.step-item` elements, each with a
  `.step-circle` and a `.step-connector`, using the states `completed` and `active` and marking the
  current one with `aria-current="step"`. In the target it reads `1. Select Class`,
  `2. Details & Registration`, `3. Confirmation`.
- The **class summary** column, a labelled region (`aria-label="Evening Class Summary"`) carrying what is
  being booked: title, time, instructor and the price lines.
- `section.card.form-card` (`aria-labelledby="form-heading"`) containing `#form-heading`, the five fields,
  and - for the error state - `#form-error-banner` with `role="alert"` and `aria-live="assertive"`,
  plus `#error-summary-count`. An error is announced, not merely coloured.
- The five field labels as the target writes them: *Full name* (`name`), *Email* (`email`),
  *Delivery address* (`address`), *Postcode* (`postcode`) and *Anything we should know?* (`notes`). The
  last is the field the `echo` block persists and reads back, and its label is deliberately conversational
  where the others are administrative.
- `demo/confirmation.html` carries the ticket: success mark, reference, the booking's details, a
  perforated divider, the attendee and payment lines, and the QR block. `demo/empty.html` carries the
  empty card.

## Anti-patterns

- **Two emerald actions competing.** The accent marks the forward action of a state. The browse board
  puts a solid emerald *Book* button on each of five cards and emerald seat badges besides, which turns
  the signal into wallpaper; the target keeps one primary action per state and lets the cards' other
  affordances stay quiet.
- **A step indicator that disagrees with the flow it depicts.** The boards show three different step
  models and none of them matches the target's `Select Class / Details & Registration / Confirmation`. A
  stepper is a claim about what the whole flow is; when two screens claim differently, the interface is
  lying about its own shape, and a rebuild should follow the target rather than any one board.
- **A different logo on every screen.** The five boards carry five different marks behind one constant
  wordmark. A mark that changes per screen is not a mark.
- **A logged-in dashboard for a public booking page.** The empty-state board's left sidebar
  (`Dashboard`, `Schedule`, `Classes`, `Instructors`, `Settings`) describes an administrative product,
  not the consumer flow the other four boards and the target depict.
- **A window frame around the picture.** All five boards are drawn inside a browser window. The target is
  unframed UI; `mwg-train-ondc` is the bead that would remove the chrome.
- **Inventing what the spec withholds.** A session, a password field, a payment step, a cancellation
  route, a confirmation email, or an expiry on the reference - none of these are declared, and a picture
  that promises one is describing software nobody specified. The reference is a reference.
- **A styled not-found page.** A reference with no row is a `404` plain document by the evaluation side's
  plan. Styling it invents a designed state the contract does not have.
- **A seat grid that changes size between two pictures of the same step.** Step 2 shows four rows by six
  columns and step 4 three by four; both are the seat picker of the same form. Neither board agrees with
  the contract either: the spec declares no seat field, and the demo has no seat picker at all - its
  mentions of seats are a `5 seats left` capacity count and the notes placeholder's `Window seat please`,
  not a grid of desks.

## Rationale

The type is `record-form` - a page with a form, a write that stores one row, and a read-back by reference
- and every visual choice here serves that shape. Dark ground and bordered cards let a schedule, a form
and a receipt be the same kind of object at different widths; one accent keeps *what do I do next*
unambiguous on a page that has several legitimate actions; a full error scale exists because the form is
refusable, and the refusal has to be as legible as the success. The ticket treatment for the receipt is
not decoration either: it is the visual form of *this row now exists and can be read back*, which is the
one thing the archetype is for.

## Provenance

- **The boards** are registered in
  [`docs/provenance/assets/design-reference-booking.md`](../../../provenance/assets/design-reference-booking.md),
  with a SHA-256 digest and the generating prompt for each in [`README.md`](README.md). They were
  generated, not designed - which is why the disagreements recorded under *Anti-patterns* are gaps in the
  reference set rather than decisions, and why this document follows the demo where the two differ.
- **The demo** (`demo/`) is the accepted target, hand-written and static, and its README records the
  boundaries: not the sealed evaluation target, not the pilot corpus, and excluded from training.
- **The measurements** in this document - every token value, geometry figure, spacing frequency and
  label - were read from `demo/styles.css` and `demo/index.html`, and the board descriptions from the
  five JPEGs against their recorded prompts. Nothing here is drawn from a specification that has not
  been published in this repository.
