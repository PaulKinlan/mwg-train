---
archetype: contact-lead
spec: docs/eval/specs/contact-lead.json
---

# Public-service enquiry form — functional specification

The behaviour of the `contact-lead` archetype, bound to [`contact-lead.json`](../../specs/contact-lead.json) rather than
restated from it: every claim below is checked against that spec, and the spec is what
`node scripts/rebuild-from-spec.mjs --family contact-lead` rebuilds the project from. Acceptance criteria are
quoted verbatim, so angle brackets in them are literal rather than markup.

This document describes what every arm of the family does. What each arm *looks like* is in that arm's
`design.md` beside this file.

## Use case

A council service takes enquiries, validates them, and shows the enquirer their reference. The user supplies three fields: `name`, `email` and `message`.

## Routes and effects

| Route | Kind | Effect |
| --- | --- | --- |
| `GET /` | page | render the enquiry form |
| `POST /enquiry` | write | refuse the submission if a required field is missing; otherwise store the enquiry and redirect |
| `GET /enquiry/:ref` | read-by-reference | read the enquiry by reference and show the message back to the enquirer |
| `GET /inbox` | list | list the stored enquiries |

What the spec does not define, the family does not serve: nothing edits or deletes an enquiry. `GET /inbox`
lists what has been written and `GET /enquiry/:ref` reads one back by reference, so from the family's point of
view an enquiry is written once and read afterwards.

## Data and state

- **Engine:** `sqlite`
- **Write route:** `/enquiry`
- **Read route:** `/enquiry/:ref`

## Journey

1. Start at `/`.
2. Fill `form#enquiry-form`: `input[name=name]` with "Grace Hopper", `input[name=email]` with "grace@example.test", `textarea[name=message]` with "Please repair the street light".
3. Expect text: "Grace Hopper".

## Validation and states

- **Required fields:** `name`, `email`, `message`
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored
- **On success:** insert one row into records and answer 303 with Location: /enquiry/<ref>

## Acceptance criteria

- after a successful submit the browser lands on /enquiry/<ref> and the echoed message is present
- reloading that URL still shows it
- an empty submit is observed to be refused

## Implementation status

What exists in every arm is exactly what the spec declares. Where we cannot check an implementation detail, we treat it as declared rather than done.

## Provenance

The story, fields, validation, journey and acceptance criteria are the durable spec
[`docs/eval/specs/contact-lead.json`](../../specs/contact-lead.json), authored on 2026-10-08 and kept in step with the
generator by `test/spec.test.mjs`. This document is checked against that spec by
`npm run check:design-schema`; the routes and fields are also exercised end to end by the corpus harness.
