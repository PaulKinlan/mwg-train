---
archetype: booking
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/booking/
register: docs/provenance/assets/design-reference-booking.md
spec: docs/eval/specs/booking.json
---

# `booking` — functional contract

An evening-class booking surface: a weekly schedule to browse, one form that writes a booking, and a
receipt read back at the reference the server issued. This document is the contract for the `booking`
archetype - what a student can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan
documents are. What it describes is the accepted target at `docs/design/archetypes/booking/`, **not** the
sealed evaluation target under `docs/eval/targets/` and `data/A6_evaluation/`, which this document does
not describe.

## Use case

A training centre takes bookings for evening classes and shows the booking back to the student.

A **student** browses the week's schedule, chooses a class, fills one five-field form, and lands on a
receipt page at a reference URL they can return to or share. The centre's own view is the roster list:
the flow is a booking, not a payment, so no money moves and no card is ever asked for.

Three absences are part of the contract rather than gaps in it. The spec declares no session at all
(`session: false`, `password_field: null`), no edit, delete or search route, and no second form. A
rebuild that invents an account, a cancellation flow or a payment step has gone beyond the type, not
improved on it.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the schedule and the booking form the journey submits |
| `POST /book` | write | inserts one row and answers `303` with the reference in the `Location` header |
| `GET /booking/:ref` | read-by-reference | reads that row back and shows the booking, including the echoed notes |
| `GET /roster` | list | the type's list route |

The spec defines nothing else, and the family is expected to serve nothing else: the evaluation side's
plan is explicit that there is no edit, no delete and no search.

**Every declared route is served.** `scripts/check-pilot-served.mjs`, which runs inside `check:all`,
compares the route names a spec declares against those extracted from a generated server, and it files
**no** `declared_not_served` entry for this archetype - every declared route is answered by every
generated arm. That is a positive difference from `account-recovery`, whose reset write the generator
drops; here the divergence runs the other way, and the check records four routes each arm serves that
the spec does not declare - `GET /search`, `GET /inbox`, `GET /attendees`, `GET /cart` - as generator
fallbacks rather than anything this contract promises.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line, alive for one process. It is a store for the
  life of that process, not a durable store.
- **Table:** `records`, with `ref` (TEXT, primary key), `created_at` (TEXT, not null) and `payload`
  (TEXT, not null).
- **Write route:** `/book` inserts one row.
- **Read route:** `/booking/:ref` reads that row back by reference.
- **The reference:** server-issued, returned in the `Location` header of the `303` - never chosen by the
  client. A reference with no row behind it is not this archetype's success path at all: it is the `404`
  in *Validation and states*.

The row is the whole of the state. There is no basket, no draft, no seat hold and no session to expire,
so a booking either exists at its reference or it does not.

## Journey

The declared journey, verbatim from the spec:

- it starts at `/`;
- it submits `form#booking-form` with five fills - `input[name=name]` `Ada Lovelace`,
  `input[name=email]` `ada@example.test`, `input[name=address]` `12 Bridge Row`,
  `input[name=postcode]` `AB1 2CD`, and `textarea[name=notes]` `Window seat please`;
- and it expects to find `Ada Lovelace` on what the submit returns.

Two details are easy to lose. The journey's expected text is the **name**, while the value that proves
persistence is the **notes** - the spec's `echo` block names `notes` as the field echoed back into
`#booking-notes` on the read-by-reference route, which is what a reload assertion can check without
depending on layout. And the notes text is free prose: `Window seat please` is a value, not a label any
form has to print.

## Validation and states

- **Required fields:** `name`, `email`, `address`, `postcode`, `notes` - all five required.
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored.
- **On success:** insert one row and answer `303` with `Location: /booking/<ref>`.
- **On a missing reference:** a reference with no row is `404`, and the evaluation side's plan asks for a
  plain document rather than a styled page - a distinction worth keeping, because a styled "not found"
  page implies a designed state the contract does not have.
- **No session, by declaration:** the spec declares `session: false` and no password field, so there is no
  form token to embed and no cookie attribute to get wrong in this archetype's own terms. (The pilot's
  security record still reports a session-cookie verdict - see *Implementation status*, where it is
  recorded rather than explained away.)
- **Two states the target pictures beyond the happy path:** an error state, where the form is re-rendered
  with an error banner naming the fields to correct, and an empty state, where the schedule has no
  sessions for the chosen filter. Both are in the demo; the boards picture them too.

## Acceptance criteria

1. After a successful submit the browser lands on `/booking/<ref>` and the echoed notes text is present.
2. Reloading that URL still shows it, which is only possible if the server stored it.
3. An empty submit is observed to be refused by the server rather than silently accepted.
4. The reference in the URL was issued by this submission, not read from a row that already existed.
5. A submission missing any of the five required fields re-renders the form and stores nothing.
6. A reference with no row behind it answers `404` as a plain document.
7. The surface is served with no session and no password field.
8. The accepted target presents five states - browse, form, confirmation, error and empty - and each is
   reachable without a server: `demo/index.html` carries the browse and form views with an error banner
   and a state switcher, while `demo/confirmation.html` and `demo/empty.html` are separate pages.

Criteria 1 to 4 are the spec's own acceptance strings, quoted. Criterion 4 is the one that is easiest to
fake and hardest to check: a reference read from a row that already existed satisfies criteria 1 and 2
perfectly, so it needs its own assertion - a run against an empty store, where the only reference that
can exist is the one this submission was issued.

## Implementation status

- **Five arms are generated from the spec** - `pilot/projects/booking-{hono,preact,raw,react,vue}` -
  rebuilt by `node scripts/rebuild-from-spec.mjs --family booking`.
