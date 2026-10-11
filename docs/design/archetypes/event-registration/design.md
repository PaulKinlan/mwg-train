---
archetype: event-registration
type: record-form
boards: docs/design/archetypes/event-registration/
register: docs/provenance/assets/design-reference-wave2.md
---

# `event-registration` — aesthetic system

The look of the `event-registration` archetype: one dark page for a conference, an emerald accent that
marks the chosen ticket and the primary action, and a pass view that turns the confirmation into a ticket
stub with a QR block. This document describes the accepted target at
`docs/design/archetypes/event-registration/` - its demo and its two reference boards - in the section order
the evaluation side requires of a design (`DESIGN_SECTIONS`).

## Visual thesis

One event, one brand, one accent. `FUTURE WEB 2026` runs through the page title, the board, the pass and the
comparison view, which makes this reference set the least ambiguous of the family so far: there is no
second brand and no second currency to reconcile.

The palette is small - **ten colour tokens, all of them colours, all single-valued** - and it is the same
slate-and-emerald house palette the other archetypes use, by value: `--page` `#0f172a`,
`--card` `#1e293b`, `--accent` `#10b981`, and an `--accent-ink` of `#04231a` for text that sits **on** the
accent. Two details give it its own character. `--field` is `#111b2e`, a touch darker than the card it sits
inside, so an input reads as a well rather than a raised box; and `--accent-bright` (`#34d399`) exists
alongside `--accent` for hover states, links and the estimate line, so brightness - not fill - marks
interaction.

The scheme is **dark only**: the stylesheet declares `color-scheme: dark`, contains no `light-dark()` pair
and has no `prefers-color-scheme` block. Every one of the ten tokens is single-valued.

That small palette is not the whole story of the colour in this target - see the first anti-pattern below:
sixteen hex colours are written outside `:root`, eleven of them values the ten tokens never declare.

## Grammar and layout

- **The shell** is `width: min(100% - 2rem, 52rem)` - a single measured column, narrower than the catalogue
  archetype's grid - and its padding is fluid: `clamp(1rem, 4vw, 2.5rem) 0 4rem`.
- **Vertical rhythm is fluid rather than stepped.** Section padding is `clamp(1.5rem, 4vw, 2.5rem)` or
  `clamp(1.5rem, 4vw, 2rem)`, and the same trick is used inside the card, so the page breathes with the
  viewport instead of jumping at a breakpoint.
- **Tickets are a two-column grid that collapses.** `.ticket-grid` is `repeat(2, minmax(0,1fr))` with a
  `.8rem` gap, becoming one column at `48rem`; each `.ticket-row` wraps at `24rem`, where the stepper takes
  the full width. Those are the only two width breakpoints in the stylesheet, alongside the
  `forced-colors: active` and `prefers-reduced-motion: reduce` blocks.
- **Radii are spelled literally, not tokenised** - this target declares no `--radius-*` at all. The card
  surfaces (`.event-hero`, `#registration-form`, `.event-pass`) take `12px`; controls and fields take `8px`;
  `.capacity-note` and `.pass-status` are `999px` pills; `.capacity-dot` is a `50%` circle; and
  `.event-pass::after` uses `3.5rem 3.5rem 0 0` to cut the pass's shoulders.
- **There is no shadow anywhere.** The stylesheet contains no `box-shadow` declaration at all, which is the
  opposite of the catalogue archetype's drawer, and there is no gradient declaration either. So the pass
  earns its shape from a notched silhouette and a darker field colour rather than from depth or elevation -
  on a single-column dark page, separation comes from `--field` being darker than `--card`, and from the
  outline colour.

## Typography

One family only: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. This target has
**no monospace** - no `--font-mono` token, no `code` or `pre` rule - so a reference or a part number, if one
ever appears here, would be set in the same face as the prose. Nothing is downloaded, so nothing shifts
after first paint.

Two headings are viewport-scaled and they are the only ones: `h1` at `clamp(1.8rem, 5vw, 2.75rem)` and `h2`
at `clamp(1.4rem, 4vw, 1.75rem)`. Both carry `line-height: 1.2`, `letter-spacing: -.025em` and
`text-wrap: balance` - the last of which is doing real work on a heading like `Event details & ticket
selection`, and is the kind of thing that only shows up when a heading wraps.

Below the headings the scale is small and deliberately fine-grained: `1.25rem` once, then the metadata sizes
cluster into `0.875rem` (twice), `0.825rem`, `0.82rem` (three times) and `0.8rem` (twice). Three values
within `0.025rem` of each other is more precision than a reader can perceive, and it means the target's
small text is essentially one size with three near-misses - worth knowing before copying the numbers into a
second target. Body text is `1rem` at a line height of `1.5`.

