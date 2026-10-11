---
archetype: contact-lead
type: record-form
boards: docs/design/archetypes/contact-lead/
register: docs/provenance/assets/design-reference-wave2.md
---

# `contact-lead` — aesthetic system

The look of the `contact-lead` archetype: a consultation form for a design studio rendered in deep slate with a subtle blueprint grid, anchored by an emerald action colour. This document describes the accepted target at `docs/design/archetypes/contact-lead/` - its demo and its two reference boards - in the section order the evaluation side requires of a design (`DESIGN_SECTIONS`).

## Visual thesis

The visual thesis of a consultation form is **professional restraint and clear progression**. The background is a deep slate (`#0f172a`) with a faint blueprint grid pattern (`--blueprint`), establishing an architectural and methodical tone. 

The two-column layout places the studio identity and process on the left and the interactive form on the right. Both share a card surface (`#1e293b`). The action colour is emerald (`#10b981`), used strictly for the forward action: the submit button and the active state pill.

## Grammar and layout

- **The page** is a responsive viewport with content inside a `.container`.
- **The consultation workbench** is a two-column grid. The left column `.studio-panel` holds the studio identity, address, and consultation process steps. The right column `.form-card` holds the form fields.
- **The success view** replaces the form column with a receipt card, displaying the server-issued reference token and the echoed message.
- **Corners** use a hierarchical scale: `.form-card` and `.studio-panel` use `--radius-lg` (16px), `.process-list` uses `--radius-md` (12px), form controls use `--radius-sm` (8px), and the state pills use `--radius-pill` (9999px).

## Typography

Two families, both from the system: `--font-sans` (the `system-ui` stack) for everything a person reads, and `--font-mono` for machine-issued tokens like the reference ID. 

The studio name uses the display sizes. The form labels and text are highly legible at `1rem` with a `1.5` line height. The character count and field hints use a smaller, muted text style to remain secondary to the inputs.

## Token usage

The target's colour system uses a set of custom properties defined on `:root`.

| Token | Value | Where it is used |
|---|---|---|
| `--bg-page` | `#0f172a` | `body` background |
| `--surface-card` | `#1e293b` | `.studio-panel`, `.form-card` |
| `--surface-inset` | `#162032` | `.state-switcher` |
| `--surface-raised` | `#243248` | `.process-step` |
| `--surface-input` | `#162032` | form controls |
| `--border-subtle` | `#334155` | `.process-step`, `.site-foot` |
| `--border-control` | `#64748b` | form control borders |
| `--border-highlight` | `#94a3b8` | form control focus |
| `--text-primary` | `#f8fafc` | headings, body text |
| `--text-muted` | `#94a3b8` | field hints, process details |
| `--text-inverse` | `#0b1220` | button text |
| `--action` | `#10b981` | `.btn--action`, `.state-pill` |
| `--action-hover` | `#059669` | `.btn--action:hover` |
| `--action-active` | `#047857` | `.btn--action:active` |
| `--action-ink` | `#04231a` | `.state-pill` text |
| `--action-text` | `#34d399` | accent text |
| `--danger` | `#ef4444` | invalid field borders |

## Spacing rhythm

The scale is rem-based and provides generous breathing room for the form fields to ensure accessibility. The two-column layout uses `gap: 2rem` between the studio panel and the form card. Form fields are separated by `1.5rem` vertically. Padding inside the cards is `2rem` on desktop, scaling down to `1.25rem` on mobile.

## Component hierarchy

Read from `demo/index.html`:

- `header.top-bar` with `nav.top-nav` - the persistent chrome.
- A **demo state switcher** for verifying states statically.
- `main.container` containing `.consultation` layout.
- `.studio-panel` holding the identity, address, and process list.
- `.form-card` holding `#enquiry-form`.
- The form includes fields for `name`, `email`, `scope`, `budget`, and `message`, with `#message-count` and `#message-status` for the character limit.
- `demo/success.html` replaces the form with a success panel showing the reference and the echoed message.

## Anti-patterns

- **A window frame around the picture.** The reference boards have been corrected to remove the macOS window chrome, but adding generic browser chrome back in is an anti-pattern.
- **Multiple accent colours.** The design uses one emerald action colour. Adding secondary accents breaks the visual thesis.
- **Transmitting data in the demo.** The demo is purely a visual static target; it does not actually transmit or store data.

## Rationale

The design choices reflect a professional architecture or design studio context. The deep slate and blueprint background establish trust and precision. The strict two-column layout ensures the user always has context (the studio's process and contact info) while completing the form. The character counter is a practical affordance for the 500-character limit on the message field.

## Provenance

- **The boards** are registered in [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md).
- **The demo** (`demo/`) is the accepted target, hand-written and static.
- **The measurements** in this document were read from `demo/styles.css` and `demo/index.html`.
