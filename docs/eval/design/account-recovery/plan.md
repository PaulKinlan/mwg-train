---
archetype: account-recovery
spec: docs/eval/specs/account-recovery.json
---

# Account sign-in and recovery — functional specification

The behaviour of the `account-recovery` archetype, bound to [`account-recovery.json`](../../specs/account-recovery.json) rather than
restated from it: every claim below is checked against that spec, and the spec is what
`node scripts/rebuild-from-spec.mjs --family account-recovery` rebuilds the project from. Acceptance criteria are
quoted verbatim, so angle brackets in them are literal rather than markup.

This document describes what every arm of the family does. What each arm *looks like* is in that arm's
`design.md` beside this file.

## Use case

Sign-up, sign-in with a server session, and a password-reset request. The user supplies three fields: `email`, `password` and `displayName`.

## Routes and effects

| Route | Kind | Effect |
| --- | --- | --- |
| `GET /` | page | render the sign-up form |
| `POST /signup` | write-account | create the account, start a session, and redirect to the account page |
| `GET /account` | read-session | read the session and show the display name it identifies |
| `POST /reset` | write-reset | start a password reset and redirect to a reference-addressed page |
| `GET /reset/:ref` | read-by-reference | read the reset by reference and render it |

What the spec does not define, the family does not serve. The family is two writes - `POST /signup` for an
account and `POST /reset` for a reset request - plus a read of the request by reference at `GET /reset/:ref`.
No route edits or deletes an account.

## Data and state

- **Engine:** `sqlite`
- **Write route:** `/signup`
- **Read route:** `/account`

## Journey

1. Start at `/`.
2. Fill `form#signup-form`: `input[name=email]` with "alan@example.test", `input[name=password]` with "correct horse battery", `input[name=displayName]` with "Alan T".
3. Expect text: "Alan T".

## Validation and states

- **Required fields:** `email`, `password`, `displayName`
- **On a missing field:** the server refuses the submission and re-renders the form; no account is created
- **On success:** create the account, issue a session, and answer 303 with Location: /account

## Acceptance criteria

- the echoed display name is held by the session the server issued, so it survives a reload only if the session does
- the session cookie carries HttpOnly, SameSite=Lax and Path=/ (and Secure when the arm sets it)
- an empty submit is observed to be refused

## Implementation status

Not everything declared is served. Every declared GET route is answered, `/account` among them, by the generated fallback for declared routes that have no handler of their own. `POST /reset` is different: it is declared by the spec and named in the table above, no handler answers it, and it therefore has no endpoint - the reset flow can be read but not started. Everything else in this document is what generation shows; where an implementation detail cannot be checked, it is treated as declared rather than done.

## Provenance

The story, fields, validation, journey and acceptance criteria are the durable spec
[`docs/eval/specs/account-recovery.json`](../../specs/account-recovery.json), authored on 2026-10-08 and kept in step with the
generator by `test/spec.test.mjs`. This document is checked against that spec by
`npm run check:design-schema`; the routes and fields are also exercised end to end by the corpus harness.
