---
archetype: restaurant-ordering
type: storefront
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/restaurant-ordering/
register: docs/provenance/assets/training-reference-boards.md
---

# `restaurant-ordering` — functional contract

An online ordering platform for hospitality: a digital menu with configurable items, an interactive order cart, a checkout flow requesting fulfillment details (table number or collection time), a persistent receipt view, and optionally a live kitchen dashboard. This document is the contract for the `restaurant-ordering` archetype - what a guest or kitchen worker can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow - see *Implementation status*. Nothing here should be read as describing running software.

Two families implement this archetype, and both are described together because the archetype is the contract they share rather than either one alone:

- **`tr-11`, Crust & Crumb Micro-Bakery** — sourdough cottage bakery weekly loaf orders.
- **`fam-11`, Wood-fired Pizzeria** — table and takeaway ordering, with an active kitchen dashboard (eval split: dev).

## Use case

A hospitality operation providing food or baked goods directly to customers.

A **guest** browses the menu categories (pizzas, baked loaves), customises an item with specific styles or quantities, and adds it to their cart or order form. During checkout, the guest specifies either their dining table number or a scheduled collection pickup time, alongside contact details. The server securely stores the order and directs the guest to a persistent receipt view. A **kitchen staff member** (`fam-11`) monitors the active order queue on a dedicated dashboard to track preparation status.

## Routes and effects

The families declare their own routes. The archetype's common shape is a menu view, a write producing one order, and a read-by-reference receipt.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | both | page | serves the landing page |
| `GET /menu` | both | page | serves the configurable restaurant menu or weekly bake list |
| `GET /order` | `tr-11` | page | serves the combined order form |
| `POST /order` | `tr-11` | write | inserts the bread order and redirects to its receipt |
| `GET /orders/:id` | `tr-11` | read-by-reference | reads the bread order receipt |
| `GET /cart` | `fam-11` | page | serves the interactive order basket allowing quantity adjustments |
| `GET /checkout` | `fam-11` | page | serves the intake form for fulfillment details and contact info |
| `POST /checkout` | `fam-11` | write | inserts the pizza order and answers `303` with the reference |
| `GET /order/:id` | `fam-11` | read-by-reference | reads the persistent order receipt tracking preparation status |
| `GET /kitchen` | `fam-11` | page | administrative view showing live pending orders for kitchen fulfillment |

**On the methods in that table.** The manifest declares routes as paths rather than methods. The methods shown are therefore only as firm as their source: `POST /order` and `POST /checkout` are named by the families' assertions, as are the `GET` read-backs. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: orders, item breakdowns, fulfillment details (table numbers or collection slots), and status tracking.
- **Write route:** `POST /order` and `POST /checkout` store the transaction.
- **Read by reference:** the families read the submitted order's state back by its identifier to verify persistence.
- **The reference:** server-issued reference, returned in the Location header of a `303`.

## Journey

The declared journeys. For the evaluation family (`fam-11`), these are quoted verbatim from the manifests. For the training family (`tr-11`), these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-11` (sourdough bakery):**
- Starts at `/`, submits `form#bread-order-form` with `input[name=customer]` `Nadia Rossi`, `input[name=phone]` `+44 7700 900888`, `input[name=quantity]` `2`, `textarea[name=notes]` `Please slice if possible`, selecting `select[name=style]` `Seeded Rye Sourdough`, `select[name=window]` `Friday 14:00 - 16:00`.
- Expects `Nadia Rossi` echoed back and again after a reload.
- Searches via `/search?q=Nadia` to verify the search endpoint finds the stored record.
- Updates the `customer` to `Nadia Rossi (updated)`.
- Its intake steps submit `/intake` having selected `select[name=style]` `Seeded Rye Sourdough`, and `/intake/confirm` expects `Seeded Rye Sourdough` back.

**`fam-11` (wood-fired pizzeria):**
- browse pizza menu categories, customise a pizza with toppings, add items to cart, proceed to checkout with table number or collection time, submit order, and view live order receipt
- reload `/order/:id` in a separate tab or after browser restart, verifying that the order items, special requests, and order status are loaded from server storage
- attempt to check out with an empty cart or invalid contact details, receive clear inline validation errors, supply required values, and successfully complete the order

## Validation and states

- **Required fields:** Customer identity, contact details, style/menu items, and fulfillment timing.
- **Quantity integrity:** `tr-11` strictly asserts that submitting an order with zero total loaves displays an error message and stops submission. `fam-11` similarly asserts that checking out with an empty cart returns an error.
- **On a missing field or empty order:** the server refuses the submission, returning HTTP `400` (or rendering inline errors); nothing is stored.
- **On success:** insert one row into the orders and answer `303` with a Location header.

## Acceptance criteria

The families define specific observable assertions:

`tr-11`:
1. `POST /order` saves the customer's bread order and redirects to `/orders/:id`
2. `GET /orders/:id` renders the ordered items, total quantity, and collection window on reload
3. submitting an order with zero total loaves displays an error message and stops submission

`fam-11`:
4. `POST /checkout` with cart items and customer details creates an order and redirects to `/order/:id` with HTTP 303
5. `GET /order/:id` after full page reload returns HTTP 200 with the exact ordered pizzas, quantities, and order reference
6. submitting `/checkout` with an empty cart or missing fulfillment details returns HTTP 400 with descriptive error messages
7. `GET /kitchen` returns HTTP 200 listing all pending orders with their current preparation status

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **One landing reference exists:** `tr-11/reference.jpg`. It depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- The single-step `tr-11` and `fam-11` targets are simple pages containing an order intake form, but do not evaluate the full multi-step `restaurant-ordering` menu, session cart, checkout, and live kitchen dashboard functionality end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-11`) and `docs/eval/briefs/manifest.jsonl` (`fam-11`). Route names, field slugs, control types, selectors, fill values, and all acceptance criteria are quoted from those rows rather than invented.
- **The reference** is the training family's generated board, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `storefront` is listed.
