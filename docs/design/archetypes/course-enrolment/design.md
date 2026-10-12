---
archetype: course-enrolment
type: course
boards: docs/design/archetypes/course-enrolment/
---

# `course-enrolment` — aesthetic system

The look of the `course` type, expanding from the `tr-09` reference board into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

## Visual thesis

An educational and outdoor pursuit catalog. The visual language conveys structure, safety, and learning: clear syllabuses, explicit terrain and duration constraints, and legible enrolment forms. The palette is grounded in nature (moss green, leaf green, bark brown) over a clean paper-white ground, providing high contrast and readability.

The layout emphasizes the curriculum. Forms are treated as rigorous intake steps (collecting emergency contacts and mobility notes), never as trivial newsletter signups. The lesson player provides an authenticated, distraction-free environment for educational focus.

## Grammar and layout

- One page frame, `--content-frame: 1150px`, centred, with `--page-padding: 1.5rem` at the sides.
- The catalog (`step1-catalog`) presents course offerings in a grid or robust list, each with a thumbnail, title, and summary.
- The detail view (`step2-syllabus`) is a comprehensive reading page: large hero image, syllabus breakdown, terrain difficulty, and session date selectors.
- The enrolment checkout (`step3-enrol`) is a clean, single-column intake form prioritizing legible labels and accessibility.
- The player (`step4-lesson`) is an immersive, distraction-free interface focusing entirely on the lesson content.
- The empty state (`step5-empty`) is a calm, informative panel explaining the lack of matching courses.

## Typography

- A system UI sans-serif stack for clarity and modern readability.
- Exactly one `h1` per page.
- Section headings maintain a strict document outline to organize syllabuses, prerequisites, and session schedules.
- Form inputs feature clear programmatic labels placed directly above or beside the fields.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--ff-page` | `#f0fdf4` | The paper-white page ground |
| `--ff-surface` | `#ffffff` | Clean white card surfaces and form backgrounds |
| `--ff-border` | `#bbf7d0` | Soft green structural borders |
| `--ff-accent` | `#16a34a` | Leaf green primary actions, selection states, and confirm buttons |
| `--ff-text` | `#14532d` | Moss green primary text |
| `--ff-muted` | `#78350f` | Bark brown muted metadata (duration, difficulty) |

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 10px`, `--control-border: 1px solid var(--ff-border)`.
- Generous padding inside syllabus cards to distinguish distinct curriculum modules.
- Form fields are separated by ample vertical rhythm, ensuring error messages fit seamlessly between inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark, primary navigation, and user authentication state.
2. **Catalog Grid** - Course preview cards with thumbnail, title, and brief summary.
3. **Syllabus Detail** - Hero image, detailed curriculum, terrain difficulty, duration, and session dates.
4. **Enrolment Form** - Labelled inputs for student name, emergency contact, course selection, session date, and dietary/mobility notes.
5. **Lesson Player** - Immersive viewport for content delivery.
6. **State Panels** - Empty search states and confirmation vouchers.

## Anti-patterns

- A prerequisite note that appears only *after* a form submit fails.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.

## Rationale

The botanical school use case demands trust, clarity, and safety. Participants are booking outdoor field courses, meaning emergency contacts and mobility constraints are critical data. The design system therefore elevates forms from trivial interactions to rigorous, highly accessible intake procedures. The pale green and paper-white palette provides a calming, natural aesthetic that reinforces the brand identity without sacrificing WCAG contrast requirements.

## Provenance

- Evaluated against the A6 training spec (`tr-09` / `course-enrolment`).
- Baseline constraints defined in the multi-step visual journey flow criteria.
