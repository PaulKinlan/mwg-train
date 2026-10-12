---
archetype: expense-tracker
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/expense-tracker/
register: docs/provenance/assets/training-reference-boards.md
---

# `expense-tracker` — functional contract

A budget and collective expenditure ledger: a chronological list of recent transactions, categorical department allocations, a structured entry form, and a summary reporting dashboard. This document is the contract for the `expense-tracker` archetype - what an operator can read, what they can log, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow and no pilot spec for this archetype — see *Implementation status*. Nothing here should be read as describing running software.

Four families implement this archetype, and all are described together because the archetype is the contract they share rather than any one alone:

- **`tr-15`, Oakridge Tenant Co-operative** — tenant collective maintenance expense logging.
- **`tr-29`, Community Woodland Trust** — memorial tree fund contributions and planting site tracker.
- **`fam-15`, Independent Film Production** — budget and receipt expense logging (eval split: test).
- **`fam-r03`, Treasurer's Ledger** — treasurer's expense ledger (eval split: test, repair).

## Use case

A community operation collects financial records or contributions and needs to aggregate them securely: a tenant collective managing hallway lightbulb costs, a woodland trust tracking memorial tree donations, a film crew tracking department budgets, or a treasurer running a ledger. All are the same shape of problem — a list of transactions, a running total or categorical breakdown, and an intake form that modifies the aggregate state.

An **operator** arrives at the tracker, reads the current state of the ledger, and logs a new transaction. The logged transaction is stored on the server, and the running total updates, so reloading the ledger shows the record and accurate calculation rather than only the operator's own submit.

## Routes and effects

The families declare their own routes, and all are listed because the archetype's routes are the union of its instances. The common shape is a ledger view, a write producing one transaction, and a read-by-reference receipt or updated summary.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | all | page | serves the landing or overview page |
| `GET /expenses` | `tr-15`, `fam-15` | page | serves the chronological ledger of recorded expenses |
| `GET /expenses/new` | `tr-15`, `fam-15`, `fam-r03` | page | serves the expense logging intake form |
| `POST /expenses/new` | `tr-15`, `fam-15`, `fam-r03` | write | inserts an expense record and redirects to the receipt or ledger |
| `GET /expenses/:id` | `tr-15`, `fam-15`, `fam-r03` | read-by-reference | reads the detailed expense receipt by reference |
| `GET /funds` | `tr-29` | page | serves the tree funds view |
| `POST /contribute` | `tr-29` | write | inserts a contribution record and redirects |
| `GET /contributions/:id` | `tr-29` | read-by-reference | reads the contribution receipt |
| `GET /ledger` | `tr-29`, `fam-r03` | page | serves the aggregate ledger view |
| `GET /reports` | `fam-15` | page | serves an aggregated summary report of spending grouped by department |

**On the methods in that table.** The manifest declares routes as paths rather than methods, and carries no `method` key anywhere. The methods shown are therefore only as firm as their source: `POST /expenses/new` and `POST /contribute` are named by the families' assertions, as are the `GET` read-backs. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: expense/contribution entries, calculated aggregate balances, and the running total.
- **The transaction** carries a contributor/vendor, a numeric amount, and metadata (category, date, notes).
- **Write routes:** `POST /expenses/new` and `POST /contribute` store the transaction.
- **Read by reference:** the families read one subject's state back by its identifier. The running total on the ledger is recalculated dynamically based on the stored rows.
- **The reference:** server-issued reference, returned in the Location header of a `303` or displayed on the list.

## Journey

The declared journeys. For the evaluation families (`fam-15`, `fam-r03`), these are quoted verbatim from the manifests. For the training families, these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-15` (tenant-collective):**
- Starts at `/`, submits `form#maintenance-expense-form` with `input[name=tenant]` `Casey Duval`, `input[name=vendor]` `City Hardware Supply`, `input[name=amount]` `42`, `input[name=date]` `2026-03-15`, `input[name=description]` `Hallway LED lightbulbs`, selecting `select[name=category]` `Winter Salt and Grounds`.
- Expects `Hallway LED lightbulbs` echoed back and again after a reload.
- Searches via `/search?q=Hallway` to verify the search endpoint finds the stored record.
- Updates the `description` to `Hallway LED lightbulbs (updated)`.
- Its intake steps submit `/intake` having selected `select[name=category]` `Winter Salt and Grounds`, and `/intake/confirm` expects `Winter Salt and Grounds` back.

