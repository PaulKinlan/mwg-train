# Catalogue Archetype: Modern Visual Design Target

- **Archetype:** `catalogue` (Searchable reference catalogue)
- **Status:** Illustrative visual design target and demonstration.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`.
- **Boundaries:**
  - **Not the sealed evaluation target:** this demonstration does not modify or replace
    `docs/eval/targets/catalogue/` (whose manifest digest is pinned by `EVAL_TARGETS_SEAL`).
  - **Not part of pilot:** this demo lives outside `pilot/**` and `data/A6_evaluation/**`. The frozen
    pilot corpora (`pilot/CORPUS.json`, `pilot/TRAINING_CORPUS.json`, and generated arm trees) remain
    byte-identical.
  - **Not training data:** kept purely for visual verification and operator inspection.
  - **Not a conformance result:** nothing here asserts a match with the boards or a pass against the
    contract. It is hand-written markup, not a measured outcome.
  - **No committed screenshots:** every comparison on `compare.html` is either the reference board
    JPEG itself or a live iframe of the file beside it.

## Purpose

This directory is a browser-verifiable implementation of the visual language established by the three
reference boards in `docs/design/archetypes/catalogue/` (`step1-grid.jpg`, `step2-cart.jpg`,
`step3-empty.jpg`), aimed at the catalogue archetype's functional contract in
`docs/eval/specs/catalogue.json`.

The boards depict a journey broader than that contract — category chips and a sort dropdown, a
slide-over drawer with per-line steppers and a checkout CTA, and an empty search state. This demo
adopts their **visual language** onto the contract's **actual fields** (a `q` search and an `item`
part number), and it says plainly below which parts of the pictured journey it does not implement.

It is standalone raw HTML and CSS with **no build step, no bundler, no framework, no web fonts and no
network requests**. It opens from the filesystem or from any static server.

## What each board contributed

1. **Board 1 — product grid and filtering (`step1-grid.jpg`).**
   Search bar with an in-field query, category chips, a sort dropdown, a sticky cart indicator with an
   item count, and a card grid whose cards read art → name → variant → price → stock pill → action.
   The demo runs the grid at one, two and three columns by viewport width rather than the board's five
   across its own width, and adds a "Kiln parts" chip (see *Contract shape*).
2. **Board 2 — slide-over cart drawer (`step2-cart.jpg`).**
   A `28rem` right-hand drawer over a dimmed and blurred grid: line thumbnails, names, unit prices,
   `+ −` steppers, line totals, a remove glyph, an Items/Subtotal/Shipping/Estimated total summary, a
   free-shipping message, and a single prominent checkout CTA.
3. **Board 3 — empty search state (`step3-empty.jpg`).**
   The query still in the search field, the category row intact, and a centred card with an
   illustration, a heading that quotes the query, a suggestion line, and a reset action.

## Layout and palette decisions

- **Palette (from the boards and the design guidance in `docs/design.md`):** page `#0f172a`, cards
  `#1e293b`, inset surfaces `#162032`, raised surfaces `#243248`, dividers `#334155`, action emerald
  `#10b981` (hover `#059669`, active `#047857`), primary text `#f8fafc`, muted text `#94a3b8`.
  A single dark scheme with `color-scheme: dark`: the boards are a dark storefront, no theme switch is
  promised, and a fake light mode would be worse than none.
- **Type:** the system font stack only, with a monospace stack for part numbers. No font request is
  made, so the page renders identically offline.
- **Grid:** one column below `34rem`, two columns from `34rem`, three from `60rem`, inside a `68rem`
  frame with `1.5rem` page padding (`1rem` below `30rem`).
- **Breakpoints** use range syntax (`@media (width <= 30rem)`, `(width >= 34rem)`), following the pilot
  stylesheets in `pilot/projects/*/app/styles.css`; `compare.html` adds `(width >= 48rem)` for its
  two-column comparison layout.
- **Illustrations:** twelve product shapes plus a shelf, drawn as SVG paths in one in-document sprite
  and tinted by `[data-tone]` custom properties (`ash`, `terracotta`, `cream`, `celadon`, `graphite`).
  No image file, no request, and the same shape is reused for the matching cart thumbnail.
- **Motion:** the drawer slides and the backdrop fades; `prefers-reduced-motion: reduce` collapses both
  to a step change.

## Contrast decisions (measured)

The board draws white labels on emerald buttons. That combination measures **2.54:1**, below the 4.5:1
needed for normal text, so the demo keeps the board's emerald fill and uses a dark ink (`#04231a`) on
it instead: **6.57:1**. The same reasoning gives small emerald text on a tinted surface the lighter
`#34d399` (**5.62:1** on the in-stock pill) rather than `#10b981`, and gives form controls and chips a
`#64748b` border (**3.75:1** against the page, **3.43:1** against the inset field surface) instead of
the decorative divider grey, which would not have cleared the 3:1 non-text threshold.

