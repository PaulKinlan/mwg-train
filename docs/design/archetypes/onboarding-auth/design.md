---
archetype: onboarding-auth
type: b2b-saas-signup
boards: docs/design/archetypes/onboarding-auth/
register: docs/provenance/assets/training-reference-boards.md
---

# `onboarding-auth` — aesthetic system

The look of the `b2b-saas-signup` type as the `onboarding-auth` archetype implements it, expanded from the training family's landing reference into a full multi-step journey. This document is written in the section order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document (`DESIGN_SECTIONS`).

**Where this system comes from:** The archetype's visual baseline is declared by the single training family:

- **`tr-05`, Meadowbrook Wildlife Hospital** — [`prompt.txt`](../../training/tr-05/prompt.txt), [`reference.jpg`](../../training/tr-05/reference.jpg).

The evaluation-side family (`fam-05`, Independent Bookshop) has **no reference board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not invent a look for it.

## Visual thesis

An onboarding portal establishes trust and competence immediately. The thesis follows from that: **a focused, distraction-free central form, clear primary actions, and immediate accessible feedback**, supported by a thematic but restrained light palette.

The `tr-05` board establishes this directly: a crisp, light palette utilizing natural green tones appropriate for wildlife rehabilitation. The primary accent guides the user exclusively toward establishing their credential.

## Grammar and layout

The reference establishes the grammar:
- **The onboarding form** is typically a single column or split layout (form on one side, brand/imagery on the other). The form is deliberately constrained in width to prevent excessively long input lines.
- **The login view** is highly focused, stripping away non-essential navigation to prioritize credential entry and recovery links.
- **The authenticated profile** transitions into an application layout, often introducing a sidebar or a distinct authenticated navigation header.
- **The password reset flow** isolates the user, minimizing UI elements down to a simple central card to eliminate distraction during a sensitive operation.
- **The reference** is a **browser viewport**: chrome runs along the top edge with an address bar (`https://meadowbrookwildlife.shop/`), depicting the page as a framed composition.

## Typography

A system UI sans-serif stack for everything a person reads. 

The display heading is the largest type on the page, establishing the brand and the purpose of the current step (e.g., "Create your volunteer profile"). Form controls carry **permanent visible labels**, guaranteeing clarity.

## Token usage

The `tr-05` palette is explicitly built as a light botanical theme reflecting wildlife rehabilitation. All values are declared in the prompt; observed uses reflect their deployment.

**`tr-05`, Meadowbrook Wildlife Hospital — a light botanical palette.**
- **Ground (`wb-light`):** `#f0fdf4` (very light green tint)
- **Surface (`wb-card`):** `#ffffff`
- **Border (`wb-border`):** `#cbd5e1`
- **Text (`wb-dark`):** `#0f172a` (deep slate ink)
- **Accent (`wb-green`):** `#14532d` (the single primary action, dark forest green)
- **Secondary (`wb-leaf`):** `#22c55e` (emphasis or status indicators)

A generator must carefully preserve these exact hex values and apply them to their respective semantic roles without blending them into generic signup templates.

## Spacing rhythm

- The declared constants: a centred frame (`1100px`), page padding (`1.5rem`), a rounded control radius (`10px`), and a one-pixel border drawn in the border token.
- **Form inputs** maintain generous internal padding to ensure touch targets are accessible and text is legible.
- **The layout** separates its rows generously so that validation feedback (e.g., password strength meters or missing field alerts) can appear inline without shifting the layout abruptly.

## Component hierarchy

1. **Brand header** — the mark, the organization's name.
2. **Authentication Card** — a centered surface containing the intake/login fields.
3. **Intake form** — the labelled fields for entering credentials and onboarding data.
4. **Validation feedback** — inline error messages and password strength indicators explicitly associated with inputs via `aria-describedby`.
5. **Profile view** — the dedicated authenticated state showing the stored configuration.
6. **Footer** — contact details and copyright.

## Anti-patterns

- **A credential field without an autocomplete token.** Critical for accessibility and security (`autocomplete='new-password'`, `autocomplete='email'`).
- **A modal or step wizard hiding part of the form.** The entry form should be fully visible inline.
- **Colour alone carrying an error state with no message naming the field.** 
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.

## Rationale

Account onboarding handles sensitive credentials. The user must feel secure and guided. This requires unambiguous forms, explicit and immediate error states, proper autocomplete semantics for password managers, and a layout that removes distractions during the authentication event.

## Provenance

- **The declarations:** `docs/design/training/tr-05/prompt.txt`, which names the palette, the structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-05/reference.jpg`. The file and prompt are pinned in [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (family `tr-05`), and `docs/eval/briefs/manifest.jsonl` (`fam-05`).
