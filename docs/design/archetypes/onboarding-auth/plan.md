---
archetype: onboarding-auth
type: b2b-saas-signup
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/onboarding-auth/
---

# `onboarding-auth` — functional contract

An account onboarding and authentication portal: user registration, credential login, authenticated member profiles, and robust session management backed by persistent server-side cookies. This document is the contract for the `onboarding-auth` archetype - what a prospective or returning member can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

An independent bookshop reading club member accounts system.

A **prospective member** fills out a sign-up form with their name, email, and password, receiving an authenticated server session and immediately landing on their personal profile page. A **registered user** logs out and seamlessly logs back in; refreshing the profile page retains their active session because it is securely backed by cookies. A **locked-out member** navigates an account recovery journey, generating a persistent reset token URL to securely establish a new password and log back in. The flow differs from a simple `record-form` because read views depend on the authenticated session identity rather than URL routing parameters alone.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing page |
| `GET /signup` | page | serves the account registration form |
| `POST /signup` | write-account | creates a user record, establishes a session cookie (`HttpOnly`), and redirects to `/profile` |
| `GET /login` | page | serves the credential authentication form |
| `POST /login` | write-session | establishes a session cookie for valid credentials and redirects to `/profile` |
| `GET /profile` | read-session | reads the session cookie and serves the authenticated member profile |
| `GET /forgot-password` | page | serves the password recovery request form |
| `POST /forgot-password` | write | generates a persistent reset token and answers `303` with a redirect |
| `GET /reset-password/:token` | read-by-reference | serves the password update form validated by the reference token |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `accounts`, with `id` (TEXT, primary key), `name` (TEXT, not null), `email` (TEXT, not null), and `password_hash` (TEXT, not null).
- **Session:** authenticated via cookies (`HttpOnly`, `SameSite`), tracking the logged-in user.
- **Tokens:** persistent reset tokens stored server-side to validate `/reset-password/:token`.
- **Write route:** `POST /signup` and `POST /login` establish the session state.
- **Read route:** `GET /profile` reads the identity entirely from the session.

## Journey

The declared journey, derived from the `fam-05` spec:

- it starts at `/signup`;
- it submits the registration form with fills - `input[name=name]` `Alex Rider`, `input[name=email]` `alex@example.test`, and `input[name=password]` `Str0ng#Passw0rd!2026`;
- it automatically lands on `/profile` and expects to find the authenticated name `Alex Rider` rendered;
- it logs out, navigates to `/login`, and submits the previous credentials, verifying the session cookie is re-established and `/profile` loads successfully;
- the locked-out journey requests a reset token at `/forgot-password`, navigates to `/reset-password/:token`, and sets a new password that permanently updates the server credential.

## Validation and states

- **Required fields:** `name`, `email`, `password`.
- **On a missing field or invalid login:** the server refuses the submission, returning HTTP 400 or 401, and re-renders the form with an accessible error message (using `aria-invalid` and `aria-describedby`); nothing is stored or authenticated.
- **On success:** insert an account record or establish a session, and answer 303 with Location: `/profile`.
- **Empty state:** a guest visiting `/profile` without a valid session cookie is denied access and prompted to log in.

## Acceptance criteria

1. `POST /signup` creates a user record in server storage, establishes a session cookie with `HttpOnly` and `SameSite` attributes, and redirects to `/profile`
2. `GET /profile` returns HTTP 200 with the logged-in member name when a valid session cookie is present, and survives a browser reload
3. `POST /forgot-password` generates a persistent reset token; `POST /reset-password/:token` updates the member password so subsequent login with the new password succeeds
4. form validation failures and authentication errors are associated with input fields using `aria-invalid` and `aria-describedby` and announced to screen readers
5. `POST /signup` and `POST /login` forms have inputs with `autocomplete="email"` and `autocomplete="new-password"` or `autocomplete="current-password"`

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist:
- The single-step `tr-05` and `fam-05` targets evaluate basic registration forms, but do not evaluate the full multi-step `onboarding-auth` session retention, sign-in, and reset token life cycles.
- The reference boards for the full multi-step journey are planned (`step1-signup`, `step2-login`, `step3-profile`, `step4-forgot`, `step5-reset`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-onboarding-auth.md`.
- **The behaviour** is derived from the A1 training family (`tr-05`) and the A6 evaluation spec (`fam-05`, `onboarding-auth`). The `fam-05` route spelling (`/signup`, `/login`, `/profile`, `/forgot-password`, `/reset-password/:token`) governs the multi-step contract; `tr-05` contributes the wildlife rescue and volunteer intake domain contexts.