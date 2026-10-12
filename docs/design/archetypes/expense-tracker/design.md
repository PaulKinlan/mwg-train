---
archetype: expense-tracker
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/expense-tracker/
register: docs/provenance/assets/training-reference-boards.md
---

# `expense-tracker` — aesthetic system

The look of the `record-form` type as the `expense-tracker` archetype implements it, expanded from the two training families' landing references into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Two systems, and they must not be averaged.** This archetype's training families represent two distinct domains built upon light palettes:

| Family | Subject | Token prefix | Declared theme |
|---|---|---|---|
| `tr-15` | Oakridge Tenant Co-operative — Maintenance Ledger & Expenses | `ot-` | "in a light palette" |
| `tr-29` | Community Woodland Trust — Memorial Tree Fund & Dedication Ledger | `cw-` | "in a light palette" |

The evaluation-side families (`fam-15`, `fam-r03`) have **no reference boards** in `docs/design/training/`; their journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for them.

## Visual thesis

A financial ledger or contribution tracker must prioritize trust, clarity, and precision. Both families resolve this by ensuring the **running total is the most prominent element on the page**. 

The tenant co-op (`tr-15`) reads as an **administrative ledger** — crisp, structured, and strictly formatted. The tree fund (`tr-29`) reads as a **community campaign** — organic, warm, and highly focused on the aggregate progress of the fund. Both rely on a light ground, high-contrast text for numerical data, and structured tables or grids to align the expense rows perfectly.

## Grammar and layout

Both families declare the structural constants `--content-frame: 1200px`, `--page-padding: 1.5rem`, `--control-radius: 8px` and `--control-border: 1px solid var(--*-border)`, and both declare the same page structure: a brand header, a navigation bar, a main content area, one content section, the working form, and a footer.

- **The aggregate summary** is placed at the top of the main area. This is where the calculated running total or budget allocation lives.
- **The ledger grid** aligns figures so that the amounts can be compared by scanning down the column.
- **The intake form** is rendered open and inline, either beside the ledger in a two-column desktop layout or immediately following it in a single column layout.
- **Both references are browser viewports** with chrome and an address bar, depicting the page as a framed composition.
- **The receipt** (`step3-receipt`) isolates the transaction into a single focused ticket or card, providing a printable or permanent view of the logged record.
- **The empty state** (`step5-empty`) is a centred card explaining that no expenses have been logged yet.

## Typography

- A system UI sans-serif stack, as declared by both families.
- **Numbers get their own treatment.** The running totals and transaction amounts are set larger and heavier than surrounding text. Table columns for currencies are strictly right-aligned to allow decimal comparison.
- Exactly one `h1` on each reference establishing the ledger's purpose.
- Form controls carry **permanent visible labels** on both boards, guaranteeing accessibility when users are inputting sensitive financial amounts.

## Token usage

All values are declared in the prompts; observed uses reflect their deployment.

**`tr-15`, Oakridge Tenant Co-operative — a crisp administrative desk.**
- **Ground (`ot-bg`):** `#f8fafc` (light slate ground)
- **Surface (`ot-card`):** `#ffffff`
- **Border (`ot-border`):** `#cbd5e1`
- **Text (`ot-text`):** `#0f172a` (deep slate ink)
- **Accent (`ot-brick`):** `#b91c1c` (the single primary action, providing strong contrast against the cool slate ground)
- **Muted (`ot-muted`):** `#64748b`
- **Dark band (`ot-slate`):** `#1e293b`

**`tr-29`, Community Woodland Trust — an organic campaign tracker.**
- **Ground (`cw-bg`):** `#f0fdf4` (very light green ground)
- **Surface (`cw-card`):** `#ffffff`
- **Border (`cw-border`):** `#bbf7d0`
- **Text (`cw-text`):** `#14532d` (dark forest green ink)
- **Accent (`cw-green`):** `#14532d` (acts as the primary action and typography)
- **Secondary (`cw-brass`):** `#854d0e` (emphasis or status)
- **Muted (`cw-muted`):** `#4b5563`

Both families are explicitly built as light palettes. A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them.

## Spacing rhythm

- The declared constants are shared: a centred frame, page padding, an eight-pixel control radius, and a one-pixel border drawn in each family's own border token.
- **Table rows** keep a uniform height so the ledger reads as an aggregate set rather than disconnected paragraphs.
- **The intake form** separates its rows generously so that validation feedback can appear inline without jarring the layout.

## Component hierarchy

1. **Brand header** — the mark, the desk's name, the section navigation.
2. **Summary region** — the aggregate total or remaining budget, set in large display type.
3. **Data table (Ledger)** — aligned figures, right-aligned amounts, and chronological rows.
4. **Intake form** — the labelled fields for entering the transaction details.
5. **Receipt view** — the dedicated view for a single transaction.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A running total that does not match the listed entries.** The math must be strictly correct. The backend recalculates it dynamically based on the stored rows.
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- **Colour alone carrying an error state with no message naming the field.** Especially critical for negative or empty amount fields, which must be rejected with clear accessible feedback.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

A financial ledger exists to maintain collective trust. Whether tracking apartment lightbulbs or memorial trees, the user must believe the math. That argues for figures before prose, a prominent and automatically calculated running total, right-aligned currency columns, and highly visible error states preventing negative inputs. 

## Provenance

- **The declarations:** `docs/design/training/tr-15/prompt.txt` and `docs/design/training/tr-29/prompt.txt`, which name each palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-15/reference.jpg` and `docs/design/training/tr-29/reference.jpg`. Both files and both prompts are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (families `tr-15`, `tr-29`), and `docs/eval/briefs/manifest.jsonl` (`fam-15`, `fam-r03`).