Measured pairs, all above their thresholds: body text 17.06:1 on the page and 13.98:1 on a card; muted
text 6.96:1 on the page and 5.71:1 on a card; low-stock amber 7.62:1; out-of-stock red 6.70:1; focus
ring 7.04:1 against the page.

## Contract shape (`docs/eval/specs/catalogue.json`)

| Contract element | Present in the demo | What it actually does here |
| --- | --- | --- |
| `GET /` (page) | `index.html` | The page itself, opened as a static file. |
| `GET /search` (search) | `form#search-form`, method `get`, action `/search`, field `input[name=q]` of type `search`, label "Search parts", `required` | The submit is intercepted and the twelve cards in the markup are filtered in the browser. The action attribute is kept for contract shape and is **not served**; the query is also mirrored into the URL as `?q=…` so a reload or a shared link restores the view. |
| `POST /cart` (write) | `form#cart-form`, method `post`, action `/cart`, submit "Add to cart" | The submit is intercepted and the part number is written to `localStorage` instead of a server session. |
| `GET /cart` (read) | The drawer on `index.html`; `cart.html` as a static variant | The drawer re-renders from `localStorage` on every load, which is what a reload of a static file does. |
| `input[name=item]` | Drawer, "Part number", type `text`, `required` | Adds a catalogue line, or records an unknown part number as a custom line rather than dropping what was typed. |
| `input[name=quantity]` | Drawer, "Quantity", type `number`, marked "(optional)" | **Not required**, and adding an item submits with it empty: the optional field is not made required anywhere. Blank means one. |
| `readPath /api/records` | Not implemented | There is no such route in this directory and nothing calls one. |
| `expectText` `bearing` | `index.html`, `cart.html` | Two catalogue products carry the word in their names (the Silicon Nitride Kiln Bearing Set and the Alumina Bearing Roller), so a search for it returns a real result set; it also appears in the results line's echo of the query, in the empty-state heading, and in the bearing line of the static cart variant. |
| `session: true` | `localStorage` key `kiln-copper-cart-v1` | Stands in for the server session. It is not a cookie, not issued by a server, and not shared between browsers. |

The invented detail the boards contain — category counts, shipping promises, "free
shipping over £40 applied", the illustrated checkout — is placeholder content from the board prompts,
not data this demo claims.

## What this demo does NOT do

It is a static design target. Stated plainly:

- **It does not run the spec's server routes.** `GET /search`, `POST /cart` and `GET /cart` have no
  implementation in this directory. The forms carry those `method` and `action` values so the contract
  shape is readable, and every submit is intercepted by JavaScript. With JavaScript disabled, a submit
  navigates to `/search` or `/cart`, which nothing here serves.
- **It does not persist to SQLite.** There is no database, no `records` table, no `sessions` table and
  no server process. The cart lives in `localStorage` under `kiln-copper-cart-v1`.
- **It does not implement the declared `readPath` `/api/records`.** Nothing calls it, and no endpoint
  answering that name exists here.
- **It does not issue or read a session cookie**, and it has no per-visitor identity. `cart.html` shows
  the same three hand-written lines for everyone, and its totals are literal markup, not a computation
  from your cart.
- **It does not search or page server-side data.** The catalogue is twelve cards in the markup and the
  filtering is `indexOf` over their text. There is no paging, no ranking and no server query.
- **It does not take payment or place orders.** The "Proceed to checkout" button says so when clicked;
  there is no order route, no basket hand-off and no receipt.
- **It does not survive a storage block.** `localStorage` can be unavailable, and some browsers refuse
  it for `file://` URLs. Every access is wrapped in `try`/`catch`, so the cart still works in memory for
  the page view and is simply not remembered.
- **It does not prove its own quality.** No accessibility audit and no browser-driven acceptance run
  happened while the markup was written, and no screenshot of this demo is committed; `compare.html` shows
  the result so a reader can judge it directly. That is a statement about how these files were AUTHORED, not
  about the tree: the behaviours above are driven in a real browser by `scripts/verify-catalogue-demo.mjs`.

