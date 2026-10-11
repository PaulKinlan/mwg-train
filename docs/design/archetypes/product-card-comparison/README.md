# Product card comparison — illustrative multi-step visual references

- **Archetype:** `product-card-comparison`; a catalogue of cards whose attributes can be compared, the
  side-by-side comparison itself, the selection carried into the next step, and the state before any
  card has been chosen for comparison. This is the `card` type on the archetype type axis, authored for
  bead `mwg-train-efg` rather than one of the five evaluation archetypes or the thirty training
  families.
- **Generation:** 2026-10-11 UTC by `scripts/generate-archetype-boards.mjs --write --only
  product-card-comparison`, which passes `model: gemini-nano-banana-2.1` explicitly and fails closed if
  the response is not that model. The JPEGs are **not reproducible**: the endpoint takes no seed, so the
  committed bytes are the artefact and the prompts below are what was sent, not a recipe that returns
  the same picture.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning
  references, neither generated-site captures nor sealed evaluation targets, and nothing in the corpus
  derives from them.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md)
  records the evaluation archetypes' boards by the same generator; this family keeps its own register at
  [design-reference-product-card-comparison.md](../../../provenance/assets/design-reference-product-card-comparison.md),
  which carries the digests, the prompt hashes and the vision review.
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md)
  prohibit using AI-generated service content to develop machine-learning models. That is why these are
  `excluded_from_training`: they may be looked at, described and hashed, and they may not be training
  material.
- **Depicted content:** the catalogue name, product names, attribute values, prices, ratings, scores and
  badges are invented, unverified placeholders. The boards depict intended states; they demonstrate no
  behaviour and prove nothing about an implementation, which does not exist yet (see
  [`plan.md`](plan.md)).
