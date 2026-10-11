# event-registration asset set

The shared assets for the `event-registration` archetype: what every framework build for it draws
from, so two builds of this archetype render the same brand, the same palette and the same imagery.

**Do not edit by hand.** This set is an EXTRACTION from the accepted target at
`docs/design/archetypes/event-registration`, written by `scripts/build-archetype-assets.mjs`. The crafted
target design is the source of truth; the set is pulled out of it. Edit the target, then re-run:

```bash
node scripts/build-archetype-assets.mjs --write --only event-registration
```

## What it contains

| Part | Where | Extracted from |
| --- | --- | --- |
| Brand, palette, typography, copy | `set.json` | `docs/design/archetypes/event-registration/README.md` and the `demo/` documents |
| State imagery | `images/` | the target's own step boards |

**Rights are inherited, not asserted here.** `excluded_from_training: true`, `approved_for_training: false`, from [`docs/design/archetypes/event-registration/README.md:5`](../../../docs/design/archetypes/event-registration/README.md:5). These are design-planning references: they are not corpus, not teacher output, and not evidence that any depicted flow works.

## Brand

**Future Web 2026**

- `Future Web 2026` — from `docs/design/archetypes/event-registration/demo/index.html:7` (demo-title, weak candidate)
- `Future Web 2026` — from `docs/design/archetypes/event-registration/demo/index.html:15` (demo-heading, weak candidate)


Adjudicated on 2026-10-11: **Future Web 2026**. The accepted target has no brand element. Its demo's own h1 names the event - 'Future Web 2026', with '24-25 October - Barbican Centre, London' - and for an event-registration site the event is the site's name. The candidate is weak (a heading can be a page title), which is exactly why the choice is recorded here with its evidence rather than extracted silently.

## The one hand-written file

`decisions.json` is the only file here that is not generated, and it exists only where the target does not speak
with one voice about its own brand: it records which candidate was chosen - or that the target is deliberately
unbranded - why, and when, so the ambiguity is adjudicated in the open instead of being resolved by whichever value
the extractor happened to read last. When the target stops being ambiguous the decision becomes stale and
`check:archetype-assets` fails until it is deleted.

