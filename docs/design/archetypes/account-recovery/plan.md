---
archetype: account-recovery
type: b2b-saas-signup
spec: docs/eval/specs/account-recovery.json
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/account-recovery/
register: docs/provenance/assets/design-reference-wave2.md
---

# `account-recovery` — functional contract

The behaviour of the `account-recovery` archetype: how a person creates an account, signs in, and asks
for a way back in when they cannot. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`),
so it is reviewable the same way the evaluation side's plan documents are.

Two things are stated up front because they change how the rest should be read. First, unlike the
type-axis plans, **this archetype is implemented**: its behaviour is a durable spec and a generated
family, not a proposal, and the spec is the authority for every claim below. Second, **its visual
target covers two states of that contract and not the others**, which is a real gap rather than an
omission - it is recorded under *Implementation status* rather than hidden by describing the boards as
if they showed the whole journey.

## Use case

Two roles, and the difference between them is the whole archetype: a **person who cannot get in** and
the **service that holds the account**. The person is locked out and holds only an address; the service
holds the credential and decides whether to issue a way back in.

The journey has two halves and they are deliberately unequal:

- **Creating and using an account.** A visitor supplies an address, a password and a display name; the
  service creates the account, issues a session, and shows the name the session identifies. Reloading
  the account page keeps showing it, and that persistence is what makes the session real rather than a
  receipt.
- **Recovering access.** Someone who is not signed in supplies only an address and asks for a recovery
  message. The service starts a reset and answers with an address the person can be sent to. There is
  no password in the recovery request and no account is named in it - the route answers the same way
  whether or not the address has an account, which is what stops it being an account-enumeration
  oracle.

This is the `b2b-saas-signup` type's "sign in and recover" half. The type's other half - a company or
workspace with a second actor and an owner-only boundary - is **not here**, and the axis says so:
[`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md) records this type as `partial` on exactly that
ground, with the missing half tracked as the `workspace` capability (`mwg-train-ksn`).

## Routes and effects

| Route | Actor | Effect |
| --- | --- | --- |
| `GET /` | visitor | The sign-up form: `email`, `password`, `displayName`. |
| `POST /signup` | visitor | `write-account`: creates the account, issues a session, and redirects to `/account`. |
| `GET /account` | session holder | `read-session`: reads the session and shows the display name it identifies. |
| `POST /reset` | locked-out person | `write-reset`: starts a password reset and redirects to a reference-addressed page. |
| `GET /reset/:ref` | holder of the reference | `read-by-reference`: reads the reset by reference and renders it. |

The distinction that makes this archetype worth having is in the last two route kinds. Three of these
five the shared engine can already express - a page, a write, a read. `GET /account` is answered from
**the session**, so the same request returns different things to different people; `GET /reset/:ref` is
answered from **a reference**, so it returns the same thing to whoever holds the address, signed in or
not. An archetype in which every read is answered from the request alone is the record-form type
wearing an account's noun, and it is the failure this contract exists to name.

One of these five the generated arms do **not** serve, and it is stated here rather than left for a
reader to discover: `POST /reset` is declared by the spec and dropped by the generator, which emits
only the first write route. That divergence is recorded as a named exception with its reason in
`scripts/check-pilot-served.mjs`, a check that compares the route names a spec declares against those
extracted from a generated server and runs as part of `check:all`; *Implementation status* records what
follows from it - and because that check compares names, it settles nothing about behaviour.

## Data and state

- `account`: `email`, `password`, `displayName`. All three are required; the spec declares no others.
- `session`: issued by `POST /signup`. It is what `GET /account` reads, and it is the only reason the
  display name survives a reload. The acceptance criteria pin its attributes rather than leaving them
  to an arm: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when the arm sets it.
- `reset`: a reference, created by `POST /reset` and read by `GET /reset/:ref`. No session and no
  credential is involved - the address is the authority, which is why it must not be guessable in a
  real service.
- **The credential is never rendered.** `password` is a field of the write and nothing else: it is not
  echoed, not read back, and not part of any page this contract describes.
- State that is deliberately absent: reading `GET /reset/:ref` requires no session, so recovery does
  not depend on being able to sign in - which is the point of recovery. Nothing in this archetype
  edits or deletes an account.

## Journey

Declared by the spec, exercised against the generated family - an account:

1. Start at `/`.
2. Fill `form#signup-form`: `input[name=email]` with `alan@example.test`, `input[name=password]` with a
   passphrase, `input[name=displayName]` with `Alan T`.
3. Submit. Expect the text `Alan T` back, read from the session the server issued.

Crafted by the visual target, exercised in a browser - a lockout, which is the two boards and
`demo/`:

