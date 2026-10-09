---
archetype: event-registration
spec: docs/eval/specs/event-registration.json
---

# Event registration with capacity — functional specification

The behaviour of the `event-registration` archetype, bound to [`event-registration.json`](../../specs/event-registration.json) rather than
restated from it: every claim below is checked against that spec, and the spec is what
`node scripts/rebuild-from-spec.mjs --family event-registration` rebuilds the project from. Acceptance criteria are
quoted verbatim, so angle brackets in them are literal rather than markup.

This document describes what every arm of the family does. What each arm *looks like* is in that arm's
`design.md` beside this file.

## Use case

Registration for a limited-capacity event, with a server-enforced waitlist. The user supplies three fields: `name`, `email` and `ticket`.

## Routes and effects

| Route | Kind | Effect |
| --- | --- | --- |
| `GET /` | page | render the registration form |
| `POST /register` | write-with-capacity | refuse the submission if a required field is missing; otherwise apply the capacity rule, store the registration, and redirect |
| `GET /registration/:ref` | read-by-reference | read the registration by reference and show the attendee name back |
| `GET /attendees` | list | list the stored registrations |

What the spec does not define, the family does not serve: nothing edits or deletes a registration.
`GET /registration/:ref` reads one back by reference and `GET /attendees` lists what was written, so attendance
is recorded by appending rather than by amending a ledger.

## Data and state

- **Engine:** `sqlite`
- **Write route:** `/register`
- **Read route:** `/registration/:ref`

## Journey

1. Start at `/`.
2. Fill `form#registration-form`: `input[name=name]` with "Katherine Johnson", `input[name=email]` with "kj@example.test".
3. Expect text: "Katherine Johnson".

## Validation and states

- **Required fields:** `name`, `email`
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored
- **On success:** insert one row into records and answer 303 with Location: /registration/<ref>

## Acceptance criteria

- after a successful submit the browser lands on /registration/<ref> and the echoed attendee name is present
- reloading that URL still shows it
- the capacity rule is enforced by the server, so the fourth registration is waitlisted rather than silently accepted

## Implementation status

Every route this archetype's spec declares is answered by the generated server, by a handler or by the generated fallback for declared routes that have no handler of their own. But not every rule is enforced: the capacity rule is declared and nothing is waitlisted, and the `COUNT(*)` the server prepares is never used. Where an implementation detail cannot be checked, it is treated as declared rather than done.

## Provenance

The story, fields, validation, journey and acceptance criteria are the durable spec
[`docs/eval/specs/event-registration.json`](../../specs/event-registration.json), authored on 2026-10-08 and kept in step with the
generator by `test/spec.test.mjs`. This document is checked against that spec by
`npm run check:design-schema`; the routes and fields are also exercised end to end by the corpus harness.
