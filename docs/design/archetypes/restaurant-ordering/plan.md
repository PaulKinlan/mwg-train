---
archetype: restaurant-ordering
type: storefront
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/restaurant-ordering/
---

# `restaurant-ordering` — functional contract

An online ordering platform for hospitality: a digital menu with configurable items, an interactive order cart, a checkout flow requesting fulfillment details (table number or collection time), a persistent receipt view, and a live kitchen dashboard. This document is the contract for the `restaurant-ordering` archetype - what a guest or kitchen worker can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

A wood-fired pizzeria offering both dine-in table service and curbside takeaway.

A **guest** browses the menu categories (pizzas, sides, beverages), customises an item with specific toppings or dietary preferences, and adds it to their cart. During checkout, the guest specifies either their dining table number or collection pickup time, alongside contact details. The server securely stores the order and directs the guest to a persistent receipt view tracking preparation status. A **kitchen staff member** monitors the active order queue on a dedicated dashboard. 

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing page |
| `GET /menu` | list | serves the configurable restaurant menu |
| `GET /cart` | page | serves the interactive order basket allowing quantity adjustments |
| `GET /checkout` | page | serves the intake form for fulfillment details and contact info |
| `POST /checkout` | write | inserts the order and answers `303` with the reference in the `Location` header |
| `GET /order/:id` | read-by-reference | reads the persistent order receipt tracking preparation status |
| `GET /kitchen` | list | administrative view showing live pending orders for kitchen fulfillment |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `orders`, with `id` (TEXT, primary key), `customer_name` (TEXT, not null), `phone` (TEXT, not null), `items` (TEXT, not null), `fulfillment` (TEXT, not null), and `status` (TEXT).
- **Write route:** `POST /checkout` stores the order.
- **Read route:** `GET /order/:id` reads the order by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, derived from the `fam-11` spec:

- it starts at `/menu` (menu);
- it customises a pizza with toppings and adds the item to the cart;
- it proceeds to `/checkout` and submits the order with fills - `input[name=customer]` `Nadia Rossi`, `input[name=phone]` `+44 7700 900888`, and `input[name=fulfillment]` `Table 14`;
- and it expects to find `Nadia Rossi` on what the submit returns at `/order/:id`.
- The kitchen staff navigates to `/kitchen` and sees the newly placed order in the queue.

## Validation and states

- **Required fields:** `customer`, `phone`, `fulfillment`.
- **On an empty cart or missing field:** the server refuses the submission, returning HTTP 400, and re-renders the checkout form with descriptive inline error messages; nothing is stored.
- **On success:** insert one row into orders and answer 303 with Location: `/order/<id>`.
- **Empty state:** attempting to checkout with zero items in the cart returns a clear, accessible validation error preventing submission.

## Acceptance criteria

1. after a successful submit the browser lands on `/order/<id>` and the exact ordered pizzas, quantities, and order reference are present
2. reloading the `/order/:id` URL still shows the items and status, proving server-side persistence
3. submitting `/checkout` with an empty cart or missing fulfillment details returns HTTP 400 with descriptive inline error messages
4. `GET /kitchen` returns HTTP 200 listing all pending orders with their current preparation status
5. all item selections and checkout forms have explicit programmatic labels with matching for/id attributes

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist:
- The single-step `tr-11`, `tr-27`, and `fam-11` targets are simple pages containing a form, but do not evaluate the full multi-step `restaurant-ordering` menu, session cart, checkout, and live kitchen dashboard functionality.
- The reference boards for the full multi-step journey are planned (`step1-menu`, `step2-cart`, `step3-checkout`, `step4-receipt`, `step5-kitchen`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-restaurant-ordering.md`.
- **The behaviour** is derived from the A1 training families (`tr-11`, `tr-27`) and the A6 evaluation spec (`fam-11`, `restaurant-ordering`). The `fam-11` route spelling (`/menu`, `/cart`, `/checkout`, `/order/:id`, `/kitchen`) governs the multi-step contract; `tr-11` and `tr-27` contribute the sourdough bakery and parish church concert seat contexts.