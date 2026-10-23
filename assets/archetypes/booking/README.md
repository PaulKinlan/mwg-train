# booking asset set

The shared assets for the `booking` archetype: what every framework build for it draws
from, so two builds of this archetype render the same brand, the same palette and the same imagery.

**Do not edit by hand.** This set is an EXTRACTION from the accepted target at
`docs/design/archetypes/booking`, written by `scripts/build-archetype-assets.mjs`. The crafted
target design is the source of truth; the set is pulled out of it. Edit the target, then re-run:

```bash
node scripts/build-archetype-assets.mjs --write --only booking
```

## What it contains

| Part | Where | Extracted from |
| --- | --- | --- |
| Brand, palette, typography, copy | `set.json` | `docs/design/archetypes/booking/README.md` and the `demo/` documents |
| State imagery | `images/` | the target's own step boards |

**Rights are inherited, not asserted here.** `excluded_from_training: true`, `approved_for_training: false`, from [`docs/design/archetypes/booking/README.md:7`](../../../docs/design/archetypes/booking/README.md). These are design-planning references: they are not corpus, not teacher output, and not evidence that any depicted flow works.

## Brand

**Evening Class Studio**

- `Learning Hub` — from `docs/design/archetypes/booking/demo/index.html:13` (demo-brand-element, strong candidate)
- `Evening Class Studio` — from `docs/design/archetypes/booking/README.md:1` (target-heading, strong candidate)
- `Evening Class Booking` — from `docs/design/archetypes/booking/demo/index.html:7` (demo-title, weak candidate)
- `Find Your Next Evening Class` — from `docs/design/archetypes/booking/demo/index.html:39` (demo-heading, weak candidate)

The target states more than one brand, and the recorded decision keeps both rather than deleting one: **Evening Class Studio** is the primary brand a build renders, and these are supported variants of the same archetype:

- `Learning Hub` — the brand stated by `confirmation.html`, `empty.html`, `index.html`

Adjudicated on 2026-10-13: **Evening Class Studio** (supported variants: `Learning Hub`). Owner decision (Paul Kinlan, 2026-10-13): 'we probably need both'. The booking archetype keeps both brands rather than resolving to one: 'Evening Class Studio' is the primary brand, the name in this archetype's own heading and on all five reference boards, and 'Learning Hub' is a supported variant of the same archetype - the brand the interactive demo's product pages state in their own titles. A build renders the primary brand unless it is deliberately building the Learning Hub variant, and the demo is not drift to be renamed.

## The one hand-written file

`decisions.json` is the only file here that is not generated, and it exists only where the target does not speak
with one voice about its own brand: it records which candidate is the primary brand - or that the target is
deliberately unbranded - which candidates are supported variants that coexist with it, why, and when, so the
ambiguity is adjudicated in the open instead of being resolved by whichever value the extractor happened to read
last. When the target stops being ambiguous the decision becomes stale and
`check:archetype-assets` fails until it is deleted.

