---
archetype: support-helpdesk
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/support-helpdesk/
register: docs/provenance/assets/training-reference-boards.md
---

# `support-helpdesk` — functional contract

The behaviour of the `record-form` type as the `support-helpdesk` archetype implements it. This document is the
archetype's contract: who files a request, what they submit, what the staff side does with it, and what a
journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan documents
are. It is **not** checked against a generated demo, because there is no generated demo for the five-step flow
and no evaluation spec for this archetype — see *Implementation status*. Nothing here should be read as
describing running software.

**Three families implement this archetype**, and they are not interchangeable. Two are training-side and one is
evaluation-side, and the evaluation-side family carries two capabilities the training families do not:

| Family | Side | Subject | Distinctive behaviour |
|---|---|---|---|
| `tr-08` | train | Community darkroom maintenance and supply requests | a validation assertion that a missing category highlights the field |
| `tr-28` | train | Outdoor equipment loan repair and missing part tickets | a gear list route in front of the ticket desk |
| `fam-08` | eval | Community radio station listener inquiries and equipment issues | a **staff queue**, a **reply** write, and collapsible content that must be keyboard operable |

## Use case

Two roles, and the archetype only works when both are modelled. A **reporter** — a co-op member with a
misbehaving enlarger, a listener with a dropped stream, a young person with a torn backpack — files a request
and then has to find it again. An **agent** — a darkroom technician, a station engineer, a gear-locker
volunteer — works a queue of requests, changes their status, and answers them.

That second role is what distinguishes this archetype from the other `record-form` archetypes. `booking`,
`event-registration` and `job-board` all end at a receipt; a helpdesk does not. The request has a **life after
submission** — a status, and on the evaluation-side family a reply thread — and the staff side reads the queue
rather than an individual record. The archetype's own first prohibition says it plainly: "a ticket reference
shown once and never recoverable again".

The frequency of that prohibition across the families is worth recording: all three state it, which is a
stronger signal than one family stating it.

`TYPE-AXIS.md` names this archetype on the `record-form` row with two families, the type the axis marks as
covered. Two training families and one evaluation family exist here, so the axis's count of two refers to the
training side; the evaluation-side family is additional rather than a fourth subject. The archetype is
`record-form` rather than a type of its own for the reason the axis gives: a list, a write producing one
record, and a read-by-reference receipt is the same behavioural contract whatever the subject is.

## Routes and effects

| Route | Kind | Families | Effect |
|---|---|---|---|
| `GET /` | page | all three | serves the desk's landing view and its route into the ticket form |
| `GET /tickets` | page | all three | serves the ticket list |
| `POST /tickets/new` | write | all three | stores one ticket and redirects to its receipt |
| `GET /tickets/:id` | read-by-reference | all three | reads one ticket back by its own reference |
| `GET /gear` | page | `tr-28` | serves the equipment list the ticket is filed against |
| `GET /agent/queue` | page | `fam-08` | serves the staff queue of open tickets |
| `POST /tickets/:id/reply` | write | `fam-08` | appends a staff response and changes the ticket's status |

**On the methods.** The manifests declare routes as paths and carry no `method` key, so the methods above are
only as firm as their source, and their sources differ by family. On the training side, `POST /tickets/new` is
named by the first assertion of both families. On the evaluation side the row's assertions name three
methods — `POST /tickets/new`, `GET /tickets/:id` and `POST /tickets/:id/reply` — which is why the reply route
is the only one in this table whose method a brief states directly. `GET /tickets`, `GET /gear` and
`GET /agent/queue` rest on their kind column alone; `/agent/queue` is a page by its assertion's description of
staff who "access the agent queue", not by any stated method.

## Data and state

- **Stored on the server**, per every family's `server_persistence`: tickets, their statuses, and — on the
  evaluation side — technician replies and status changes, persisting across reloads.
- **The ticket** carries a reporter, the thing that is broken, a category, an urgency, and a description:

  | Family | Fields |
  |---|---|
  | `tr-08` | `reporter` (text, required), `equipment` (text, required, echoed), `category` (select, required: Enlarger malfunction, Chemical replenishment (Fixer/Dev), Safelight / Timer electrical, Water supply / Wash bath), `urgency` (select, required: Routine maintenance, Needs attention today, Urgent / Darkroom unusable), `description` (textarea, required) |
  | `tr-28` | `reporter` (text, required, echoed), `serial` (text, required), `gear` (select, required: Tent, Backpack, Sleeping bag, Stove), `issue` (textarea, required), `urgency` (select, required: Low, Normal, Urgent) |
  | `fam-08` | the brief's prompt and journeys name name, email, broadcast frequency or studio room, issue category and urgency; the field slugs are the evaluation side's own and are not restated here |

