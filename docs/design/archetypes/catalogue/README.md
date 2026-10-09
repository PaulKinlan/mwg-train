# Catalogue — illustrative multi-step visual references

- **Archetype:** `catalogue`; browse/product grid, cart review, and empty search state.
- **Generation:** 2026-10-09 UTC, via the Google Antigravity OAuth `generate_image` tool. The generating lane reports the default image model as `gemini-3-pro-image`; the tool calls omitted an explicit `model` parameter and their responses reported file paths, not an attested model ID. Each requested `aspectRatio: "16:9"` and returned a 1376 × 768 JPEG. The prompts below are copied verbatim from the recorded tool-call arguments, including literal backslashes where present.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning references, neither generated-site captures nor sealed evaluation targets. Do not use them as corpus inputs, teacher outputs, conformance evidence, or training/evaluation data.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md) prohibit using AI-generated service content to develop machine-learning models. No separate image reuse/license clearance, exclusive rights, or reproducible generation settings/seed were supplied. Publishing these references for operator review does not grant training or commercial reuse permission.
- **Depicted content:** Products, category counts, prices, inventory, totals, shipping promise and checkout buttons are illustrative, unverified placeholders. The JPEGs do not prove a functional search, cart, checkout, responsive implementation or accessible controls. Their pictured flow is broader than the frozen catalogue archetype contract.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-grid.jpg`](step1-grid.jpg) | Product browse grid and category/search controls | `456797ff0dc2a65d988e165cdd4216cbbeac377de725f70bca60fe146eafab9c` | 584268 |
| [`step2-cart.jpg`](step2-cart.jpg) | Cart drawer and order summary | `4ae6bd190c913e72933e1f2bff49cfe9fa241b50940a516d4024157b7fc3aae8` | 470070 |
| [`step3-empty.jpg`](step3-empty.jpg) | Empty search results and reset option | `22444d6ba74ba644c53a6fc70aa34fba7a043978ed2177cff2622bf3f6e0ae93` | 390955 |

Hashes pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or legal status. The corpus must derive from its own approved source and measured records, not these images.

## Exact generation prompts

### `step1-grid.jpg`

```text
Modern web application UI for an online artisanal ceramics & homeware catalogue. Step 1: Product Grid & Filtering. Dark slate theme (#0f172a, card surface #1e293b, action accent #10b981). Clean layout featuring top search bar, category chips (Vases, Tableware, Planters, Lighting), sort dropdown, and a 3-column product grid with high-quality pottery cards showing image, title, price, in-stock badge, and quick 'Add to Cart' action. Compact sticky cart indicator in top nav showing item count. Modern typography, generous margins, crisp system font feel.
```

### `step2-cart.jpg`

```text
Modern web application UI for an online artisanal ceramics catalogue, Step 2: Slide-out Cart Drawer & Order Review. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Background shows dimmed product grid. Foreground displays modern slide-over cart drawer containing 2 items (Artisanal Ceramic Tableware £19.99, Rustic Vase £23.90) with quantity steppers (- 1 +), trash remove icon, subtotal £43.89, shipping notice 'Free shipping over £40 applied', and prominent 'Proceed to Checkout' button. Crisp modern typography, generous margins, accessible contrast.
```

### `step3-empty.jpg`

```text
Modern web application UI for an online artisanal ceramics catalogue, Empty Search State. Dark slate theme (#0f172a, card surface #1e293b). Shows top search input populated with query 'porcelain teapot', category filters intact, and a centered card showing a clean modern illustration of an empty shelf or ceramic bowl, clear heading 'No ceramics match \"porcelain teapot\"', helpful suggestion 'Try searching for bowls, vases, or browse our latest pottery collection', and action button 'Reset Search'. Clean responsive web design, generous padding.
```
