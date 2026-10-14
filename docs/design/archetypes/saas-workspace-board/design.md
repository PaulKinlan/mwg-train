---
archetype: saas-workspace-board
type: collaborative-workspace
boards: docs/design/archetypes/saas-workspace-board/
register: docs/design/archetypes/saas-workspace-board/PROVENANCE.md
---

# `saas-workspace-board` — authored visual system

**Planning, not an image-derived design.** Kestrel, its people, issues and release are fictional. The pinned workspace palette and four states define a proposed interface; no generated JPEG or functioning issue tracker has been observed. Behaviour and authority boundaries are in [`plan.md`](plan.md).

## Direction contract

**THESIS:** A working sprint board organised around a real issue, not an empty dashboard of matching cards. KES-218 remains the same record as views and filters change.

**OWN-WORLD:** Dense slate work surface, narrow ink-dark project rail, legible status lanes, measured indigo action cues, restrained code/telemetry annotation.

**STORY:** Triage, inspect, assign, select across a filtered table, then recover from a zero-match and invalid creation without losing work.

**FIRST VIEWPORT:** Three useful panes at desktop: persistent rail, four-lane board, KES-218 inspector. IDs and actions remain readable at 1376 px; no browser-frame imitation.

**FORM:** Brief-pinned SaaS workspace. Impeccable concept-seed unavailable on this VM; no seed key. Signature interaction is a fast nonmodal command search that leaves the same issue in context.

**FINISH:** Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Visual thesis

A release team's workspace where the selected issue remains legible while the operator changes perspective. The board is the middle of a real workflow: the inspector shows a precise engineering title/spec/history rather than decorative metrics, the command palette makes an explicit next action discoverable, and the table makes multiselect obvious without pretending a bulk operation has succeeded. Dark slate is a focused work surface, not a neon SaaS landing page. Indigo carries selected actions; issue priority and status also have text and icon, never colour alone.

The use scene is a firmware team's shared monitor during sprint triage: they need density and trust, not an illustration of a dashboard. The four proposed boards are **full-page 1376 × 768 JPEG specifications**; controls are page elements with no OS window border, macOS traffic lights or exterior shadow. Illustration can show a state, not demonstrate persistence, permission checks, screen-reader flow or clipboard/export behaviour.

## Grammar and layout

- Three-pane desktop composition: left workspace rail around its content, centre board/table taking flexible width, and right inspector with an adjustable inline size. Use grid tracks such as `minmax(0, auto) minmax(0, 1fr) minmax(18rem, var(--inspector-size))` only while each pane still reads; below that threshold move inspector into a labelled panel after the selected issue, not a clipped 120 px column.
- Four centre board lanes have distinct headings/counts: Triage, In Progress, In Review, Shipped. Cards show ID, title, priority icon and label, component chip, assignee. Do not repeat KES-218 to fill multiple columns. The right inspector keeps the same ID/title when a command or view changes its status.
- Inspector `container: issue-inspector / inline-size` (or separate `container-name/type`) allows the properties/spec/activity layout to adapt to **pane width**. A labelled keyboard-operable Inspector width input is the primary resizing control; optional pointer drag augments it. No `container-type:size` with an indefinite height.
- The command palette is a **non-modal** `[popover="auto"]` at the top layer, presented visually above a subdued workspace without making the background inert. The Cmd/Ctrl+K trigger and input are both labelled. Filtered action results are real buttons in a list; Arrow keys/Enter may be implemented by JS, with Tab/Shift+Tab and Escape always usable. Do **not** declare `role="menu"`/`aria-haspopup="menu"` merely because it looks like a menu; that would promise a keyboard pattern the proposed group does not yet implement.
- The KES-218 status-badge action group is tethered to its button with `anchor-name`/`position-anchor` and logical `position-area`, plus `position-try-fallbacks: flip-block, flip-inline`. Anchor positioning is not a universal dependency: default in-flow/popover placement keeps the actions reachable in unsupported browsers or at extreme zoom. Do not crop the panel outside the image to imply an OS overlay.
- Board→Table shares issue data and filters. A supported View Transition may animate spatial continuity if motion is allowed; immediate DOM update is the base case. Active Priority: High and Component: Firmware chips are removable controls with explicit names; checked table rows use real checkboxes and `:has(:checked)` may reveal a bottom bulk toolbar. JS still validates the actual ID set and permissions before any bulk action.
- Quick-Create is a native `<dialog>` with a labelled required title and Markdown reproduction textarea. Empty title after attempted submit shows `:user-invalid`, an adjacent textual message and synchronised `aria-invalid`; the textarea stays filled. An empty filtered table remains visible behind the modal, labelled as **zero matches**, not a broken loading skeleton.

## Typography

- Use a licensed, self-hosted workhorse sans with clear uppercase/lowercase distinction for issue IDs and names; absent a font asset, the system UI stack is the honest planning fallback. No unlicensed face is claimed to ship.
- IDs, keyboard chords and telemetry-like tokens may be monospace for alignment, not every heading and button. The issue title and command names use body lettering at a readable size; place shortcut badges to the right without letting them replace the action label.
- Dense table rows retain high-contrast body text at normal zoom, accessible focus rings and enough line-height for two-line card titles. A screenshot's tiny type is a visual defect to be caught at generation, not an accepted spec.

## Token usage

