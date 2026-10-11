# Provenance: booking visual reference boards

- **Status:** illustrative AI-generated visual reference, **not approved as training data, not a conformance
  target, and not an input to any generator**.
- **Origin:** REGENERATED 2026-10-11 UTC with `model: gemini-nano-banana-2.1` passed explicitly, replacing the 2026-10-09 boards generated with `gemini-3-pro-image` and no explicit model (owner-rejected on sight; bead `mwg-train-c1c`). Produced by `scripts/generate-archetype-boards.mjs`, which fails closed unless the gateway attests the requested model in its `modelVersion` response field; all five boards are attested `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192. Original prompts unchanged, authored to produce high-fidelity desktop browser application mockups matching `layout-storefront.jpg` density and typography.
- **Rights:** no claim of CC0, model-output exclusivity, provider permission for training, or legal clearance is
  made. Output-use and training terms need review before any reuse beyond this project's planning
  documentation.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`, as declared in
  [`README.md`](../../design/archetypes/booking/README.md) and enforced by
  `test/design-reference.test.mjs`.
- **Boundary:** these boards illustrate a visual language for the `booking` archetype. They are **not** the
  sealed A6 evaluation target (`docs/eval/targets/booking/`), and no target, corpus or generator may treat them
  as conformance evidence. The screens they depict contain model-generated placeholder names, prices and seat
  labels.

| Board | Purpose | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| [`step1-browse.jpg`](../../design/archetypes/booking/step1-browse.jpg) | weekly timetable browse with search and category chips | `3a7f56d2fc42661a89d067a301c2035dbb89804bacb2533d28d0e745afdf5c11` | 525042 |
| [`step2-form.jpg`](../../design/archetypes/booking/step2-form.jpg) | multi-step details and seat selection with a summary card | `73633dd4b1c0a5ae877ec8bdcbe41c1260c4fbf48d25a3f9fac64e1884615074` | 517592 |
| [`step3-confirmation.jpg`](../../design/archetypes/booking/step3-confirmation.jpg) | verified booking pass and digital receipt | `1b65cd87c9c693be2a159a3f3ead25ae32c4f3faaec664ea7d80684fce6e31ef` | 394097 |
| [`step4-error.jpg`](../../design/archetypes/booking/step4-error.jpg) | accessible validation and conflict error states | `d018d5b50bae312f497445e3e449191ea8c3ac6cccbd5c6058463d738e7d06f8` | 466358 |
| [`step5-empty.jpg`](../../design/archetypes/booking/step5-empty.jpg) | honest empty state with recovery actions | `6eae324018056198c8020855961eeb734db79f403355035ed36147c078540b3e` | 447870 |

**Reproduction boundary:** image generation is stochastic; these hashes verify the committed bytes, not
reproducibility from the same prompt. The journey the boards describe - timetable browse, seat selection,
receipt, error and empty states - is **richer than the archetype's functional contract** in
`docs/eval/specs/booking.json`, which fixes the fields, routes and journey the demos must satisfy; the design
language is reusable, the invented functionality is not.