**`tr-29` (memorial-tree):**
- Starts at `/`, submits `form#contribution-form` with `input[name=contributor]` `Marta Vidal`, `input[name=amount]` `75`, `textarea[name=message]` `In memory of Rosa Vidal`, selecting `select[name=site]` `Church Lane Green`.
- Expects `Marta Vidal` echoed back and again after a reload.
- Searches via `/search?q=Marta` to verify the search endpoint finds the stored record.
- Updates the `contributor` to `Marta Vidal (updated)`.
- Its intake steps submit `/intake` having selected `select[name=site]` `Church Lane Green`, and `/intake/confirm` expects `Church Lane Green` back.

**`fam-15` (independent film):**
- log a new production expense for camera equipment rental with amount, department, receipt reference, and notes, submit, and view the updated expense list
- reload `/expenses` in a clean session, verify that the logged expense, category totals, and budget depletion amounts remain accurate from server storage
- attempt to record an expense with a negative amount or missing department, verify descriptive error messages appear adjacent to the invalid fields, correct the input, and confirm

**`fam-r03` (treasurer ledger):**
- add an expense with a description and an amount, and see the running total update
- reload the ledger and see the same expenses and the same correct total
- enter a blank or negative amount and see a clear error with nothing added

## Validation and states

- **Required fields:** amounts and primary identity fields (`tenant`, `contributor`, `department`) are strictly required.
- **Numeric integrity:** `tr-15`, `tr-29`, `fam-15`, and `fam-r03` all explicitly assert that submitting a **negative or blank amount** is refused and displays an accessible validation error. This prevents corrupting the running total.
- **On a missing field or invalid value:** the server refuses the submission, returning HTTP `400` (or rendering inline errors); nothing is stored.
- **On success:** insert one row into the ledger and answer `303` with a Location header.
- **Empty state:** a ledger with no logged expenses returns a helpful zero-state ledger.

## Acceptance criteria

The families define specific observable assertions:

`tr-15`:
1. `POST /expenses/new` records the expense and updates the cumulative total
2. `GET /expenses` renders all previously recorded items and correct running balance after reload
3. submitting a negative or non-numeric amount displays an accessible validation error

`tr-29`:
4. `POST /contribute` records the contribution on the server and redirects to `/contributions/:id`
5. `GET /ledger` calculates and displays accurate total funds including all saved contributions after reload
6. submitting a negative or blank contribution amount displays an accessible validation error

`fam-15`:
7. `POST /expenses/new` with expense details writes a record and redirects to `/expenses` with HTTP 303
8. `GET /expenses` after page reload returns HTTP 200 containing the new expense amount and department tag
9. submitting `/expenses/new` with non-positive amount or missing required fields returns HTTP 400 with inline validation errors
10. `GET /reports` returns HTTP 200 with departmental expense totals reflecting all saved records
11. all monetary amounts are formatted consistently with dollar currency symbol and two decimal places

`fam-r03`:
12. `POST /expenses/new` stores an expense and redirects to `/expenses/:id`
13. `GET /ledger` after a reload shows the same expenses and a total computed from the stored data
14. the amount field is a native input with a programmatically associated label
15. a blank or negative amount produces a clear error and adds no expense

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **Two landing references exist, one for each training family:** `tr-15/reference.jpg` and `tr-29/reference.jpg`. Each depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- The single-step `tr-15`, `tr-29`, `fam-15`, and `fam-r03` targets are simple pages containing a form, but do not evaluate the full multi-step `expense-tracker` ledger, intake form, and aggregated reports functionality end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (families `tr-15`, `tr-29`) and `docs/eval/briefs/manifest.jsonl` (`fam-15`, `fam-r03`). Route names, field slugs, control types, selectors, fill values, and all acceptance criteria are quoted from those rows rather than invented.
- **The references** are the training families' generated boards, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompts that declared them are committed beside them. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `record-form` is recorded as satisfied.