- **What the pilot records contain.** `docs/pilot/records.json`, produced by `scripts/pilot-records.mjs`,
  holds one entry per project per version. Seven of its 35 projects are booking arms - the five above plus
  `svelte` and `webcomponents`, which have no directory under `pilot/projects/` today - and each has an
  `original` and an `uplifted` entry, fourteen in all. Every entry carries the same three harness probes -
  `server-persistence`, `validation-failure` and `content` - plus per-rule status, security status and
  both tree hashes. Measured field by field:
  - `server-persistence` records the browser arriving at `/booking/<ref>` on all fourteen entries and
    reading `Window seat please` back as the persisted value - the notes text, as the `echo` block
    promises;
  - `validation-failure` records a visible error on all fourteen entries, the observation
    `refused-observed` on all seven arms, and a `serverRefused` flag that is true in six of the fourteen;
    its `stillOnForm` and `urlUnchanged` flags are true on some entries and false on others, so the
    record does not show one uniform refusal shape;
  - `security.session-cookie-attributes` is `FAIL` on every entry, and `form-token-exposure` is `PASS` on
    every entry;
  - the original and uplifted tree hashes are present for all seven arms and **differ in every one** - the
    uplift changed the tree in all seven cases;
  - no booking entry carries a response status at all.
- **Which criterion each of those evidences, and which it does not.** Criterion 1 is evidenced by the
  arrival at `/booking/<ref>`, and criterion 2 by the reload read-back. Criterion 3 is evidenced at arm
  level - `refused-observed` on all seven - while the per-entry `serverRefused` flag is true in six of
  fourteen. Criterion 4 is **not** evidenced by these records: nothing in them distinguishes a reference
  newly issued from one read out of an existing row, and the recorded `afterSubmit` URL shows only that a
  reference existed. Criterion 5 is only partly evidenced - a visible error is recorded, but no field
  records that nothing was stored. Criteria 6 and 7 are not evidenced here at all, and the records carry
  no response status, so neither the `303` nor the `Location` the spec declares appears in them.
- **A divergence, named rather than adjudicated.** The rule behind `session-cookie-attributes` requires a
  session cookie to be `HttpOnly`, to be `Secure` and to carry a SameSite value other than `None`, and it
  is recorded as `FAIL` on every booking entry - in an archetype whose spec declares `session: false`, no
  password field and no security journey. The record names neither the cookie nor the failing attribute,
  and the pilot serves over `http://127.0.0.1`, where a `Secure` cookie cannot be set at all. This
  document therefore records the status and does not claim to know what produced it.
- **The visual target is hand-written and static.** `demo/` holds a browse-and-form page with a state
  switcher, a confirmation page and an empty page, plus `compare.html` and its stylesheet; the five boards
  are the reference pictures. The demo's own README records the boundaries: it is not the sealed
  evaluation target, not part of the pilot corpus, and excluded from training
  (`excluded_from_training: true`, `approved_for_training: false`). It answers from no server, holds no
  credential and stores nothing.
- **The boards do not agree with each other, and three of them do not agree with the target.** All five
  are framed in a desktop browser window rather than showing unframed UI, and they disagree about which
  browser: steps 1 and 5 are drawn in a Safari frame, steps 2, 3 and 4 in a Chrome frame with a tab bar.
  Their step indicators describe three different flows - `1. Choose Class / 2. Details & Seats /
  3. Payment` on step 2, `1. Details / 2. Payment / 3. Confirmation` on step 3, and
  `Step 1: Choose Class / Step 2: Details & Seating / Step 3: Payment` on step 4 - while the accepted
  target's own stepper reads `1. Select Class`, `2. Details & Registration`, `3. Confirmation`, so no
  board matches the target and the flow cannot be both three steps ending at Payment and three steps
  ending at Confirmation. Each board also carries a **different logo mark** behind the constant
  `Evening Class Studio` wordmark, step 5 switches from the consumer storefront layout to an authenticated
  dashboard with a left sidebar of `Dashboard`, `Schedule`, `Classes`, `Instructors` and `Settings`, and
  step 4's seat grid is three rows by four columns where step 2's is four by six. Two further
differences are contract-level rather than decorative: the boards' forms carry a **phone number** field
and neither **address** nor **postcode** - two of the spec's five required fields - and two boards picture
a **seat picker** that no declared field describes, where the demo has no seat picker at all and mentions
seats only as a `5 seats left` capacity count and the wording of the notes placeholder. The bead that
would strip the browser chrome is `mwg-train-ondc`;
the stepper, logo, layout and field differences are not in its scope and are not covered by it.
- **The section order of this file is a convention, not a checked rule.** `test/design-contract.test.mjs`
  walks `docs/eval/design`, so the order and no-`###` shape of `docs/design/archetypes/*` documents is
  kept by hand. If that gap should close, it is a bead of its own.

## Provenance

- **The boards** are registered in
  [`docs/provenance/assets/design-reference-booking.md`](../../../provenance/assets/design-reference-booking.md),
  and [`README.md`](README.md) in this directory quotes a SHA-256 digest for each of the five files and
  the prompt each was generated from. They were generated rather than designed, so the disagreements
  above are evidence about the generator, not about the archetype.
- **The behaviour** is declared by [`docs/eval/specs/booking.json`](../../../eval/specs/booking.json). Its
  durability block records that it was authored on 2026-10-08, transcribed from the pilot archetype and
  hand-reviewed, and that `test/spec.test.mjs` keeps the spec and the pilot in step; it is replayed by
  `node scripts/rebuild-from-spec.mjs --family booking`.
- **The measurements** in this document were taken from the spec, from `scripts/check-pilot-served.mjs`,
  from `docs/pilot/records.json` and from the demo's own files. Where a number appears here it was read
  from one of those, not estimated.
