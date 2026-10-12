---
archetype: booking
type: record-form
boards: docs/design/archetypes/booking/
register: docs/provenance/assets/design-reference-booking.md
---

# `booking` — aesthetic system

The look of the `booking` archetype: from a night-class studio rendered in dark slate, to outdoor farm visits and community workshops. This document expands the original accepted target at `docs/design/archetypes/booking/` to cover the full set of ten implementing families, following the section order the evaluation side requires of a design (`DESIGN_SECTIONS`).

## Visual thesis

A booking page is a decision with a receipt. The thesis follows from that: **a calm ground, cards that carry one thing each, and a single accent that marks the forward action**, with a full error scale held in reserve for the moment the form pushes back.

**The pilot target's aesthetic:** The ground is deep slate (`#0f172a` in the target's dark scheme) and every surface above it is a card (`#1e293b`) with a one-pixel border. The accent is emerald (`#10b981`), and the demo spends it on one forward action per state - *Continue to Confirmation* on the form, *Download PDF Receipt* on the confirmation, *Clear Filters* on the empty state. It also marks the state that means the same thing: the completed step's tick and the active step's halo. Because the type is a form that can be refused, the palette is not just ground-and-accent: it carries a complete error scale and a matching success scale.

**The family designs must not be averaged.** The seven training families employ distinctly different aesthetic systems. For instance, `tr-01` (bicycle mechanic) and `tr-03` (pottery kiln) are declared dark ("in a dark, low-glare palette"), while `tr-17` (farm vet) and `tr-21` (volunteer lift) use light palettes ("in a light palette"). Each board uses its own primary action token.

## Grammar and layout

- **The pilot page** is `min-height: 100vh` and its content sits in a `.container` no wider than `68rem`. The layout changes its column count at its breakpoints, while the spacing and the body type stay fixed.
- **The booking workbench** is a two-column grid - a summary column beside the form - which collapses to a single column below its breakpoint. The summary is deliberately pinned to a minimum width: it is the thing that tells the user *what they are booking*.
- **The receipt** is a narrower column, and at `680px` and up the ticket card becomes a `1fr 240px` grid, which is how the perforated stub is laid out beside the body of the ticket rather than under it.
- **The empty state** is a centred card, capped at `38rem`, holding one icon, one heading, one sentence that says what is missing and why, and one way out.
- **Training boards:** All seven training boards show a primary heading and a prominent booking form or schedule interface, adapting the core layout to their specific scenarios.

The original five pilot boards are laid out on this grammar but not always inside it: four of them are consumer pages with a top bar and no sidebar, while the empty-state board switches to an authenticated dashboard with a left sidebar. The target has no such sidebar anywhere.

## Typography

Two families in the pilot, both from the system: `--font-sans` (the `system-ui` stack) for everything a person reads, and `--font-mono` for the things a machine issued (the echoed record content and the ticket's reference badge). 

The display heading is the largest type on the page and the only text that scales with the viewport. Card headings are left-aligned inside their own cards, keeping them attached to the content they label; the confirmation ticket centres its title, its reference and its booking details, because the ticket is a centred object. 

Each training family adopts typography suited to its domain, though all remain highly legible and forms-oriented.

## Token usage

The pilot target's colour system is scheme-aware: sixteen of its twenty-five colour tokens are written as `light-dark()` pairs, serving both schemes.
The primary accent is `--accent` (`#10b981`), used for actions and active states. The error scale (`--error`, `--error-bg`, `--error-border`, `--error-text`) ensures validation visibility.

**The training families define their own distinct palettes:**
- `tr-01` (mobile bicycle mechanic): dark slate ground with bright primary actions.
- `tr-03` (pottery kiln): dark studio interface.
- `tr-17` (farm vet): light outdoor/agricultural theme.
- `tr-19` (rowing skiff): light nautical theme.
- `tr-21` (volunteer lift): light community theme.
- `tr-24` (farmers market): light rustic market theme.
- `tr-27` (acoustic concert): light parish hall theme.

Each family relies on these color signatures to establish its own identity.

## Spacing rhythm

The pilot scale is rem-based and tight at the bottom. The gap between sibling elements is `0.5rem` more often than anything else. Card padding runs `1.25rem` to `2rem`. The compact `0.25rem 0.65rem` inset belongs to the pills and the badges. Form controls sit between the two, around `0.7rem 0.85rem`.

The rhythm's job is to make the two-column workbench and the single-column receipt feel like the same page at different widths. 

## Component hierarchy

Read from the pilot `demo/index.html`:
- `header.top-bar` with `nav.top-nav` - the persistent chrome.
- A **demo state switcher** for verification without a server.
- `nav.stepper-nav` holding a progress stepper.
- The **summary** column, a labelled region carrying what is being booked.
- `section.card.form-card` containing the fields, and - for the error state - `#form-error-banner` with `role="alert"`.
- The receipt page carries the ticket: success mark, reference, the booking's details, a perforated divider, and the QR block.

Each training family implements its equivalent semantic structure matching its `plan.md` form definition.

## Anti-patterns

- **Two primary actions competing.** The accent marks the forward action of a state. The browse board puts a solid primary button on each of five cards and badges besides, which turns the signal into wallpaper.
- **A step indicator that disagrees with the flow it depicts.** The pilot boards show three different step models.
- **A different logo on every screen.** The pilot boards carry five different marks behind one constant wordmark.
- **Inventing what the spec withholds.** A session, a password field, a payment step, a cancellation route, a confirmation email, or an expiry on the reference - none of these are declared.
- **A seat grid that changes size.** (Present in the original pilot boards).

## Rationale

The type is `record-form` - a page with a form, a write that stores one row, and a read-back by reference - and every visual choice here serves that shape. Dark or light grounds and bordered cards let a schedule, a form and a receipt be the same kind of object at different widths; one accent keeps *what do I do next* unambiguous. The ticket treatment for the receipt is the visual form of *this row now exists and can be read back*.

## Provenance

- **The pilot boards** are registered in [`docs/provenance/assets/design-reference-booking.md`](../../../provenance/assets/design-reference-booking.md). They were generated, not designed - which is why the disagreements recorded under *Anti-patterns* are gaps in the reference set.
- **The training reference boards** are 7 distinct generation outcomes registered in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md). They declare and establish the visual baselines for `tr-01`, `tr-03`, `tr-17`, `tr-19`, `tr-21`, `tr-24`, and `tr-27`.
- **The demo** (`demo/`) is the accepted pilot target, hand-written and static.
- **The measurements** in this document were read from `demo/styles.css` and `demo/index.html`, and the board descriptions from the reference JPEGs against their recorded prompts.
