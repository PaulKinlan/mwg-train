# Catalogue — illustrative multi-step visual references

- **Archetype:** `catalogue`; browse/product grid, cart review, and empty search state.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below are UNCHANGED from Wave 2 and the generator reads them out of this file, refusing to run unless they reproduce the digest register byte-for-byte - with one recorded exception. `step3-empty.jpg`'s prompt was AMENDED on 2026-10-11 (bead `mwg-train-6n77`) to state the unframed requirement explicitly, because the board it produced showed the page inside a rounded panel floating on a ground: a presentation frame that the frame gate cannot see, since it looks only for macOS-style traffic lights. The first attempt appended that requirement to the end of the original prompt; its output was reported by the generator as 400756 bytes, but the worktree's file held the original bytes again afterwards, so what that attempt actually rendered is not established and this record does not claim it was framed. The prompt was then rewritten to lead with the requirement and to disambiguate the palette roles, which is what the earlier wording left open - the original said "Dark slate theme (#0f172a, card surface #1e293b)", and a model reading that can paint #0f172a as a ground and put the whole application on a #1e293b card, which is what the board on disk shows. The register carries the amended digest beside the amended bytes, and the other eight Wave 2 prompts are untouched.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning references, neither generated-site captures nor sealed evaluation targets. Do not use them as corpus inputs, teacher outputs, conformance evidence, or training/evaluation data.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md) prohibit using AI-generated service content to develop machine-learning models. No separate image reuse/license clearance, exclusive rights, or a seed were supplied; the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible. Publishing these references for operator review does not grant training or commercial reuse permission.
- **Depicted content:** Products, category counts, prices, inventory, totals, shipping promise and checkout buttons are illustrative, unverified placeholders. The JPEGs do not prove a functional search, cart, checkout, responsive implementation or accessible controls. Their pictured flow is broader than the frozen catalogue archetype contract.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-grid.jpg`](step1-grid.jpg) | Product browse grid and category/search controls | `d67e02068c0ac84bf178f3a58b468be1f68b0fd45976177a7d1536078e21a383` | 541719 |
| [`step2-cart.jpg`](step2-cart.jpg) | Cart drawer and order summary | `13a1e108161d5b35d94d3b70058293f94a0468d96e4097bc3e40e60413f42306` | 463222 |
| [`step3-empty.jpg`](step3-empty.jpg) | Empty search results and reset option | `c564732d825446943215fb65d507ecf0a937dd01f36dad15dcfa0d5dc3c32246` | 394902 |

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
Full-bleed desktop screenshot of a web application's own viewport: an online artisanal ceramics catalogue, Empty Search State. The application fills the entire 1376x768 frame edge to edge - no browser window, no OS title bar or traffic lights, no device frame, no page container, no rounded panel around the page, no surrounding background margin and no drop shadow around the interface. The only background visible is the application's own page colour (#0f172a), and it reaches all four edges. On that page: a top search input populated with the query 'porcelain teapot', category filters intact, and, centred within the page, a card (surface #1e293b) showing a clean modern illustration of an empty shelf or ceramic bowl, clear heading 'No ceramics match \"porcelain teapot\"', helpful suggestion 'Try searching for bowls, vases, or browse our latest pottery collection', and action button 'Reset Search'. Clean responsive web design, generous padding.
```
