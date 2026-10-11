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
rendered through seven arms so the measurement separates *what the model must learn* from *how a
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

## The build key: use case × framework × model

Every row of [`CORPUS.json`](CORPUS.json) and [`TRAINING_CORPUS.json`](TRAINING_CORPUS.json) records
`model` and the derived `build_key` (`project_id@model`), defined in
[`../src/eval/build-key.mjs`](../src/eval/build-key.mjs) and gated by `npm run check:build-key`.

The model half is the key that was missing (bead mwg-train-gzi, from Paul: *"we might need to key each
archetype/framework with another key, the llm used to generate"*). It matters because the sealed
evaluation compares arms that differ **by model and only by model**: without it, two arms collide on one
identity and one of them silently wins. A build with no model identity is **refused**, never defaulted.

Both corpora here are deterministic — `CORPUS.json`'s own `baseline_definition` says *"no model and no
teacher in the loop"* — so every row records the explicit sentinel `deterministic:no-model` and the
loudest failure mode, a silently absent field, cannot happen. The sentinel contains no `/`, so it can
never be parsed as a `provider/id` model identity; a gate asserts that, because the first version of the
sentinel (`deterministic/no-model`) read as provider `deterministic` with model `no-model`.

The first half of the key is `project_id`, not the archetype name, for a measured reason: seven of the
thirty training families share the `booking` archetype, so an archetype-based key collides 63 times in
`TRAINING_CORPUS.json` alone. `project_id` is the unit each corpus keys by — the archetype in the pilot,
the family (`tr-01`) in the training corpus — already paired with its framework.

`pilot/projects/<id>/spec.json` deliberately does **not** carry the model yet: those trees are hashed into
the original and uplift tree hashes the record carries, so adding a field there changes 35 recorded hashes
and needs a fresh browser pilot run to re-record honestly (`pilot-corpus.mjs --record` itself refuses a run
whose originals no longer match). That is tracked as a follow-up rather than done silently.
