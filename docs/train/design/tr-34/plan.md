---
family: tr-34
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-34-v1
---

# `tr-34` functional specification — NorthSea Grid — Dogger Bank Sector B Offshore Wind Telemetry & Alert Log

The behaviour of the `tr-34` training family, bound to its canonical brief row
[`tr-34-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is NorthSea Grid Dogger Bank Sector B offshore wind telemetry and alert rule log, in the `realtime-telemetry-dashboard` archetype. The brief asks for:

> NorthSea Grid monitors offshore wind generation and battery storage across Dogger Bank Sector B and needs an operations telemetry console with a persisted alert-rule editor. Let duty engineers inspect turbine KPIs and time-window readings, submit a thermal alert threshold rule with incident notes, and verify that the saved rule persists on the server after a page reload.

The form the journey drives carries 5 fields: `turbine_id`, `operator`, `warning_temp`, `critical_temp`, `dispatch_note`.

The brief's own user journeys, which the harness flow below is derived from:

- Inspect Dogger Bank Sector B generation KPIs, 16-turbine status cells, and gearbox temperature readings
- Configure a thermal alert rule with turbine unit, duty engineer, warning and critical thresholds, and incident note
- Save the alert rule to the server and reload the confirmation record to verify it is stored in the audit log

Out of scope, by the brief's own non-goals: live SCADA breaker actuation; high-frequency raw binary stream ingestion.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/alerts` | write route the form submits to |
| `/alerts/:id` | read-back of one stored record by its reference |
| `/incidents` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "turbine thermal alert rules and incident audit log annotations are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-GB`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-34-hono`, `pilot/projects/tr-34-raw`,
`pilot/projects/tr-34-react`, `pilot/projects/tr-34-preact`,
`pilot/projects/tr-34-vue`, `pilot/projects/tr-34-svelte`, and
`pilot/projects/tr-34-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Turbine B-07" in `select[name=turbine_id]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Turbine B-07".
3. On `/`, fill form#northsea-alert-form: `input[name=operator]` with "Soren Lindqvist", `input[name=warning_temp]` with "78", `input[name=critical_temp]` with "88", `textarea[name=dispatch_note]` with "Gearbox oil excursion observed during 14:00 UTC gust window."; choose "Turbine B-07" in `select[name=turbine_id]`.
4. Submit; the read page shows "Soren Lindqvist", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Soren" lists "Soren Lindqvist" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `operator` field can be changed to "Soren Lindqvist (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`realtime-telemetry-dashboard` plan](../../../design/archetypes/realtime-telemetry-dashboard/plan.md)
and [`realtime-telemetry-dashboard` design](../../../design/archetypes/realtime-telemetry-dashboard/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-34/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `turbine_id`, `operator`, `warning_temp`, `critical_temp`, `dispatch_note` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `forms/forms`, drawn from the
  applicable set `accessibility/accessibility`, `forms/forms`, `forms/required-field-feedback`, `css/responsive-design`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /alerts records the thermal alert threshold rule on the server and redirects to /alerts/:id
- GET /alerts/:id displays the duty engineer, turbine unit, and warning/critical thresholds after reload
- all telemetry summaries and incident tables expose accessible headings and programmatic form labels

## Implementation status

Task: `generate`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-34/index.html`](../../targets/tr-34/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
