# Web shop — illustrative empty-cart visual reference

- **Archetype:** `web-shop`; a heritage orchard's farm-gate cider shop, an in-family training archetype (`tr-02`, one of the sixteen in [`src/eval/prereg.mjs`](../../../../src/eval/prereg.mjs)), not one of the five evaluation families. Its brief asserts an empty-cart contract: checkout is prevented with an accessible alert and a path back to the catalogue ([`plan.md`](plan.md:84), assertions `tr-02`/`fam-02`).
- **Generation:** 2026-10-13 UTC by `scripts/generate-archetype-boards.mjs --write --only web-shop`, which passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway (`https://gemini.int.exe.xyz/v1beta/models/gemini-nano-banana-2.1:generateContent`, overridable with `MWG_TRAIN_IMAGE_ENDPOINT`) and fails closed unless the response's `modelVersion` equals the requested model, so the board is gateway-attested `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; it returned a 1376 × 768 JPEG. The prompt digest is recorded in the provenance register below and in [`docs/provenance/assets/design-reference-web-shop.md`](../../../provenance/assets/design-reference-web-shop.md), so this brief can be re-run against the same bytes.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning references, neither generated-site captures nor sealed evaluation targets. Do not use them as corpus inputs, teacher outputs, conformance evidence, or training/evaluation data.
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md) prohibit using AI-generated service content to develop machine-learning models. No separate image reuse/license clearance, exclusive rights, or a seed were supplied, and no seed is set, so this board is non-reproducible. Publishing it for operator review does not grant training or commercial reuse permission.
- **Depicted content:** Shop name, product names, prices, the zero-item cart badge and every caption line are illustrative, unverified placeholders. The JPEG does not prove a working catalogue, cart, checkout guard or accessible alert; the empty-cart prevention behaviour is asserted by the brief and its verifiers, not by this picture.
- **Why this one state:** the brief's asserted states that a board can depict are the empty cart and the checkout refusal; of those, the corpus's parity and journey work names the empty cart (`tr-02`, [`plan.md`](plan.md):84). Error and payment states are **not** pictured and must not be inferred from this image.
- **Where the state renders:** the brief's route table lists `/cart`; every generated web-shop renders its cart there, and the empty cart is that page's initial state. `board-states.json` maps this board to `/cart` so a capture that reaches the route compares against it.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-empty.jpg`](step1-empty.jpg) | Empty cart with disabled checkout and a path back to the ciders | `9be759c4b80d5e2744a0cae5003cfc9f5b4dca11476879318c9d6b8a65ffe41d` | 366555 |

Hashes pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or legal status. The corpus must derive from its own approved source and measured records, not these images.

## Exact generation prompts

### `step1-empty.jpg`

```text
High-fidelity, production-quality full-bleed edge-to-edge web canvas with no floating window and no exterior drop shadow of a modern web application UI for a heritage orchard's farm-gate cider shop, "Orchard Row Press". Step 1: Empty Cart. Dark slate theme (#0f172a page background, #1e293b card surface, emerald green #10b981 accent). The cart page shows a small breadcrumb back to the ciders list, the heading "Your order", and a calm empty-state card: a simple line illustration of a wicker basket, the message "No bottles in your order yet", one short line explaining that checkout opens once a bottle is added, and a prominent emerald "Browse the ciders" action that returns to the catalogue. Beneath the card, the checkout control is visibly disabled with the accessible note "Checkout opens once your order has at least one bottle". The shop header carries the orchard name and a cart badge showing 0. Modern typography, generous padding, accessible contrast.
```
