---
archetype: expense-tracker
type: record-form
boards: docs/design/archetypes/expense-tracker/
---

# `expense-tracker` — aesthetic system

The look of the `expense-tracker` type, expanding from the `tr-15`, `tr-29` and `fam-15` reference boards into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A budget and collective expenditure ledger. The visual language conveys financial clarity, accuracy, and operational transparency: crisp tabular data, explicit currency formatting, and highly legible transaction forms. The palette is grounded in a stark, high-contrast monochrome aesthetic, employing subtle green and red accents strictly for financial indicators.

The layout emphasizes rapid scanning of categorical totals and chronological logs. Input forms are treated as rigorous financial intake steps preventing corrupted records. The summary reporting dashboards prioritize distinct departmental aggregations over dense prose.

## Grammar and layout

- One page frame, `--content-frame: 1000px`, centred, with `--page-padding: 1.5rem` at the sides.
- The ledger view (`step1-ledger`) presents a chronological data table of recent expenses with a prominent running total.
- The intake form (`step2-intake`) is a rigorous, single-column data entry panel prioritizing accessible labels and strict numeric validation.
- The receipt detail (`step3-receipt`) acts as a durable, shareable transaction record detailing the vendor, amount, and memos.
- The aggregate dashboard (`step4-reports`) groups expenditures by department, displaying clear categorical totals.
- The empty state (`step5-empty`) is a clean, informative panel illustrating a zero-balance ledger ready for the first transaction.

## Typography

- A highly legible system sans-serif stack for structure, and a distinct monospace stack (e.g. `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`) for tabular numeric data to ensure vertical alignment of currency digits.
- Exactly one `h1` per page.
- Table headers maintain strict alignments (e.g., right-aligned numeric columns).
- Form inputs feature clear programmatic labels placed directly above the fields.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#f1f5f9` | The page ground |
| `--bg-surface` | `#ffffff` | Clean card surfaces, tables, and form backgrounds |
| `--border` | `#cbd5e1` | Structural borders and table row dividers |
| `--accent` | `#334155` | Slate primary actions and submit buttons |
| `--text-primary` | `#0f172a` | High-contrast text for critical financial data |
| `--text-muted` | `#64748b` | Muted metadata and table headers |

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 4px`, `--control-border: 1px solid var(--border)`.
- Dense but readable padding inside data tables (e.g., `0.75rem 1rem`) to ensure numerous rows remain scannable without excessive scrolling.
- Form fields are separated by ample vertical rhythm, ensuring error messages fit seamlessly between inputs without causing layout jumps.

## Component hierarchy

1. **Brand Header** - Logo mark, main navigation, and quick-add button.
2. **Summary Dashboard** - High-level total expenditure and departmental breakdowns.
3. **Ledger Table** - Chronological list of expenses with aligned monetary columns.
4. **Intake Form** - Date, category, vendor, amount, and notes inputs.
5. **Receipt View** - Detailed transaction record and references.
6. **State Panels** - Empty ledger states and zero-balance indicators.

## Anti-patterns

- Using proportional fonts for columns containing monetary values, breaking vertical decimal alignment.
- Overwhelming the ledger with excessive graphical charts instead of prioritizing clear, sortable raw data tables.
- Accepting silent validation failures for negative or empty numeric amounts, corrupting the running aggregate totals.

## Rationale

The financial expense tracking use case demands trust, numeric accuracy, and strict data persistence. Crew leads and treasurers are logging critical expenditures, meaning validation errors and inaccessible inputs directly harm production operations. The design system therefore elevates standard forms to rigorous financial ledgers. The high-contrast monochrome and slate palette provides a dependable, professional aesthetic that reinforces accuracy and utility without distracting the user with unnecessary flourishes.

## Provenance

- Evaluated against the A1 training families (`tr-15`, `tr-29`) and the A6 evaluation spec (`fam-15` / `expense-tracker`).