---
archetype: web-shop
type: storefront
boards: docs/design/archetypes/web-shop/
register: docs/provenance/assets/training-reference-boards.md
---

# `web-shop` — aesthetic system

The look of the `web-shop` archetype. This document covers the aesthetic choices across the implementing families: the three training families (`tr-02`, `tr-18`, `tr-26`) and the evaluation family (`fam-02`). It describes the multi-step storefront journey in the section order the evaluation side requires of a design (`DESIGN_SECTIONS`).

## Visual thesis

A storefront is a display grid leading to a transaction. The thesis follows from that: **a calm ground, strong product photography or typography, and a single accent that marks the forward path to purchase**, with a full error scale held in reserve for validation.

**The family designs must not be averaged.** The three training families employ distinctly different aesthetic systems within light palettes. For instance, `tr-02` (cider pre-orders) and `tr-18` (bulk dry goods) use distinct light palettes reflecting artisanal and organic domains ("in a light palette"), while `tr-26` (coffee subscription) opts for a light palette enriched with deep roast and gold tones suited for coffee beans. Each board uses its own primary action token.

## Grammar and layout

- **The catalogue** is a grid layout (typically `minmax` columns) that displays product cards. Each card groups an image (or title), price, and a primary action.
- **The product detail** expands the hierarchy to a split view or single dominant column, prioritizing large imagery alongside configuration selects (quantity, variant, grind).
- **The cart and checkout** collapse into a two-column grid at desktop widths - a summary column beside the form - which collapses to a single column below its breakpoint. The summary is deliberately pinned to a minimum width: it is the thing that tells the shopper *what they are buying*.
- **The receipt** is a narrower column. The receipt presents the order confirmation cleanly, often resembling a digital ticket or printed invoice.
- **The empty state** is a centred card holding one icon, one heading, one sentence that says the cart is empty, and one way out (back to the catalogue).

## Typography

Two families: `--font-sans` (the `system-ui` stack) for everything a person reads, and `--font-mono` for receipts and product SKUs. 

The display heading is the largest type on the page. Card headings are left-aligned inside their own cards; the confirmation receipt centres its title and its reference. 

Each training family adopts typography suited to its domain: rustic or elegant sans-serifs for cider and pottery, and starker geometric types for coffee subscriptions.

## Token usage

The colour system defines the brand and guides the transaction. 
The primary accent (`--accent`) is used for primary actions (Add to Cart, Checkout, Save Subscription) and active states. The error scale (`--error`, `--error-bg`, `--error-border`, `--error-text`) ensures checkout validation is clearly visible.

**The training families define their own distinct palettes:**
- `tr-02` (cider pre-orders): light, crisp palette reflecting apples and heritage brewing.
- `tr-18` (bulk dry goods): earthy, organic tones reflecting natural zero-waste products.
- `tr-26` (coffee subscription): light palette with deep roast and gold tones.

Each family relies on these color signatures to establish its own identity.

## Spacing rhythm

The scale is rem-based. The gap between sibling elements in product grids is generous to separate distinct items. The checkout form relies on tighter rhythm (`0.5rem` to `1rem`) for logical groupings. Card padding runs `1.25rem` to `2rem`.

The rhythm's job is to make the product grid and the single-column checkout feel like the same application at different widths. 

## Component hierarchy

Read from the expected archetype structure:
- `header.top-bar` with `nav.top-nav` - the persistent chrome containing the cart badge.
- A **product grid** (`ul.product-list` or similar) displaying item cards.
- The **cart drawer or page**, a labelled region carrying line items and a subtotal.
- `section.card.checkout-card` containing the shipping/payment fields, and - for the error state - `#form-error-banner` with `role="alert"`.
- The receipt page carries the success mark, reference, and itemised list.

Each training family implements its equivalent semantic structure matching its `plan.md` form definition. `tr-26` explicitly focuses on a `.subscription-card` rather than a cart.

## Anti-patterns

- **Two primary actions competing.** The accent marks the forward action of a state. Product cards should not compete with the primary checkout button.
- **A different logo on every screen.** The mark should be consistent across the entire user journey.
- **Inventing what the spec withholds.** A user session, a password field, an account dashboard (unless specified, like `tr-26` subscriptions), a cancellation route, or an expiry on the receipt - none of these are declared.
- **Transmitting real payment details.** The simulation uses mock/simulated fields; real financial tokens must never be used.

## Rationale

The type is `storefront` - a catalogue, an aggregation state (cart), a write that stores one order row, and a read-back by reference. Dark or light grounds and bordered cards let a grid, a form and a receipt be the same kind of object at different widths; one accent keeps *what do I do next* unambiguous. 

## Provenance

- **The training reference boards** are 3 distinct generation outcomes registered in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md). They declare and establish the visual baselines for `tr-02`, `tr-18`, and `tr-26`.
- **The measurements** in this document reflect the generated baselines for these families against their recorded prompts.
