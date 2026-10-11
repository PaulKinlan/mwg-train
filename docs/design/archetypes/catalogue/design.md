---
archetype: catalogue
type: storefront
boards: docs/design/archetypes/catalogue/
register: docs/provenance/assets/design-reference-wave2.md
---

# `catalogue` — aesthetic system

The look of the `catalogue` archetype: a ceramics shop on a dark ground, where the emerald marks what is
in stock and what you can add, and a slide-over drawer holds the cart. This document describes the accepted
target at `docs/design/archetypes/catalogue/` - its demo and its three reference boards - in the section
order the evaluation side requires of a design (`DESIGN_SECTIONS`).

## Visual thesis

A catalogue is a room full of things, and the interface's job is to let the merchandise be the brightest
thing in it. So the ground is dark and the product photography carries the colour: `--bg-page` `#0f172a`,
cards a step lighter at `#1e293b`, inset panels `#162032` and the one raised surface `#243248`.

Three colour families do the talking. **Emerald** (`--action` `#10b981`, with `--action-hover`,
`--action-active`, `--action-ink`, `--action-text`, `--action-subtle`) is the action family: it fills the
`Add to cart` buttons, the cart badge, the active filter pill and the checkout button. **Amber**
(`--caution` `#fcd34d` with a subtle fill and a border) is the warning family, used for low stock and the
no-script note. **Red** (`--danger`, `--danger-text`, `--danger-subtle`, `--danger-border`) is the failure
family, used on invalid fields, out-of-stock items and the remove control's hover.

The scheme is **dark only, and deliberately so**: the stylesheet declares `color-scheme: dark` and contains
**no** `light-dark()` pair and no `prefers-color-scheme` block. All 29 colour tokens are single-valued in
`:root` - though *in `:root`* is not the same as *throughout the stylesheet*, as the clay family below
shows. A rebuild that adds a light scheme is designing a second target, not completing this one.

The target also carries a clay family that only the artwork uses: `--art-clay`, `--art-clay-dark`,
`--art-clay-light` and `--art-glaze`. **None of the four is referenced from the stylesheet at all**, which is
why searching `demo/styles.css` alone reports them as unused; all four are used from inline SVG in the demo's
HTML instead - 21, 30, 18 and 16 references respectively. The first three are not even fixed values: five
`[data-tone]` variants (`ash`, `celadon`, `cream`, `graphite`, `terracotta`) re-value them, which makes the
clay family the one part of the palette that takes more than one value. Only `--art-glaze` holds a single
value everywhere.

## Grammar and layout

- **The page** is `min-height: 100vh` on the dark ground, and its blocks set their own measure rather
  than sharing one container width. `.product-grid` is a single column by default, two columns from
  `34rem` and three from `60rem`; the add-by-part grid becomes `1fr 9rem` at `34rem`; and the narrow block
  below `30rem` tightens the horizontal padding of the top bar, the state switcher, the container and the
  footer to `1rem` rather than changing any columns.
- **The product grid** is the page: `.product-card` elements in a responsive grid, each carrying an image,
  a stock pill, a name, a price and one full-width `Add to cart` action.
- **Measure is set per block, not globally.** The widest text block is the page's `.subtitle` at `46rem`;
  the empty state caps itself at `34rem` and its copy at `26rem`, so a centred apology never stretches to
  the width of a product row.
- **The cart is a drawer, not a page.** It slides in over the grid with the only shadow in the stylesheet -
  `box-shadow: -18px 0 40px rgba(0, 0, 0, 0.35)` - and its line items use a `3.75rem 1fr` grid, the artwork
  column fixed so the names and quantity steppers line up down the list.
- **Corners** are graded by size, and the grading is consistent enough to name every owner: `--radius-lg`
  (16px) is `.catalogue-controls`, `.product-card`, `.empty-state` and `.comparison-card`; `--radius-md`
  (12px) is `.cart-item`, `.cart-add`, `.cart-empty-note`, `.noscript-note`, `.legend`, `.view-image` and
  `.view-frame`; `--radius-sm` (8px) is `.btn`, `select`, `.brand-mark`, `.drawer-close`, `.cart-item-art`,
  `.qty-stepper` and `.cart-remove`; and the full pill (`9999px`) is `.cart-button`, `.cart-badge`,
  `.state-pill`, `.chip` and `.stock-pill`.

## Typography

Two system stacks: `--font-sans` for the interface and `--font-mono` for two things - `code` and a cart
line's part number (`.cart-item-part`). Nothing is downloaded, so the type does not shift after first paint.

The display heading is the only viewport-scaled type - `clamp(1.6rem, 1.3rem + 1.4vw, 2.4rem)` on
`.display-title`. Below it the scale is fixed and fairly tight: `1.125rem`, then `0.9375rem`, `0.875rem`
for secondary and link text, `0.8125rem` for pills and metadata, and `0.75rem` for the smallest labels.
Body text is `1rem` at a line height of **`1.55`** - looser than the round `1.5` a rebuild would reach for,
and the reason long product descriptions stay readable against a dark ground.