4. On the request card, enter an address in `#email`. Before interaction the form shows no error; the
   message appears only after the field has been used and left invalid.
5. Submit a valid address. The request card is replaced by the sent card, the address is echoed into
   `#email-echo`, and focus moves to `#sent-title` so the change is announced rather than only seen.
6. Wait out the preview countdown: at zero a resend control appears, and using it restarts the preview
   without sending anything. Return to the request card, which comes back empty and focused.

Steps 4-6 are a **local preview of the second board**, not the served journey: the demo answers from no
server, and its sent state is recorded as illustrative text rather than as a completed request. The
sign-up half, steps 1-3, has no board at all.

## Validation and states

- **Required fields:** `email`, `password`, `displayName`. On a missing one the server refuses the
  submission and re-renders the form; no account is created. On success it creates the account, issues
  the session, and answers `303` with `Location: /account`.
- **Recovery takes an address and nothing else.** An empty or malformed address is refused by the
  field's own constraint before submission, so the recovery route is never reached with no input.
- **Errors are announced, not just coloured.** The invalid state adds `aria-invalid` and reveals a
  message bound to the field (`aria-errormessage`); the message persists after the field is corrected
  only long enough to clear it. A red border with no text is the failure this is written against.
- **Validation is deferred until it can be shown.** The form starts disabled and is enabled by script
  that installs the submit handler first, so an address cannot be submitted in a state where nothing
  would handle it, and no error is displayed before the person has interacted.
- **The sent state says what it is.** It is a preview: no message was sent, no link exists, and there is
  no expiry - the notice says so in as many words, and the controls that would imply otherwise are
  disabled and labelled.
- **States with no board, declared rather than implied:** the sign-up form, the account page, any error
  page, an empty state, and the reference-addressed page reached from a recovery message. The two
  boards depict the request form and the sent notice only. Nothing in this document should be read as
  saying the published pictures show the sign-up half of the contract.

## Acceptance criteria

1. `GET /` renders the sign-up form with `email`, `password` and `displayName`.
2. Submitting `form#signup-form` with all three fields creates the account and answers `303` with
   `Location: /account`.
3. `GET /account` shows the display name the session identifies, and a reload returns the same name -
   which holds only if the session is held by a cookie the browser sends back.
4. The session cookie carries `HttpOnly`, `SameSite=Lax` and `Path=/`, and `Secure` where the arm sets
   it.
5. An empty submit is refused, no account is created, and the form is re-rendered.
6. `POST /reset` with an address redirects to a reference-addressed page, and `GET /reset/:ref` renders
   it without a session.
7. The request card shows no error before interaction, and an error after an invalid field has been
   used and left.
8. A valid submit on the request card shows the sent state with the address echoed, and moves focus to
   its heading.
9. The preview countdown reaches zero and offers a resend, and neither the submit nor the countdown
   makes a network write: the demo serves nothing.
10. Returning from the sent state clears the field, restores the request card, and focuses the input.
11. The demo's two states are driven in a real browser at 390, 768 and 1280 pixels wide, with no
    horizontal overflow and no page exceptions, by this archetype's own
    `scripts/verify-account-recovery-demo.mjs` - covering criteria 7, 8 and 10 and the part of
    criterion 9 that the countdown ticks without a write, but not its end state: that run stops before
    the countdown reaches zero and never uses the resend control. Criteria 1 to 6 concern the generated
    arms rather than the demo and are not covered by it; *Implementation status* says which of them is
    measured where, and which is not met.

## Implementation status

**Implemented as a generated family, with a visual target that covers two of its states.** Being exact
about which half is which, because "there is a demo" and "the archetype is done" are not the same
claim:

- The behaviour is a durable spec, [`docs/eval/specs/account-recovery.json`](../../../eval/specs/account-recovery.json),
  and the evaluation side's plan for it is
  [`docs/eval/design/account-recovery/plan.md`](../../../eval/design/account-recovery/plan.md), which
  `npm run check:design-schema` checks against that spec. That plan and this one describe the same
  contract from two sides; where they differ, the spec is right and both are wrong.
- Five arms are generated from the spec - `pilot/projects/account-recovery-{hono,preact,raw,react,vue}`
  - rebuilt by `node scripts/rebuild-from-spec.mjs --family account-recovery`. Every declared `GET`
  route is answered, `/account` by the generated fallback.
- **The reset write is declared and not served, and the arms serve more than the spec declares.**
  `POST /reset` is dropped by the generator in all five arms, recorded with the reason "Generator only
  emits the first write route; /reset is dropped on account-recovery" as a named exception in
  `scripts/check-pilot-served.mjs`, which runs inside `check:all`. The same file records five routes
  each arm serves that the spec does not declare - `GET /search`, `/roster`, `/inbox`, `/attendees`,
  `/cart` - which are generator fallbacks rather than anything this contract promises. Criterion 6
  below is therefore a requirement the generated family does not currently meet, and reading this
  document's route table as a description of what the arms do would be wrong in exactly one row.
