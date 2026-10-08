# Provenance: rough design layout boards

- **Status:** illustrative AI-generated concepts, **not approved as training data**.
- **Origin:** generated on 2026-10-08 with the signed-in Google Antigravity image tool, default `gemini-3-pro-image`, from original prompts by this project lane. No third-party page or provided photograph was used as a visual reference. The tool returned JPEG bytes; filenames use `.jpg` accordingly.
- **Rights:** no claim of CC0, model-output exclusivity, provider permission for training, or legal clearance is made. Output-use/training terms need review before any reuse beyond this project's planning documentation.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Keep separate from A1/A6 target designs and generated code examples; never treat the images as conformance evidence. Text and prices inside them are model-generated placeholders and may be inaccurate.

| Board | Purpose | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| [`layout-storefront.jpg`](../../design/layout-storefront.jpg) | object-ledger commerce composition | `7e882799b48401bbdfc72b0f820be0878ed61b4ccac580d7bb827f29dcbf2db1` | 567307 |
| [`layout-saas.jpg`](../../design/layout-saas.jpg) | decision-workbench comparison and signup | `e26e969a359a73c8da35771a8a7e29572ebc6a67a42aafb99e1027c6e26ce4c7` | 550861 |
| [`layout-explainer.jpg`](../../design/layout-explainer.jpg) | field-notes reading and interactive explanation | `41c15ca19fc9317bdca59dc53677f4d0c5fb5e80d83e969a03f51b6ba113668e` | 712421 |

**Reproduction boundary:** image generation is stochastic; these hashes verify the committed bytes, not reproducibility from the same prompt. The prompts are recorded in the generating tool call history; a later production asset needs a fresh prompt, separate provenance and content check. `test/design-language.test.mjs` checks these exact files and their exclusion markers without invoking image generation.
