---
archetype: onboarding-auth
type: b2b-saas-signup
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/onboarding-auth/
register: docs/provenance/assets/training-reference-boards.md
---

# `onboarding-auth` — functional contract

An account onboarding and authentication portal: user registration, credential login, authenticated member profiles, and robust session management backed by persistent server-side cookies. This document is the contract for the `onboarding-auth` archetype - what a prospective or returning member can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow - see *Implementation status*. Nothing here should be read as describing running software.

Two families implement this archetype, and both are described together because the archetype is the contract they share rather than either one alone:

- **`tr-05`, Meadowbrook Wildlife Hospital** — wildlife rehabilitation volunteer intake and credentials.
- **`fam-05`, Independent Bookshop** — reading club member accounts, session cookies, and password resets (eval split: test).

## Use case

An organization establishing durable identities and secure sessions.

A **prospective member** fills out an intake form with contact data and a password, receiving an authenticated server session and immediately landing on a personal profile page. A **registered user** logs out and seamlessly logs back in; refreshing the profile page retains their active session securely. A **locked-out member** (`fam-05`) navigates an account recovery journey, generating a persistent reset token URL to securely establish a new password and log back in. The flow differs from a simple `record-form` because read views depend on the authenticated session identity rather than URL routing parameters alone.

## Routes and effects

The families declare their own routes. The archetype's common shape is a registration view, a login view, and a session-gated profile view.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | both | page | serves the landing page |
| `GET /register` | `tr-05` | page | serves the volunteer intake form |
| `POST /register` | `tr-05` | write-account | creates a volunteer account and redirects to `/volunteer/profile` |
| `GET /volunteer/profile` | `tr-05` | read-session | reads the authenticated profile |
| `GET /signup` | `fam-05` | page | serves the account registration form |
| `POST /signup` | `fam-05` | write-account | creates a user record, establishes a session cookie (`HttpOnly`), and redirects to `/profile` |
| `GET /login` | both | page | serves the credential authentication form |
| `POST /login` | both | write-session | establishes a session cookie for valid credentials and redirects |
| `GET /profile` | `fam-05` | read-session | reads the session cookie and serves the authenticated member profile |
| `GET /forgot-password` | `fam-05` | page | serves the password recovery request form |
| `POST /forgot-password` | `fam-05` | write | generates a persistent reset token |
| `GET /reset-password/:token` | `fam-05` | read-by-reference | serves the password update form validated by the reference token |
| `POST /reset-password/:token` | `fam-05` | write | updates the password credential |

**On the methods in that table.** The manifest declares routes as paths rather than methods. The methods shown are therefore only as firm as their source: `POST /register`, `POST /signup`, `POST /login`, `POST /forgot-password`, and `POST /reset-password/:token` are derived from the families' expected behaviors and assertions. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: user account records, credentials, onboarding profiles, and server session tokens. `fam-05` explicitly stores password reset tokens.
- **Session:** authenticated via cookies (`HttpOnly`, `SameSite`), tracking the logged-in user.
- **Write route:** `POST /register` and `POST /signup` establish the user record and initial session state.
- **Read route:** `GET /profile` reads the identity entirely from the session.

## Journey

The declared journeys. For the evaluation family (`fam-05`), these are quoted verbatim from the manifests. For the training family (`tr-05`), these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-05` (wildlife hospital):**
- Starts at `/`, submits `form#volunteer-registration-form` with `input[name=name]` `Morgan Reed`, `input[name=email]` `morgan.reed@example.test`, `input[name=phone]` `+44 7700 900456`, `input[name=password]` `Str0ng#Passw0rd!2026`, `textarea[name=notes]` `Wildlife first aid certified, 3 years mammal rescue experience`, selecting `select[name=vaccination]` `Tetanus only`, `select[name=experience]` `1 to 2 years experience`, `select[name=species]` `Small mammals and hedgehogs`.
- Expects `Morgan Reed` echoed back and again after a reload.
- Searches via `/search?q=Morgan` to verify the search endpoint finds the stored record.
- Its intake steps submit `/intake` having selected `select[name=vaccination]` `Tetanus only`, and `/intake/confirm` expects `Tetanus only` back.

**`fam-05` (independent bookshop):**
- register a new reading club member with an email, full name, and secure password, then automatically transition to the authenticated member profile page
- log out from the profile, log back in with valid credentials, verify the server session cookie, and reload `/profile` to confirm authentication persists
- request a password reset token for an existing email address, navigate to the reset link with token, set a new password, and verify the updated credential persists across reloads and allows subsequent login
- attempt login with incorrect credentials or submit an invalid signup form and verify that accessible error announcements alert screen reader users immediately

## Validation and states

- **Required fields:** User identity (`email`), credentials (`password`), and domain-specific attributes.
- **Password criteria:** `tr-05` explicitly asserts that passwords must meet strength criteria and display accessible inline feedback if invalid.
- **On a missing field or invalid login:** the server refuses the submission, returning HTTP `400` or `401`, and re-renders the form with an accessible error message (using `aria-invalid` and `aria-describedby`); nothing is stored or authenticated.
- **On success:** insert an account record or establish a session, and answer `303` with a Location header.
- **Security:** `fam-05` requires establishing a session cookie with `HttpOnly` and `SameSite` attributes, and requires inputs to utilize specific `autocomplete` tokens.

## Acceptance criteria

The families define specific observable assertions:

`tr-05`:
1. `POST /register` creates a volunteer account and redirects to `/volunteer/profile`
2. `POST /login` with valid credentials establishes a session and renders the saved profile
3. passwords must meet strength criteria and display accessible inline feedback if invalid

`fam-05`:
4. `POST /signup` creates a user record in server storage, establishes a session cookie with `HttpOnly` and `SameSite` attributes, and redirects to `/profile`
5. `GET /profile` returns HTTP 200 with the logged-in member name when a valid session cookie is present, and survives a browser reload
6. `POST /forgot-password` generates a persistent reset token; `POST /reset-password/:token` updates the member password so subsequent login with the new password succeeds
7. form validation failures and authentication errors are associated with input fields using `aria-invalid` and `aria-describedby` and announced to screen readers
8. `POST /signup` and `POST /login` forms have inputs with `autocomplete='email'` and `autocomplete='new-password'` or `autocomplete='current-password'`

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **One landing reference exists:** `tr-05/reference.jpg`. It depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- Only the training family (`tr-05`) has a single-step target in `docs/train/targets/` that evaluates a basic registration form in the harness. The evaluation family (`fam-05`) is declared as a brief in `docs/eval/briefs/manifest.jsonl` but has no single-step target in the sealed evaluation target set, and neither evaluates the full multi-step `onboarding-auth` session retention, sign-in, and reset token life cycles end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-05`) and `docs/eval/briefs/manifest.jsonl` (`fam-05`). Route names, field slugs, control types, selectors, fill values, and all acceptance criteria are quoted from those rows rather than invented.
- **The reference** is the training family's generated board, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `b2b-saas-signup` is listed.
