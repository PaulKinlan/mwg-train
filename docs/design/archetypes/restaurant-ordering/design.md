---
archetype: restaurant-ordering
type: record-form
boards: docs/design/archetypes/restaurant-ordering/
register: docs/provenance/assets/training-reference-boards.md
---

# `restaurant-ordering` — aesthetic system

The look of the `record-form` type as the `restaurant-ordering` archetype implements it, expanded from the training family's landing reference into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Where this system comes from:** The archetype's visual baseline is declared by the single training family:

- **`tr-11`, Crust & Crumb Micro-Bakery** — [`prompt.txt`](../../training/tr-11/prompt.txt), [`reference.jpg`](../../training/tr-11/reference.jpg).

The evaluation-side family (`fam-11`, Wood-fired Pizzeria) has **no reference board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for it.

## Visual thesis

A restaurant ordering page is an appetite trigger followed by an exact logistical contract. The thesis follows from that: **warm, appetizing grounds and accents, strong food photography, and unambiguous fulfillment controls**, with a full error scale held in reserve for validation.

The `tr-11` board establishes this directly: a warm, light palette utilizing rich bread and crust tones. The accent marks the forward action to secure the weekly loaf order.

## Grammar and layout

The reference establishes the grammar:
- **The menu catalog** is a grid or list layout displaying the menu items. Each card groups an image, description, price, and a primary action to add or customize.
- **The cart and checkout** form a focused flow. The summary is deliberately pinned to a minimum width: it is the thing that tells the customer *what they are ordering*.
- **The receipt** presents the order confirmation clearly, often resembling a printed kitchen docket.
- **The kitchen view** (`fam-11`) is an operational kanban or queue layout, prioritizing ticket statuses.
- **The empty state** is a centred card explaining that the cart is empty, directing the user back to the menu.

The `tr-11` reference is a **browser viewport**: chrome runs along the top edge with an address bar (`https://crustcrumb.collective/`), depicting the page as a framed composition.

## Typography

A system UI sans-serif stack for everything a person reads. 

The display heading is the largest type on the page. Form controls carry **permanent visible labels**, guaranteeing clarity when users select their critical pickup windows.

## Token usage

The `tr-11` palette is explicitly built as a warm, artisanal light theme reflecting a sourdough bakery. All values are declared in the prompt; observed uses reflect their deployment.

**`tr-11`, Crust & Crumb Micro-Bakery — a warm light palette.**
- **Ground (`cb-bg`):** `#fffbeb` (warm cream)
- **Surface (`cb-card`):** `#ffffff`
- **Border (`cb-border`):** `#fde68a`
- **Text (`cb-bread`):** `#451a03` (deep bread ink)
- **Accent (`cb-crust`):** `#78350f` (the single primary action, rich crust tone)
- **Secondary (`cb-warm`):** `#fef3c7`

A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them into generic storefront templates.

## Spacing rhythm

- The declared constants: a centred frame (`1200px`), page padding (`1.5rem`), an eight-pixel control radius (`8px`), and a one-pixel border drawn in the border token.
- **Menu cards** maintain generous internal padding to emphasize the photography and isolate the customization controls.
- **The intake form** separates its rows generously so that validation feedback can appear inline.

## Component hierarchy

1. **Brand header** — the mark, the bakery's name, the section navigation.
2. **Hero image** — an editorial-quality photograph of the food.
3. **Menu list / Grid** — the available items with pricing and add-to-order controls.
4. **Intake form** — the labelled fields for entering contact and collection details.
5. **Receipt view** — the dedicated view for the finalized order.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A menu option that cannot be reached by keyboard.**
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- **Colour alone carrying an error state with no message naming the field.** 
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

Food ordering is inherently time-sensitive and physically rooted. The user must easily trace exactly what they are ordering, when they will receive it, and where. This requires unambiguous forms and highly visible error states preventing zero-item or un-schedulable submissions.

## Provenance

- **The declarations:** `docs/design/training/tr-11/prompt.txt`, which names the palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-11/reference.jpg`. The file and prompt are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (family `tr-11`), and `docs/eval/briefs/manifest.jsonl` (`fam-11`).