## Token usage

Ten colour tokens, every one of them referenced somewhere - there is no dead token in this target. The
owners and counts below are measured across the whole of `demo/styles.css`, `:root` included, counting
`var()` occurrences - a declaration shared by several selectors counts once, however many it names - and
none of the ten is referenced from the demo's HTML:

| Token | Value | Where it is used (references in the stylesheet) |
|---|---|---|
| `--page` | `#0f172a` | `body`, `.event-pass::after`, the comparison images and iframes (3) |
| `--card` | `#1e293b` | the form card and the pass (2) |
| `--field` | `#111b2e` | `.ticket-row` and the field inputs and textareas (2) |
| `--outline` | `#64748b` | `.ticket-row`, `.stepper`, `.stepper input` and five more (8) |
| `--accent` | `#10b981` | `:root`'s `accent-color`, `::selection`, `.capacity-dot` and three more (6) |
| `--accent-bright` | `#34d399` | links, `.estimate`, `.primary-action:hover`, the field inputs and the quiet actions (5) |
| `--accent-ink` | `#04231a` | text drawn on the accent (2) |
| `--text` | `#f8fafc` | `.capacity-note`, `.stepper button`, `.qr-badge` and three more (6) |
| `--muted` | `#cbd5e1` | `.event-hero > p`, `.form-lead`, `.hint`, `.ticket-row label span` and five more (10) |
| `--error` | `#fca5a5` | `input:user-invalid`, `textarea:user-invalid`, `.error-message` (2) |

Two of the ten are worth reading closely. `--muted` is the commonest token in the stylesheet (ten
references) even though it is a metadata colour, which is what a form-heavy page looks like when every
label, hint and description is deliberately quieter than the value beside it. And `--error` is attached to
`:user-invalid` rather than to a class - the failure colour arrives from the platform's own validation state
rather than from script, which is consistent with the target's refusal treatment.

## Spacing rhythm

There is no dominant gap in this target, which is itself the measurement: `.5rem` appears twice, and
`1rem`, `1.25rem`, `.8rem`, `.6rem` and `.65rem` appear once each. Padding is where the discipline lives,
and it is fluid: two `clamp()` values for sections, one for the shell, `padding: 0` twice for elements that
manage their own insets, and `padding: .85rem 1rem` twice for the medium controls.

The practical consequence is that this target's spacing is not a scale you can extend - it is a set of
one-off decisions, mostly fluid. A rebuild that invents a `--space-*` scale for it would be inventing
structure the reference does not have, and would be more likely to fight the clamps than to help them.

## Component hierarchy

Read from `demo/index.html`, with the pass view selected by `?view=pass` and the comparison page in
`demo/compare.html`:

- **The event hero** (`.event-hero`): the event name `Future Web 2026`, its subtitle, the date and location,
  and a `.capacity-note` pill with a `.capacity-dot` - the seats-filled count, `142 / 200`.
- **The registration form**: `form#registration-form`, `action="/register"`, `method="post"`, and
  `aria-labelledby="form-heading"` pointing at its `h2`, `Event details & ticket selection`.
- **The ticket pickers**: two `.ticket-row`s, General Admission and Workshop Pass, each with a `.stepper`
  whose buttons are individually labelled - `Add one General Admission ticket`,
  `Remove one General Admission ticket`, and a group labelled `General Admission quantity` - over the
  `data-tier="general"` and `data-tier="workshop"` attributes.
- **The attendee fields**: `Attendee name` (`name="name"`), `Work email` (`name="email"`), `Organization`
  (`name="organization"`) and `Dietary preferences` (`name="dietary"`), with `.hint` text beneath and a
  `#tier-error` element ready for a tier-level failure.
- **The live estimate**: `#estimate` with `role="status"`, reading
  `Illustrated total: £120 for 1 ticket · not a charge`. The `not a charge` disclaimer is part of the
  target's own copy, not an annotation of it, and it is the reason the invented prices in this archetype are
  a presentation rather than a claim about money.
- **The pass view**: `.event-pass` with the brand, the attendee in `#attendee-name`, a `.pass-details`
  list of pass type, date and location, a QR block, and `.pass-actions` offering `Save to Apple Wallet` and
  `Download PDF Badge`. The demo is explicit that its pass is a preview and not a ticket: its own labels
  read `Design preview · not valid for entry` and `Illustrative badge · do not scan`, and its README says
  the demo's pass is conspicuously labelled not valid. The stronger labels on the board - a
  `REGISTRATION CONFIRMED` pill and a `SCAN AT CHECK-IN` caption - belong to the **board**, not to the
  demo, and copying them into a rebuild would present an unissued pass as a confirmed one.
