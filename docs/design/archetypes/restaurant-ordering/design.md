---
archetype: restaurant-ordering
type: storefront
boards: docs/design/archetypes/restaurant-ordering/
---

# `restaurant-ordering` — aesthetic system

The look of the `restaurant-ordering` type, expanding from the `tr-11`, `tr-27` and `fam-11` reference boards into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A digital menu and checkout platform for hospitality. The visual language conveys warmth, appetite appeal, and operational efficiency: large photographic imagery for menu items, clear dietary labeling, and highly accessible checkout forms. The palette is grounded in a warm, artisanal aesthetic suitable for a wood-fired pizzeria or sourdough bakery.

The layout emphasizes rapid visual scanning and frictionless purchasing. The menu prioritizes enticing item cards over dense text. The checkout and cart forms act as rigorous intake steps to ensure no orders are lost or misrouted to the wrong table. The kitchen dashboard strips away marketing elements in favor of high-contrast tabular efficiency.

## Grammar and layout

- One page frame, `--content-frame: 1200px`, centred, with `--page-padding: 1.5rem` at the sides.
- The menu view (`step1-menu`) presents categorized items (pizzas, sides) in an appealing grid with clear 'Add to Order' affordances.
- The cart view (`step2-cart`) is an interactive tray allowing quantity adjustments and displaying the running subtotal.
- The checkout intake (`step3-checkout`) is a clean, single-column form requesting table/collection details and payment configuration.
- The persistent receipt (`step4-receipt`) serves as a durable digital ticket confirming the order items and current preparation status.
- The kitchen dashboard (`step5-kitchen`) is a dense, high-contrast list view prioritizing active orders and time-since-placed metrics.

## Typography

- A highly legible system sans-serif stack for structure, paired with an expressive serif or rounded display font for brand headings to convey artisanal warmth.
- Exactly one `h1` per page.
- Clear typographic hierarchy distinguishes menu item titles from ingredient lists.
- Form inputs feature clear programmatic labels placed directly above the fields.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#fffbf7` | The warm off-white page ground |
| `--bg-surface` | `#ffffff` | Clean card surfaces and form backgrounds |
| `--border` | `#e5e7eb` | Soft structural borders |
| `--accent` | `#dc2626` | Tomato red primary actions, 'Add to Cart' buttons, and active states |
| `--text-primary` | `#1c1917` | High-contrast dark stone text for primary readability |
| `--text-muted` | `#78716c` | Muted metadata (ingredients, item descriptions) |

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 8px`, `--control-border: 1px solid var(--border)`.
- Generous padding inside menu cards to showcase imagery and prevent accidental mis-taps on mobile devices.
- Form fields are separated by ample vertical rhythm, ensuring error messages fit seamlessly between inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark, main navigation, and persistent cart toggle.
2. **Menu Grid** - Photographic item cards with titles, prices, and dietary tags.
3. **Cart Sidebar/Drawer** - Active order breakdown and subtotal calculation.
4. **Checkout Form** - Fulfillment options (Table or Collection) and contact details.
5. **Receipt View** - Order reference number, item breakdown, and live status.
6. **Kitchen Dashboard** - High-density tabular view of pending tickets.

## Anti-patterns

- Using low-contrast or illegible decorative fonts for critical pricing or dietary allergen information.
- Trapping keyboard users inside the cart drawer or failing to return focus when closed.
- Swallowing validation errors when attempting to checkout an empty cart, stranding the user.

## Rationale

The restaurant ordering use case bridges consumer hospitality and back-of-house operations. Diners require an enticing, frictionless browsing experience, meaning large touch targets and clear dietary labels are critical. Kitchen staff require immediate clarity, meaning the administrative dashboard must be dense and unambiguous. The design system therefore elevates standard e-commerce flows to handle both environments. The warm off-white and tomato red palette provides an artisanal, appetizing aesthetic that reinforces the brand identity while maintaining strict WCAG contrast requirements for accessibility.

## Provenance

- Evaluated against the A1 training families (`tr-11`, `tr-27`) and the A6 evaluation spec (`fam-11` / `restaurant-ordering`).