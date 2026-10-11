# Provenance: booking visual reference boards

- **Status:** illustrative AI-generated visual reference, **not approved as training data, not a conformance
  target, and not an input to any generator**.
- **Origin:** REGENERATED 2026-10-11 UTC with `model: gemini-nano-banana-2.1` passed explicitly, replacing the 2026-10-09 boards generated with `gemini-3-pro-image` and no explicit model (owner-rejected on sight; bead `mwg-train-c1c`). Produced by `scripts/generate-archetype-boards.mjs`, which fails closed unless the gateway attests the requested model in its `modelVersion` response field; all five boards are attested `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192. Original prompts unchanged, authored to produce high-fidelity desktop browser application mockups matching `layout-storefront.jpg` density and typography. The attestation is a property of the gateway's own response, not a cryptographic proof about the pixels: it records the model the service states it executed, and nothing here should be read as reproducing these bytes from a prompt, since no seed was set.
- **Observed placeholder artefacts, inspected and accepted:** an independent vision review of this 2026-10-11 set found no corrupted text in a primary position anywhere - the defect class that caused the previous set's rejection - and reported one cosmetic quirk, left uncorrected because re-rolling a board for illustrative noise would discard a board that is otherwise correct: `step2-form.jpg` renders desks `A3` and `B3` both as selected, where the prompt specifies only `B3`. `step1-browse.jpg` and `step3-confirmation.jpg` were each retried once to clear a corrupted subtitle and a misrendered booking reference respectively; the reference they now show, `#BK-92841`, matches both the prompt and the URL bar on the same board.
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
| [`step1-browse.jpg`](../../design/archetypes/booking/step1-browse.jpg) | weekly timetable browse with search and category chips | `b43851e30368d98b2508758983165c9d104e95990826371cd64c88354ede2462` | 500442 |
| [`step2-form.jpg`](../../design/archetypes/booking/step2-form.jpg) | multi-step details and seat selection with a summary card | `230848d3bd282e7c2cecadea52418cdfd794c0dad8b1e1499c8b360d1992e48e` | 492023 |
| [`step3-confirmation.jpg`](../../design/archetypes/booking/step3-confirmation.jpg) | verified booking pass and digital receipt | `31e6ed730371b55a9414c00680c04ce64d43219ca36518dc37e10b2b3f4953d8` | 406153 |
| [`step4-error.jpg`](../../design/archetypes/booking/step4-error.jpg) | accessible validation and conflict error states | `0b7e463903a1b7c0994ad92513a4087aec8aed5d05cf76b8bab75ad5e815fc72` | 446021 |
| [`step5-empty.jpg`](../../design/archetypes/booking/step5-empty.jpg) | honest empty state with recovery actions | `cf586e1d6f2c2faefa603d0be4fb8b4c7b2f73375e69b23ae44b41931f07170e` | 455551 |

**Reproduction boundary:** image generation is stochastic; these hashes verify the committed bytes, not
reproducibility from the same prompt. The journey the boards describe - timetable browse, seat selection,
receipt, error and empty states - is **richer than the archetype's functional contract** in
`docs/eval/specs/booking.json`, which fixes the fields, routes and journey the demos must satisfy; the design
language is reusable, the invented functionality is not.
