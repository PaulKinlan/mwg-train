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
| [`step1-cards.jpg`](step1-cards.jpg) | Catalogue of cards with comparable attributes, a select action and a compare toggle | `27c11e7058344c7c02d624d8a04b48fe99eb8b057dc1bf332dab176bf51242d6` | 656438 |
| [`step2-compare.jpg`](step2-compare.jpg) | Side-by-side comparison with attributes aligned by row and differences marked | `edad3920cf35bb000d9671dd914615d314227ef1b13dc4711c93e40ba96f64c5` | 575681 |
| [`step3-selected.jpg`](step3-selected.jpg) | The chosen card carried into the next step, with the selection changeable | `8b7f909c14f37975f37e0b420c5e8f3a47893e0799e43e6e23fa338c01c913d9` | 504705 |
| [`step4-empty.jpg`](step4-empty.jpg) | The comparison state before two cards are chosen, and its one clear action | `b28768b4de0f72af9f6958133a61010430e290697e2b1170df4136042e0d5885` | 632059 |

The digests pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or
legal status. The corpus must derive from its own approved material, never from these. Per-board
inspection findings and the exact prompt bytes' hashes are in the
[register](../../../provenance/assets/design-reference-product-card-comparison.md).

## Exact generation prompts

### `step1-cards.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern industrial-design hardware benchmark catalogue UI, "Rig Selection Board" (Dieter Rams / Braun / Teenage Engineering inspired), Step 1: The Card Catalogue in ANODIZED ALUMINIUM & COBALT DAYLIGHT MODE (#f3f4f6 brushed aluminium light grey page ground reaching all four edges, #ffffff precision spec cards with 1px #d1d5db hairline borders, #111827 crisp technical sans/monospace ink, industrial cobalt-blue #0284c7 primary accent for actionable controls). Controls row above the grid: search input, Category select ("Category: Graphics cards"), Sort select ("Sort by: Price low to high"), and count "24 cards". Below it, one symmetrical row of exactly THREE hardware cards side by side ("Vector VX-4070", "Northwind Arc A770", "Halcyon RX-7800"), each with a studio GPU render, aligned three-row tabular spec list (Memory 12 GB, Power draw 200 W, Warranty 3 years), price (£549, £629, £479), filled cobalt "Select" button, and outline "Compare" checkbox toggle (first card checked with 2px cobalt outline).
```

### `step2-compare.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern industrial-design hardware benchmark catalogue UI, "Rig Selection Board", Step 2: Side-by-Side Comparison in ANODIZED ALUMINIUM & COBALT DAYLIGHT MODE (#f3f4f6 brushed aluminium page ground reaching all four edges, #ffffff comparison matrix table with 1px #d1d5db grid hairlines, #111827 technical ink, industrial cobalt #0284c7 primary buttons and winner checkmarks). Heading "Comparing 3 cards" with "Clear comparison" link at right and summary bar "Cheapest 2 of 3 on price". Comparison matrix aligns 8 attribute rows (Price, Chipset, Memory, Power draw, Length, Warranty, Score, Availability) across the three GPU columns ("Vector VX-4070", "Northwind Arc A770", "Halcyon RX-7800"). Best values in each row carry a cobalt check badge; two cells include inline notes ("3 slots needed", "adapter included"). Each column foot has a filled cobalt button "Select this card".
```

### `step3-selected.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern industrial-design hardware benchmark catalogue UI, "Rig Selection Board", Step 3: The Selection Carried Forward in WORKSTATION GRAPHITE DARK MODE (#111317 neutral anodized graphite page ground reaching all four edges, #1c2026 elevated build card surface with #2e3440 border, #f3f4f6 crisp white ink, electric sky-cobalt #38bdf8 primary button, #22c55e emerald confirmation line). Main confirmation panel headed "Your selection" displays a green badge "Selected card carried into your build", the chosen GPU card "Northwind Arc A770" with four aligned spec rows (Memory 16 GB, Power draw 225 W, Length 280 mm, Warranty 3 years), price £629, "Score 8.7 / 10", "Change selection" link, and primary cobalt button "Continue with this card". Right-hand narrower panel "Still comparing" lists the two remaining compared cards with "Remove" buttons and note "Your comparison is kept until you clear it".
```

### `step4-empty.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern industrial-design hardware benchmark catalogue UI, "Rig Selection Board", Step 4: The Empty Comparison State in ANODIZED ALUMINIUM & COBALT DAYLIGHT MODE (#f3f4f6 brushed aluminium page ground reaching all four edges, #ffffff cards with #d1d5db borders, #111827 ink, #0284c7 cobalt accent). Flat top header with "Rig Selection Board" at left and three links (Catalogue, Compare, Selection) at right — no sidebar, no avatar, no bell. Heading "Comparing cards". Centered empty-state panel shows a minimal technical diagram of two spec cards joined by a dashed line, heading "Choose two cards to compare", copy "Select Compare on any two cards and their attributes will line up here, row by row.", cobalt link "Back to the catalogue", and disabled button "Compare selected" with note "Select two cards first". Below, counter "0 of 3 selected to compare" and one symmetrical row of three GPU cards ("Vector VX-4070", "Northwind Arc A770", "Halcyon RX-7800") with unchecked Compare toggles.
```

The empty comparison board is the state that proves the comparison is real state rather than a layout:
with nothing chosen there is nothing to compare, and the page says which action fixes that.
