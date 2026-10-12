---
archetype: directory-listing
type: record-form
boards: docs/design/archetypes/directory-listing/
register: docs/provenance/assets/training-reference-boards.md
---

# `directory-listing` — aesthetic system

The look of the `record-form` type as the `directory-listing` archetype implements it, expanded from the two training families' landing references into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Two systems, and they must not be averaged.** This archetype's training families represent two distinct domains built upon light palettes:

| Family | Subject | Token prefix | Declared theme |
|---|---|---|---|
| `tr-06` | Highland Guild of Craftsmen — Artisan Directory & Open Studios | `cg-` | "in a light palette" |
| `tr-14` | Stonegate Heritage Trail — Historical Stops & Audio Transcripts | `st-` | "in a light palette" |

The evaluation-side family (`fam-06`, Neighbourhood Trades) has **no reference board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for it.

## Visual thesis

A directory listing must prioritize rapid scanning and immediate orientation. Both families resolve this by leading with highly legible search and filter controls atop a structured card grid or list.

The artisan guild (`tr-06`) reads as an **editorial catalogue** — utilizing parchment and stone tones to evoke natural materials. The heritage trail (`tr-14`) reads as a **civic or museum guide** — utilizing plum and sand tones to denote historical authority.

## Grammar and layout

Both families declare the structural constants `--content-frame: 1200px`, `--page-padding: 1.5rem`, `--control-radius: 8px` and `--control-border: 1px solid var(--*-border)`, and both declare the same page structure: a brand header, a navigation bar, a main content area, one content section, the working form, and a footer.

- **The index** is a grid or list layout displaying entity cards. Each card groups a title, category badge, short excerpt, and a link to the profile.
- **The filter region** sits prominently above or beside the index, utilizing native selects or pill groups.
- **The detailed profile** expands the hierarchy into a split view or dominant column prioritizing biographical text and photography.
- **Both references are browser viewports** with chrome and an address bar (`https://highlandguild.club/` and `https://stonegateheritage.club/`), depicting the page as a framed composition.
- **The intake form** is rendered open and inline, either for submitting a new entity (`fam-06`, `tr-06`) or appending a visitor comment (`tr-14`).
- **The empty state** is a centred card explaining that the filter or search query matched no results.

## Typography

- A system UI sans-serif stack, as declared by both families.
- Exactly one `h1` on each reference establishing the directory's purpose.
- **Semantic structure:** Both families prioritize proper document outlining and ARIA landmarks to ensure assistive technologies can scan the directory items efficiently. Form controls carry permanent visible labels.

## Token usage

All values are declared in the prompts; observed uses reflect their deployment.

**`tr-06`, Highland Guild of Craftsmen — a parchment editorial palette.**
- **Ground (`cg-parchment`):** `#fdfbf7`
- **Surface (`cg-stone`):** `#f5f5f4`
- **Border (`cg-border`):** `#e7e5e4`
- **Text (`cg-text`):** `#292524`
- **Accent (`cg-bark`):** `#451a03` (primary action, deep brown)
- **Secondary (`cg-copper`):** `#b45309` (emphasis or status)
- **Muted (`cg-muted`):** `#78716c`

**`tr-14`, Stonegate Heritage Trail — a civic museum palette.**
- **Ground (`st-sand`):** `#f5f5f4`
- **Surface (`st-card`):** `#ffffff`
- **Border (`st-border`):** `#e7e5e4`
- **Text (`st-text`):** `#292524`
- **Accent (`st-plum`):** `#581c87` (primary action, deep rich plum)
- **Secondary (`st-gold`):** `#b45309` (emphasis or status)
- **Muted (`st-muted`):** `#78716c`

Both families are explicitly built as light palettes. A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them.

## Spacing rhythm

- The declared constants are shared: a centred frame, page padding, an eight-pixel control radius, and a one-pixel border drawn in each family's own border token.
- **Directory cards** maintain internal padding that ensures titles and category badges align horizontally across the grid.
- **The intake form** separates its rows generously so that validation feedback can appear inline.

## Component hierarchy

1. **Brand header** — the mark, the civic/guild name.
2. **Search & Filter bar** — URL-parameter-driven controls selecting categories or queries.
3. **Directory list / Grid** — the matching entities.
4. **Entity Profile** — the dedicated detailed view for a single maker or stop.
5. **Intake form** — the labelled fields for entering comments or new registrations.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A listing card whose entire surface is not the link it appears to be.** 
- **Filter controls that break browser history.** URL parameters must drive the search/filter state.
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

A community directory depends on effortless exploration and persistent wayfinding. The user must understand exactly where they are in the taxonomy, how to filter the list further, and how to reliably share a filtered view. This requires standard URL parameters, strong keyboard-accessible interactive lists, and card boundaries that behave as predictable hit areas.

## Provenance

- **The declarations:** `docs/design/training/tr-06/prompt.txt` and `docs/design/training/tr-14/prompt.txt`, which name each palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-06/reference.jpg` and `docs/design/training/tr-14/reference.jpg`. Both files and both prompts are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (families `tr-06`, `tr-14`), and `docs/eval/briefs/manifest.jsonl` (`fam-06`).
