---
archetype: event-registration
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/event-registration/
register: docs/provenance/assets/design-reference-wave2.md
spec: docs/eval/specs/event-registration.json
---

# `event-registration` — functional contract

Registration for a limited-capacity event: an attendee picks tickets, gives a name and an email, submits,
and lands on a pass page at a server-issued reference they can come back to. The interesting part of the
contract is the one it cannot yet prove - the capacity rule - so this document is explicit about what is
declared, what is recorded, and which of the two the third acceptance criterion rests on.

It is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`). It describes the accepted target at
`docs/design/archetypes/event-registration/`, **not** the sealed evaluation target under
`docs/eval/targets/` and `data/A6_evaluation/`.

## Use case

A conference runs a two-day event with a fixed number of seats. An **attendee** chooses tickets, enters
their name and email, and receives a confirmation page carrying a reference they can revisit.

The spec's own story is the shortest statement of it: "Registration for a limited-capacity event, with a
server-enforced waitlist." The type axis agrees this is a `record-form` - the row for that type is the only
one it marks **satisfied**, and its family list names `event-registration` among the families it covers
(alongside `dashboard` and `directory-listing`). So this archetype is not waiting on a missing capability in
the same way the `blog` or `storefront` archetypes are; what it is waiting on is a *proof*, and that is
criterion 3's problem rather than a missing route.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the event page and the registration form |
| `POST /register` | write-with-capacity | registers the attendee and redirects to their reference |
| `GET /registration/:ref` | read-by-reference | reads one registration back by the reference the server issued |
| `GET /attendees` | list | lists registrations |

`write-with-capacity` is a kind of its own in this spec, not the `write` the record-form archetypes use.
The reference is returned in the `Location` header of a **303** rather than as a session, and there is no
second form (`extra_form` is null) and no declared security journey - the archetype has no account and no
session to protect.

**Every declared route is served.** `scripts/check-pilot-served.mjs` reports no `declared_not_served` entry
for this archetype. It does record four routes each generated arm serves that the spec does not declare -
`GET /search`, `GET /roster`, `GET /inbox` and `GET /cart` - five arms' worth, twenty exceptions in all.
Their reasons are not uniform: five entries are `Generator fallback` and fifteen are
`Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)`. None of the
four is capacity-aware; they are generator furniture.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line, alive for one process - a store for the life of
  that process, not a durable one.
- **Table:** one. `records` holds `ref` (TEXT, primary key), `created_at` (TEXT, not null) and `payload`
  (TEXT, not null) - the value a write stores, read back by the reference the server issued. Unlike the
  catalogue archetype, which also declares a `sessions` table, this spec declares nothing else.
- **The capacity is a scalar, not state.** The spec sets `capacity: 3` and puts the rule in its story and
  its third acceptance criterion; the declared state has **no counter and no waitlist column**. A server
  that enforces the rule therefore has to derive the count from the `records` rows it has already written,
  and the spec says nothing about how or when it does so. That is the gap criterion 3 sits in.
- **The reference is the whole key for a single record.** Persistence is by a server-issued reference
  returned in a `Location` header, and the reload assertion is "reloading `/registration/<ref>` still shows
  the stored attendee name" - so one registration is read back by its reference. The `GET /attendees` list
  route reads many at once, so the reference addresses a single record rather than being the only way to
  read anything; either way, nothing survives the process that wrote it.

## Journey

The declared journey is a form submission that asserts its own echo:

- it starts at `/`;
- it submits `form#registration-form`, filling `input[name=name]` with `Katherine Johnson` and
  `input[name=email]` with `kj@example.test`;
- and it expects `Katherine Johnson` back.

The spec's `echo` block names where that name should appear - field `name`, container `#attendee-name`, on
the `read-by-reference` route - so a run that stays on the form is not the journey passing. Two quirks are
worth naming. The third field, `ticket`, is **required** yet the journey never fills it, so a generated form
has to satisfy that requirement some other way (a default selection) for the declared journey to submit at
all. And there is **no write journey**: the spec's `write_journey` is null, which is why the records below
carry no `write-journey` probe and why criterion 3 is not covered by one either.

