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

**The family designs must not be averaged.** `tr-07` is **dark** — its prompt says "in a dark,
low-glare palette" — while `tr-30` is **light**. They are opposite aesthetic systems alongside,
not replacements for, the accepted target above. `fam-07` has no committed reference board,
so its evaluation-side flow has no visual system to infer here.

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
  opposite of the catalogue archetype's drawer, and there is no gradient declaration either. The pass earns
  its shape from a notched silhouette - a `var(--card)` surface with its shoulders cut using `--page` -
  rather than from depth or elevation. Where this page does separate a surface from its ground, it is by fill
  rather than by shadow: the ticket rows and the form fields sit on `--field`, which is darker than the
  `--card` around them, and the outline colour does the rest.

The two training boards each declare `content-frame 1200px` and `page-padding 1.5rem`.
Their control radii differ: `tr-07` declares 12px, `tr-30` 8px. Both boards bound the page
with a complete footer inside the viewport; this observation is scoped to these two boards,
not the entire corpus (`tr-16` bleeds while keeping its footer). `tr-07` puts an observatory
photo and reviews to the left of the "Reserve Your Pass" form card; `tr-30` puts an event
card, an available-zones panel, photo and reviews to the left of its form card.

### Functional site projection

These are instructions for an interactive site, not static-board measurements. The four named shared
roles describe structure usable by an event family; the family journey supplies its control types,
fields, outcomes and form ID. Unclassified Shared-structure bullets remain pattern guidance,
not family instructions.

#### Shared structure

- **Shell:** A fluid, narrow page shell frames event details and a labelled registration form.
- **Choices:** A responsive selection region adapts to available space and includes only choices and controls the site’s journey declares.
- **Form:** The registration form presents labelled participation fields from its journey, announced validation and a clear refusal state.
- **Outcome:** A confirmation/read-back view shows the stored result; include a pass or QR only when the site’s journey defines one.

#### Pattern-specific details

These authored details describe this archetype's pattern, not the controls or measurements of any
separate training family.

- A fluid, narrow page shell capped at `52rem` frames the event pattern.
- Tickets are a two-column grid that collapses to one column on narrow screens; ticket rows and labelled quantity controls remain usable at every width.
- The event hero names the date and location, and shows availability only when backed by actual registration state.
- A live estimate is clearly marked as illustrative rather than a charge.

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

Each training board shows **exactly one visible `h1`**: `tr-07` says "Public Telescope
Viewing Passes" and `tr-30` says "Low-Tide Beach Cleanup & Kit Pass". Both prompts
specify a system UI sans-serif stack; their board titles are distinct from the target's
conference headline.

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
| `--accent-bright` | `#34d399` | links, `.estimate`, `.primary-action:hover`, the field inputs and textareas and the quiet actions (5) |
| `--accent-ink` | `#04231a` | text drawn on the accent (2) |
| `--text` | `#f8fafc` | `.capacity-note`, `.stepper button`, `.qr-badge` and three more (6) |
| `--muted` | `#cbd5e1` | `.event-hero > p`, `.form-lead`, `.hint`, `.ticket-row label span` and seven more declarations (10) |
| `--error` | `#fca5a5` | `input:user-invalid`, `textarea:user-invalid`, `.error-message` (2) |

Two of the ten are worth reading closely. `--muted` is the commonest token in the stylesheet (ten
references) even though it is a metadata colour, which is what a form-heavy page looks like when every
label, hint and description is deliberately quieter than the value beside it. And `--error` is attached to
`:user-invalid` rather than to a class - the failure colour arrives from the platform's own validation state
rather than from script, which is consistent with the target's refusal treatment.

**Declared family tokens and observed uses (not stylesheet reference counts).** The tables
below are sourced from the family prompts and the committed boards; they do not re-measure
or replace the target's ten-token table above.

`tr-07` — dark observatory:

| Token | Value | Observed use |
|---|---|---|
| `ds-bg` | `#030712` | dark page ground |
| `ds-surface` | `#0b1120` | dark surface behind content |
| `ds-card` | `#111c33` | form card |
| `ds-border` | `#1e2e4f` | dark surface and control borders |
| `ds-cyan` | `#38bdf8` | submit-button fill, logo star and active navigation |
| `ds-indigo` | `#6366f1` | barely visible or omitted entirely; at most blended into dark surfaces |
| `ds-text` | `#f1f5f9` | light foreground text |
| `ds-muted` | `#94a3b8` | quieter supporting text |

`tr-30` — light beach cleanup:

| Token | Value | Observed use |
|---|---|---|
| `sm-ocean` | `#075985` | submit-button fill |
| `sm-teal` | `#0f766e` | brand identity: anchor logo, active navigation, calendar badge, review stars and photo accents; never a button fill |
| `sm-card` | `#ffffff` | white form card |
| `sm-border` | `#bae6fd` | pale borders |
| `sm-bg` | `#f0fdfa` | mint/aqua-tinted page ground |
| `sm-text` | `#0f172a` | dark foreground text |
| `sm-muted` | `#64748b` | quieter supporting text |

