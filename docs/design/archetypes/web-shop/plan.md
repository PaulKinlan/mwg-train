---
archetype: web-shop
type: storefront
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/web-shop/
register: docs/provenance/assets/training-reference-boards.md
---

# `web-shop` — functional contract

An e-commerce retail platform: an inventory list, product selection, an interactive session cart (or direct order), a checkout flow handling simulated transactions, and a durable order receipt. This document is the contract for the `web-shop` archetype - what a shopper can do, what the server does about it, and what a journey can assert.

It covers the four implementing families in this corpus: the three training-side families (`tr-02`, `tr-18`, `tr-26`), and the single evaluation-side family (`fam-02`).

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

A storefront takes orders from visitors and persists the transaction.

A **shopper** browses the catalogue, selects products or variants (quantities, sizes, grinds), adds them to their order, and submits a checkout or subscription form. The server stores the submitted order so that reloading the order confirmation URL directly confirms the purchased items.

| Family | Split | Topic | Core constraint |
|---|---|---|---|
| `tr-02` | train | seasonal cider pre-orders and local pickup | pre-ordering products for a collection slot |
| `tr-18` | train | bring-your-own-container bulk dry goods orders | bulk ordering by gram weights |
| `tr-26` | train | single-origin coffee subscription renewal and grind preference | managing an active subscription configuration |
| `fam-02` | dev | artisan pottery and ceramics studio shop | traditional multi-item cart and shipping |

Three absences are part of the contract rather than gaps in it. The specs declare no user accounts (`session: false`, `password_field: null`), no complex inventory management for admins, and no real payment gateways. A rebuild that invents an account or transmits real credit card numbers has gone beyond the type, not improved on it.

## Routes and effects

The families implement variations of the multi-step storefront journey:

| Family | Read routes | Write route |
|---|---|---|
| `tr-02` | `/`, `/ciders`, `/cart`, `/checkout`, `/orders/:id` | `POST /checkout` → `GET /orders/:id` |
| `tr-18` | `/`, `/products`, `/basket`, `/checkout`, `/orders/:id` | `POST /checkout` → `GET /orders/:id` |
| `tr-26` | `/`, `/subscriptions`, `/subscriptions/:id`, `/subscriptions/:id/edit` | `POST /subscriptions/:id/edit` → `GET /subscriptions/:id` |
| `fam-02` | `/`, `/products`, `/products/:id`, `/cart`, `/checkout`, `/order/:id` | `POST /checkout` → `GET /order/:id` |

`tr-26` diverges from the traditional cart flow by using an edit pattern (`/subscriptions/:id/edit`) to manage an existing subscription configuration. The others follow a direct `POST /checkout` pattern to generate a new order receipt.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `orders` (or `subscriptions`), with `id` (TEXT, primary key) and payload data representing the customer details, products, and simulated totals.
- **Session:** `fam-02` explicitly mentions maintaining active cart state across page navigation.
- **Write route:** `POST /checkout` (or `/subscriptions/:id/edit`) stores the transaction.
- **Read route:** `GET /orders/:id` reads the transaction by reference.
- **The reference:** server-issued reference, returned in the Location header of a `303`.

## Journey

The declared journeys. For evaluation families (`fam-02`), these are quoted verbatim from the manifests. For the training families, these are derived summaries of the structured `journey` objects defined in the manifest:

### `tr-02`
- browse available cider varieties and select a quantity for local pickup
- proceed to checkout, enter customer details, and choose a preferred collection time slot
- submit the pre-order, view the order summary reference, and reload to ensure it persists

### `tr-18`
- review the catalogue of bulk dry goods and select a staple item
- add a specific gram weight to the basket and proceed to checkout with customer details
- complete the order, view the confirmation receipt, and reload to verify persistence

### `tr-26`
- review the available single-origin coffee beans and subscription options
- edit an active subscription to update the chosen bean, grind type, and delivery frequency
- submit the updated preferences, view the confirmation page, and reload to verify the changes

### `fam-02`
- browse handcrafted ceramic pieces, view details for a stoneware mug, add two units to the shopping cart, and view the updated cart total
- proceed to checkout, input shipping address and simulated payment information, submit the order, and receive an order confirmation with an order reference
- reload the order confirmation URL directly and confirm that the purchased items, quantities, shipping address, and total amount remain visible
- update item quantities in the cart or remove an item and verify the cart subtotal recalculates instantly

## Validation and states

- **Required fields:** Customer identity (`customer`, `email`), product selections (`variety`, `staple`), and quantities are strictly required.
- **On a missing field or invalid value:** the server refuses the submission, returning HTTP `400` (or rendering inline errors); nothing is stored. `tr-18` explicitly requires preventing zero or negative weight values. `tr-02` explicitly prevents an empty cart checkout.
- **On success:** insert or update one row and answer `303` with Location header.
- **Empty state:** `tr-02` and `fam-02` explicitly handle empty cart states, preventing checkout and providing a path back to the catalogue.

## Acceptance criteria

The families define specific observable assertions:

`tr-02`:
1. POST `/checkout` creates an order record and redirects to `/orders/:id`
2. GET `/orders/:id` displays the order summary, total quantity, and collection slot after reload
3. empty cart checkout is prevented with an accessible alert message

`tr-18`:
1. POST `/checkout` creates a bulk goods order and redirects to `/orders/:id`
2. GET `/orders/:id` displays the itemized gram weights and total price after a page reload
3. entering zero or negative weight values is prevented with clear accessible feedback

`tr-26`:
1. POST `/subscriptions/:id/edit` updates the subscriber preferences on the server
2. GET `/subscriptions/:id` displays the updated grind and frequency settings after a page reload
3. form validation announces missing required choices to screen readers

`fam-02`:
1. POST `/checkout` with cart items and shipping details creates a persistent order and redirects to `/order/:id`
2. GET `/order/:id` returns HTTP `200` with the purchased pottery items, shipping address, and order total following a browser refresh
3. shipping address form inputs contain autocomplete attributes corresponding to `street-address`, `postal-code`, and `country`
4. adjusting quantity controls on `/cart` updates the line total and aggregate checkout sum in the DOM

## Implementation status

**Not implemented in the sealed pilot.** Nothing drives these multi-step routes today in the pilot corpus, and the pending visual boards are the only artefact of this expanded type that exists. Being precise about what does exist:
- Only the training families (`tr-02`, `tr-18`, `tr-26`) have single-step targets in `docs/train/targets/` that evaluate basic cart checkout forms. The evaluation family (`fam-02`) is declared as a brief in `docs/eval/briefs/manifest.jsonl` but has no single-step target in the sealed evaluation target set, and none drive the full multi-step `web-shop` inventory catalogue, product detail, interactive cart drawer, and persistent receipt lifecycle end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The training reference boards** are 3 distinct generation outcomes registered in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md). They declare the visual baselines for `tr-02`, `tr-18`, and `tr-26`.
- **The behaviour** is declared by the respective JSONL manifest rows for the training and evaluation families. The `fam-02` route spelling (`/products`, `/cart`, `/checkout`, `/order/:id`) governs the canonical multi-step contract; `tr-02`, `tr-18`, and `tr-26` contribute the heritage cider, bulk dry goods, and coffee subscription domains.
