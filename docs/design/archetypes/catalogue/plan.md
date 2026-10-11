---
archetype: catalogue
type: storefront
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/catalogue/
register: docs/provenance/assets/design-reference-wave2.md
spec: docs/eval/specs/catalogue.json
---

# `catalogue` — functional contract

A searchable reference catalogue: a product grid to browse and filter, a search whose query comes back
from the server, and a cart held in a session and reviewed in a slide-over drawer. This document is the
contract for the `catalogue` archetype - what a shopper can do, what the server does about it, and what a
journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan
documents are. What it describes is the accepted target at `docs/design/archetypes/catalogue/`, **not** the
sealed evaluation target under `docs/eval/targets/` and `data/A6_evaluation/`, which this document does not
describe.

## Use case

A ceramics supplier sells tableware and kiln supplies. A **shopper** browses a filtered grid, searches for a
part by word, adds items to a cart, and reviews the cart's lines, quantities and subtotal in a drawer
before leaving.

The type axis calls this `storefront` - "browse or filter a catalogue, choose a variant, put it in a cart" -
and it records the type as **partial**: the pilot's catalogue has the search and the session cart, while
`web-shop` has a products list and a checkout write. The contract reflects that split: **there is no
checkout route**. The cart is the end of this archetype's declarations, so a rebuild that adds an order
confirmation has added a route the spec does not have, not completed one.

Two absences are part of the contract rather than gaps in it. There is no security journey declared, and
there is no stored copy of the search: the query is reflected back by the server and the reload assertion
is explicit that "the query echo is a reflected URL parameter, not stored state".

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the product grid and the search form the journey submits |
| `GET /search` | search | reflects the query back and narrows the grid; nothing is stored |
| `POST /cart` | write-session | stores the posted part number against the session and redirects |
| `GET /cart` | read-session | reads the cart back out of the session |

The archetype carries a second form beyond the search: `cart-form` posts `item` and `quantity` to `/cart`
with `Add to cart` as its submit. So the write is reachable both from the grid and from the drawer.

**Every declared route is served.** `scripts/check-pilot-served.mjs`, which runs inside `check:all`,
compares the route names a spec declares against those extracted from a generated server, and it files
**no** `declared_not_served` entry for this archetype. It does record four routes each generated arm serves
that the spec does not declare - `GET /record/:ref`, `GET /roster`, `GET /inbox`, `GET /attendees` - across
five arms, twenty exceptions in all, all `Generator fallback` or `Hardcoded generator fallback`. Those are
generator furniture rather than anything this contract promises.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line, alive for one process - a store for the life of
  that process, not a durable one.
- **Table:** `records`, with `ref` (TEXT, primary key), `created_at` (TEXT, not null) and `payload`
  (TEXT, not null) - the same shape the other record-form archetypes use.
- **The cart is not a table.** The spec's persistence block names `/cart` as both the write and the read
  route and the reference as a **session id issued by the server as a cookie**; the reload assertion is
  "reloading `/cart` still shows the cart the session stored". So the cart's identity is the session, and
  its contents live in it.
- **The query is not state at all.** It is reflected from the URL parameter on a `GET`, which is why the
  search has no row behind it and why a reload of `/search?q=...` can still be answered after the process
  that served it has gone.

## Journey

The declared journey is a `get-query-reload` rather than a write:

- it starts at `/`;
- it submits `form#search-form` with `input[name=q]` filled with `bearing`;
- and it expects `bearing` to come back.

Two things are worth naming because they are easy to lose. The journey asserts a **read**, so it cannot
prove anything about the cart; the cart's evidence is the `write-journey` probe in *Implementation status*.
And the expected text is the query itself, echoed - a run that searched for something else, or that
printed a fixed string, would satisfy a careless reading of it.

## Validation and states

- **Required fields:** `q` and `item`.
- **On a missing query:** the spec is explicit that "a search with no query renders an empty result set
  rather than refusing" - the empty state is a designed state here, not an error.
- **On a cart post:** the part number is stored against the session and the response redirects.
- **The empty state is first class:** the target ships a whole page for it (`demo/empty.html`) and the
  third board depicts it, with the searched term quoted back in the heading.
- **No security journey is declared.** The session is still a session, so the pilot's security rule reports
  on it - see *Implementation status*, where that is recorded as measured rather than explained away.

## Acceptance criteria

1. The echoed query is the value this attempt typed, reflected by the server after a `GET` reload.
2. The cart write is read back from the session, and the part number posted is unique to this attempt so an
   older row cannot satisfy it.
3. An optional field is not made required by the uplift: the project never asked the user for it.
4. The cart is reachable from the grid and reviewable in the drawer: the target's grid carries an
   `Add to cart` action per product, and the drawer carries the lines, a quantity stepper, the subtotal and
   a `Proceed to checkout` button.

Criteria 1 to 3 are the spec's own acceptance strings, quoted. Criterion 4 is the target's; note that the
`Proceed to checkout` button has **no declared route behind it** - the button is pictured in the demo and
on two boards, and the contract stops at the cart.

## Implementation status

