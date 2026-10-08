# Provenance: rough design layout boards

- **Status:** illustrative AI-generated concepts, **not approved as training data**.
- **Origin:** generated on 2026-10-08 using `gemini-nano-banana-2.1` through `https://gemini.int.exe.xyz/v1beta/models/gemini-nano-banana-2.1:generateContent` with original text prompts by this project lane. The proxy injects the signed-in account credentials; no credential was sent or committed here. No third-party page or supplied photograph was used as a visual reference. The model returned JPEG bytes; filenames use `.jpg` accordingly.
- **Rights:** no claim of CC0, model-output exclusivity, provider permission for training, or legal clearance is made. Output-use/training terms need review before any reuse beyond this project's planning documentation.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Keep separate from A1/A6 target designs and generated code examples; never treat the images as conformance evidence. Text and prices inside them are model-generated placeholders and may be inaccurate.

| Board | Purpose | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| [`layout-storefront.jpg`](../../design/layout-storefront.jpg) | object-ledger commerce composition | `7f772a7f5f0cbd2209b2e8045d0432dca3cb80cafa1329e4eeba14970b178ac8` | 583606 |
| [`layout-saas.jpg`](../../design/layout-saas.jpg) | decision-workbench comparison and signup | `dd6f6a8f765de0d10c1b23d5fd25f846909600592389c4de328bbe690a78a797` | 547529 |
| [`layout-explainer.jpg`](../../design/layout-explainer.jpg) | field-notes reading and interactive explanation | `2b94d83badbee2529a8d7adc02edafb6af59b162bd2c1f94280a62f74b6184a5` | 611586 |

**Reproduction boundary:** image generation is stochastic; these hashes verify the committed bytes, not reproducibility from the same prompt. Prompt gist per board: storefront = asymmetrical ceramic product grid, variant picker and compact cart, mineral-white/charcoal/cobalt; SaaS = three-tier comparison, billing selector and workspace signup, cool-white/navy/turquoise; explainer = urban-tree wiki reading column with search/TOC, before/after diagram and slider, gray/forest-ink/orange. Each prompt explicitly requested fictional/placeholder content and no real brands or claims. A later production asset needs a fresh prompt, separate provenance and content check. `test/design-language.test.mjs` checks these exact files and their exclusion markers without invoking image generation.
