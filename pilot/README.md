# pilot/projects/ — the materialized measured corpus

This directory holds the **materialized** trees of the pilot corpus: the generated project sites.
They are **outputs, not sources** — the single source of truth is [`plan.json`](plan.json) plus the
generator ([`generate.mjs`](generate.mjs), with [`archetypes.mjs`](archetypes.mjs) and
[`frameworks.mjs`](frameworks.mjs)). Regenerating from the plan reproduces every tree
byte-for-byte, and `npm run check:pilot-corpus` proves it against the recorded hashes in
[`CORPUS.json`](CORPUS.json). Not every planned tree is necessarily materialized on disk — arms
added after the last write exist in the plan and the record, and are materialized on demand (the
corpus viewer does this, verifying against the recorded SHA).

## Why a generator is the source, not these directories

If the checked-in trees were the source, they could drift from what was measured: an edit to a
project after the run would leave the recorded numbers describing a tree that no longer exists —
a false green. With the plan as the source, the measured artefact is *reproducible*, the record is
*verifiable*, and a tree that cannot be reproduced to its recorded SHA is treated as broken, not
silently served. (The corpus viewer enforces this: it serves the plan-materialized trees after
verifying them against `CORPUS.json`, and refuses anything that doesn't reproduce.)

## Composition: 5 archetypes × 7 rendering arms

Each archetype is one realistic site shape with its own journeys and seeded defects; each is
rendered through five arms so the measurement separates *what the model must learn* from *how a
framework expresses it*:

| Archetype | What it is |
|---|---|
| `booking` | Evening class booking |
| `contact-lead` | Public-service enquiry form |
| `catalogue` | Searchable reference catalogue |
| `account-recovery` | Account sign-in and recovery |
| `event-registration` | Event registration with capacity |

| Arm | Role |
|---|---|
| `raw` | the platform, no framework |
| `react`, `preact`, `vue`, `svelte` | client-rendered variants |
| `webcomponents` | the platform's component model |
| `hono` | server-rendered variant |

`defects` in the plan is what each original (BASELINE) is seeded with; the deterministic uplift
(`src/corpus/uplift.mjs`) is then measured against them. See [../docs/PIPELINE.md](../docs/PIPELINE.md)
for where this sits in the pipeline, and the corpus viewer for the measured evidence.
