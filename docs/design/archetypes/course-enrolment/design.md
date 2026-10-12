---
archetype: course-enrolment
type: record-form
boards: docs/design/archetypes/course-enrolment/
---

# `course-enrolment` — aesthetic system

The look of the `course-enrolment` type, expanding from the `tr-09` reference board into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

An outdoor field and botanical school catalog and enrolment system. The visual language conveys structure, safety, and learning: clear syllabuses, explicit constraints, and legible enrolment forms. The palette is grounded in a calming, natural aesthetic providing high contrast and readability.

The layout emphasizes the curriculum. Forms are treated as rigorous intake steps, never as trivial newsletter signups. The confirmation voucher acts as a durable, shareable ticket proving enrolment persistence.

## Grammar and layout

- One page frame, `--content-frame: 1150px`, centred, with `--page-padding: 1.5rem` at the sides.
- The catalog (`step1-catalog`) presents course offerings in a grid or robust list, each with a thumbnail, title, and summary.
- The detail view (`step2-syllabus`) is a comprehensive reading page: large hero image, syllabus breakdown, terrain difficulty, and session date selectors.
- The enrolment checkout (`step3-enrol`) is a clean, single-column intake form prioritizing legible labels and accessibility.
- The confirmation voucher (`step4-voucher`) is an authoritative ticket displaying the server-issued reference, course details, and student name.
- The empty state (`step5-empty`) is a calm, informative panel explaining the lack of matching courses.

## Typography

- A system UI sans-serif stack for clarity and modern readability.
- Exactly one `h1` per page.
- Section headings maintain a strict document outline to organize syllabuses, prerequisites, and session schedules.
- Form inputs feature clear programmatic labels placed directly above or beside the fields.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#f4f7f4` | The paper-white page ground on all states |
| `--bg-surface` | `#ffffff` | Clean card surfaces and form backgrounds |
| `--border` | `#c1d6c1` | Soft green structural borders |
| `--accent` | `#1b4332` | Moss green primary actions, selection states, and confirm buttons |
| `--text-primary` | `#2d3748` | Primary slate text |
| `--text-muted` | `#4a5568` | Muted metadata (duration, difficulty) |

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 10px`, `--control-border: 1px solid var(--border)`.
- Generous padding inside syllabus cards to distinguish distinct curriculum modules.
- Form fields are separated by ample vertical rhythm, ensuring error messages fit seamlessly between inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark and primary navigation.
2. **Catalog Grid** - Course preview cards with thumbnail, title, and brief summary.
3. **Syllabus Detail** - Hero image, detailed curriculum, terrain difficulty, duration, and session dates.
4. **Enrolment Form** - Labelled inputs for student name, emergency contact, course selection, session date, and dietary/mobility notes.
5. **Confirmation Voucher** - Display of the persistent enrolment record and unique reference code.
6. **State Panels** - Empty search states and no-matches responses.

## Anti-patterns

- A prerequisite note that appears only *after* a form submit fails.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.

## Rationale

The botanical school use case demands trust, clarity, and safety. Participants are booking outdoor field courses, meaning emergency contacts and mobility constraints are critical data. The design system therefore elevates forms from trivial interactions to rigorous, highly accessible intake procedures. The pale green and paper-white palette provides a calming, natural aesthetic that reinforces the brand identity without sacrificing WCAG contrast requirements.

## Provenance

- Evaluated against the A6 training spec (`fam-09` / `course-enrolment`).
- Baseline constraints defined in the multi-step visual journey flow criteria.
