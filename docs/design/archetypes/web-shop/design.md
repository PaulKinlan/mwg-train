---
archetype: web-shop
type: storefront
boards: docs/design/archetypes/web-shop/
---

# `web-shop` — aesthetic system

The look of the `web-shop` type, expanding from the `tr-02`, `tr-18`, `tr-26` and `fam-02` reference boards into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A premium direct-to-consumer e-commerce storefront. The visual language conveys craftsmanship, tangibility, and modern retail efficiency: large bleed photography, generous whitespace, and highly structured checkout forms. The palette is grounded in a muted, artisanal aesthetic—ideal for ceramics, heritage cider, or bulk dry goods—allowing the product imagery to dominate the visual hierarchy.

The layout emphasizes exploration followed by frictionless conversion. The catalogue and product detail views prioritize high-resolution imagery and clear typography for dimensions or ingredients. The cart and checkout views pivot to rigorous, accessible data entry, isolating the user from marketing distractions to prevent order abandonment.

## Grammar and layout

- One page frame, `--content-frame: 1200px`, centred, with `--page-padding: 2rem` at the sides, collapsing gracefully to edge-to-edge on mobile.
- The catalogue index (`step1-catalogue`) presents a masonry or uniform grid of product cards with clean pricing metadata.
- The product detail (`step2-product`) splits the viewport between expansive product imagery and a sticky purchasing sidebar with variant selectors.
- The interactive cart (`step3-cart`) is an accessible tray or dedicated view allowing immediate quantity adjustments and clear subtotal visibility.
- The checkout flow (`step4-checkout`) is a secure, single-column intake form prioritizing legible labels, browser autocomplete hints, and simulated payment fields.
- The persistent receipt (`step5-receipt`) acts as a durable, shareable order ticket detailing the shipping address, total charge, and purchased items.

## Typography

- A sophisticated serif for brand headings and product titles to convey heritage and craftsmanship, paired with a highly legible sans-serif for UI elements, forms, and pricing.
- Exactly one `h1` per page.
- Clear typographic hierarchy distinguishes product titles from descriptive copy and pricing numbers.
- Checkout form inputs feature clear programmatic labels placed directly above the fields to prevent visual tracking errors.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#fafaf9` | The warm stone page ground |
| `--bg-surface` | `#ffffff` | Elevated cart surfaces and checkout forms |
| `--border` | `#e7e5e4` | Soft structural dividers and form borders |
| `--accent` | `#292524` | Charcoal primary actions, 'Add to Cart' buttons, and focus states |
| `--text-primary` | `#1c1917` | High-contrast dark stone text for primary readability |
| `--text-muted` | `#78716c` | Muted metadata (dimensions, secondary product text) |

## Spacing rhythm

- `--page-padding: 2rem`, `--control-radius: 4px`, `--control-border: 1px solid var(--border)`.
- Generous padding around product imagery to create a premium, uncrowded browsing experience.
- Form fields in the checkout view are separated by ample vertical rhythm, ensuring validation error messages fit seamlessly beneath inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark, main navigation, and persistent cart toggle with item count badge.
2. **Product Grid** - Image-first cards with title, price, and subtle hover interactions.
3. **Purchasing Panel** - Sticky product details with variant dropdowns and primary 'Add to Cart' action.
4. **Cart Drawer/View** - Line items with increment/decrement controls and aggregate totals.
5. **Checkout Form** - Shipping address inputs, payment mockups, and order summary.
6. **Receipt Confirmation** - Order reference number, shipping breakdown, and purchased item list.

## Anti-patterns

- Missing `autocomplete` attributes on shipping address or payment fields, forcing users to type everything manually.
- Using low-contrast gray text for critical pricing or shipping costs that fail WCAG requirements.
- Trapping keyboard users inside a cart drawer modal or failing to return focus to the trigger button when closed.

## Rationale

The independent retail e-commerce use case demands both aesthetic appeal and absolute transactional clarity. Shoppers require high-quality imagery to evaluate artisanal products like ceramics or cider, meaning the catalogue layout must prioritize visual space. Conversely, the checkout flow handles sensitive financial and logistical data, demanding accessible, unambiguous form design. The warm stone and charcoal palette provides a premium, dependable aesthetic that showcases the products without competing with them, while ensuring strict contrast compliance for pricing and error states.

## Provenance

- Evaluated against the A1 training families (`tr-02`, `tr-18`, `tr-26`) and the A6 evaluation spec (`fam-02` / `web-shop`).