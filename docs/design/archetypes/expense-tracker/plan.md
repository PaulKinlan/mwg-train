---
archetype: expense-tracker
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/expense-tracker/
---

# `expense-tracker` — functional contract

A budget and collective expenditure ledger: a chronological list of recent transactions, categorical department allocations, a structured entry form, and a summary reporting dashboard. This document is the contract for the `expense-tracker` archetype - what a crew member or treasurer can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

An independent film production budget and receipt expense logging platform.

A **crew member** logs daily production expenses by entering the date, department category, merchant vendor, dollar amount, and receipt memo. The server validates the numeric input and stores the expense securely. A **unit manager** or treasurer views the main dashboard displaying recent transactions and aggregated spending totals broken down by production department. The ledger recalculates and persists accurate running totals across reloads.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing or overview page |
| `GET /expenses` | list | serves the chronological ledger of recorded expenses |
| `GET /expenses/new` | page | serves the expense logging intake form |
| `POST /expenses/new` | write | inserts an expense record and answers `303` with a redirect back to `/expenses` |
| `GET /expenses/:id` | read-by-reference | reads the detailed expense receipt by reference |
| `GET /reports` | list | serves an aggregated summary report of spending grouped by department |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `expenses`, with `id` (TEXT, primary key), `date` (TEXT, not null), `department` (TEXT, not null), `vendor` (TEXT, not null), `amount` (REAL, not null), and `notes` (TEXT).
- **Write route:** `POST /expenses/new` stores the expense.
- **Read route:** `GET /expenses/:id` reads the expense by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303 or displayed on the list.

## Journey

The declared journey, derived from the `fam-15` spec:

- it starts at `/expenses` (ledger);
- it navigates to `/expenses/new` to log a new production expense;
- it submits the expense form with fills - `input[name=date]` `2026-10-15`, `select[name=department]` `Camera`, `input[name=vendor]` `Lens Rental Co`, `input[name=amount]` `450.00`, and `textarea[name=notes]` `Cinema prime lenses for exterior shoot`;
- and it expects to see the updated expense list at `/expenses`, confirming the logged expense amount and department tag are accurate;
- it navigates to `/reports` and verifies that the departmental expense totals accurately reflect the newly logged spending.

## Validation and states

- **Required fields:** `date`, `department`, `vendor`, `amount`.
- **On a missing field or non-positive amount:** the server refuses the submission, returning HTTP 400, and re-renders the form with inline validation errors adjacent to the invalid fields; nothing is stored.
- **On success:** insert one row into expenses and answer 303 with Location: `/expenses`.
- **Empty state:** a brand new production with no logged expenses returns a helpful zero-state ledger.

## Acceptance criteria

1. after a successful submit the browser lands on `/expenses` and the logged expense amount and department tag are present
2. reloading the `/expenses` URL still shows the transaction, proving server-side persistence
3. submitting without a required field or with a negative or zero amount halts submission and shows clear field validation
4. `GET /reports` returns HTTP 200 with departmental expense totals reflecting all saved records
5. all monetary amounts are formatted consistently with a currency symbol and two decimal places
6. each form input on the expense form has an explicit programmatic label with a matching for/id attribute

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist:
- The single-step `tr-15`, `tr-29`, and `fam-15` targets are simple pages containing a form, but do not evaluate the full multi-step `expense-tracker` ledger, intake form, and aggregated reports functionality.
- The reference boards for the full multi-step journey are planned (`step1-ledger`, `step2-intake`, `step3-receipt`, `step4-reports`, `step5-empty`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-expense-tracker.md`.
- **The behaviour** is derived from the A1 training families (`tr-15`, `tr-29`) and the A6 evaluation spec (`fam-15`, `expense-tracker`). The `fam-15` route spelling (`/expenses`, `/expenses/new`, `/reports`) governs the multi-step contract; `tr-15` and `tr-29` contribute the tenant and memorial fund domain contexts.