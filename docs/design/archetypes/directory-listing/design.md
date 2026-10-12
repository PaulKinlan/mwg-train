---
archetype: directory-listing
type: record-form
boards: docs/design/archetypes/directory-listing/
---

# `directory-listing` — aesthetic system

The look of the `directory-listing` type, expanding from the `tr-06`, `tr-14` and `fam-06` reference boards into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A neighborhood independent trades and artisan directory system. The visual language conveys trust, locality, and professionalism: clear trade categories, distinct verified badges, and highly legible contact cards. The palette is grounded in a civic, dependable aesthetic providing high contrast and readability.

The layout emphasizes rapid filtering and scanning. Listings are treated as structured business cards, prioritizing operating hours and phone numbers. The submission form is clear and authoritative, encouraging local businesses to provide comprehensive, accurate details.

## Grammar and layout

- One page frame, `--content-frame: 1200px`, centred, with `--page-padding: 1.5rem` at the sides.
- The landing page (`step1-landing`) introduces the directory with featured categories and a primary search bar.
- The directory index (`step2-directory`) presents listings in a robust grid or list, complete with filtering sidebar and summary cards.
- The detail view (`step3-profile`) is a comprehensive profile page: business hero image, operating hours, verified badges, full description, and customer reviews.
- The submission intake (`step4-submit`) is a clean, single-column form prioritizing legible labels and accessibility.
- The empty state (`step5-empty`) is a helpful, informative panel explaining the lack of matching trades and offering a clear path to adjust filters.

## Typography

- A system UI sans-serif stack for clarity and modern readability.
- Exactly one `h1` per page.
- Section headings maintain a strict document outline to organize categories, business details, and form sections.
- Form inputs feature clear programmatic labels placed directly above or beside the fields.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#f8fafc` | The clean page ground on all states |
| `--bg-surface` | `#ffffff` | Elevated card surfaces and form backgrounds |
| `--border` | `#e2e8f0` | Structural borders and list dividers |
| `--accent` | `#0284c7` | Civic blue primary actions, selection states, and submit buttons |
| `--text-primary` | `#0f172a` | Primary slate text for readability |
| `--text-muted` | `#64748b` | Muted metadata (operating hours, postcodes, category tags) |

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 8px`, `--control-border: 1px solid var(--border)`.
- Generous padding inside listing cards to clearly distinguish distinct businesses.
- Form fields are separated by ample vertical rhythm, ensuring error messages fit seamlessly between inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark, main navigation, and global search.
2. **Filter Sidebar** - Trade categories, location radius, and sorting controls.
3. **Listing Grid** - Business summary cards with category tags, phone numbers, and verified credentials.
4. **Profile View** - Comprehensive business details, operating hours table, and customer reviews.
5. **Submission Form** - Business name, category, phone, postcode, and description inputs.
6. **State Panels** - Empty search states and no-matches responses.

## Anti-patterns

- Rendering a listing as unstructured dense text rather than distinct data points (postcode, phone, hours).
- Overwhelming the submission form with aggressive real-time validation before the user has finished typing.
- Using decorative illegible fonts for trade names, sacrificing readability.

## Rationale

The neighborhood civic directory use case demands trust, clarity, and accessibility. Residents are looking for dependable local trades, meaning verified credentials and clear contact details are critical. The design system therefore elevates listings from simple lists to robust, highly accessible profile cards. The civic blue and slate palette provides a professional, dependable aesthetic that reinforces the local community identity without sacrificing WCAG contrast requirements.

## Provenance

- Evaluated against the A1 training families (`tr-06`, `tr-14`) and the A6 evaluation spec (`fam-06` / `directory-listing`).