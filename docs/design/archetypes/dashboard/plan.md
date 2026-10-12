---
archetype: dashboard
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/dashboard/
register: docs/provenance/assets/training-reference-boards.md
---

# `dashboard` — functional contract

The behaviour of the `record-form` type as the `dashboard` archetype implements it. This document is the
archetype's contract: what an operator can read, what they can log, what the server does about it, and what a
journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan documents
are. It is **not** checked against a generated demo, because there is no generated demo for the five-step
flow and no evaluation spec for this archetype — see *Implementation status*. Nothing here should be read as
describing running software.

Two training families implement this archetype, and both are described together because the archetype is the
contract they share rather than either one alone:

- **`tr-04`, SunHarbor Community Solar** — array telemetry and member credits for a community solar co-op.
- **`tr-22`, Canopy Guardian** — street tree health and watering for an urban forestry programme.

## Use case

A community operation monitors something distributed and needs to act on it: a co-op watches what its solar
array generates and what that credits its members, and a neighbourhood committee watches the health of the
street trees it planted and records what it waters or treats. Both are the same shape of problem — a
monitored resource, a periodic measurement, a threshold or status that somebody has to notice, and a log of
what was done about it.

An **operator** arrives at a dashboard, reads the current state of the resource, picks out one subject — an
account and meter, or one tree — and logs an action against it. The logged action is stored on the server, so
reloading the subject's view shows the record rather than only the operator's own submit.

The flow differs from `booking` and `event-registration`, which are `record-form` archetypes too, in what the
record is attached to. There the form is the point: one submission produces one booking or one registration,
and the read-back is a receipt. Here the read-back is a **standing view of a subject** — a table, a profile,
or a running total — and the record is an increment to it. The dashboard has to be worth reading before
anything is submitted, and the log has to change what it shows afterwards.

`TYPE-AXIS.md` records `record-form` as **satisfied** — "the one type the corpus covers" — and counts this
archetype's two families among the thirty. So this contract is not proposing a new capability for the corpus;
it is writing down the shape its two dashboard families already share.

## Routes and effects

The two families declare their own routes, and both are listed because the archetype's routes are the union
of its instances rather than either one's. The archetype's common shape is a landing view, a per-subject read
view, and a write that attaches a record to one subject.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | both | page | serves the dashboard's landing view: current state, and the entry points into the subject views |
| `GET /generation` | `tr-04` | page | serves the array's generation view |
| `GET /credits` | `tr-04` | page | serves the member credit view |
| `GET /credits/:account` | `tr-04` | read-by-reference | reads one account's accrued credits |
| `GET /trees` | `tr-22` | page | serves the tree inventory, filterable by neighbourhood block |
| `GET /trees/:id` | `tr-22` | read-by-reference | reads one tree's profile and its logging history |
| `GET /trees/:id/log` | `tr-22` | write | records a maintenance event against that tree and updates its last-actioned date |
| `GET /canopy-summary` | `tr-22` | page | serves the programme-level summary |

Both families also declare a search view addressed by a `q` query parameter (`/search?q=…`), which the two
journeys use differently: `tr-04` searches by meter reference and `tr-22` by date.

**Not proposed here.** Unlike the other archetype contracts, this one adds no route the families do not
declare. `TYPE-AXIS.md` calls `record-form` the one type the corpus covers, and both families already carry
the read and write routes this document describes.

## Data and state

- **Stored on the server**, per both families' `server_persistence`: the monitored subject and the records
  attached to it.
- **The monitored subject** is identified by a reference: `account` and `meter` for the solar co-op, `tree`
  for the forestry programme. Each family carries a subject identifier and a human-readable one.
- **The measurement** is a numeric field: `reading` in kWh for `tr-04`, `litres` for `tr-22`. Both also carry
  a period or timestamp: `period` (a select) for `tr-04`, `timestamp` for `tr-22`.
- **The record** carries `notes`, a free-text observation, and an attributed actor: the form is filled with a
  member's account and meter, or a steward's name.
- **Write routes:** `POST /trees/:id/log` for `tr-22`; `tr-04`'s declared journey submits
  `form#solar-credits-form` and its assertions read the credit back from `/credits/:account`.
- **Read by reference:** both families read one subject's state back by its identifier, which is what makes a
  reload the test of server persistence rather than of client state.

## Journey

Both families declare a journey; they are the archetype's two instance journeys rather than one journey with
variations.

**`tr-04` (solar co-op):** it starts at `/`; it reads the landing telemetry; it submits
`form#solar-credits-form` with fills `input[name=account]` `MTR-9042`, `input[name=meter]` `SOL-4021`,
`input[name=reading]` `48` and `textarea[name=notes]` `Optimal irradiance, array operating at 96%
efficiency`; it expects to find `MTR-9042` echoed back; and its search leg queries `/search?q=MTR-9042`. Its
intake steps select `select[name=period]` `Monthly cumulative` at `/intake` and expect `Monthly cumulative` at
`/intake/confirm`.

