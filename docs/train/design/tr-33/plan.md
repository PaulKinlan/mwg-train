---
family: tr-33
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-33-v1
---

# `tr-33` functional specification — Kestrel Workspace — Sprint 24 Firmware Issue Tracker & Inspector

The behaviour of the `tr-33` training family, bound to its canonical brief row
[`tr-33-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Kestrel Sprint 24 firmware issue tracker and quick-create workbench, in the `saas-workspace-board` archetype. The brief asks for:

> Our embedded systems team uses Kestrel to track Sprint 24 firmware and telemetry issues across Triage, In Progress, In Review, and Shipped columns alongside a detail inspector. Build the workspace and quick-create issue flow so engineers can file a bug with title, assignee, priority, subsystem, and reproduction steps, persist it on the server, and inspect it after reloading.

The form the journey drives carries 5 fields: `title`, `assignee`, `priority`, `component`, `repro_steps`.

The brief's own user journeys, which the harness flow below is derived from:

- Review active Sprint 24 firmware and telemetry issues across the Kestrel workspace board and inspector
- Open the quick-create issue form and enter an issue title, assignee, priority, subsystem, and reproduction steps
- Submit the new engineering issue and reload the issue detail page to confirm it is persisted on the server

Out of scope, by the brief's own non-goals: external GitHub or Jira webhook syncing; multi-tenant enterprise billing management.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/issues` | write route the form submits to |
| `/issues/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "sprint engineering issues, subsystem tags, and reproduction steps are stored on the server"

The family's declared framework arm is `svelte` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-33-hono`, `pilot/projects/tr-33-raw`,
`pilot/projects/tr-33-react`, `pilot/projects/tr-33-preact`,
`pilot/projects/tr-33-vue`, `pilot/projects/tr-33-svelte`, and
`pilot/projects/tr-33-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "High" in `select[name=priority]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "High".
3. On `/`, fill form#kestrel-issue-form: `input[name=title]` with "Fix SPI bus contention during flash write", `input[name=assignee]` with "Elena Rostova", `textarea[name=repro_steps]` with "Reflash controller; stream telemetry at 200Hz; observe SPI lock."; choose "High" in `select[name=priority]`; choose "Firmware" in `select[name=component]`.
4. Submit; the read page shows "Fix SPI bus contention during flash write", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Fix" lists "Fix SPI bus contention during flash write" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `title` field can be changed to "Fix SPI bus contention during flash write (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`saas-workspace-board` plan](../../../design/archetypes/saas-workspace-board/plan.md)
and [`saas-workspace-board` design](../../../design/archetypes/saas-workspace-board/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-33/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `title`, `assignee`, `priority`, `component`, `repro_steps` - each is required in the form and re-checked on the server.
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

- POST /issues creates the sprint issue on the server and redirects to /issues/:id
- GET /issues/:id displays the issue title, subsystem tag, priority, and assignee after reload
- the quick-create form and issue table controls announce required-field errors to assistive technology

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
[`docs/train/targets/tr-33/index.html`](../../targets/tr-33/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