The product name is the anchor of a card and is set as a heading, not as a link with a heading's styling;
prices sit directly beneath it in the same left-aligned column, so a scan down the grid compares like with
like.

## Token usage

The last column names where each of the 29 colour tokens is actually used, with the selectors and the
number of references, rather than describing an intended use. References are counted across the whole of
`demo/styles.css`, *including* `:root` - except for the four `--art-*` rows, which are referenced only from
the demo's HTML and are counted there. Two tokens - `--text-inverse` and `--action-glow` - are referenced
nowhere in either file.

| Token | Value | Where it is used (references; in `styles.css` unless stated) |
|---|---|---|
| `--bg-page` | `#0f172a` | `body`, `.view-image` (3) |
| `--surface-card` | `#1e293b` | `.top-bar`, `.state-pill` and seven more (9) |
| `--surface-inset` | `#162032` | `.state-switcher`, `.chip` and six more (8) |
| `--surface-raised` | `#243248` | `.cart-button`, disabled buttons (3) |
| `--surface-input` | `#162032` | the text and search inputs (1) |
| `--border-subtle` | `#334155` | `.top-bar`, `.state-switcher` and nineteen more (21) |
| `--border-control` | `#64748b` | `.cart-button`, `.state-pill` and four more (6) |
| `--border-highlight` | `#94a3b8` | `.chip:hover:not([disabled])` (1) |
| `--text-primary` | `#f8fafc` | `body`, `.brand` and thirteen more (15) |
| `--text-muted` | `#94a3b8` | `.top-nav a`, `.state-switcher-label` and twenty-six more (28) |
| `--text-inverse` | `#0b1220` | nothing - referenced nowhere in the stylesheet or the HTML |
| `--action` | `#10b981` | `:root`'s `accent-color`, buttons and links (17) |
| `--action-hover` | `#059669` | `.btn--action:hover`, `.btn--add:hover` (5) |
| `--action-active` | `#047857` | `.btn--action:active` (2) |
| `--action-ink` | `#04231a` | `.brand-mark`, `.cart-badge` (6) |
| `--action-text` | `#34d399` | `.cart-button:hover`, the current pill (8) |
| `--action-subtle` | `rgba(16,185,129,.18)` | the current pill, the in-stock pill (3) |
| `--action-glow` | `rgba(16,185,129,.25)` | nothing - referenced nowhere in the stylesheet or the HTML |
| `--caution` | `#fcd34d` | the low-stock pill, the no-script note (3) |
| `--caution-subtle` | `rgba(245,158,11,.16)` | the low-stock pill, the no-script note (2) |
| `--caution-border` | `#f59e0b` | the no-script note (1) |
| `--danger` | `#ef4444` | invalid fields (1) |
| `--danger-text` | `#fca5a5` | an error status, the out-of-stock pill (3) |
| `--danger-subtle` | `rgba(239,68,68,.16)` | the out-of-stock pill, the remove button (2) |
| `--danger-border` | `rgba(239,68,68,.5)` | the remove button's hover (1) |
| `--art-clay` | `#c8ab86` | inline SVG in the demo's HTML (21); none in the stylesheet |
| `--art-clay-dark` | `#a9855d` | inline SVG in the demo's HTML (30); none in the stylesheet |
| `--art-clay-light` | `#e0cbaa` | inline SVG in the demo's HTML (18); none in the stylesheet |
| `--art-glaze` | `#34d399` | inline SVG in the demo's HTML (16); none in the stylesheet |

The action and danger families are not the same emerald-and-red pair the record-form archetypes use by
accident: this target keeps a **separate text tone** for each (`--action-text`, `--danger-text`) so that a
coloured word on the dark ground clears contrast where the fill colour would not.

## Spacing rhythm

The scale is rem-based and clustered: across the stylesheet the most frequent gap between siblings is
`0.75rem` (seven uses), then `0.5rem` (six), `0.35rem` (five), and `1rem` and `0.6rem` (four each), with
`1.25rem` used twice. Padding is written as a bare `1rem` four times, with two further shorthands that
begin with it (`1rem 1rem 1.15rem` and `1rem 1.25rem`); `1.5rem` is used twice.

Two consequences are visible in the design. The gap scale's centre of mass is below `1rem`, which is what
lets a three-column grid read as a catalogue rather than a spreadsheet. And the two commonest values are
not interchangeable: `0.5rem` separates a control's parts (`.cart-button`, `.search-form`, `.chip-row`,
`.sort-control`) and the lines inside a product's body, while `0.75rem` separates a card's foot
(`.product-foot`), the tools on a cart line (`.cart-item-tools`) and the actions in the empty state
(`.empty-state-actions`).