## Validation and states

- **Required fields:** `name` and `email`. `ticket` is required too, and is a `select` over
  `standard`, `accessible` and `student`.
- **On a missing field:** per the spec, the server refuses the submission and re-renders the form, and
  nothing is stored.
- **On success:** the spec says the server inserts one row into `records` and answers `303` with a
  `Location` header pointing at the new registration's reference.
- **The waitlist state is declared but has no shape.** The story promises that over-capacity registrations
  are waitlisted, and the third acceptance criterion requires the fourth to be waitlisted rather than
  silently accepted - but no route, field, column or journey describes what a waitlisted registration looks
  like, and the target pictures no waitlist state at all.
- **No security journey is declared**, consistent with there being no session: `session` is false and
  `password_field` is null.

## Acceptance criteria

1. After a successful submit the browser lands on `/registration/<ref>` and the echoed attendee name is
   present.
2. Reloading that URL still shows it.
3. The capacity rule is enforced by the server, so the fourth registration is waitlisted rather than
   silently accepted.

All three are the spec's own strings. What the repo can show for each is very uneven, and this is the most
useful thing this document can record:

- **Criterion 1 is evidenced directly.** In all fourteen pilot entries the `server-persistence` probe's
  `afterSubmit` value is a `/registration/<ref>` URL, one per entry - the first is
  `http://127.0.0.1:4356/registration/61483c64` and the other thirteen run from `.../6fb90c8b` to
  `.../fa49c4fb` - so the landing page after a submit is recorded, not inferred.
- **Criterion 2 is evidenced directly.** The same probe's `persistedText` is `Katherine Johnson` in all
  fourteen entries, which is the reload assertion's own subject: the stored attendee name comes back.
- **Criterion 3 is evidenced nowhere.** Measured across all fourteen entries and all three probes, **no key
  or value mentions capacity or waitlist** - zero of fourteen. The spec declares `write_journey: null`, so
  no journey exercises it; `scripts/check-pilot-served.mjs` never mentions capacity; no test in `test/`
  covers it; the target implements no waitlist logic (no `waitlist`, `soldOut` or `remaining` anywhere in
  its markup); and the boards picture a seats-filled count rather than a waitlist. The practical consequence
  is worth stating plainly: **a rebuild that accepted every registration, however many arrived, would
  satisfy every recorded check in this repository.** The rule is real in the spec and unverified in the
  corpus.

## Implementation status

- **Five arms are generated from the spec** - `pilot/projects/event-registration-{hono,preact,raw,react,vue}`
  - rebuilt by `node scripts/rebuild-from-spec.mjs --family event-registration`.
- **What the pilot records contain.** `docs/pilot/records.json` holds an `original` and an `uplifted` entry
  for each of seven arms (the five above plus `svelte` and `webcomponents`, which have no directory under
  `pilot/projects/` today) - fourteen entries. Each carries **three** harness probes:
  `server-persistence`, `validation-failure` and `content`, and no write probe, since the spec declares no
  write journey. Measured field by field:
  - `validation-failure` observes `refused-observed` on all seven arms, and the two versions differ in a way
    worth recording rather than averaging. In the **original** entries five arms (preact, raw, svelte, vue,
    webcomponents) recorded a server refusal - `serverRefused: true`, one visible error, nothing on the form
    - while `hono` and `react` recorded two invalid fields and no refusal. In every **uplifted** entry all
    seven record two invalid fields and no refusal. So the uplift did not add refusals; it moved every arm
    onto the client-side invalid-field treatment, and the refusals are a property of the original
    generators, not of the archetype.
  - `server-persistence` records `echoed` as `Katherine Johnson` on all fourteen, plus `echoedText` and
    `textLength`, and the `afterSubmit` and `persistedText` values quoted under *Acceptance criteria*.
  - `security.session-cookie-attributes` is `FAIL` on all fourteen entries and `form-token-exposure` is
    `PASS` on all fourteen. Neither is surprising here and neither should be read as a defect: this
    archetype declares **no session**, so there is no session cookie for the rule to inspect, and no
    credential is collected, so there is nothing for a token-exposure rule to find.
  - **No response status is recorded anywhere.** Unlike the catalogue archetype's records, which carry
    `status: 303` and a read status, these entries carry no status field at all - the 303 in this contract
    comes from the spec and from `afterSubmit` being a `/registration/<ref>` URL, not from a recorded
    status. A reader checking the redirect has to infer it from the landing page.
  - Both tree hashes are present for all seven arms and **differ in every one**; unlike the catalogue
    archetype's single identical pair, no arm's uplift left its tree unchanged.
