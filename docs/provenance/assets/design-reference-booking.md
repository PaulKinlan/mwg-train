# Provenance: booking visual reference boards

- **Status:** illustrative AI-generated visual reference, **not approved as training data, not a conformance
  target, and not an input to any generator**.
- **Origin:** generated on 2026-10-09 using `gemini-3-pro-image` via Google Antigravity OAuth image generation tool. Original prompts authored to produce high-fidelity desktop browser application mockups matching `layout-storefront.jpg` density and typography.
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
| [`step1-browse.jpg`](../../design/archetypes/booking/step1-browse.jpg) | weekly timetable browse with search and category chips | `941d3ca9d19e34b2025eaa1dae3570f7e97d3218f4737a3ef899249674727e4b` | 425903 |
| [`step2-form.jpg`](../../design/archetypes/booking/step2-form.jpg) | multi-step details and seat selection with a summary card | `4767765102ff750b3f9521c1a159b24e5710367cfaea88b809f987558117a5a8` | 453206 |
| [`step3-confirmation.jpg`](../../design/archetypes/booking/step3-confirmation.jpg) | verified booking pass and digital receipt | `daf301bdcbe8cf040acc5faeb30fc5a8db86843d8ae0cc45e74fab6d8fdd5a5f` | 441793 |
| [`step4-error.jpg`](../../design/archetypes/booking/step4-error.jpg) | accessible validation and conflict error states | `5cc76aabb6e16cb2b8b5f079d84c2ebb6dfdc3a34d557786af4b54836427ac07` | 478909 |
| [`step5-empty.jpg`](../../design/archetypes/booking/step5-empty.jpg) | honest empty state with recovery actions | `0b553968c4cdc90638daf11e3ebfc6240178946f5bfffe28da19f4a1db7ce58f` | 459349 |

**Reproduction boundary:** image generation is stochastic; these hashes verify the committed bytes, not
reproducibility from the same prompt. The journey the boards describe - timetable browse, seat selection,
receipt, error and empty states - is **richer than the archetype's functional contract** in
`docs/eval/specs/booking.json`, which fixes the fields, routes and journey the demos must satisfy; the design
language is reusable, the invented functionality is not.