| Token | Intended value | Role |
| --- | --- | --- |
| `--ground` | `#090d16` | Continuous workspace ground behind panes |
| `--rail` | `#111827` | Project navigation / inspector header |
| `--surface` | `#1e293b` | Issue cards, table focus and inspector controls |
| `--accent` | `#6366f1` | Current view, selected action, focus support (paired with outline) |
| `--ink` | `#f8fafc` | Issue titles, actions and primary text |
| `--ink-muted` | `#cbd5e1` | Secondary metadata, contrast to verify in browser |
| `--separator` | `#475569` | Quiet row dividers without nested card borders |
| `--invalid` | `#fb7185` | Validation mark *with* field-specific error text |

Values are **brief-specified design intent**, not inferred from absent model assets or proven WCAG ratios. Status and urgency require words/shapes in addition to any hues. A selected table row still carries a checked input and readable count; an indigo fill is not the selection API.

## Spacing rhythm

The rail is narrow, the board gets most space, and the inspector's density tracks its own container rather than a desktop screenshot's pixel grid. Group a card's ID, title and owner tightly; separate status lanes more generously than their internal card insets. Reserve breathing room above the inspector's title and between spec and activity. On mobile, one useful work region leads and the rail/inspector become accessible disclosure targets; a floating bulk bar must not cover the selected rows, keyboard focus, or Quick-Create controls. Use fluid sizes and intrinsic content rather than clipping overflow to preserve the 1376 px art direction.

## Component hierarchy

1. **Workspace rail:** switcher, sprint/triage/roadmap destinations, visible Cmd+K / Ctrl+K command trigger.
2. **Board and view controls:** four named columns, explicit Board/Table toggle, active filter chips and a truthful zero-match state.
3. **Issue card:** unique ID, concise title, priority marker, component tag, assignee and selected state.
4. **Issue inspector:** KES-218 title, properties, keyboard resize control, sanitised Markdown spec and activity events. Responsive to its own container.
5. **Command search:** nonmodal popover with labelled input, keyboard-operable button results, and separately tethered badge action group.
6. **Grouped table:** semantic headings and checkboxes, accessible selected count and authorisation-aware bulk action bar.
7. **Quick-Create dialog:** native modal with form, retained Markdown, title error text and Close control.

Suggested progressive-enhancement boundary (not shipped CSS):

```css
.status-actions { position: static; } /* Safe in-flow location without anchor support. */
/* TODO(baseline/anchor-positioning): Remove the unsupported-browser spatial branch; keep the accessible button group in DOM order. */
@supports (anchor-name: --issue-status) {
  .status-trigger { anchor-name: --issue-status; }
  .status-actions {
    position-anchor: --issue-status;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
  }
}
.issue-inspector { container: issue-inspector / inline-size; }
@container issue-inspector (inline-size < 25rem) {
  .inspector-fields { display: block; }
}
.issue-table:has(input[type="checkbox"]:checked) .bulk-actions { display: flex; }
.issue-title:user-invalid { outline: 2px solid var(--invalid); }
```

The native `popover="auto"` promotion, focus/keyboard logic, container query, selection count and actual validation are **not** achieved by this CSS sample. Supporting browsers have limited CSS anchor support; the base action group must stay usable. A project targeting browsers without native Popover may use an in-flow disclosure/manual fallback instead of silently depending on a third-party polyfill.

## Anti-patterns

- A `popover="auto"` command search advertised as an `aria-modal` focus trap or as a complete ARIA menu with no arrow-key semantics; a `<dialog>` used for a nonmodal status action panel.
- A clipped status dropdown near the viewport edge, or a fixed pixel inspector that cannot be keyboard resized or read when the viewport narrows.
- Three checked-looking rows with no native checkbox state, a bulk action that mutates unselected IDs, or a confirmation claiming success after a refused write.
- A `:user-invalid` red border on the empty title before any interaction, unsynchronised `aria-invalid`, disappearing Markdown steps after refusal, or an error conveyed only by color.
- View Transition as the only way Board/Table content appears, and a search command executed merely because the user typed its name.
- Generic rounded feature-card wallpaper or fake customer activity replacing real issue fields; product screenshots that imply a stored issue without a source.
- Browser chrome, macOS traffic lights, tab strip, address bar, OS wallpaper and exterior desktop window shadow baked into the reference JPEGs.

## Rationale

Dense engineering work calls for stable identity and precise permission feedback. The same KES-218 should be traceable from card to inspector to command to table row; the layout makes that continuity spatially clear. Popovers and anchor positioning can reduce manual overlay math, but only if their semantics and unsupported-browser path remain honest. Container queries reflect a resizable inspector's actual space, not guesses from the outer viewport. Delayed field validation respects typing, while a native dialog provides the separate modal boundary the command popover lacks. Still references remain planning material even after future approved generation; they do not attest any of these behaviours.

## Provenance

- Functional routes/roles/acceptance: [`plan.md`](plan.md). Exact pending unframed image instructions: [`README.md`](README.md). [Local pending provenance](PROVENANCE.md) lists prompt digests and missing-image/model evidence.
- Modern Web Guidance informed the distinction between button groups and true ARIA menus, nonmodal popovers versus modal `<dialog>`, logical anchor flip tactics, and visual/programmatic validation synchronisation. The design does not claim these APIs were implemented in an actual site.
- Any future visual board remains `excluded_from_training: true` and `approved_for_training: false` absent separate rights clearance. Kestrel's sample people/issues are fictional and outside A1/A6 datasets.
