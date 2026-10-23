# contact-lead asset set

The shared assets for the `contact-lead` archetype: what every framework build for it draws
from, so two builds of this archetype render the same brand, the same palette and the same imagery.

**Do not edit by hand.** This set is an EXTRACTION from the accepted target at
`docs/design/archetypes/contact-lead`, written by `scripts/build-archetype-assets.mjs`. The crafted
target design is the source of truth; the set is pulled out of it. Edit the target, then re-run:

```bash
node scripts/build-archetype-assets.mjs --write --only contact-lead
```

## What it contains

| Part | Where | Extracted from |
| --- | --- | --- |
| Brand, palette, typography, copy | `set.json` | `docs/design/archetypes/contact-lead/README.md` and the `demo/` documents |
| State imagery | `images/` | the target's own step boards |

**Rights are inherited, not asserted here.** `excluded_from_training: true`, `approved_for_training: false`, from [`docs/design/archetypes/contact-lead/README.md:5`](../../../docs/design/archetypes/contact-lead/README.md). These are design-planning references: they are not corpus, not teacher output, and not evidence that any depicted flow works.

## Brand

**ARKHITECTS Studio**

- `ARKHITECTS Studio` — from `docs/design/archetypes/contact-lead/demo/index.html:48` (demo-brand-element, strong candidate)
- `ARKHITECTS Studio` — from `docs/design/archetypes/contact-lead/demo/index.html:7` (demo-title, weak candidate)
- `ARKHITECTS Studio` — from `docs/design/archetypes/contact-lead/demo/index.html:73` (demo-heading, weak candidate)



## The one hand-written file

`decisions.json` is the only file here that is not generated, and it exists only where the target does not speak
with one voice about its own brand: it records which candidate is the primary brand - or that the target is
deliberately unbranded - which candidates are supported variants that coexist with it, why, and when, so the
ambiguity is adjudicated in the open instead of being resolved by whichever value the extractor happened to read
last. When the target stops being ambiguous the decision becomes stale and
`check:archetype-assets` fails until it is deleted.

