---
archetype: web-shop
type: storefront
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/web-shop/
---

# `web-shop` — functional contract

An e-commerce retail platform: a product catalogue with detailed variant views, an interactive session cart, a checkout flow handling shipping and simulated payments, and a durable order receipt. This document is the contract for the `web-shop` archetype - what a shopper can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

An artisan pottery and ceramics studio shop.

A **shopper** browses handcrafted ceramic pieces, views high-resolution product details and dimensions for a specific item, adds units to their shopping cart, and views the updated cart total. At checkout, the shopper inputs their shipping address and simulated payment information, relying on browser autofill hints to prevent repetitive typing. The server stores the submitted order so that reloading the order confirmation URL directly confirms the purchased items, quantities, shipping address, and total amount remain visible.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing page |
| `GET /products` | list | serves the full inventory catalogue |
| `GET /products/:id` | read-by-reference | serves detailed product information, dimensions, and variant selection |
| `GET /cart` | page | serves the interactive shopping basket with quantity adjustment |
| `GET /checkout` | page | serves the shipping and payment intake form |
| `POST /checkout` | write | inserts the order record and answers `303` with a redirect to `/order/:id` |
| `GET /order/:id` | read-by-reference | reads the persistent order confirmation receipt by reference |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `orders`, with `id` (TEXT, primary key), `items` (TEXT, not null), `shipping_address` (TEXT, not null), and `total_amount` (REAL, not null).
- **Session:** the active cart state is maintained across page navigation.
- **Write route:** `POST /checkout` stores the order.
- **Read route:** `GET /order/:id` reads the order by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, derived from the `fam-02` spec:

- it starts at `/products` (catalogue);
- it navigates to `/products/:id` to inspect a stoneware mug;
- it adds two units to the cart and navigates to `/cart` to verify the subtotal recalculates instantly;
- it proceeds to `/checkout` and submits the order with fills - `input[name=name]` `Ellis Vance`, `input[name=street-address]` `14 High Street`, and simulated payment fields;
- and it expects to find `Ellis Vance` and the itemised quantities on what the submit returns at `/order/:id`.

## Validation and states

- **Required fields:** `name`, `street-address`, payment credentials, and a non-empty cart.
- **On a missing field or empty cart:** the server refuses the submission, returning HTTP 400, and re-renders the form with accessible inline error messages; nothing is stored.
- **On success:** insert one row into orders and answer 303 with Location: `/order/<id>`.
- **Empty state:** the cart view explicitly informs the user when no items are selected and provides a path back to the catalogue.

## Acceptance criteria

1. `POST /checkout` with cart items and shipping details creates a persistent order and redirects to `/order/:id`
2. `GET /order/:id` returns HTTP 200 with the purchased pottery items, shipping address, and order total following a browser refresh
3. shipping address form inputs contain autocomplete attributes corresponding to `street-address`, `postal-code`, and `country`
4. adjusting quantity controls on `/cart` updates the line total and aggregate checkout sum in the DOM

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist:
- The single-step `tr-02`, `tr-18`, `tr-26`, and `fam-02` targets generally evaluate basic cart checkout forms, but do not evaluate the full multi-step `web-shop` inventory catalogue, product detail, interactive cart drawer, and persistent receipt lifecycle.
- The reference boards for the full multi-step journey are planned (`step1-catalogue`, `step2-product`, `step3-cart`, `step4-checkout`, `step5-receipt`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-web-shop.md`.
- **The behaviour** is derived from the A1 training families (`tr-02`, `tr-18`, `tr-26`) and the A6 evaluation spec (`fam-02`, `web-shop`). The `fam-02` route spelling (`/products`, `/cart`, `/checkout`, `/order/:id`) governs the multi-step contract; `tr-02`, `tr-18`, and `tr-26` contribute the heritage cider, bulk dry goods, and coffee subscription domains.