**The two-chromatic question has different answers.** `tr-07`'s `ds-cyan` fills the
"Reserve Passes • $30.00 →" button, while `ds-indigo` is barely visible at all — the
weakest second-token role recorded in this lane. Amber `#fbbf24` appears on its review
stars only, outside its declared palette. `tr-30`'s `sm-ocean` fills the "Register &
Secure Kit Pass" button; `sm-teal` is brand identity only, not a second action colour.

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

**Capacity is depicted on both family boards, because limited capacity is the whole subject
of this archetype.** `tr-07` embeds "(14 spots left)" in the viewing-night date select's
option label, not in a separate meter. `tr-30` lists Zone A: North Shingle with 12 spots
left, Zone B: Estuary Mudflats with 8, and Zone C: South Promenade with 15 in the
Available Coastal Zones panel; its selected Zone B matches the eight-spot listing. These
are the boards' illustrations, not evidence that either board enforces the cap.

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
- **Illustrated commercial detail that contradicts the spec's own rule.** The boards show
  `142 / 200 seats filled`, £120 and £220 prices and a `Principal Engineer` job title. The spec declares
  `capacity: 3`, a single `ticket` select over `standard`, `accessible` and `student`, and no price or role
  at all. The demo carries the same invented figures but marks every one of them as illustrative rather than
  real - its capacity note reads `Reference board depicts 142 of 200`, its ticket prices read `£120
  illustrated` and `£220 illustrated`, and its estimate is `Illustrated total: £120 for 1 ticket · not a
  charge` - and the `Principal Engineer` job title is the one piece of it that appears on the pass board only
  and nowhere in the demo. So the seats count is not a rendering of the capacity rule - it is a different
  idea of capacity, and neither the demo nor the boards shows the waitlist the story promises. The raster QR
  is not a check-in code either, which this directory's `README.md` states in its own words.
- **One board carries browser chrome and is exempt from the rule that forbids it.** `step1-event.jpg` is
  detected by `check:archetype-frames` and listed as a grandfathered image; `step2-pass.jpg` is clean. The
  exemption is deliberate and checked, so the pair should not be "fixed" without re-reading that rule.

**Training-board defects and divergences (not rules for the accepted target):**

- `tr-07` declares `date:date*` but renders Viewing Night Date as a **select**; it declares
  `notes:textarea` but renders Accessibility and Telescope Requirements as a **single-line
  input**. Its board labels the names field differently from `attendees`. The footer says
  `© 2028` against the page's 2026 dates, and a small "Register" badge overlaps the
  navigation CTA border.
- `tr-30` declares **three** fields, but its board shows **four** controls: volunteer name,
  contact number, Cleanup zone, and an extra Litter Kit Allocation select. The declared
  zone names North Cove / Harbour Wall / East Sands differ entirely from the board's
  North Shingle / Estuary Mudflats / South Promenade. Do not substitute the board's
  options into the contract.
- Neither family board depicts a pass, ticket or confirmation view; those outcomes are
  designed from the briefs' read-by-reference contracts, not copied from a board.

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
  target, not part of the pilot corpus, and it stores nothing: it calls no storage API, and it intercepts the
  form's submit with `preventDefault` and renders the pass in the page, so nothing is sent or persisted. It
  does load its own stylesheet, as a static page must. Its pass shows the literal sample name `Sarah Jenkins`,
  replaced from the attendee input when the form is submitted.
- **The measurements** - every token value, owner and reference count, the geometry, the radii and the
  selectors that carry them, the absence of any shadow and of any monospace family, the type sizes and line
  heights, the gap and padding values, the breakpoints, and the literal-hex count - were read from
  `demo/styles.css` and the demo's markup; the board descriptions come from the two JPEGs and the framing
  verdict from `check:archetype-frames`.
- **The family declarations** are [`docs/train/briefs/manifest.jsonl`](../../../train/briefs/manifest.jsonl)
  and [`docs/eval/briefs/manifest.jsonl`](../../../eval/briefs/manifest.jsonl). The palettes
  and constants are declared in [`tr-07/prompt.txt`](../../training/tr-07/prompt.txt) and
  [`tr-30/prompt.txt`](../../training/tr-30/prompt.txt). The independent vision readings
  concern [`tr-07/reference.jpg`](../../training/tr-07/reference.jpg) (677609 bytes,
  SHA-256 `db55eaa21f2709e8b2a803302c9b306fc4a92a7fa7329b47b383920382841eda`)
  and [`tr-30/reference.jpg`](../../training/tr-30/reference.jpg) (572091 bytes,
  SHA-256 `d3bc8e0cffac6b45a834a558070da205c4cd7dddad05c7eed817057843613857`),
  measured with `sha256sum` and `stat -c%s`. These are separate from this directory's
  two target boards and its measured demo stylesheet.