- **The arms' behaviour is measured, and the measurement is committed.** `docs/pilot/records.json`,
  produced by `scripts/pilot-records.mjs` from a run directory, holds one entry **per project per
  version**. For the account-recovery arms each entry carries the browser journeys this archetype
  declares - `server-persistence`, which reaches `/account` after a submit and reads the display name
  back on a reload; `validation-failure`, which records a refused submission with a visible error and
  the observation `refused-observed`; and `content` - together with per-rule status, security status and
  the tree hashes, for both the original and the uplifted build. So criteria 3 and 5 are measured
  directly - the display name is read back on a reload, and an empty submission is recorded as refused.
  Criterion 2 is measured only as far as where the browser arrived: these journey summaries record the
  landing address, not the response status, and the `303` the spec declares appears in one arm's record
  and not the others'. The records name **seven** arms, including `svelte` and `webcomponents`, while
  `pilot/projects/` holds five directories today: the file records a run, not the current tree.
- **The record also carries a divergence from criterion 4, named rather than explained.**
  `security.session-cookie-attributes` is recorded as `FAIL` for all seven arms in both builds. That
  rule requires the session cookie to be `HttpOnly`, to be `Secure` and to carry a SameSite value, and
  the pilot serves over `http://127.0.0.1`; the recorded status does not say which attribute produced
  the verdict, so this document records it and does not adjudicate it. Criterion 4's own wording -
  `Secure` "when the arm sets it" - is the qualification the spec already carries.
- **Which measurement covers which criterion.** Criterion 3 and criterion 5 are measured by the pilot
  records above, and criterion 2 only as far as the address the browser landed on; criterion 4 is
  measured there too and recorded as failing; criterion 1's route is covered only as a route name; and
  criterion 6 is not met. `check:pilot-served` compares route *names* and
  establishes nothing about fields, redirects, reload persistence, cookie attributes or refusal, so
  where this document says a criterion is measured it names the artefact that measures it rather than
  the check that happens to run beside it.
- The visual target is hand-written and static: `demo/` plus the two boards. It answers from no server,
  holds no credential, and sends nothing - the browser verifier asserts that submitting and letting the
  countdown run make no write. That is the design, not a shortfall: a preview that quietly claimed to
  have mailed a recovery link would be the more serious defect.
- **The boards cover the recovery half only.** Two states exist - the request form and the sent notice
  - and there is no board for the sign-up form, the account page, an error, an empty state, or the
  reference-addressed page. The sign-up half, which is the half the spec spends its fields and session
  rules on, is pictured nowhere. Treating these two boards as the archetype's whole visual record is
  the mistake this section exists to prevent.
- Beads: the epic is `mwg-train-qjkw` and this document is `mwg-train-tcsk`. `mwg-train-jnkx` is open
  and will re-render the boards as unframed UI - the two boards currently disagree about their own
  frame, and one currently asserts a sent message and an expiry that the spec does not promise.
  Credential verification and a second actor are `mwg-train-ksn` and are not part of this contract.
- The sealed evaluation target under `docs/eval/targets/account-recovery/` and `data/A6_evaluation/` is
  a different artefact with its own provenance. Nothing here describes it or was derived from it.

## Provenance

- The durable behaviour, fields, validation, journey and acceptance criteria:
  [`docs/eval/specs/account-recovery.json`](../../../eval/specs/account-recovery.json), with its
  evaluation-side plan beside it at
  [`docs/eval/design/account-recovery/plan.md`](../../../eval/design/account-recovery/plan.md).
- Reference boards, their prompts, their SHA-256 digests and the rights they are under:
  [`README.md`](README.md) and the register
  [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md).
  Both boards are `excluded_from_training: true` and `approved_for_training: false`; the Google
  consumer-account terms record prohibits using AI-generated service content to develop models, no
  seed was set, and the depicted address, expiry, countdown and link are invented illustrations rather
  than records of anything that happened.
- The aesthetic system for the same archetype: [`design.md`](design.md) beside this file.
- The type axis that classifies this archetype and records its missing half:
  [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md).
- The browser verifier whose run the acceptance criteria depend on:
  `scripts/verify-account-recovery-demo.mjs`, and the design-system contract this document follows:
  `src/design/contract.mjs` (`PLAN_SECTIONS`).
- Work: `mwg-train-qjkw` (epic), `mwg-train-tcsk` (this document), `mwg-train-jnkx` (board framing),
  `mwg-train-ksn` (the `workspace` capability this type's missing half needs).
