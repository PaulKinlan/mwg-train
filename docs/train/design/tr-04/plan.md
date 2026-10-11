---
family: tr-04
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-04-v1
---

# `tr-04` functional specification — SunHarbor Community Solar — Array Telemetry & Member Credits

The behaviour of the `tr-04` training family, bound to its canonical brief row
[`tr-04-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is community solar array daily output and member credits, in the `dashboard` archetype. The brief asks for:

> Our neighbourhood solar cooperative installed a 50kW array on the community centre roof and needs a public dashboard. Residents want to view real-time kilowatt generation, cumulative monthly kilowatt-hours, and query their household solar credit balance by entering their meter number. Credit balance queries must return accurate server records and the layout must adapt smoothly across desktop and mobile screens.

The form the journey drives carries 5 fields: `account`, `meter`, `reading`, `period`, `notes`.

The brief's own user journeys, which the harness flow below is derived from:

- View current solar power generation metrics and total kilowatt-hours produced
- Enter a household member account ID to look up assigned monthly energy credits
- Navigate generation statistics and tables using keyboard focus and screen reader labels

Out of scope, by the brief's own non-goals: utility billing transactions; inverter hardware telemetry controls.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/generation` | supporting page declared by the brief |
| `/credits` | supporting page declared by the brief |
| `/credits/:account` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "member credit allocations and hourly generation logs are stored on the server"

The family's declared framework arm is `vue` and its locale is `en-US`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Monthly cumulative" in `select[name=period]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Monthly cumulative".
3. On `/`, fill form#solar-credits-form: `input[name=account]` with "MTR-9042", `input[name=meter]` with "SOL-4021", `input[name=reading]` with "48", `textarea[name=notes]` with "Optimal irradiance, array operating at 96% efficiency"; choose "Monthly cumulative" in `select[name=period]`.
4. Submit; the read page shows "MTR-9042", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="MTR-9042" lists "MTR-9042" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `account` field can be changed to "MTR-9042 (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `account`, `meter`, `reading`, `period` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `css/responsive-design`, drawn from the
  applicable set `accessibility/accessibility`, `css/responsive-design`, `css/css-layout`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- GET /credits/:account returns the exact kWh credits accrued for the queried meter ID
- summary statistics update dynamically without breaking keyboard navigation flow
- generation metric tables remain usable and horizontally scrollable on mobile viewports

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
[`docs/train/targets/tr-04/index.html`](../../targets/tr-04/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
