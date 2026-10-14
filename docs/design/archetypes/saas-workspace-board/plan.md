---
archetype: saas-workspace-board
type: collaborative-workspace
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/saas-workspace-board/
register: docs/design/archetypes/saas-workspace-board/PROVENANCE.md
---

# `saas-workspace-board` — functional contract

**Kestrel**, a fictional hardware/firmware issue tracker for **Sprint 24: v3.4 Telemetry Release**. This is a proposed multi-actor SaaS workflow and four image briefs, not a running board, real customer record, verified issue timeline or secured production workspace. The eight headings follow [`PLAN_SECTIONS`](../../../../src/design/contract.mjs); [`design.md`](design.md) owns its visual system.

## Use case

A triager sees outstanding firmware/PCB/telemetry issues, inspects KES-218, assigns it to Elena Rostova and changes its status. A project lead filters high-priority Firmware issues, selects three and moves or exports them, while an engineer creates a new issue and fixes an empty-title error without losing reproduction notes. Roles differ: contributors may propose/comment, the lead may bulk reassign, and an authorised workspace owner manages membership. Role boundaries and persistence are **requirements for a future implementation**, not proved by mock images or the existing simple form builder. A four-column screenshot with no permission checks, saved updates or accessible input is not a collaborative workspace.

Names, people, sprint numbers and issue descriptions below are fictional sample content, not a customer record or a deployed issue database. Do not use a rendered screenshot as evidence of telemetry, a shipped product or a model evaluation target.

## Routes and effects

| Route / action | Actor | Intended effect |
| --- | --- | --- |
| `GET /sprints/24?view=board` | member | Show one authorised Sprint 24 with four Kanban groups, counts, filters and a selected issue inspector; opening KES-218 preserves board context. |
| `GET /issues/KES-218` | member | Deep-link to the same issue and activity, with role-gated editing. An unknown or forbidden ID has distinct not-found/access-denied states. |
| Command search / actions | member or lead | `Cmd+K` (also Ctrl+K where appropriate) opens a **non-modal** `popover="auto"` search panel; search “assign elena”, navigate actions by keyboard and execute only authorised choices. Escape/light-dismiss returns focus. |
| `GET /sprints/24?view=table&priority=high&component=firmware` | lead | Switch to grouped Table while preserving filters; select three issue IDs, then bulk move to In Review, assign owner or export the **selected** issues as JSON. |
| `POST /issues` | member | Quick-create with a required title and optional Markdown reproduction steps; invalid title creates nothing and retains the typed steps. Valid submission creates one issue and updates the board/table, without duplicating on retry. |
| `POST /sprints/24/bulk` | lead | Authorised, atomic update over an explicit set of issue IDs; refuse stale/unknown/forbidden selections and leave other issues unchanged. |
| `GET/POST /workspace/members` | owner | **Proposed only.** Manage membership/roles, granting or revoking who may edit or bulk-move. A member cannot self-escalate to owner. |

The proposed paths specify observable future behaviour; there is **no Kestrel server today**. Deep links and selected/filter state must not reveal an issue to an unauthorised visitor merely because an image shows it.

## Data and state

- `Issue`: stable ID (`KES-218` for the central example), concise title (“Fix SPI bus contention during flash write”), component (`Firmware`/`PCB`/`Telemetry`), priority, status (`Triage`, `In Progress`, `In Review`, `Shipped`), assignee, Markdown spec, activity entries, version for optimistic conflict detection. Store Markdown as source and render via sanitised output/text policy; a prototype must not execute pasted HTML or scripts.
- Sprint 24 includes a count next to Triage (4 in the supplied brief) and four distinct columns. In the illustrative initial state, KES-218 is selected in its inspector; later command and grouped table states preserve that **same ID**, not a second unrelated issue made for each picture.
- Board/table selection is a view over one sprint dataset. View, filter and query state have shareable URL equivalents; selected issue IDs may be transient but are validated against the filtered, authorised set before any bulk action. Switching views never silently submits a change.
- “Assign KES-218 to Elena Rostova”, “Set priority → Urgent”, “Move KES-218 to In Review” and “Switch view to Grouped Table” are **real action names only in a future implementation**. A command palette must not execute a hidden bulk mutation when a user only searches; execution requires explicit Enter/click on a highlighted action.
- `popover="auto"` is a **non-modal** top-layer panel with light-dismiss, not a modal `<dialog>` and not a focus trap. Put an input with a visible label and a list of actual buttons inside; ArrowUp/Down, Enter, Escape and Tab have defined behaviour without claiming `role="menu"` unless the complete ARIA menu pattern is built. No `aria-modal="true"` on a popover. The status badge's small action panel may use an explicitly anchored popover when supported, with a readable in-flow/popover fallback otherwise.
- Right inspector is resizable via a keyboard-operable “Inspector width” control (plus optional pointer drag). A named `@container` responds to the **inspector's inline size**, not just the viewport. Narrow displays move the inspector into a labelled disclosure/drawer without discarding its actions or history.
- Grouped table selection uses native checkbox inputs and a derived `selectedIds` set. `:has(:checked)` can reveal a bulk toolbar visually; JS still computes true selection/count/authorised operations. Unchecking the last row removes the bar and preserves keyboard focus sensibly.

