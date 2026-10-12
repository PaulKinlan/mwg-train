---
archetype: community-forum
type: fan-community
boards: docs/design/archetypes/community-forum/
register: docs/provenance/assets/training-reference-boards.md
---

# `community-forum` — aesthetic system

The look of the `fan-community` type as the `community-forum` archetype implements it, expanded from the training family's landing reference into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Where this system comes from:** The archetype's visual baseline is declared by the single training family:

- **`tr-20`, Ceilidh & Session Tune Vault** — [`prompt.txt`](../../training/tr-20/prompt.txt), [`reference.jpg`](../../training/tr-20/reference.jpg).

The evaluation-side family (`fam-14`, Urban Gardening Forum) has **no reference board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for it.

## Visual thesis

A community forum must organize densely nested conversations without overwhelming the reader. The thesis follows from that: **a structured, low-glare reading environment, clear typographic hierarchies for nested replies, and distinct surfaces separating the index from the thread**.

The `tr-20` board establishes this directly: a light, warm parchment palette invoking sheet music and traditional folk archives. The primary gold accent guides the user toward contributing notes, while the layout gives the threaded discussion room to breathe.

## Grammar and layout

The reference establishes the grammar:
- **The index (`step1-browse`)** is a list or table layout displaying topics or tunes. It prioritizes filters (dance rhythm, key) and metadata over imagery.
- **The thread (`step2-thread`)** expands a single topic. The layout shifts to a vertical reading column where replies are stacked chronologically or nested.
- **The composer (`step3-composer`)** isolates the user to collect their reply or tempo note without distraction, often rendered inline at the bottom of the thread.
- **The moderation queue (`step4-moderation`)** (`fam-14`) is an administrative tabular layout prioritizing fast scanning of flagged posts and quick action toggles (hide/approve).
- **The empty state (`step5-empty`)** is a quiet panel naming the filter that matched nothing.
- **The reference** is a **browser viewport**: chrome runs along the top edge with an address bar (`https://ceilidhsession.site/`), depicting the page as a framed composition.

## Typography

A system UI sans-serif stack for everything a person reads. 

The display heading is the largest type on the page. **Metadata and Author Tags** are set distinctly: author names, timestamps, and musical keys carry specific muted or weighted treatments so a musician can scan a thread to see *who* is speaking before reading *what* they said. Form controls carry **permanent visible labels**.

## Token usage

The `tr-20` palette is explicitly built as a light parchment theme reflecting a traditional music archive. All values are declared in the prompt; observed uses reflect their deployment.

**`tr-20`, Ceilidh & Session Tune Vault — a light parchment palette.**
- **Ground (`fv-parchment`):** `#fefce8` (warm light yellow/parchment)
- **Surface (`fv-card`):** `#ffffff`
- **Border (`fv-border`):** `#fef08a`
- **Text / Primary Ink (`fv-brown`):** `#450a0a` (deep brown ink for headings and dark ground text)
- **Accent (`fv-gold`):** `#b45309` (the single primary action and active states)
- **Secondary Ink (`fv-text`):** `#292524` (deep ink for body copy)
- **Muted (`fv-muted`):** `#78716c`

A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them into generic forum templates.

## Spacing rhythm

- The declared constants: a centred frame (`1200px`), page padding (`1.5rem`), a rounded control radius (`8px`), and a one-pixel border drawn in the border token.
- **Threaded replies** utilize margin indents and border hairlines to visually denote hierarchy and nesting.
- **The intake form** separates its rows generously so that validation feedback can appear inline without shifting the layout abruptly.

## Component hierarchy

1. **Brand header** — the mark, the vault's name, the section navigation.
2. **Search and filter bar** — controls to scope the library.
3. **Index list / Grid** — the available tunes or topics with metadata.
4. **Thread view** — the dedicated reading state showing the parent record and nested replies.
5. **Composer form** — the labelled fields for entering comments or tempo notes.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A posting control offered to a visitor who cannot use it.** If moderation or session credentials are required, the UI must reflect that state accurately.
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- **Colour alone carrying an error state with no message naming the field.** 
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

A forum handles community memory and discussion. The user must easily trace the lineage of a conversation, identify authors quickly, and submit their own responses without losing context. This requires unambiguous forms, explicit nesting visual cues, and a layout that prioritizes reading endurance over dense, flashy graphics.

## Provenance

- **The declarations:** `docs/design/training/tr-20/prompt.txt`, which names the palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-20/reference.jpg`. The file and prompt are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (family `tr-20`), and `docs/eval/briefs/manifest.jsonl` (`fam-14`).