- **The visual target is hand-written and static.** `demo/` holds an event page (`index.html`), a pass view
  selected by `?view=pass`, a side-by-side comparison page, and one stylesheet. It answers from no server,
  holds no credential and stores nothing - not even in the browser, since the demo calls no storage API and
  issues no request; the reference it shows, `#attendee-name` carrying `Sarah Jenkins`, is scripted from the
  attendee input.
- **The boards are two pictures of one event, framed differently, and one of them is a deliberate
  exception.** The frames rule (`check:archetype-frames`, part of `check:all`) detects browser chrome in
  `step1-event.jpg` and lists it as a **grandfathered** image rather than a failure, because the rule was
  introduced after these rasters were captured; `step2-pass.jpg` is full-bleed with no chrome. That is the
  checked state of the pair, and it is recorded here so nobody reads the exemption as a defect to fix or as
  an accident.
- **The boards promise more than the contract declares.** They agree on the event, the brand and the
  currency - one shop, unlike some other archetypes' reference sets - but they disagree with each other and
  with the spec about the flow and the tickets: the first board's stepper reads
  `01. Tickets & Details / 02. Payment / 03. Confirmation` where the second's reads
  `01 Details / 02 Your Pass`; the first shows a General Admission ticket selected at £120 with Workshop
  Pass at £220, while the second's pass is for the Workshop Pass; and the attendee name is a placeholder
  (`Alex Morgan`) on the first board, `Sarah Jenkins` on the second, and `Katherine Johnson` in the journey.
  The spec's `ticket` is a `select` over `standard`, `accessible` and `student`; the target's tickets are two
  quantity steppers (`data-tier="general"` and `data-tier="workshop"`), and the prices, the
  `142 / 200 seats filled` count and the pass's `Principal Engineer` are all invented. This directory's
  `README.md` already says as much in its own words - the depicted content is "unverified placeholders" and
  the raster QR graphic "is not a valid check-in pass; do not scan or use it" - so the disclaimer is a
  property of the reference set, not something this document is adding.
- **The section order of this file is a convention, not a checked rule.** `test/design-contract.test.mjs`
  walks `docs/eval/design`, so the order and no-`###` shape of `docs/design/archetypes/*` documents is kept
  by hand.

## Provenance

- **The boards** are registered in
  [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md),
  whose scope names this archetype, and [`README.md`](README.md) in this directory carries a SHA-256 digest
  and a byte count for each of the two files, the rights boundary, and the "unverified placeholders"
  sentence quoted above.
- **The behaviour** is declared by
  [`docs/eval/specs/event-registration.json`](../../../eval/specs/event-registration.json). Its durability
  block records that it was authored on 2026-10-08, transcribed from the pilot archetype and hand-reviewed,
  and that `test/spec.test.mjs` keeps the spec and the pilot in step; it is replayed by
  `node scripts/rebuild-from-spec.mjs --family event-registration`. The evaluation side has its own plan at
  [`docs/eval/design/event-registration/plan.md`](../../../eval/design/event-registration/plan.md), which
  this document does not restate.
- **The measurements** here were taken from the spec, from `scripts/check-pilot-served.mjs`,
  `scripts/check-archetype-frames.mjs`, `docs/pilot/records.json`, this directory's `README.md`, the demo's
  markup and stylesheet, and the two JPEGs. Where a number appears it was read from one of those.