## Journey

1. Enter Sprint 24 Board. See workspace switcher, left navigation (`Active Sprint (24)`, `Triage (4)`, Roadmap and Cmd+K), four Kanban groups and card IDs/priorities/components/assignees. Open KES-218 to read its properties, sanitised Markdown spec and activity in the right inspector; resize with keyboard control and keep all essential information visible.
2. Invoke command search via the visible trigger or Cmd/Ctrl+K. Focus enters its labelled input; type “assign elena” and see “Assign KES-218 to Elena Rostova” alongside allowed next actions. Choose explicitly to assign; after execution the inspector, card and activity all reflect Elena, with an accessible confirmation. A status-badge context popover remains anchored when supported but is not an OS/browser menu.
3. Switch Board→Grouped Table using the command or view switcher. Apply Priority: High and Component: Firmware chips. Select exactly three visible rows via checkboxes; a bottom toolbar says “3 issues selected”, offering Move to In Review, Assign owner and Export JSON. Execute a permitted bulk move and verify exactly those three IDs change while unrelated rows remain unchanged. A supported same-document View Transition may animate the view swap; plain update is complete without it.
4. Search for “bootloader-panic” with these filters. See a zero-match state that repeats the query and offers Clear filters, not a blank table mistaken for a network failure. Open Quick-Create Issue `<dialog>`, leave required Issue title empty and type Markdown reproduction steps. Submit: the title gets `:user-invalid` styling, `aria-invalid="true"` after interaction and the inline message “Enter a concise issue title before creating”; typed steps remain. Enter a title, submit successfully and see the new issue without losing the filter context or duplicating a record.
5. A contributor without lead permission tries the bulk endpoint and gets a refusal without mutating any issue. An owner may later revoke a member, making a fresh session lose edit rights. These role transitions are **unimplemented** planning criteria, not observable from the images.

## Validation and states

- Distinguish loading, no match, missing issue, forbidden issue, failed mutation, stale version and offline network state with an accessible message and a specific next action; do not conflate “bootloader-panic has zero matches” with no sprint issues at all.
- Validate title before creating. Use `required` and `:user-invalid` after blur or submit; synchronise `aria-invalid` with the visible error rather than announcing invalid on first focus. Associate the message with the title via `aria-errormessage`/`aria-describedby`. On correction remove both error state and message; preserve Markdown steps across any refusal.
- Use native `.showModal()` for Quick-Create: backdrop/inert background and focus handling are native, Close/Escape dismiss, focus returns to the opener. Never use the command palette's nonmodal `popover="auto"` to implement a focus-trapping form dialog.
- `popover="auto"` and CSS Anchor Positioning are independent capabilities. The command palette remains usable as a centered/top-layer panel if anchors are unsupported; the KES-218 badge menu stays discoverable as an in-flow revealed button group rather than clipping beyond the viewport. The anchor-enhanced panel uses logical `position-area` with `position-try-fallbacks` to flip near edges; do not call it an ARIA menu without actual arrow-navigation semantics.
- `document.startViewTransition()` is an optional motion enhancement only. Reduced-motion users and browsers without the API receive the same immediate board/table state and focus restoration. A view toggle must not hide selected IDs or re-run a write.
- A failed bulk operation keeps the three selected IDs and reports which row/permission failed; it cannot partially move one row while claiming all three succeeded. Export JSON contains only currently authorised selected IDs and their allowed fields, with an explicit failure if export is blocked.

## Acceptance criteria

