---
archetype: course-enrolment
type: course
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/course-enrolment/
---

# `course-enrolment` — functional contract

A curriculum and registration system: a catalog of educational offerings to browse, detailed syllabuses with dates and terrain constraints, an enrolment form, an authenticated lesson player, and an empty state. This document is the contract for the `course-enrolment` archetype - what a student can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). What it describes is the full canonical journey expanded from the training target `tr-09`.

## Use case

A botanical school or training academy lists structured courses with session dates and prerequisites, taking registrations and eventually hosting lesson content.

A **student** browses the available courses, inspects the syllabus and prerequisites of a single course, fills out an enrolment form including dietary or mobility considerations, and lands on a confirmation voucher. Once enrolled, the student accesses a lesson player. The flow differs from a simple `booking` because the curriculum contains rich metadata (syllabus, duration, difficulty) and the end state includes authenticated access to educational material (the lesson player), making it a true `course` type rather than a transient record.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the course catalog |
| `GET /courses/:id` | read-by-reference | serves the detailed syllabus, duration, terrain difficulty, and available dates for one course |
| `POST /enrol` | write | inserts an enrolment row and answers `303` with the reference in the `Location` header |
| `GET /enrolments/:ref` | read-by-reference | reads the enrolment voucher by reference, showing the student name and session date |
| `GET /lesson/:id` | read-by-reference | authenticated player view for course content |

The spec defines nothing else.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `enrolments`, with `ref` (TEXT, primary key), `course_id` (TEXT, not null), `student_name` (TEXT, not null), `contact_phone` (TEXT, not null), `session_date` (TEXT, not null), and `considerations` (TEXT).
- **Write route:** `/enrol` stores the enrolment.
- **Read route:** `/enrolments/:ref` reads the enrolment by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, expanding the `tr-09` spec:

- it starts at `/` (catalog);
- it navigates to `/courses/:id` to view the syllabus and available dates;
- it submits `form#course-enrolment-form` with fills - `input[name=student]` `Maya Soren`, `input[name=contact]` `+44 7700 300456`, `select[name=course]` `Wild Greens Masterclass`, `select[name=session]` `Sunday 18 May`, and `textarea[name=dietary]` `No nuts; wheelchair access required`;
- and it expects to find `Maya Soren` on what the submit returns at `/enrolments/:ref`.

## Validation and states

- **Required fields:** `student`, `contact`, `course`, `session`.
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored.
- **On success:** insert one row into enrolments and answer 303 with Location: /enrolments/<ref>.
- **Empty state:** searching or filtering for an unavailable course topic returns an empty catalog state.

## Acceptance criteria

1. after a successful submit the browser lands on /enrolments/<ref> and the echoed student name is present
2. reloading that URL still shows it, proving server-side persistence
3. submitting without an emergency contact number halts submission and shows field validation
4. the catalog lists available courses with their syllabus summaries
5. the course detail page displays duration, terrain difficulty, and session dates

## Implementation status

- **The reference boards:** expanding from the single `tr-09` landing board, five full multi-step visual flow boards are planned (`step1-catalog`, `step2-syllabus`, `step3-enrol`, `step4-lesson`, `step5-empty`).
- **The functional target:** `docs/eval/specs/course-enrolment.json` serves as the archetype.

## Provenance

- **The boards** are pending generation; once created they will be registered in `docs/provenance/assets/design-reference-course-enrolment.md`.
- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-09`, `course-enrolment`).