## Component hierarchy

Read from `demo/index.html`, `demo/cart.html` and `demo/empty.html`:

- **The top bar** with the brand (`.brand`, carrying an SVG mark and the name *Kiln & Copper*) and
  `nav[aria-label="Main navigation"]`, plus the cart button, which carries no `aria-label` of its own and
  shows the count in a `.cart-badge`. The label *Items in your cart* belongs to the cart's items list further
  down the page, not to this control.
- **The search form**: `form#search-form`, `method="get"`, `action="/search"`, `role="search"` - the
  journey's own form - containing `input[name="q"]`.
- **The filter row**: category pills with `aria-label="Filter by category"`, of which the current one is
  marked `aria-current="page"`.
- **The grid**: a `.visually-hidden` heading carries the accessible name *Catalogue products*, and each
  `.product-card` holds artwork, a `.stock-pill` (with `--in`, `--low` and `--out` variants), an `h3`
  product name, a price and a `.btn--add` reading *Add to cart*.
- **The cart drawer**: a slide-over whose title is *Your cart* (`#cart-drawer-title`), with a close control
  labelled *Close cart*, one row per line item (artwork, name, price, `.qty-btn` minus and plus, a remove
  control), the subtotal, and `form#cart-form` (`method="post"`, `action="/cart"`) for the add-by-part form.
- **The checkout affordance**: a `.btn--checkout` reading *Proceed to checkout*. Two notes follow it - a
  status paragraph and the browser-storage note - and it has **no route behind it**: the spec declares none,
  and the drawer says so itself, that this target "has no server session and no order route".
- **The empty state**: `h2.empty-state-title` quoting the search term, a `.btn--action` reading *Reset
  search*, and a `.link-quiet` escape hatch.
- **A demo state switcher** (`aria-label="Demo state switcher"`). Like the other archetypes' switchers this
  is a verification control, not product UI: it exists so a person can see the error and filled states
  without a server.

## Anti-patterns

- **Three shops in three pictures.** The boards carry three different brand names - `EARTH & OAK`,
  `ceramics` and `KERA` - while the demo has a fourth, `Kiln & Copper`. A reference set that cannot agree
  on the shop's name cannot be used to check branding.
- **Two currencies, one catalogue.** The grid board prices in dollars and the cart board in pounds, in the
  same set, with no explanation.
- **An orange action in an emerald system.** The empty board's only button is orange, where every action in
  the demo and on the other two boards is emerald and orange means *caution* here. The accent should be the
  accent.
- **A picture that promises a checkout.** `Proceed to checkout` appears in the demo and on the cart board,
  and no route serves it. The README lists checkout buttons among the depicted content, so this is a
  deliberate illustration rather than a slip - but a reader who takes the picture as a contract will look
  for an order page that does not exist.
- **Invented commercial detail.** Stock pills, category counts with numbers in them, `Cart (3)`, `2 items`,
  subtotals and *Free shipping over £40 applied* are all pictured; none is state the spec declares. Prices
  and inventory are illustration, and a rebuild should not treat them as fixtures.
- **A preview that pretends to persist.** The demo's cart drawer is populated by script and kept in the
  browser's `localStorage`, not in a session. Two opposite mistakes follow: taking the demo for a
  session-backed cart that stores something server-side, and taking its `localStorage` stand-in - which the
  README names as a substitute for the session - for the session the spec actually declares.

## Rationale

The type is `storefront`, and the design follows the merchandise. A dark ground lets the product photography
be the brightest element and keeps six cards on screen without a busy frame. One action family, spent on
adding to the cart, means the eye learns a single verb; a caution family keeps low stock distinct from
failure; and a separate text tone for each family is what makes those meanings legible as words rather than
only as fills. The drawer, rather than a cart page, keeps the shopper on the grid - the cart is a decision
in progress, so it slides over the catalogue instead of replacing it. And the empty state gets a whole page
because a search with no results is a designed outcome in this type, not an error.

## Provenance

- **The boards** are registered in
  [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md),
  with a SHA-256 digest and a byte count for each in [`README.md`](README.md). They were generated, not
  designed, which is why the disagreements recorded under *Anti-patterns* are gaps in the reference set
  rather than decisions; this document follows the demo where the two differ.
- **The demo** (`demo/`) is the accepted target, hand-written and static. It is not the sealed evaluation
  target, not part of the pilot corpus, and its cart is scripted and kept in browser storage rather than
  stored on a server.
- **The measurements** in this document - every token value and reference count, the geometry, the radii and
  their selectors, the type sizes and line height, the spacing frequencies, the shadow and the breakpoints -
  were read from `demo/styles.css`, the component list from the demo's HTML, and the board descriptions from
  the three JPEGs. Nothing here is drawn from a specification that has not been published in this
  repository.
