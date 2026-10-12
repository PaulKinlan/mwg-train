---
archetype: docs-site
type: record-form
boards: docs/design/archetypes/docs-site/
register: docs/provenance/assets/training-reference-boards.md
---

# `docs-site` — aesthetic system

The look of the `record-form` type as the `docs-site` archetype implements it, expanded from the two training families' landing references into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Two systems, and they must not be averaged.** This archetype's training families represent two distinct domains built upon light palettes:

| Family | Subject | Token prefix | Declared theme |
|---|---|---|---|
| `tr-13` | Urban Soil Collaborative — Composting Handbook & Soil Test Registry | `us-` | "in a light palette" |
| `tr-25` | Voices of the Mill Valley — Elder Oral History Archive & Transcript Index | `oh-` | "in a light palette" |

The evaluation-side family (`fam-13`, Environmental Sensor Network) has **no reference board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for it.

## Visual thesis

A documentation site exists to make deep reading and referencing effortless. Both families resolve this by utilizing high-contrast typography, distinct hierarchical sidebars for navigation, and calm grounds that prevent visual fatigue during long reading sessions.

The composting handbook (`tr-13`) utilizes an **organic earthy palette** — incorporating leaf and straw tones to ground the content. The oral history archive (`tr-25`) utilizes an **archival academic palette** — utilizing deep indigo and gold to signal preservation and authority.

## Grammar and layout

Both families declare the structural constants `--content-frame: 1200px` (or similar constraints), `--page-padding: 1.5rem`, `--control-radius: 8px` and `--control-border: 1px solid var(--*-border)`, and both declare the same page structure: a brand header, a navigation bar, a main content area, one content section, the working form, and a footer.

- **The article layout** relies heavily on a split view: a persistent sidebar containing the table of contents or index, and a dominant reading column.
- **Hierarchical navigation** utilizes semantic heading structures. Active sections are visually highlighted (e.g., via `aria-current="page"`).
- **Code examples and transcripts** are presented within distinctive blocked containers. `fam-13` specifically demands contrast-compliant styling for code snippet blocks.
- **Both references are browser viewports** with chrome and an address bar (`https://urbansoil.shop/` and `https://voicesof.studio/`), depicting the page as a framed composition.
- **The intake form** is rendered open and inline, either at the bottom of the article for feedback (`fam-13`, `tr-25`) or on a dedicated registry page (`tr-13`).
- **The empty state** is a search modal or page that clearly names the failed query.

## Typography

- A system UI sans-serif stack, as declared by both families.
- Exactly one `h1` on each reference establishing the document or site's title.
- **Semantic structure:** Both families prioritize proper document outlining and heading hierarchy (`h2`, `h3`) to ensure long-form text remains readable. Form controls carry permanent visible labels.

## Token usage

All values are declared in the prompts; observed uses reflect their deployment.

**`tr-13`, Urban Soil Collaborative — an organic earthy palette.**
- **Ground (`us-card` / `us-bg` implicitly):** `#ffffff`
- **Border (`us-border`):** `#e7e5e4`
- **Text (`us-text`):** `#292524`
- **Accent (`us-earth`):** `#3b251a` (deep brown action token)
- **Secondary (`us-leaf`):** `#15803d` (green emphasis or status)
- **Highlight (`us-straw`):** `#fef08a`
- **Muted (`us-muted`):** `#78716c`

**`tr-25`, Voices of the Mill Valley — an archival academic palette.**
- **Ground (`oh-bg`):** `#f8fafc`
- **Surface (`oh-card`):** `#ffffff`
- **Border (`oh-border`):** `#e2e8f0`
- **Text (`oh-text`):** `#1e293b`
- **Accent (`oh-indigo`):** `#1e1b4b` (primary action, deep academic indigo)
- **Secondary (`oh-gold`):** `#b45309` (emphasis or status)
- **Muted (`oh-muted`):** `#64748b`

Both families are explicitly built as light palettes. A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them.

## Spacing rhythm

- The declared constants are shared: a centred frame, page padding, an eight-pixel control radius, and a one-pixel border drawn in each family's own border token.
- **Reading columns** limit their maximum width (typically around 65-75 characters) to ensure optimal reading rhythm for long-form prose and transcripts.
- **The intake form** separates its rows generously so that validation feedback can appear inline.

## Component hierarchy

1. **Brand header** — the mark, the handbook/archive name.
2. **Search bar / Filter** — URL-parameter-driven controls selecting categories or full-text queries.
3. **Table of Contents (Sidebar)** — hierarchical navigation linking to document anchors.
4. **Article Body** — rich text formatting, transcripts, or code blocks (`fam-13`).
5. **Intake form** — the labelled fields for entering feedback, annotations, or test records.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A code example that cannot be copied as text.**
- **Filter controls that break browser history.** URL parameters must drive the search/filter state.
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

A documentation portal exists to transfer complex knowledge accurately. The user must understand exactly where they are in the documentation hierarchy, how to jump to related topics, and how to read the text without fatigue. This requires rigorous typographic hierarchy, semantic code styling, and highly visible active-state indicators on the navigation tree.

## Provenance

- **The declarations:** `docs/design/training/tr-13/prompt.txt` and `docs/design/training/tr-25/prompt.txt`, which name each palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-13/reference.jpg` and `docs/design/training/tr-25/reference.jpg`. Both files and both prompts are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (families `tr-13`, `tr-25`), and `docs/eval/briefs/manifest.jsonl` (`fam-13`).