- **The comparison page**: `h1` `Event registration: visual references and live demo`, and four figures in
  two pairs. Each pair sets an `Unmodified reference` figure showing one of the boards
  (`step1-event.jpg`, then `step2-pass.jpg`) beside a neighbouring live figure - captioned
  `Live registration form` and `Live pass preview` - which embeds `index.html` and
  `index.html?view=pass` in an iframe, so each board can be read against the target it inspired.

## Anti-patterns

- **A ten-token palette with sixteen hex values beside it.** Outside `:root` this stylesheet writes sixteen
  hex colours directly - fourteen distinct values, `#475569` and `#162437` among them. Eleven of those
  fourteen are colours the ten tokens never declare, and the other three (`#10b981`, `#34d399`, `#64748b`)
  merely repeat a token's value as a literal instead of referencing it. The token layer is real but partial,
  so "the palette" here is not a complete description of the colour in the page, and a rebuild that
  followed only the tokens would not reproduce the target.
- **Three sizes within 0.025rem.** `0.825rem`, `0.82rem` and `0.8rem` all appear, and no reader can tell
  them apart. Copying that cluster into a second target multiplies arbitrary numbers without adding
  hierarchy.
- **No depth mechanism at all.** With no shadow and no elevation token, every surface has to be separated
  by fill and outline. It works here because the fields are darker than their card; it would not survive a
  light scheme, which is presumably one reason there isn't one.
- **Two steppers for one flow.** The boards' progress indicators disagree: `01. Tickets & Details / 02.
  Payment / 03. Confirmation` on the event board against `01 Details / 02 Your Pass` on the pass board.
  Neither matches the other, and the second drops the step the first calls Payment.
- **Three names for one registration.** `Alex Morgan` (a placeholder on the event board), `Sarah Jenkins`
  (the pass board and `#attendee-name` in the demo) and `Katherine Johnson` (the spec's journey). A
  reference set that cannot agree on the attendee cannot be used to check an echoed name.
- **A pass for a ticket the previous board did not select.** The event board has General Admission selected
  at £120 with Workshop Pass at zero; the pass board's pass is a `Workshop Pass (£220)`.
- **Illustrated commercial detail that contradicts the spec's own rule.** The boards and the demo show
  `142 / 200 seats filled`, £120 and £220 prices and a `Principal Engineer` job title; the spec declares
  `capacity: 3`, a single `ticket` select over `standard`, `accessible` and `student`, and no price or role
  at all. The seats count is not a rendering of the capacity rule - it is a different idea of capacity, and
  neither the demo nor the boards shows the waitlist the story promises. The raster QR is not a check-in
  code either, which this directory's `README.md` states in its own words.
- **One board carries browser chrome and is exempt from the rule that forbids it.** `step1-event.jpg` is
  detected by `check:archetype-frames` and listed as a grandfathered image; `step2-pass.jpg` is clean. The
  exemption is deliberate and checked, so the pair should not be "fixed" without re-reading that rule.

## Rationale

The type is `record-form`, and the design's job is to get a form filled and out of the way. So the page is a
single 52rem column with one accent, the ticket decision is made first and visually (a chosen row, a
stepper, a live estimate), and the details follow in a plain two-up field grid. The capacity note belongs in
the hero rather than at the form because it is the fact that decides whether a person is registering or
joining a queue - even though, as the contract records, the waitlist behind it is the one part of this
archetype that no artefact yet demonstrates. And the pass view is where the design gets to be a thing rather
than a form: a ticket stub, cut at the shoulders, carrying the name, the details and something that looks
like a way in.

## Provenance

- **The boards** are registered in
  [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md),
  with a SHA-256 digest and a byte count for each in [`README.md`](README.md). They were generated rather
  than designed, and the README says as much: the depicted content is "unverified placeholders" and the QR
  graphic "is not a valid check-in pass; do not scan or use it" - so this document follows the demo where
  the two disagree and records the
  disagreements rather than treating them as decisions.
- **The demo** (`demo/`) is the accepted target, hand-written and static. It is not the sealed evaluation
  target, not part of the pilot corpus, and it stores nothing: the name in `#attendee-name` is scripted.
- **The measurements** - every token value, owner and reference count, the geometry, the radii and the
  selectors that carry them, the absence of any shadow and of any monospace family, the type sizes and line
  heights, the gap and padding values, the breakpoints, and the literal-hex count - were read from
  `demo/styles.css` and the demo's markup; the board descriptions come from the two JPEGs and the framing
  verdict from `check:archetype-frames`.
