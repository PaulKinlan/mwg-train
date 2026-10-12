---
archetype: course-enrolment
type: record-form
boards: docs/design/archetypes/course-enrolment/
register: docs/provenance/assets/training-reference-boards.md
---

# `course-enrolment` — aesthetic system

The look of the `record-form` type as the `course-enrolment` archetype implements it, expanded from the training family's landing reference into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Where this system comes from:** The archetype's visual baseline is declared by the single training family:

- **`tr-09`, Forage & Fern Botanical School** — [`prompt.txt`](../../training/tr-09/prompt.txt), [`reference.jpg`](../../training/tr-09/reference.jpg).

The evaluation-side family (`fam-09`, Marine Navigation Evening Classes) has **no reference board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for it.

## Visual thesis

A course enrollment system must balance inspiration with institutional clarity. The thesis follows from that: **a light, structured ground, strong photographic or editorial hero areas, and a clear linear progression towards the enrolment voucher**, with a full error scale held in reserve for validation.

The `tr-09` board establishes this directly: a crisp, light palette utilizing rich botanical tones (`ff-moss`, `ff-leaf`). The primary accent guides the user exclusively toward establishing their registration securely.

## Grammar and layout

The reference establishes the grammar:
- **The catalog** is a grid or list layout displaying the available courses. Each card groups an image, description, duration/terrain metadata, and a primary action to view the syllabus.
- **The syllabus detail** is an expanded, long-form layout, prioritizing readable typography for the course curriculum, prerequisites, and available dates.
- **The intake form** isolates the user to collect critical emergency and dietary information without distraction.
- **The receipt (Voucher)** presents the confirmation clearly, often resembling a printed ticket or official confirmation letter.
- **The admin roster** (`fam-09`) is an operational tabular layout prioritizing fast scanning of enrolled students and session assignments.
- **The reference** is a **browser viewport**: chrome runs along the top edge with an address bar (`https://foragefern.studio/`), depicting the page as a framed composition.

## Typography

Two families: `--font-sans` (the `system-ui` stack) for everything a person reads. 

The display heading is the largest type on the page, establishing the brand and the purpose of the current step (e.g., "Wild Greens Masterclass"). Form controls carry **permanent visible labels**, guaranteeing clarity when users are submitting sensitive emergency or dietary information.

## Token usage

The `tr-09` palette is explicitly built as a light botanical theme reflecting an outdoor foraging school. All values are declared in the prompt; observed uses reflect their deployment.

**`tr-09`, Forage & Fern Botanical School — a light botanical palette.**
- **Ground (`ff-paper`):** `#f0fdf4` (very light green tint)
- **Surface (`ff-card`):** `#ffffff`
- **Border (`ff-border`):** `#bbf7d0`
- **Text (`ff-text`):** `#14532d` (dark moss ink)
- **Accent (`ff-moss`):** `#14532d` (the single primary action, dark moss)
- **Secondary (`ff-leaf`):** `#16a34a` (emphasis or status indicators)
- **Contrast (`ff-bark`):** `#78350f` (deep brown for contrast or secondary highlights)

A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them into generic booking templates.

## Spacing rhythm

- The declared constants: a centred frame (`1150px`), page padding (`1.5rem`), a rounded control radius (`10px`), and a one-pixel border drawn in the border token.
- **Form inputs** maintain generous internal padding to ensure touch targets are accessible and text is legible.
- **The layout** separates its rows generously so that validation feedback (e.g., missing emergency contact alerts) can appear inline without shifting the layout abruptly.

## Component hierarchy

1. **Brand header** — the mark, the school's name, the section navigation.
2. **Hero image** — an editorial-quality photograph of the outdoor subject or class setting.
3. **Course list / Grid** — the available modules with metadata.
4. **Intake form** — the labelled fields for entering student credentials, emergency contacts, and session dates.
5. **Voucher view** — the dedicated receipt state showing the finalized enrollment.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A prerequisite note that appears only after the submit fails.** Critical constraints must be visible during the syllabus or form stage.
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- **Colour alone carrying an error state with no message naming the field.** 
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

Course enrolment handles structured commitments and safety diligence. The user must feel informed about the terrain/prerequisites and guided through the emergency contact collection securely. This requires unambiguous forms, explicit and immediate error states, and a layout that removes distractions during the critical data intake.

## Provenance

- **The declarations:** `docs/design/training/tr-09/prompt.txt`, which names the palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-09/reference.jpg`. The file and prompt are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (family `tr-09`), and `docs/eval/briefs/manifest.jsonl` (`fam-09`).