- A member loads Sprint 24 board with four actual status groups and the same KES-218 when navigating directly to its deep link; a non-member cannot see that issue's details.
- A keyboard user can open the nonmodal command popover, type a query, choose an action with Enter, close with Escape and return focus; no input appears inside an incorrectly marked modal.
- Assigning KES-218 to Elena changes the persisted issue, card, inspector and activity together, while merely typing “assign elena” does not mutate anything.
- The inspector changes layout at its **own width** on resize, stays operable via keyboard, and does not clip the spec, history or controls on narrow screens.
- Board→Table preserves filters/selection and works without View Transitions; filtering High + Firmware and checking three rows shows exactly “3 issues selected” and only their authorised bulk actions.
- Bulk move changes exactly the selected three issues atomically and reports a stale/forbidden failure without a partial successful claim.
- A query “bootloader-panic” with no matching issues shows a named zero-match state and Clear filters; clearing restores the previous sprint rows.
- Submitting Quick-Create with an empty required title creates **no** issue, displays the exact inline title error only after the attempted action, marks the field `aria-invalid="true"`, and preserves the typed reproduction steps. Correcting it creates one issue and clears the error.
- Four page-only 1376 × 768 boards illustrate the specified states with NO browser or OS chrome; actual model/bytes/dimensions and vision review can be claimed only after approved generation and inspection.

## Site Generation Prompt

Build a responsive **Kestrel** multi-actor hardware/firmware issue tracker for **Sprint 24: v3.4 Telemetry Release**. Use `#090d16` continuous ground, `#111827` left rail, `#1e293b` card/inspector surfaces and measured `#6366f1` indigo action accent. Do NOT draw a browser frame, macOS traffic lights, tabs, address bar, OS wallpaper or exterior desktop shadow as the site. The first viewport is one complete workspace: left rail with workspace switcher/Active Sprint/Triage/Roadmap/search trigger, four readable Triage/In Progress/In Review/Shipped board groups, and a keyboard-resizable KES-218 inspector describing “Fix SPI bus contention during flash write”, component, priority, assignee, sanitised Markdown spec and activity. Support direct issue links, actual persisted mutations, permissions, empty/error/loading states and mobile inspector layout rather than reproducing a static illustration.

Provide a command search opened by Cmd/Ctrl+K or a button as a **nonmodal** `popover="auto"` with a labelled input and keyboard-navigable button results; searching “assign elena” reveals explicit assignment/priority/status/view actions but does not execute them until activated. Enhance the KES-218 status badge action group with CSS Anchor Positioning and edge-flip tactics only when supported, leaving a usable non-anchored fallback; never falsely label it as an ARIA menu. Use named container queries driven by inspector width, native checkboxes with `:has(:checked)` toolbar display and JS-derived selected IDs, and optional `document.startViewTransition()` on Board→Table while preserving the same data when motion is disabled. Filter Priority: High and Component: Firmware; select three rows, bulk update atomically or export only their authorised fields. “bootloader-panic” produces a truthful zero-result state with Clear filters. Native `<dialog>` Quick-Create retains Markdown reproduction text after an empty Issue title is rejected; `required` + `:user-invalid` and synchronised `aria-invalid` show “Enter a concise issue title before creating” only after interaction. No generated image, visual mockup or fictitious data proves these behaviours: implement and browser-test them separately.

## Implementation status

**Planning only.** No Kestrel server, authenticated roles, stored issues, four JPEGs, rendered sprint UI, browser journey or verified mutation exists for this archetype. The four [`README.md`](README.md) prompts are offline text; no paid model gateway has been called. A separate owner-approved image task must generate and inspect boards, then add true asset provenance and viewer/taxonomy wiring. The sealed A6 targets and current A1 training corpus are unchanged.

## Provenance

- Functional and aesthetic direction: [`design.md`](design.md); exact pending image prompts: [`README.md`](README.md); [local pending provenance](PROVENANCE.md) holds actual prompt SHA-256 and explicit missing JPEG/model states.
- Type-axis context: [`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md). Existing workspace capabilities elsewhere are not Kestrel or a role-verified member/owner journey.
- Future images are `excluded_from_training: true` and `approved_for_training: false` without separate rights clearance. Fictional issue names, people and release numbers are not user data or evidence of deployed work.
- Work: `mwg-train-07ka.3` offline design/prompts. Generation/vision/global register/viewer wiring tracked separately after approval.