- **Five arms are generated from the spec** - `pilot/projects/catalogue-{hono,preact,raw,react,vue}` -
  rebuilt by `node scripts/rebuild-from-spec.mjs --family catalogue`.
- **What the pilot records contain.** `docs/pilot/records.json`, produced by `scripts/pilot-records.mjs`,
  holds one entry per project per version. Seven of its 35 projects are catalogue arms - the five above plus
  `svelte` and `webcomponents`, which have no directory under `pilot/projects/` today - and each has an
  `original` and an `uplifted` entry, fourteen in all. Every entry carries **four** harness probes -
  `server-persistence`, `validation-failure`, `write-journey` and `content` - one more than the archetypes
  whose only write is a record form, because this one writes to a session. Measured field by field:
  - `server-persistence` records the echoed query as `bearing` on all fourteen entries - the value the
    journey fills, so criterion 1's echo has a recorded value rather than an assertion about one;
  - `write-journey` records `status: 303`, `landedStatus: 200` and `readStatus: 200` on all fourteen, with
    `posted: true` and `postedMethod: "POST"`, and a `submittedValue` that is a distinct part number in
    every one of the fourteen (`part-muziszq5-drsuw9`, `part-muzit3tg-fhtprq`, and so on). Criterion 2 is
    therefore evidenced directly, and uniquely: fourteen distinct values is what "unique to this attempt"
    means;
  - `validation-failure` records a visible error and `refused-observed` on all seven arms;
  - `security.session-cookie-attributes` is `FAIL` on all fourteen entries and `form-token-exposure` is
    `PASS` on all fourteen;
  - both tree hashes are present for all seven arms and **differ in six of the seven** -
    `catalogue-vue`'s uplifted tree is byte-identical to its original, which is a fact about that arm's
    uplift rather than about the archetype;
  - **unlike the record-form archetypes, these records carry response statuses.** `status`, `landedStatus`
    and `readStatus` all appear, which is why criterion 2 can be checked from the record instead of only
    from the browser.
- **A divergence, named rather than adjudicated.** The rule behind `session-cookie-attributes` requires a
  session cookie to be `HttpOnly`, to be `Secure` and to carry a SameSite value other than `None`. It is
  recorded as `FAIL` on every catalogue entry. This archetype does declare a session - the cart needs one -
  so the failure is not the absence of a session; but the record names neither the cookie nor the failing
  attribute, and the pilot serves over `http://127.0.0.1`, where a `Secure` cookie cannot be set at all.
  The status is recorded here and not adjudicated.
- **The visual target is hand-written and static.** `demo/` holds a grid-with-drawer page, a cart page and
  an empty page, plus `compare.html` and its stylesheet; the three boards are the reference pictures. The
  demo's README records the boundaries, and it answers from no server, holds no credential and stores
  nothing: the cart drawer in the demo is populated by script, not by a session.
- **The boards disagree with each other, and with the target, about who the shop is.** The three boards
  carry **three different brand names** - `EARTH & OAK`, `ceramics` and `KERA` - where the demo has a fourth,
  `Kiln & Copper`, with a kiln mark. They also disagree about money: the grid board prices in **dollars**
  (`$78.00`, `$64.00`, `$52.00`) and the cart board in **pounds** (`£19.99`, `£23.90`, `Subtotal: £43.89`).
  The grid board is full-bleed, the empty board presents the page inside a rounded panel on a contrasting
  ground, and the empty board's only action - `Reset Search` - is **orange** where every other action in the
  set and in the target is emerald. This directory's `README.md` records what the rasters depict, and it
  lists prices, category counts, inventory, totals, a shipping promise and checkout buttons among them, so
  the invented commercial detail is known and accepted rather than accidental; what the README does not
  record is that the three pictures describe three different shops.
- **The section order of this file is a convention, not a checked rule.** `test/design-contract.test.mjs`
  walks `docs/eval/design`, so the order and no-`###` shape of `docs/design/archetypes/*` documents is kept
  by hand. If that gap should close, it is a bead of its own.

## Provenance

- **The boards** are registered in
  [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md),
  whose scope names the four archetypes it covers including this one, and [`README.md`](README.md) in this
  directory carries a SHA-256 digest and a byte count for each of the three files. They were generated
  rather than designed, which is why the disagreements above are evidence about the generator rather than
  about the archetype.
- **The behaviour** is declared by [`docs/eval/specs/catalogue.json`](../../../eval/specs/catalogue.json).
  Its durability block records that it was authored on 2026-10-08, transcribed from the pilot archetype and
  hand-reviewed, and that `test/spec.test.mjs` keeps the spec and the pilot in step; it is replayed by
  `node scripts/rebuild-from-spec.mjs --family catalogue`. The evaluation side has its own plan at
  [`docs/eval/design/catalogue/plan.md`](../../../eval/design/catalogue/plan.md), which this document does
  not restate.
- **The measurements** in this document were taken from the spec, from `scripts/check-pilot-served.mjs`,
  from `docs/pilot/records.json`, from this directory's `README.md` and from the three JPEGs. Where a number
  appears here it was read from one of those, not estimated.
