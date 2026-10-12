---
archetype: course-enrolment
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/course-enrolment/
register: docs/provenance/assets/training-reference-boards.md
---

# `course-enrolment` — functional contract

A curriculum and registration system: a catalog of educational offerings to browse, detailed syllabuses with dates and terrain constraints, an enrolment form, a confirmation voucher, and an empty state. This document is the contract for the `course-enrolment` archetype - what a student can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for the full multi-step flow - see *Implementation status*. Nothing here should be read as describing running software.

Two families implement this archetype, and both are described together because the archetype is the contract they share rather than either one alone:

- **`tr-09`, Forage & Fern Botanical School** — wild edibles identification field course booking.
- **`fam-09`, Marine Navigation Evening Classes** — coastal skipper evening classes and admin roster (eval split: dev).

## Use case

An educational or outdoor school lists structured courses with session dates and prerequisites, taking registrations and supplying confirmation vouchers.

A **student** browses the available courses, inspects the syllabus and prerequisites of a single course, fills out an enrolment form including emergency contacts, and lands on a confirmation voucher. The server stores the enrolment so that reloading the voucher page retains the registration. Instructors can also view an administrative roster of all enrolled students. The flow differs from a simple `booking` because the curriculum contains rich metadata (syllabus, duration, prerequisites) and the domain requires specific intake diligence (emergency contacts), making it a true `course` type rather than a transient record.

The spec declares no user account creation or password management, and no online card payment processing.

## Routes and effects

The families declare their own routes. The archetype's common shape is a catalog view, a read-by-reference detail view, and a write producing an enrolment voucher.

| Route | Family | Kind | Effect |
|---|---|---|---|
| `GET /` | both | page | serves the landing page |
| `GET /courses` | both | page | serves the course catalog / listing |
| `GET /courses/:id` | both | read-by-reference | serves the detailed syllabus, duration, terrain difficulty, and available dates for one course |
| `GET /enrol` | `tr-09` | page | serves the enrolment form |
| `POST /enrol` | `tr-09` | write | inserts an enrolment row and redirects |
| `GET /enrolments/:id` | `tr-09` | read-by-reference | reads the enrolment voucher by reference |
| `GET /enrol/:id` | `fam-09` | page | serves the enrolment form for a specific course |
| `POST /enrol/:id` | `fam-09` | write | inserts an enrolment row and answers `303` with the reference |
| `GET /enrolment/:ref` | `fam-09` | read-by-reference | reads the enrolment voucher by reference, showing the student name and session date |
| `GET /admin/roster` | `fam-09` | list | administrative view listing all enrolled students and their assigned course references |

**On the methods in that table.** The manifest declares routes as paths rather than methods. The methods shown are therefore only as firm as their source: `POST /enrol` and `POST /enrol/:id` are named by the families' assertions, as are the `GET` read-backs. The remaining routes are pages served by `GET`.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Stored on the server**, per the families' `server_persistence`: student enrolment records, assigned sessions, dietary/contact metadata, and the administrative roster.
- **Write routes:** `POST /enrol` and `POST /enrol/:id` store the enrolment securely.
- **Read by reference:** the families read the submitted state back by its identifier to verify persistence.
- **The reference:** server-issued reference, returned in the Location header of a `303` or `302` (`fam-09` allows either).

## Journey

The declared journeys. For the evaluation family (`fam-09`), these are quoted verbatim from the manifests. For the training family (`tr-09`), these are derived summaries of the structured `journey` objects defined in the manifest:

**`tr-09` (botanical school):**
- Starts at `/`, submits `form#course-enrolment-form` with `input[name=student]` `Maya Soren`, `input[name=contact]` `+44 7700 300456`, `textarea[name=dietary]` `No nuts; wheelchair access required`, selecting `select[name=course]` `Wild Greens Masterclass`, `select[name=session]` `Sunday 18 May`.
- Expects `Maya Soren` echoed back and again after a reload.
- Searches via `/search?q=Maya` to verify the search endpoint finds the stored record.
- Updates the `student` to `Maya Soren (updated)`.
- Its intake steps submit `/intake` having selected `select[name=course]` `Wild Greens Masterclass`, and `/intake/confirm` expects `Wild Greens Masterclass` back.

**`fam-09` (marine navigation):**
- browse available navigation courses, select Coastal Skipper Theory, complete the enrolment form with student details and emergency contact, submit and receive an enrolment confirmation reference
- reload the enrolment confirmation page by URL and verify that the course title, student name, and assigned cohort date persist exactly
- attempt to submit the enrolment form with an empty student name and invalid phone format, observe distinct inline error messages, supply corrected details, and successfully confirm

## Validation and states

- **Required fields:** Primary identities (`student`), contact details (`contact`), and session selections are strictly required.
- **Emergency Diligence:** `tr-09` explicitly asserts that submitting without an emergency contact number halts submission.
- **On a missing field:** the server refuses the submission, returning HTTP `400` (or rendering inline errors) and displaying distinct error messages; nothing is stored.
- **Empty state:** searching or filtering for an unavailable course topic returns an empty catalog state.

## Acceptance criteria

The families define specific observable assertions:

`tr-09`:
1. `POST /enrol` registers the student and redirects to `/enrolments/:id`
2. `GET /enrolments/:id` shows the course title, enrolled student name, and session date after reload
3. submitting without an emergency contact number halts submission and shows field validation

`fam-09`:
4. `POST /enrol/:id` with valid payload creates an enrolment and redirects to `/enrolment/:ref` with HTTP 302 or 303
5. `GET /enrolment/:ref` after server restart or full browser reload returns HTTP 200 containing the student name and course reference
6. submitting `/enrol/:id` without required student name returns an inline error associated with the input and does not persist a record
7. each form input on `/enrol/:id` has an explicit programmatic label element with a matching for/id attribute
8. `GET /admin/roster` returns HTTP 200 listing all enrolled students and their assigned course reference

## Implementation status

**Not implemented as a multi-step flow in the sealed pilot.** Being precise about what does exist:
- **One landing reference exists:** `tr-09/reference.jpg`. It depicts one page at one scroll position. The multi-step journey boards are planned and ungenerated.
- The single-step `tr-09` and `fam-09` targets are simple landing pages containing a form, but do not evaluate the full multi-step `course-enrolment` catalog, syllabus detail, or admin roster end-to-end.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-09`) and `docs/eval/briefs/manifest.jsonl` (`fam-09`). Route names, field slugs, control types, selectors, fill values, URL parameters, and all acceptance criteria are quoted from those rows rather than invented.
- **The reference** is the training family's generated board, digest-pinned in `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it. The journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `record-form` is listed.
