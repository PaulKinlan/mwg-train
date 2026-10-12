---
archetype: docs-site
type: record-form
boards: docs/design/archetypes/docs-site/
---

# `docs-site` — aesthetic system

The look of the `docs-site` type, expanding from the `tr-13`, `tr-25` and `fam-13` reference boards into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A technical documentation portal and API reference system. The visual language conveys precision, legibility, and developer focus: crisp typography, high-contrast code blocks, and an unambiguous navigational hierarchy. The palette is grounded in a sharp, modern technical aesthetic providing comfortable reading for long-form content.

The layout emphasizes the reading experience and spatial orientation. Documentation articles use wide, comfortable line lengths, while persistent sidebars keep the reader grounded in the overall document structure. The integrated feedback form is unobtrusive but accessible, positioned at the end of the content flow.

## Grammar and layout

- One page frame, `--content-frame: 1400px` (wider to accommodate sidebars), centred, with `--page-padding: 2rem` at the sides.
- The landing page (`step1-landing`) introduces the platform with a hero section and quick-start links.
- The documentation index (`step2-index`) presents a high-level grid of topics, API categories, and integration guides.
- The article view (`step3-article`) is a rigorous three-column reading page: a left navigation tree, a central content column with code blocks, and a right-side scrollspy table of contents.
- The feedback confirmation (`step4-feedback`) is a clean, authoritative receipt panel confirming the stored rating and developer notes.
- The empty state (`step5-empty`) is a helpful "not found" search panel directing the reader to related API concepts or the main index.

## Typography

- A highly legible system sans-serif stack for prose, and a distinct monospace stack (e.g. `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`) for code snippets and endpoints.
- Exactly one `h1` per page, serving as the main article title.
- Section headings maintain a strict document outline to organize technical payloads and integration steps.
- Form inputs feature clear programmatic labels placed directly above the fields.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#ffffff` | The clean white page ground on all reading states |
| `--bg-surface` | `#f8fafc` | Subtle code block backgrounds and sidebar panels |
| `--border` | `#e2e8f0` | Structural borders dividing sidebars and content |
| `--accent` | `#6366f1` | Indigo primary actions, active navigation highlights, and submit buttons |
| `--text-primary` | `#0f172a` | High-contrast slate text for extended prose readability |
| `--text-muted` | `#64748b` | Muted metadata and inactive table of contents links |

## Spacing rhythm

- `--page-padding: 2rem`, `--control-radius: 6px`, `--control-border: 1px solid var(--border)`.
- Generous line-height (`1.6` or greater) and constrained line lengths (e.g. `70ch`) in the central content column to ensure comfortable reading of dense technical material.
- Form fields are separated by ample vertical rhythm, ensuring error messages fit seamlessly between inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark, main navigation, and global documentation search.
2. **Left Navigation Tree** - Hierarchical link list of all documentation chapters.
3. **Article Content** - The central reading column featuring prose, `<pre><code>` blocks, and data tables.
4. **Right Table of Contents** - A scrollspy sidebar reflecting the `h2` and `h3` outline of the current article.
5. **Feedback Form** - Rating selector and comment textarea anchored at the bottom of the article.
6. **State Panels** - Empty search states and feedback receipt confirmations.

## Anti-patterns

- Rendering text lines wider than 80 characters, causing eye fatigue during long-form reading.
- Using low-contrast colours for code syntax highlighting that fail WCAG requirements.
- Omitting `aria-current="page"` from the active navigation link, breaking orientation for screen reader users.

## Rationale

The technical documentation use case demands spatial orientation and extended reading comfort. Developers require structural clarity to rapidly jump to specific endpoints, meaning the layout must prioritize persistent navigation and clear heading hierarchies. The design system therefore elevates standard prose to a highly readable, multi-column technical format. The indigo and white palette provides a sharp, modern aesthetic that reinforces professional authority without introducing distracting visual noise.

## Provenance

- Evaluated against the A1 training families (`tr-13`, `tr-25`) and the A6 evaluation spec (`fam-13` / `docs-site`).