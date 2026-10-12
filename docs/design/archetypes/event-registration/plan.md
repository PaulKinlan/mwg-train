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

The **limited-capacity** contract is shared by three implementing families: all three enforce a cap.
`docs/train/briefs/TYPE-AXIS.md` line 67 **names** `event-registration` on the satisfied
`record-form` row, so this type is **quoted, not derived**.

| Family | Side | Subject | Distinguishing contract |
|---|---|---|---|
| `tr-07` | train | dark sky observatory public viewing night sign-up | party tickets decrement remaining viewing capacity |
| `tr-30` | train | low-tide beach cleanup zone assignment and kit allocation | valid beach zone and sector capacity allocation |
| `fam-07` | eval | coastal marine conservation volunteer weekend surveys | waitlist ordering and promotion after admin cancellation |

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

**Separate implementing-family routes (not the accepted target's route table above).** The manifests
list paths; the read and write methods below come from each family's own assertions, rather than
being inferred for every listed path.

| Family | Declared paths | Asserted write and read-by-reference |
|---|---|---|
| `tr-07` | `/`, `/events`, `/register/:eventId`, `/passes/:id` | `POST /register/:eventId` → `GET /passes/:id` |
| `tr-30` | `/`, `/cleanups`, `/cleanups/:id/register`, `/passes/:id` | `POST /cleanups/:id/register` → `GET /passes/:id` |
| `fam-07` | `/`, `/events`, `/events/:id/register`, `/registration/:id`, `/admin/events/:id` | `POST /events/:id/register` → `GET /registration/:id` |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line. The spec's **intended** lifetime for it is one
  process - it calls the store "per process ... not a durable store" - but that is the intent rather than an
  enforced behaviour, and the note below says what the generated arms actually do.
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
  read anything. The spec then promises less than it may sound: it calls the store "per process, in a file
  named on the command line - not a durable store", and the generated arm opens a **file-backed** database
  by default - `pilot.sqlite`, created with `CREATE TABLE IF NOT EXISTS` - which no arm deletes on shutdown.
  So a registration is not guaranteed to survive the process that wrote it, and it is not guaranteed to
  disappear either.

**Implementing-family fields and server state (not the target's sqlite schema).** `*` denotes
required; only `tr-07`'s `notes` is optional. `tr-07` has nine fields; its `date` is the only
`date`-typed field in the corpus. `tr-30` has only three fields, the fewest in the corpus.

| Family | Declared fields (type and required flag) | Select options |
|---|---|---|
| `tr-07` | `attendees:text*` (echoed), `email:email*`, `phone:tel*`, `date:date*`, `session:select*`, `party:number*`, `adults:number*`, `children:number*`, `notes:textarea` (optional) | `session`: Early Session (20:00 - 22:00); Late Session (22:30 - 01:00) |
| `tr-30` | `volunteer:text*` (echoed), `phone:tel*`, `zone:select*` | `zone`: North Cove; Harbour Wall; East Sands |
| `fam-07` | The evaluation side owns its field slugs; its journeys describe volunteer contact information, emergency contact, and dietary or accessibility needs. Its applicable rules are `accessibility/accessible-error-announcement`, `accessibility/accessibility`, `forms/required-field-feedback`, `ui-components/progress-ring` and `forms/autofill-address-form`; the first three are required rules. | Its field slugs and options are not restated here. |

The training families' fill and select values are distinct from the accepted target's fields.
`tr-07` fills `input[name=attendees]` with `Cassiopeia Vance`, `email` with
`cassiopeia@example.test`, `phone` with `+44 7700 900789`, `date` with `2026-10-24`,
`party` with `3` and `adults` with `2`; it selects `select[name=session]` =
`Late Session (22:30 - 01:00)`. `tr-30` fills `input[name=volunteer]` with `Priya Raman`,
`phone` with `+44 7700 900654` and selects `select[name=zone]` = `Harbour Wall`.

The training families also specify harness search, update and intake legs, separate from the accepted
target's journey. `tr-07` searches `/search?q=Cassiopeia` in `#search-results`, expects
`Cassiopeia Vance` and excludes `zzz-decoy`; its update changes `attendees` to
`Cassiopeia Vance (updated)`. At `/intake` it selects `Late Session (22:30 - 01:00)`;
`/intake/confirm` must return that text. `tr-30` searches `/search?q=Priya` in
`#search-results`, expects `Priya Raman` and excludes `zzz-decoy`; its update changes
`volunteer` to `Priya Raman (updated)`. At `/intake` it selects `Harbour Wall`;
`/intake/confirm` must return `Harbour Wall`.

The families' `server_persistence` statements are distinct: `tr-07` says "viewing night
registrations and remaining capacity quotas are stored on the server"; `tr-30` says
"cleanup volunteer registrations and sector capacity allocations are stored on the server";
`fam-07` says "event registrations, capacity quotas, waitlist ordering, and attendee status
updates persist in server storage across page reloads".

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

**Implementing-family journeys, distinct from the landed spec journey above.** `tr-07`
submits its named attendees, contact details, visit date, party sizes and late session,
expects `Cassiopeia Vance` echoed, then searches, updates and confirms intake as described
under *Data and state*. `tr-30` submits its volunteer contact and selected beach zone,
expects `Priya Raman` echoed, then searches, updates and confirms intake in the same way.

`fam-07`'s four journeys, quoted verbatim from `docs/eval/briefs/manifest.jsonl`:

1. "select an upcoming coastal shoreline wildlife survey event with limited volunteer capacity and start the multi-step registration process"
2. "navigate through the multi-step registration wizard: step 1 enters volunteer contact information, step 2 collects emergency contact and dietary or accessibility needs, and step 3 presents a review and confirmation screen"
3. "submit registration when capacity is available to receive a confirmed ticket reference, then reload the confirmation URL and verify registration status persists"
4. "attempt registration when an event reaches maximum capacity to be placed on a waitlist, and when an admin cancels an earlier attendee, verify the waitlisted volunteer is promoted to a confirmed slot and their status reflects this after reload"

## Validation and states

- **Required fields:** `name` and `email`. `ticket` is required too, and is a `select` over
  `standard`, `accessible` and `student`.
- **On a missing field:** per the spec, the server refuses the submission and re-renders the form, and
  nothing is stored.
- **On success:** the spec says the server inserts one row into `records` and answers `303` with a
  `Location` header pointing at the new registration's reference.
- **The eval spec leaves the waitlist state shapeless; the `fam-07` family contract defines it.**
  The spec's story promises that over-capacity registrations are waitlisted, and its third acceptance
  criterion requires the fourth to be waitlisted rather than silently accepted. The spec's state has no
  waitlist column and its target pictures no waitlist state; however `fam-07` journey 4 and assertion 3
  specify waitlist status and promotion of the **first waitlisted attendee** to confirmed when an admin
  cancels an earlier attendee, with that status still visible after reload.
- **No security journey is declared**, consistent with there being no session: `session` is false and
  `password_field` is null.

**Family refusals and validation:** `tr-07` prevents an over-capacity booking rather than issuing
an extra pass. `tr-30` requires a valid beach zone and accessible feedback when it is omitted.
`fam-07` requires `forms/required-field-feedback` and
`accessibility/accessible-error-announcement` (alongside `accessibility/accessibility`);
it also carries the corpus's only `ui-components/progress-ring` rule. Its seeded-defects
array is empty. These rules extend the family contracts, not the accepted target's validation.

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

**Implementing-family assertions: ten total** — three for `tr-07`, three for `tr-30`,
four for `fam-07`, quoted from the training and evaluation manifests and separate from the
accepted spec's three criteria above.

`tr-07`:

1. `POST /register/:eventId` **decrements available capacity** and redirects to `/passes/:id`
2. `GET /passes/:id` displays the confirmed attendee names, party size and visit date
3. attempting to book **more tickets than remaining capacity triggers an error and prevents booking**

`tr-30`:

1. `POST /cleanups/:id/register` saves the registration and **returns a pass ID**
2. `GET /passes/:id` displays the assigned beach zone and **safety briefing time** after reload
3. submission **requires choosing a valid beach zone** and displays **accessible error feedback** if omitted

`fam-07`:

1. "POST /events/:id/register stores multi-step form submissions on the server, enforcing capacity caps and redirecting to /registration/:id"
2. "GET /registration/:id shows confirmed or waitlisted status, attendee name, and event title across a browser reload"
3. "when event capacity is exceeded, subsequent submissions receive waitlist status; triggering an admin cancellation promotes the first waitlisted attendee to confirmed status"
4. "the multi-step registration form announces step progression, preserves entered values across step transitions, and links validation errors to their corresponding inputs with aria-describedby"

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
  selected by `?view=pass`, a side-by-side comparison page, and one stylesheet. It talks to no backend,
  holds no credential and stores nothing - not even in the browser, since it calls no storage API, and its
  script intercepts the form's submit (`preventDefault`) and renders the pass itself, so no registration is
  ever sent. It does load its own stylesheet and images, as a static page must. The pass it shows carries the
  literal sample name `Sarah Jenkins`, replaced from the attendee input only when the form is submitted.
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

- **Implementing-family references:** two committed training boards exist: `tr-07`'s dark
  [`reference.jpg`](../../training/tr-07/reference.jpg) and `tr-30`'s light
  [`reference.jpg`](../../training/tr-30/reference.jpg). There is **no `fam-07` reference**.
  Neither training board depicts a pass, ticket or confirmation view, even though every family's
  contract asserts a `GET /passes/:id` or `GET /registration/:id` read-by-reference.
  Outcome boards are designed from the briefs rather than copied from these two references.
  This does not replace this directory's own `step1-event.jpg` and `step2-pass.jpg` boards.

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
- **Family declarations:** [`docs/train/briefs/manifest.jsonl`](../../../train/briefs/manifest.jsonl),
  [`docs/eval/briefs/manifest.jsonl`](../../../eval/briefs/manifest.jsonl),
  [`tr-07/prompt.txt`](../../training/tr-07/prompt.txt) and
  [`tr-30/prompt.txt`](../../training/tr-30/prompt.txt). The training JPEGs above were measured
  with `sha256sum` and `stat -c%s`: `tr-07/reference.jpg` is 677609 bytes, SHA-256
  `db55eaa21f2709e8b2a803302c9b306fc4a92a7fa7329b47b383920382841eda`;
  `tr-30/reference.jpg` is 572091 bytes, SHA-256
  `d3bc8e0cffac6b45a834a558070da205c4cd7dddad05c7eed817057843613857`.