- **The category taxonomy differs by subject, and that is the point.** A darkroom's categories are chemistry
  and equipment faults; a gear locker's are equipment types; a radio station's are broadcast and studio faults.
  The archetype fixes the *shape* — a required select carrying the taxonomy — not the values.
- **The reference** is the ticket's identity. It is produced by the write and is the address of the read, which
  is why every family prohibits a reference that cannot be recovered.
- **The status** is server state, not client state: both training families assert that a refresh still shows
  the current status, and the evaluation side asserts that a reply changes it and that the change is visible to
  subsequent reads.
- **The reply** (`fam-08` only) appends staff notes to the ticket, so the evaluation-side family's record has a
  history rather than only a current value.

## Journey

Each family declares its own journey. They share a shape — file, land on the receipt, read it back, search for
it, amend it — and differ in values and in what the third step asserts.

**`tr-08`, the darkroom.** It starts at `/`, files `form#darkroom-ticket-form` with `input[name=reporter]`
`Julian Alvarez`, `input[name=equipment]` `Beseler 23C II Enlarger` and `textarea[name=description]` `Timer
relay sticks on exposure times over 15 seconds`, selecting `select[name=category]` `Chemical replenishment
(Fixer/Dev)` and `select[name=urgency]` `Needs attention today`. It expects `Beseler 23C II Enlarger` echoed
back by what the submit returns, then again after a reload. Its search leg queries `/search?q=Beseler`, reads
`#search-results`, expects `Beseler 23C II Enlarger` among them and the decoy `zzz-decoy` absent. Its update
leg rewrites `equipment` to `Beseler 23C II Enlarger (updated)`. Its intake steps submit `/intake` having
selected `select[name=category]` `Chemical replenishment (Fixer/Dev)`, and `/intake/confirm` expects to read
that category back.

**`tr-28`, the gear locker.** It starts at `/`, files `form#ticket-form` with `input[name=reporter]` `Dara
Whitfield`, `input[name=serial]` `TENT-4417-KX` and `textarea[name=issue]` `Zipper teeth missing on the inner
door`, selecting `select[name=gear]` `Backpack` and `select[name=urgency]` `Normal`. It expects `Dara
Whitfield` echoed back, and again after a reload. Its search leg queries `/search?q=Dara`, reads
`#search-results`, expects `Dara Whitfield` and expects `zzz-decoy` absent. Its update leg rewrites `reporter`
to `Dara Whitfield (updated)`. Its intake steps submit `/intake` having selected `select[name=gear]`
`Backpack`, and `/intake/confirm` expects `Backpack` back.

**`fam-08`, the radio station.** The row states four journeys rather than a fill/select fixture, and they are
the contract for the evaluation-side family. Quoted verbatim:

1. "file a new support ticket regarding a radio broadcast issue or studio equipment malfunction, specifying
   issue category, urgency, listener name, and email"
2. "view the generated ticket status page, verify the assigned ticket reference and initial open status, then
   reload the page to confirm the details persist"
3. "station engineers access the agent queue, select an open ticket, post an internal response or status update,
   and verify the update updates the ticket record"
4. "submit an invalid ticket submission with missing mandatory fields and verify accessible inline validation
   errors appear without clearing valid inputs"

Mapped to the five planned boards: step 1 the ticket desk as a new request → `step1-queue`, step 2 the ticket
form → `step2-form`, step 3 the receipt → `step3-status`, step 4 the staff side working the queue and replying
→ `step4-reply`, step 5 empty → `step5-empty`. Step 4 is the step the training families do not depict at all
and the evaluation-side family makes central.

## Validation and states

- **Required fields:** every family marks them, and every family also asserts the accessible consequence rather
  than only the rule. `tr-08`'s third assertion is that submitting without a category **highlights the field
  with an accessible message**; `tr-28`'s third is that inputs provide **programmatic labels** and accessible
  error feedback when invalid; `fam-08` asserts inputs carry associated labels and mark required fields with
  `aria-required='true'`, and that an invalid submission shows inline validation **without clearing valid
  inputs**.
- **Announcing the error is part of the contract, not polish.** Both training families carry
  `accessibility/accessible-error-announcement` among their applicable rules, so an error that is visible but
  not announced is a defect.
- **Collapsible content must stay operable** (`fam-08` only, and required rather than applicable): the row
  requires `ui-behaviors/interactive-content-reveal` and asserts that queue filters and interactive accordions
  maintain keyboard focus management and expose expanded states. A reveal animation that traps focus is a
  correctness failure here.
