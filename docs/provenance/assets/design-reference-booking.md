# Provenance: booking visual reference boards

- **Status:** illustrative AI-generated visual reference, **not approved as training data, not a conformance
  target, and not an input to any generator**.
- **Origin, split into what is known and what is only claimed.** The bytes are committed here and verified:
  `test/design-reference.test.mjs` recomputes each digest below. The generation is **reported by
  `mwg-train-coord`** as having used Nano Banana (an image model); the exact model id, endpoint, prompts and
  generation date are **not stated anywhere in this repository, and this lane did not generate the images**.
  That gap is recorded rather than filled in: a provenance record asserting a model, prompt or date it cannot
  substantiate would be worse than one that names the hole. Closing it needs the generating lane to confirm the
  model id and prompts, as `design-layouts.md` does for the earlier boards.
- **Rights:** no claim of CC0, model-output exclusivity, provider permission for training, or legal clearance is
  made. Output-use and training terms need review before any reuse beyond this project's planning
  documentation.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`, as declared in
  [`README.md`](../../design/archetypes/booking/README.md) and now enforced by
  `test/design-reference.test.mjs` rather than left as prose.
- **Boundary:** these boards illustrate a visual language for the `booking` archetype. They are **not** the
  sealed A6 evaluation target (`docs/eval/targets/booking/`), and no target, corpus or generator may treat them
  as conformance evidence. The screens they depict contain model-generated placeholder names, prices and seat
  labels.

| Board | Purpose | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| [`step1-browse.jpg`](../../design/archetypes/booking/step1-browse.jpg) | weekly timetable browse with search and category chips | `28a0a800a95c43a2438ec705fdf4870576294c48e9f7e5bcae3bf5e3165ee010` | 545209 |
| [`step2-form.jpg`](../../design/archetypes/booking/step2-form.jpg) | multi-step details and seat selection with a summary card | `8b287a45bce89a120df1e6f28c9db1a312146cafdb41650e1b52b6a8853b0fff` | 480060 |
| [`step3-confirmation.jpg`](../../design/archetypes/booking/step3-confirmation.jpg) | verified booking pass and digital receipt | `7af6ced0121c3705c64134fabdbe00c805024388eabb11b184035323b7c402e4` | 447912 |
| [`step4-error.jpg`](../../design/archetypes/booking/step4-error.jpg) | accessible validation and conflict error states | `a87a6249167f60cc7a049d2d9f8c614fc83737335a281b642990b5f2820cfbd1` | 410871 |
| [`step5-empty.jpg`](../../design/archetypes/booking/step5-empty.jpg) | honest empty state with recovery actions | `adbaa0f41b1c3c5567404d84246ce48e8854ec1a79236165119faf2c775888ce` | 429052 |

**Reproduction boundary:** image generation is stochastic; these hashes verify the committed bytes, not
reproducibility from the same prompt. The journey the boards describe - timetable browse, seat selection,
receipt, error and empty states - is **richer than the archetype's functional contract** in
`docs/eval/specs/booking.json`, which fixes the fields, routes and journey the demos must satisfy; the design
language is reusable, the invented functionality is not.