What it does instead: it filters the twelve catalogue cards in the browser, keeps a `localStorage` cart
that survives a reload in the same browser, mirrors the query into an `?q=` parameter that survives one
too, and shows static variants for the two states a template can present without a writable store.

### Where the backend work belongs

Server persistence and the backend endpoints are not missing from this directory - they belong to a
DIFFERENT part of the pipeline. The routes, the SQLite `records` and `sessions` tables, the session cookie
and the `readPath` are implemented when a family is **generated and evaluated**, where a real server is
started and scored against the spec. This directory is a design reference: it shows the intended result so a
reader, a reviewer or a future implementation can see what the generated markup is aiming at. Reading it as
an unimplemented backend would be a category error, which is why the limits above are stated per contract
rather than left to inference.

## Guidance and standards

Written without consulting Modern Web Guidance, so nothing here is a guidance claim — the techniques
are ordinary platform features, used because they are the right tool: `:focus-visible` outlines,
`prefers-reduced-motion`, a single `color-scheme: dark` instead of a `prefers-color-scheme` switch,
`forced-colors: active` fallbacks, `aria-pressed` toggle buttons, `role="status"` live regions, `inert`
for the background behind the open drawer, and a focus trap that returns focus to the control that
opened or used it. `:user-invalid` (not `:invalid`) marks the one form field with validation, so
nothing is marked wrong before the user has typed.

## Files

- `index.html`: the interactive catalogue — search, category chips, sort, the twelve-card grid, stock
  states, the quick add-to-cart buttons, the slide-over drawer with steppers and the add-by-part-number
  form, and the empty search state it reaches by filtering.
- `cart.html`: static variant of board 2 — the drawer open over the dimmed grid, with the board's two
  lines plus the bearing line, shown with its controls disabled because the page has no script.
- `empty.html`: static variant of board 3 — the query still in the field, the chips intact, and the
  empty-state card; its search form submits to `index.html?q=…`, which really does filter the grid.
- `compare.html`: every board in `../` beside the live page at a true 1280 × 900 and 390 × 844 iframe
  viewport, with the reasoning for each board adopted.
- `styles.css`: the single stylesheet — tokens, layout, components, focus states, forced colours,
  reduced motion and the responsive tiers.
- `README.md`: this file.

## Verification

What was checked while writing, and what was not:

- The inline script in `index.html` passes `node --check`.
- `styles.css` parses with PostCSS (180 rules, 710 declarations, six at-rules) and every `var()`
  reference resolves to a declared custom property.
- A structural pass over the four pages checks tag balance, duplicate ids, every `label for`, every
  `aria-labelledby` / `aria-describedby` / `aria-controls` target, and every `<use href="#…">` sprite
  reference; and it confirms the contract selectors, that `quantity` carries no `required`, that each
  card's `data-price` matches the price it displays, and that no page references a remote script, font
  or image.
- The shipped search predicate and cart arithmetic were extracted from the file and run against the
  shipped card markup: `bearing` returns the two bearing parts, `porcelain teapot` returns nothing
  (the board 3 state), and the cart maths reproduces the board's £43.89 and this demo's £62.29.
- Contrast ratios were measured for 18 foreground/background pairs; 17 pass their thresholds and the
  eighteenth is the board's white-on-emerald combination that was deliberately not copied.
- **Driven in a real browser** by `scripts/verify-catalogue-demo.mjs`, which serves these exact files and
  asserts what is VISIBLE rather than what is in the markup: the grid renders twelve cards; typing `bearing`
  narrows it to two visible cards, every one of them matching the query, with `?q=bearing` in the URL; a
  query with no match reaches the empty state; submitting the spec's own `item` field writes a cart that
  survives a page load; a card quick-add adds a **second** line; a quantity stepper mutates the persisted
  cart; mobile 390x844 renders with no horizontal overflow; and `compare.html` loads all three reference
  boards same-origin with the live demo embedded. Screenshots are written to `/tmp/xvd-shots/` and are
  deliberately not committed, which is how this repo's other demo avoids committing screenshots.
- **Not done here:** no screen reader, and Chrome only - no second engine has been tried. The degraded path
  when `localStorage` is unavailable or blocked (every access is guarded, but the fallback has not been
  exercised) and any performance or Core Web Vitals claim are also outside what has been checked.