- **The taxonomy is required.** A ticket filed without a category or an urgency is incomplete by the shape of
  every family's field list, so a form that lets either be omitted is not the archetype.
- **The reference must survive.** With all three families prohibiting a reference shown once and never
  recoverable, the receipt is a page the reporter can return to, not a confirmation toast.
- **A ticket without an owner or a status is a defect** in the same way a job posting without terms is: the
  staff side of the archetype is what makes the record useful.
- **Empty state:** a queue or search with no match renders an empty state naming what did not match. Planned as
  `step5-empty`.

## Acceptance criteria

**`tr-08`:** (1) `POST /tickets/new` creates a support ticket with timestamp and redirects to `/tickets/:id`.
(2) `GET /tickets/:id` displays the logged equipment name, fault description, and current status.
(3) submitting a ticket without selecting an issue category highlights the field with an accessible message.

**`tr-28`:** (1) `POST /tickets/new` saves the maintenance ticket to the server and redirects to `/tickets/:id`.
(2) `GET /tickets/:id` shows the gear item, defect description, and urgency rating after a refresh.
(3) form inputs provide programmatic labels and accessible error feedback when invalid.

**`fam-08`:** (1) `POST /tickets/new` creates a support ticket on the server with a unique identifier and
redirects to `/tickets/:id`. (2) `GET /tickets/:id` displays the ticket category, urgency level, original
message body, and current status following a browser refresh. (3) `POST /tickets/:id/reply` updates ticket
status and appends agent response notes visible in subsequent `GET` requests. (4) form input elements include
associated label elements and indicate required fields programmatically with `aria-required='true'`.
(5) ticket queue filters and interactive accordions maintain keyboard focus management and expose expanded
states.

All eleven criteria are quoted from the two manifests rather than restated.

## Implementation status

**Not implemented as a five-step flow.** Being precise about what does exist:

- **Two landing references exist, one for each training family**:
  [`tr-08/reference.jpg`](../../training/tr-08/reference.jpg) — 1376 × 768, 630915 bytes, sha256 `5c6b678c…`,
  the darkroom desk — and [`tr-28/reference.jpg`](../../training/tr-28/reference.jpg) — 1376 × 768, 650898
  bytes, sha256 `d49bbd4b…`, the gear locker. Each is pinned in the
  [training reference register](../../../provenance/assets/training-reference-boards.md) alongside its declared
  prompt. Each depicts **one page at one scroll position**, and neither is a picture of the five states above.
- **The two boards are different designs, not two renders of one.** Their token prefixes differ (`dr-` and
  `th-`), their palettes differ, and one declares a light palette while the other declares a dark, low-glare
  one. A generator must not average them.
- **The evaluation-side family has no reference board here.** There is no `fam-08` board in
  `docs/design/training/`, and the evaluation side's assets are not this directory's to depict.
- **The five journey boards are planned, not generated.** `step1-queue`, `step2-form`, `step3-status`,
  `step4-reply` and `step5-empty` exist in no ref, and this directory holds no committed board of its own.
- **The train-side pairs and targets do exist:** `docs/train/design/{tr-08,tr-28}/{plan,design}.md` and
  `docs/train/targets/{tr-08,tr-28}/index.html`.
- **What the engine offers is capability, not implementation.** The shared engine can render a list, a
  read-by-reference page and a write, and these families use those for tickets and a receipt. No family in the
  corpus supports the staff queue, or a reply that appends to a record, or a collapsible reveal whose expanded
  state is asserted.
- **No evaluation spec:** there is no `docs/eval/specs/support-helpdesk.json`. This contract is validated by
  section order and internal consistency, not against a spec.
- **The briefs:** four training rows (`tr-08-v1`, `tr-08-v2`, `tr-28-v1`, `tr-28-v2`) and three evaluation
  rows (`fam-08-v1`, `fam-08-v2`, `fam-08-v3`); each family's variants are the same contract in a different
  voice.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (families `tr-08`, `tr-28`) and
  `docs/eval/briefs/manifest.jsonl` (family `fam-08`). Route names, field slugs, control types, option lists,
  form selectors, fill values, select values, search legs, update legs, intake steps, journeys and all eleven
  acceptance criteria are quoted from those rows rather than invented.
- **The two references** are the training families' generated boards, digest-pinned in
  `docs/provenance/assets/training-reference-boards.md`; the prompts that declared them are committed beside
  them. The five journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `support-helpdesk` is named on
  the `record-form` row — the one type the axis marks as covered — with two families.
