---
archetype: course-enrolment
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/course-enrolment/
---

# `course-enrolment` — functional contract

A curriculum and registration system: a catalog of educational offerings to browse, detailed syllabuses with dates and terrain constraints, an enrolment form, a confirmation voucher, and an empty state. This document is the contract for the `course-enrolment` archetype - what a student can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). It is **not** checked against a generated demo, because there is no generated demo for this multi-step type yet - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

An outdoor field and botanical school lists structured courses with session dates and prerequisites, taking registrations and supplying confirmation vouchers.

A **student** browses the available courses, inspects the syllabus and prerequisites of a single course, fills out an enrolment form including emergency contacts, and lands on a confirmation voucher. The server stores the enrolment so that reloading the voucher page retains the registration. Instructors can also view an administrative roster of all enrolled students. The flow differs from a simple `booking` because the curriculum contains rich metadata (syllabus, duration, prerequisites) and the domain requires specific intake diligence (emergency contacts), making it a true `course` type rather than a transient record.

The spec declares no user account creation or password management, and no online card payment processing.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the landing page |
| `GET /courses` | page | serves the course catalog / listing |
| `GET /courses/:id` | read-by-reference | serves the detailed syllabus, duration, terrain difficulty, and available dates for one course |
| `POST /enrol` | write | inserts an enrolment row and answers `303` with the reference in the `Location` header |
| `GET /enrolment/:ref` | read-by-reference | reads the enrolment voucher by reference, showing the student name and session date |
| `GET /admin/roster` | list | administrative view listing all enrolled students and their assigned course references |

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `enrolments`, with `ref` (TEXT, primary key), `course_id` (TEXT, not null), `student_name` (TEXT, not null), `email` (TEXT, not null), and `contact_phone` (TEXT, not null).
- **Write route:** `/enrol` stores the enrolment.
- **Read route:** `/enrolment/:ref` reads the enrolment by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, derived from the `fam-09` spec:

- it starts at `/courses` (catalog);
- it navigates to `/courses/:id` to view the syllabus and available dates;
- it submits the enrolment form with fills - `input[name=student]` `Maya Soren`, `input[name=email]` `maya@example.test`, `input[name=contact]` `+44 7700 300456`;
- and it expects to find `Maya Soren` on what the submit returns at `/enrolment/:ref`.
- The instructor navigates to `/admin/roster` and sees the newly created enrolment.

## Validation and states

- **Required fields:** `student`, `email`, `contact`.
- **On a missing field:** the server refuses the submission and re-renders the form with an inline error message; nothing is stored.
- **On success:** insert one row into enrolments and answer 303 with Location: /enrolment/<ref>.
- **Empty state:** searching or filtering for an unavailable course topic returns an empty catalog state.

## Acceptance criteria

1. after a successful submit the browser lands on /enrolment/<ref> and the echoed student name is present
2. reloading that URL still shows it, proving server-side persistence
3. submitting without an emergency contact number halts submission and shows field validation
4. each form input on the enrolment form has an explicit programmatic label with a matching for/id attribute
5. the catalog lists available courses with their syllabus summaries
6. the course detail page displays duration, terrain difficulty, and session dates
7. `GET /admin/roster` lists all enrolled students and their assigned course references

## Implementation status

**Not implemented. Nothing drives these multi-step routes today, and the pending boards are the only artefact of this expanded type that exists.** Being precise about what does exist, because "tr-09 already exists" is a half-truth:
- The single-step `tr-09` target is a landing page with a form, but it does not evaluate the multi-step `course-enrolment` catalog, syllabus detail, or admin roster.
- The reference boards for the full multi-step journey are planned (`step1-catalog`, `step2-syllabus`, `step3-enrol`, `step4-voucher`, `step5-empty`) but not yet generated.
- There is no full A6 evaluation specification for this expanded multi-step type under `docs/eval/specs/`.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-course-enrolment.md`.
- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-09`) and `docs/eval/briefs/manifest.jsonl` (family `fam-09`, `course-enrolment`). The `fam-09` route spelling (`/enrol` -> `/enrolment/:ref`) governs the multi-step contract, matching `pilot/training-archetypes.mjs`; `tr-09` contributes the student/contact fields and botanical/outdoor domain.
