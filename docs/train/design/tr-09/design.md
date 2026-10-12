---
family: tr-09
target: docs/train/targets/tr-09/index.html
tokens:
  --ff-moss: "#14532d"
  --ff-leaf: "#16a34a"
  --ff-bark: "#78350f"
  --ff-paper: "#f0fdf4"
  --ff-card: "#ffffff"
  --ff-border: "#bbf7d0"
  --ff-text: "#14532d"
literals:
  control-radius: "10px"
  content-frame: "1150px"
  control-border: "1px solid var(--ff-border)"
  page-padding: "1.5rem"
antiPatterns:
  - a prerequisite note that appears only after the submit fails
  - a second accent colour competing with the primary action
  - placeholder text standing in for a visible label
  - a modal or step wizard hiding part of the form
  - colour alone carrying an error with no message naming the field
---

# `tr-09` target design — Forage & Fern Botanical School — Wild Edibles Field Course Booking

The aesthetic system of the `tr-09` family's authored target board
[`index.html`](../../targets/tr-09/index.html). The family's behaviour is specified
separately in [`plan.md`](plan.md); the frontmatter above is the single source of truth for the palette,
so this body describes what each token is for rather than what it holds.

## Visual thesis

Forage & Fern Botanical School — Wild Edibles Field Course Booking: the board for wild edibles identification field course booking, in a light palette, recognisable by its
own token prefix rather than by a shared template. The board's job is to be a *target*: a student model's
output is measured against it, so the design states one clear hierarchy - brand header, working panel,
the form - and nothing decorative competing with it.

## Grammar and layout

- A single inline stylesheet with one `:root` block; every colour decision lives in the tokens above.
- There are no media queries: the board is one fixed composition at the conformance viewport (1280x900), not a responsive study.
- Composition order follows the task: header with brand and navigation, then the working surface with the
  form, with supporting panels beside or below it.
- **Control borders:** the palette intentionally declares low-contrast control borders (`< 3:1`). Because these borders fall below the WCAG 1.4.11 boundary contrast requirement, every control MUST remain identifiable in its default unfocused state by an alternate persistent visual cue (e.g. distinct background fill or contrasting icon).
- The routes the real project serves are functional claims and live in [`plan.md`](plan.md), not here.

## Typography

- Stack: `"Georgia", serif` - system or generic families only, no remote font and no third-party asset.
- The page heading sets the scale at `1.45rem`; everything else steps down from it.
- One `h1` per board; section headings inside panels keep the outline real rather than a size effect.

## Token usage

- `--ff-moss` is the moss tone in the palette.
- `--ff-leaf` is the leaf tone in the palette.
- `--ff-bark` is the bark tone in the palette.
- `--ff-paper` is the paper tone in the palette.
- `--ff-card` is the card surface one level above the panel.
- `--ff-border` is every structural border.
- `--ff-text` is all primary text.

Everything else is a literal, listed in the frontmatter where it exists, and therefore not themeable per
family. The anti-pattern about a second accent follows from this: with one accent there is one primary
action, and a second colour would have to mean a second meaning.

## Spacing rhythm

The steps in use on this board: `1.5rem`, `10px`, `1150px`. The rhythm is
the usual one - related things closer (control to label), sections further apart (panel to panel), the
content frame the largest step - with no arbitrary gaps between.

## Component hierarchy

Top to bottom, from the board's own markup:

- `header.ff-header`
- `nav.ff-nav`
- `main.ff-grid`
- `section.ff-card`
- `form#course-enrolment-form`
- `footer.ff-footer`

The form is `form#course-enrolment-form`: illustrative markup on the board, standing in for the driven form
the brief specifies in [`plan.md`](plan.md).

## Anti-patterns

- **A prerequisite note that appears only after the submit fails.**
- **A second accent colour competing with the primary action.**
- **Placeholder text standing in for a visible label.**
- **A modal or step wizard hiding part of the form.**
- **Colour alone carrying an error with no message naming the field.**

## Rationale

Constraints rather than preferences: the board is a conformance instrument (rendered to a pinned viewport
and hash-pinned by `npm run targets:train:check`), so it is one static HTML file with one inline
stylesheet, no scripts and no external assets. Per-family identity lives in the `:root` tokens, which is
why the frontmatter above - not this prose - is the source of truth for them.

## Provenance

Subject, copy and palette are synthetic and authored in this repository; the board is a project-owned
CC0 asset, arm `A1_self_generated`, marked `excluded_from_training` as a conformance instrument - the
rights record is [`training-targets.md`](../../../provenance/assets/training-targets.md) and the render
pipeline is `scripts/render-training-targets.mjs`. This contract is verified against the board's own
stylesheet by `npm run check:train-design`.