- **Why these four states:** the type's contract is that a **prospect** can choose from one card while a
  **comparison shopper** compares several before their selection advances, so a set that showed only one
  card at a time would leave the comparison - the attribute alignment and the differences that make
  comparing worth doing - unpictured. The four are the catalogue, the comparison, the carried selection
  and the empty comparison state.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-cards.jpg`](step1-cards.jpg) | Catalogue of cards with comparable attributes, a select action and a compare toggle | `d9cec63488329028c1cb4ecf1f5847dae71fbd7eca9afc2769aafdd0a2850591` | 520168 |
| [`step2-compare.jpg`](step2-compare.jpg) | Side-by-side comparison with attributes aligned by row and differences marked | `2437d0014c66a29abc0ad3b13ce04440a91462cc013f6bec5e53dba9de2eb057` | 497736 |
| [`step3-selected.jpg`](step3-selected.jpg) | The chosen card carried into the next step, with the selection changeable | `7dd0853568106a66f325bf0b71b9dbce3cff44e921211f857fdb0d64f49320ae` | 466135 |
| [`step4-empty.jpg`](step4-empty.jpg) | The comparison state before two cards are chosen, and its one clear action | `45784693f257733ece8185bf63ec6c50a741c7e903dd1735af22b691dfdc8173` | 387224 |

The digests pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or
legal status. The corpus must derive from its own approved material, never from these. Per-board
inspection findings and the exact prompt bytes' hashes are in the
[register](../../../provenance/assets/design-reference-product-card-comparison.md).

## Exact generation prompts

### `step1-cards.jpg`

```text
Modern web application UI for a model hardware catalogue, "Rig Selection Board". Step 1: The Card Catalogue. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #22d3ee cyan accent for every actionable control, #f8fafc primary text, #94a3b8 muted metadata). One controls row above the grid: a search field with a magnifier icon, a select reading Category: Graphics cards, a select reading Sort by: Price low to high, and a result count reading "24 cards". Below it, exactly THREE product cards side by side in a single row, evenly spaced, each card containing from top to bottom: a rectangular product image, a product name reading "Vector VX-4070", "Northwind Arc A770" and "Halcyon RX-7800", a compact three-row attribute list with the labels Memory, Power draw and Warranty on the left and the values 12 GB, 200 W and 3 years on the right, one large price reading £549, £629 and £479, and a footer row holding one filled cyan button labelled Select and one outline toggle labelled Compare with a small empty checkbox. The first card's Compare checkbox is checked and its card edge carries a thin cyan outline. Every card has exactly the same number of rows so their attribute values line up across the row. Keep the layout simple and symmetrical: no more than three cards, no duplicate elements, one status element at most per card. Do not draw charts or code.
```

### `step2-compare.jpg`

```text
Modern web application UI for a model hardware catalogue, "Rig Selection Board". Step 2: Side-by-Side Comparison. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #22d3ee cyan accent, #f8fafc primary text, #94a3b8 muted metadata). A page headed "Comparing 3 cards" with a text link "Clear comparison" at the right. The body is a comparison table with three product columns and one attribute label column down the left. The left column lists, in aligned rows: Price, Chipset, Memory, Power draw, Length, Warranty, Score and Availability. Each product column has a small product thumbnail and the product name at the top - "Vector VX-4070", "Northwind Arc A770", "Halcyon RX-7800" - and then one value per row. The best value in each row is marked with a small cyan check icon and the weakest with a muted dash, and two rows carry a short inline note under the value such as "3 slots needed" or "adapter included". Each column ends with a filled cyan button labelled Select this card. A slim summary bar above the table reads "Cheapest 2 of 3 on price" in muted text. Do not draw charts or code.
```

### `step3-selected.jpg`

```text
Modern web application UI for a model hardware catalogue, "Rig Selection Board". Step 3: The Selection Carried Forward. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #22d3ee cyan accent, #f8fafc primary text, #94a3b8 muted metadata). A confirmation panel headed "Your selection" containing one large card: the product thumbnail, the chosen product name "Northwind Arc A770", the subtitle line, and the same four aligned attribute rows (Memory 16 GB, Power draw 225 W, Length 280 mm, Warranty 3 years) with the price £629 and the score "Score 8.7 / 10". A green confirmation line at the top of the panel reads exactly "Selected card carried into your build" with a small check icon, and a text link at the panel's foot reads "Change selection". To the right, a narrower panel headed "Still comparing" lists the two other cards that were compared, each as a compact row with a thumbnail, a name and a small outline button labelled Remove, with a muted note "Your comparison is kept until you clear it" underneath. A primary cyan button at the bottom of the selection panel reads "Continue with this card". Do not draw charts or code.
```

### `step4-empty.jpg`

```text
Modern web application UI for a model hardware catalogue, "Rig Selection Board". Step 4: The Empty Comparison State. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #22d3ee cyan accent, #f8fafc primary text, #94a3b8 muted metadata). A flat page with NO left sidebar and NO account avatar, notification bell or user menu: the header is one plain row with the words "Rig Selection Board" at the left and three text links reading Catalogue, Compare and Selection at the right. Below it, a page heading reading exactly "Comparing cards". In the centre of the page, ONE empty-state panel containing a simple outline illustration of two rectangles joined by a dashed line, then a heading reading exactly "Choose two cards to compare", then a muted sentence reading exactly "Select Compare on any two cards and their attributes will line up here, row by row.", then one cyan text link reading exactly "Back to the catalogue", and at the panel's foot a muted greyed-out button reading exactly "Compare selected" with a muted note beside it reading exactly "Select two cards first". Underneath the panel, a muted counter on its own line reading exactly "0 of 3 selected to compare", and below that ONE row of exactly THREE catalogue cards side by side, evenly spaced, carrying the names "Vector VX-4070", "Northwind Arc A770" and "Halcyon RX-7800", each with a product image, a price, and an unchecked outline Compare toggle. Draw exactly three cards in total and no others. Do not draw a sidebar, a user avatar, a notification bell, a search bar in the header, or more than three cards. Do not draw charts or code.
```

The empty comparison board is the state that proves the comparison is real state rather than a layout:
with nothing chosen there is nothing to compare, and the page says which action fixes that.
