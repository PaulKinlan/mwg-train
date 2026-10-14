---
family: tr-32
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-32-v1
---

# `tr-32` functional specification — Signal Grid — Daily Frequency Routing Puzzle & Streak Leaderboard

The behaviour of the `tr-32` training family, bound to its canonical brief row
[`tr-32-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Signal Grid daily frequency routing puzzle and streak leaderboard, in the `browser-puzzle-game` archetype. The brief asks for:

> We are building Signal Grid, a daily browser logic puzzle where players route 440 Hz and 660 Hz beams across a 6x6 coordinate grid into matching receivers and log their completed run to the daily leaderboard. Build the puzzle board and run-submission page so players can record their callsign, move count, routing mode, and spoiler-free notes on the server and view the persisted result after reloading.

The form the journey drives carries 4 fields: `callsign`, `moves`, `routing_mode`, `solution_summary`.

The brief's own user journeys, which the harness flow below is derived from:

- Inspect the 6x6 Signal Grid daily frequency board, par target, and optical/phase component palette
- Record a completed routing run with operator callsign, moves used, signal mode, and route notes
- Open the saved run certificate and reload to confirm the solution remains on the daily leaderboard

Out of scope, by the brief's own non-goals: real-time multiplayer matchmaking sockets; global paid tournament prize pools.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/runs` | write route the form submits to |
| `/runs/:id` | read-back of one stored record by its reference |
| `/leaderboard` | supporting page declared by the brief |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "completed puzzle runs, move counts, and leaderboard entries are stored on the server"

The family's declared framework arm is `react` and its locale is `en-GB`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "Phase Splitter" in `select[name=routing_mode]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "Phase Splitter".
3. On `/`, fill form#signal-run-form: `input[name=callsign]` with "Tamsin Kale", `input[name=moves]` with "14", `textarea[name=solution_summary]` with "Phase splitter at D4 locked both receivers cleanly."; choose "Phase Splitter" in `select[name=routing_mode]`.
4. Submit; the read page shows "Tamsin Kale", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Tamsin" lists "Tamsin Kale" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `callsign` field can be changed to "Tamsin Kale (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** `callsign`, `moves`, `routing_mode`, `solution_summary` - each is required in the form and re-checked on the server.
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

- POST /runs saves the completed puzzle solution and move count on the server and redirects to /runs/:id
- GET /runs/:id renders the operator callsign, move count, and signal mode after a page reload
- all grid controls and component palette buttons are operable by keyboard with visible focus outlines

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
[`docs/train/targets/tr-32/index.html`](../../targets/tr-32/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