**`tr-22` (urban forestry):** it starts at `/`; it opens a tree from the inventory; it submits
`form#tree-log-form` with fills `input[name=tree]` `Maple #104`, `input[name=steward]` `Rowan Thorne`,
`input[name=timestamp]` `2026-05-18 10:15`, `input[name=litres]` `20` and `textarea[name=notes]` `Bag emptied
and sapling thriving`; it expects the timestamp `2026-05-18 10:15` echoed back, which is what proves the log
was written; and its search leg queries `/search?q=2026-05-18`. Its intake steps select
`select[name=action]` `Insect damage observed` at `/intake` and expect it at `/intake/confirm`.

Mapped to the five planned boards: step 1 dashboard → `step1-overview`, step 2 subject view →
`step2-subject`, step 3 log form → `step3-log`, step 4 the filtered or status view → `step4-filtered`,
step 5 empty → `step5-empty`.

## Validation and states

- **Required fields.** `tr-04`: `account`, `meter`, `reading`, `period` (its `notes` is optional). `tr-22`:
  `tree`, `steward`, `timestamp`, `action` (its `litres` and `notes` are optional).
- **On a missing required field:** the write is refused and the form re-renders with feedback naming the
  field. Both families carry `accessibility/accessibility` among their required rules, so this is an
  assertion about the target rather than a nicety.
- **Accessibility:** `tr-04` requires keyboard navigation to survive a summary update and its tables to stay
  usable and horizontally scrollable on a mobile viewport; `tr-22` requires accessible labels on its status
  tables and action forms.
- **Summary consistency:** counts, totals and status badges must agree with the rows they summarise. Both
  families assert a read-back after a write, which is the mechanism that keeps the standing view honest.
- **Empty state:** an inventory filter or search with no match renders an empty state naming what did not
  match. Planned as `step5-empty`.

## Acceptance criteria

`tr-04`:

1. `GET /credits/:account` returns the exact kWh credits accrued for the queried meter ID.
2. Summary statistics update dynamically without breaking keyboard navigation flow.
3. Generation metric tables remain usable and horizontally scrollable on mobile viewports.

`tr-22`:

4. `POST /trees/:id/log` records a watering event and updates the tree's last-watered date.
5. `GET /trees/:id` shows the updated maintenance timestamp following a page reload.
6. All status tables and action forms meet accessibility standards with proper aria labels.

Criteria 1–6 are the two families' own assertions, quoted from `docs/train/briefs/manifest.jsonl`.

## Implementation status

**Not implemented as a five-step flow.** Being precise about what does exist, because "tr-04 and tr-22 already
exist" is exactly the half-truth this axis was written to stop:

- **Both landing references exist.** Each family has a single committed reference board, digest-pinned in the
  [training reference register](../../../provenance/assets/training-reference-boards.md) alongside its declared
  prompt: [`tr-04/reference.jpg`](../../training/tr-04/reference.jpg) (571002 bytes, sha256 `7e48405e…`) and
  [`tr-22/reference.jpg`](../../training/tr-22/reference.jpg) (625799 bytes, sha256 `4c6172ec…`). Each depicts
  a **landing page at one scroll position**: for `tr-04`, telemetry metrics, an operational notice list, a
  credit lookup paired with a result card and a facility photograph; for `tr-22`, a filter bar, an inventory
  table with a selected row, a tree profile beside a street photograph, and the maintenance log form. Neither
  demonstrates any behaviour, and neither is a picture of the five states above.
- **The five journey boards are planned, not generated.** `step1-overview`, `step2-subject`, `step3-log`,
  `step4-filtered` and `step5-empty` exist in no ref, and this directory holds no committed board of its own.
- **The train-side pairs and targets do exist:** `docs/train/design/tr-04/{plan,design}.md` and
  `docs/train/targets/tr-04/index.html`, likewise for `tr-22`. They describe the single-step target, which is
  a different artefact from this archetype contract.
- **What the engine offers is capability, not implementation.** The shared engine can render a list, a
  read-by-reference page and a write, and both families use those. No family in the corpus carries a chart, a
  status whose transitions the server enforces, or a summary figure derived from other rows.
- **No evaluation spec:** there is no `docs/eval/specs/dashboard.json`; that directory is the sealed A6
  evaluation set. This contract is validated by section order and internal consistency, not against a spec.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl`, families `tr-04` and `tr-22`. Route
  names, field slugs, control types, selectors, fill values, search parameters, intake steps and all six
  acceptance criteria are quoted from those rows rather than invented.
- **The references** are the two families' generated boards, digest-pinned in
  `docs/provenance/assets/training-reference-boards.md`; the prompts that declared them are committed beside
  them. The five journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `record-form` is recorded as
  satisfied across all thirty families, this archetype's two among them.
