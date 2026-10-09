---
archetype: booking
spec: docs/eval/specs/booking.json
---

# Evening class booking — functional specification

The behaviour of the `booking` archetype, bound to [`booking.json`](../../specs/booking.json) rather than
restated from it: every claim below is checked against that spec, and the spec is what
`node scripts/rebuild-from-spec.mjs --family booking` rebuilds the project from. Acceptance criteria are
quoted verbatim, so angle brackets in them are literal rather than markup.

This document describes what every arm of the family does. What each arm *looks like* is in that arm's
`design.md` beside this file.

## Use case

A training centre takes bookings for evening classes and shows the booking back to the student. The student
supplies five fields - `name`, `email`, `address`, `postcode` and `notes` - and the server issues a reference
that identifies the stored booking afterwards.

The point of the archetype is the round trip rather than the form: a value goes in, the server stores it, and
the page that comes back shows the value the *server* holds. That is why the reference is issued by the
submission rather than chosen by the student, and why the echoed text is read from storage.

## Routes and effects

| Route | Kind | Effect |
| --- | --- | --- |
| `GET /` | page | render the booking form |
| `POST /book` | write | refuse the submission if a required field is missing; otherwise store the booking and redirect |
| `GET /booking/:ref` | read-by-reference | read the booking by reference and show the notes back to the student |
| `GET /roster` | list | list the stored bookings |

What the spec does not define, the family does not serve: there is no edit, no delete and no search. A route
appearing in an arm's server without a line here is a defect in the arm, not a feature of the archetype.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line, alive for one process. It is a store for the
  duration of a run, not a durable database.
- **Table:** `records`, with `ref` (TEXT, primary key), `created_at` (TEXT, not null) and `payload` (TEXT,
  not null). The payload is the field map; everything read back comes from here.
- **Write route:** `/book` inserts one row and answers `303` with the reference in the `Location` header.
- **Read route:** `/booking/:ref` reads that row back by reference.
- **The reference:** server-issued, returned in the `Location` header of the `303` - never chosen by the
  client, which is what makes reading it back evidence that the server stored something.

## Journey

The flow the harness drives, with the selectors it uses:

1. Start at `/`.
2. Fill `form#booking-form`: `input[name=name]` with "Ada Lovelace", `input[name=email]` with
   "ada@example.test", `input[name=address]` with "12 Bridge Row", `input[name=postcode]` with "AB1 2CD",
   and `textarea[name=notes]` with "Window seat please".
3. Submit, and land on `/booking/<ref>`, where the text "Ada Lovelace" is present.

Reloading that URL must show the same stored values: the page after the redirect is rendered from the row,
not from the submission.

## Validation and states

- **Required fields:** `name`, `email`, `address`, `postcode`, `notes` - all five are required in the form
  and re-checked on the server.
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored.
- **On success:** insert one row into records and answer 303 with Location: /booking/<ref>.
- **Missing reference:** a reference with no row is `404`, a plain document rather than a styled page.
- **Empty list:** `GET /roster` with no rows is not given a distinct empty treatment.
- **Loading:** the echo the enhancement script fetches renders nothing while in flight; no loading affordance
  is declared.
- There is no permission-denied state and no unavailable-backend state: the family has no accounts and no
  remote dependency that can fail.

## Acceptance criteria

Quoted from the spec, which is the authority for them:

- after a successful submit the browser lands on /booking/<ref> and the echoed notes text is present
- reloading that URL still shows it, which is only possible if the server stored it
- an empty submit is observed to be refused by the server rather than silently accepted
- the reference in the URL was issued by this submission, not read from a row that already existed

## Implementation status

What exists in every arm: all four routes, all five fields, the echo round trip, the invariant error
announcement, light and dark colour schemes, and a visible `:focus-visible` outline.

What is declared but not implemented: a loading state for the echo fetch, and an empty state for the list
route. Both are described above as declarations rather than claims.

Known gap worth recording rather than smoothing: the list route renders the same page template with a
different title, so `GET /roster` serves the booking form rather than a table of rows, even though the
stylesheet carries `table`/`th`/`td` rules and the internal records endpoint does return the rows.

Absent by design: accounts, sessions, uploads, payments, email, and any third-party request.

## Provenance

The story, fields, validation, journey and acceptance criteria are the durable spec
[`docs/eval/specs/booking.json`](../../specs/booking.json), authored on 2026-10-08 and kept in step with the
generator by `test/spec.test.mjs`. This document is checked against that spec by
`npm run check:design-schema`; the routes and fields are also exercised end to end by the corpus harness.
