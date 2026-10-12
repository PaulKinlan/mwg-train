---
archetype: booking
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/booking/
register: docs/provenance/assets/design-reference-booking.md
spec: docs/eval/specs/booking.json
---

# `booking` — functional contract

A multi-step booking journey: a schedule or service list to browse, one form that writes a reservation, and a
receipt read back at the reference the server issued. This document is the contract for the `booking`
archetype - what a user can do, what the server does about it, and what a journey can assert.

It covers the nine implementing families in this corpus: the seven training-side families (`tr-01`, `tr-03`, `tr-17`, `tr-19`, `tr-21`, `tr-24`, `tr-27`), the two evaluation-side families (`fam-01`, `fam-r01`), and the sealed pilot evaluation target (`docs/eval/specs/booking.json`).

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`). It describes the accepted targets and generated implementations, **not** the
sealed evaluation target under `docs/eval/targets/` and `data/A6_evaluation/`, which this document does
not describe.

## Use case

A service provider takes reservations from visitors and shows the confirmed booking back to the user.

A **user** browses the available services, schedules, or locations, chooses an option, fills a booking form, and lands on a
receipt page at a reference URL they can return to or share. The provider's own view is often a roster or schedule list:
the flow is a booking, not a payment, so no money moves and no card is ever asked for.

| Family | Split | Topic | Core constraint |
|---|---|---|---|
| pilot | eval | evening-class booking | standard slot-based booking without payment |
| `tr-01` | train | mobile bicycle mechanic service booking | doorstep location scheduling |
| `tr-03` | train | pottery studio shared kiln firings schedule | communal equipment reservation |
| `tr-17` | train | rural farm animal vet visit scheduling | veterinary field visit dispatch |
| `tr-19` | train | tidal river rowing skiff safety and tide tracker | safety manifest and crew roster |
| `tr-21` | train | volunteer driver hospital appointment lift coordination | transport logistics matching |
| `tr-24` | train | weekend farmers market pitch booking and power requirements | space allocation with resource limits |
| `tr-27` | train | parish church acoustic concert seat selection | venue seating reservations |
| `fam-01` | dev | community bicycle repair workshop appointments | bench time slot assignment |
| `fam-r01` | dev | village hall booking | date scheduling and accessibility (repair) |

Three absences are part of the contract rather than gaps in it. The specs declare no session at all
(`session: false`, `password_field: null`), no edit or delete route, and no second form. A
rebuild that invents an account, a cancellation flow or a payment step has gone beyond the type, not
improved on it.

## Routes and effects

The families all implement a multi-step journey: browse → form → write → read receipt. Many also include a staff-side list or public schedule.

| Family | Read routes | Write route |
|---|---|---|
| pilot | `/`, `/booking/:ref`, `/roster` | `POST /book` → `GET /booking/:ref` |
| `tr-01` | `/`, `/services`, `/bookings/:id` | `POST /book` → `GET /bookings/:id` |
| `tr-03` | `/`, `/kilns`, `/reservations/:id`, `/schedule` | `POST /reserve` → `GET /reservations/:id` |
| `tr-17` | `/`, `/services`, `/visits/:id` | `POST /book-visit` → `GET /visits/:id` |
| `tr-19` | `/`, `/skiffs`, `/outings/:id`, `/safety-log` | `POST /book-outing` → `GET /outings/:id` |
| `tr-21` | `/`, `/rides`, `/rides/:id`, `/dispatch` | `POST /book-ride` → `GET /rides/:id` |
| `tr-24` | `/`, `/pitches`, `/bookings/:id`, `/market-layout` | `POST /pitches/book` → `GET /bookings/:id` |
| `tr-27` | `/`, `/concerts`, `/reservations/:id` | `POST /concerts/:id/reserve` → `GET /reservations/:id` |
| `fam-01` | `/`, `/booking/:id`, `/roster` | `POST /book` → `GET /booking/:id` |
| `fam-r01` | `/`, `/bookings/:id` | `POST /book` → `GET /bookings/:id` |

The specs define nothing else, and the families are expected to serve nothing else: the evaluation side's
plan is explicit that there is no edit, no delete and no search.

**Every declared pilot route is served.** `scripts/check-pilot-served.mjs`, which runs inside `check:all`,
compares the route names a spec declares against those extracted from a generated server, and it files
**no** `declared_not_served` entry for the pilot archetype - every declared route is answered by every
generated arm. That is a positive difference from `account-recovery`, whose reset write the generator
drops; here the divergence runs the other way, and the check records four routes each arm serves that
the spec does not declare - `GET /search`, `GET /inbox`, `GET /attendees`, `GET /cart` - as generator
fallbacks rather than anything this contract promises.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line, alive for one process. It is a store for the
  life of that process, not a durable store.
- **Write route:** The booking endpoints (e.g. `/book`, `/reserve`) insert one row into the database.
- **Read route:** The receipt endpoints (e.g. `/booking/:ref`) read that row back by reference.
- **The reference:** server-issued, returned in the `Location` header of the `303` - never chosen by the
  client. A reference with no row behind it is not this archetype's success path at all: it is the `404`
  in *Validation and states*.

The row is the whole of the state. There is no basket, no draft, no seat hold and no session to expire,
so a booking either exists at its reference or it does not.

## Journey

The declared journeys. For evaluation families (`fam-01`, `fam-r01`), these are quoted verbatim from the manifests. For the training families, these are derived summaries of the structured `journey` objects defined in the manifest:

### `tr-01`
- browse available tune-up packages, choose a service, and proceed to booking
- enter contact details, service address, and select a time slot to submit
- view the booking confirmation reference and reload the page to confirm persistence

### `tr-03`
- explore the studio's available kilns and current firing schedule
- reserve a kiln by selecting a firing cycle, required shelves, and entering member details
- submit the reservation, receive a confirmation code, and verify it updates the schedule

### `tr-17`
- review the large animal veterinary services and check field visit availability
- complete the farm visit request with location, species, and presenting symptoms
- submit the request, note the confirmed visit reference, and reload to ensure the visit persists

### `tr-19`
- browse the fleet of available rowing skiffs and current tidal windows
- book an outing by submitting the safety manifest including lifejacket count and crew roster
- confirm the outing is recorded and appears in the club's safety log

### `tr-21`
- review the driver coordination board for available lift slots and hospital destinations
- book a ride by entering patient pickup details, appointment time, and mobility requirements
- submit the lift request, view the dispatch confirmation, and reload to verify persistence

### `tr-24`
- browse the market map and available weekend pitch locations
- reserve a pitch by entering vendor details, produce category, and electrical power needs
- complete the booking, view the pitch allocation reference, and ensure it shows as occupied on the layout

### `tr-27`
- view the upcoming parish church acoustic concerts and seating availability
- reserve a pew by selecting the section and entering attendee numbers and contact details
- submit the reservation to receive an allocated reference and ensure the booking persists

### pilot
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

### `fam-01`
- select a repair service tier, pick an available workshop bench time slot, fill in customer contact details, and view the persistent booking confirmation page
- reload the booking confirmation URL directly and verify that the booking reference, chosen service, bench slot, and contact details persist intact
- attempt submission with an empty phone number and an invalid email format to verify clear inline validation messages, then supply valid data to successfully confirm

### `fam-r01`
- make a booking with name, email and a chosen date, and see a confirmation with a reference
- reload the confirmation page and see the same booking
- complete the booking form using only the keyboard and confirm it succeeds

## Validation and states

- **Required fields:** Most fields across the families are strictly required (e.g. `customer`, `phone`, `kiln`, `symptoms`, `slot`).
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored. Every family explicitly tests validation refusal (e.g., submitting without a phone number or time slot).
- **On success:** insert one row and answer `303` with `Location: /booking/<ref>` (or family equivalent).
- **On a missing reference:** a reference with no row is `404`, and the evaluation side's plan asks for a
  plain document rather than a styled page - a distinction worth keeping, because a styled "not found"
  page implies a designed state the contract does not have.
- **No session, by declaration:** the specs declare `session: false` and no password field, so there is no
  form token to embed and no cookie attribute to get wrong in this archetype's own terms.
- **Two states the target pictures beyond the happy path:** an error state, where the form is re-rendered
  with an error banner naming the fields to correct, and an empty state, where the schedule has no
  sessions for the chosen filter. Both are in the demo; the boards picture them too.

## Acceptance criteria

The evaluation families define specific observable assertions:

`fam-01`:
1. POST `/book` with valid service, slot, cyclist name, email, and phone returns a redirect to `/booking/:id` with HTTP status `303` or `200` containing the assigned reference
2. GET `/booking/:id` shows the same repair service tier, appointment time, and contact name after a complete browser reload
3. submitting `/book` with an empty cyclist name or malformed email highlights the affected input fields with visible error text and `aria-describedby` associations
4. GET `/roster` renders a chronological table of all confirmed bench bookings stored on the server

`fam-r01`:
1. POST `/book` creates a booking and redirects to `/bookings/:id`
2. GET `/bookings/:id` after a reload shows the same reference and details
3. the date field has a programmatically associated label
4. the 'Book now' control is a real button that is keyboard-focusable and activates on `Enter`

The pilot specifies its own acceptance strings, quoted:
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

Criterion 4 is the one that is easiest to fake and hardest to check: a reference read from a row that already existed satisfies criteria 1 and 2 perfectly, so it needs its own assertion - a run against an empty store, where the only reference that can exist is the one this submission was issued.

## Implementation status

- **Five arms are generated from the pilot spec** - `pilot/projects/booking-{hono,preact,raw,react,vue}` -
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
- **The section order of this file is a convention, not a checked rule.** `test/design-contract.test.mjs`
  walks `docs/eval/design`, so the order and no-`###` shape of `docs/design/archetypes/*` documents is
  kept by hand. If that gap should close, it is a bead of its own.

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

- **The pilot boards** are registered in
  [`docs/provenance/assets/design-reference-booking.md`](../../../provenance/assets/design-reference-booking.md),
  and [`README.md`](README.md) in this directory quotes a SHA-256 digest for each of the five files and
  the prompt each was generated from. They were generated rather than designed, so the disagreements
  above are evidence about the generator, not about the archetype.
- **The training reference boards** are 7 distinct generation outcomes registered in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour** is declared by [`docs/eval/specs/booking.json`](../../../eval/specs/booking.json) for the pilot, and the respective JSONL manifest rows for the training and evaluation families. Its
  durability block records that it was authored on 2026-10-08, transcribed from the pilot archetype and
  hand-reviewed, and that `test/spec.test.mjs` keeps the spec and the pilot in step; it is replayed by
  `node scripts/rebuild-from-spec.mjs --family booking`.
- **The measurements** in this document were taken from the spec, from `scripts/check-pilot-served.mjs`,
  from `docs/pilot/records.json` and from the demo's own files. Where a number appears here it was read
  from one of those, not estimated.
