# account-recovery asset set

The shared assets for the `account-recovery` archetype: what every framework build for it draws
from, so two builds of this archetype render the same brand, the same palette and the same imagery.

**Do not edit by hand.** This set is an EXTRACTION from the accepted target at
`docs/design/archetypes/account-recovery`, written by `scripts/build-archetype-assets.mjs`. The crafted
target design is the source of truth; the set is pulled out of it. Edit the target, then re-run:

```bash
node scripts/build-archetype-assets.mjs --write --only account-recovery
```

## What it contains

| Part | Where | Extracted from |
| --- | --- | --- |
| Brand, palette, typography, copy | `set.json` | `docs/design/archetypes/account-recovery/README.md` and the `demo/` documents |
| State imagery | `images/` | the target's own step boards |

**Rights are inherited, not asserted here.** `excluded_from_training: true`, `approved_for_training: false`, from [`docs/design/archetypes/account-recovery/README.md:5`](../../../docs/design/archetypes/account-recovery/README.md:5). These are design-planning references: they are not corpus, not teacher output, and not evidence that any depicted flow works.

## Brand

The accepted target is deliberately unbranded: it names no site, and the store records that instead of inventing one.

- `Account recovery` — from `docs/design/archetypes/account-recovery/demo/index.html:7` (demo-title, weak candidate)
- `Reset Your Password` — from `docs/design/archetypes/account-recovery/demo/index.html:16` (demo-heading, weak candidate)


Recorded on 2026-10-11: deliberately unbranded. The accepted target depicts an unbranded journey: its demo carries no brand element, its own heading is 'Reset Your Password', and its README names no site. The store records the absence rather than inventing a brand the design never had - a framework build for this archetype should look like the target, and the target has no site name to render.

## The one hand-written file

`decisions.json` is the only file here that is not generated, and it exists only where the target does not speak
with one voice about its own brand: it records which candidate was chosen - or that the target is deliberately
unbranded - why, and when, so the ambiguity is adjudicated in the open instead of being resolved by whichever value
the extractor happened to read last. When the target stops being ambiguous the decision becomes stale and
`check:archetype-assets` fails until it is deleted.

