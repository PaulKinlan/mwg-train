---
archetype: dashboard
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/dashboard/
register: docs/provenance/assets/training-reference-boards.md
---

# `dashboard` — aesthetic system

The look of the `record-form` type as the `dashboard` archetype implements it, expanded from each family's
single landing reference into a full multi-step journey. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**Where this system comes from, and which of the two references it describes.** The archetype has two
implementing families, so there are two declared systems and two committed boards:

- **`tr-04`, SunHarbor Community Solar** — [`prompt.txt`](../../training/tr-04/prompt.txt),
  [`reference.jpg`](../../training/tr-04/reference.jpg);
- **`tr-22`, Canopy Guardian** — [`prompt.txt`](../../training/tr-22/prompt.txt),
  [`reference.jpg`](../../training/tr-22/reference.jpg).

Both prompts declare the **same structural constants** and the **same five base roles with identical
values**, and differ in the two chromatic values they name. So the system below is presented as the shared
base plus each family's accent, and every use recorded against a token was read out of the committed bytes
rather than assumed from the declaration. The five journey boards this document describes are planned — see
*Implementation status* in `plan.md`.

## Visual thesis

An operations dashboard has one job before anything is submitted: tell somebody what is happening, in numbers
they can trust, and let them find the one subject that needs attention. Both references read that way. The
`tr-04` board leads with what the array is generating now and what it has generated this month; the `tr-22`
board leads with an inventory whose rows carry a drought risk that is not uniform, so the eye lands on the one
row that reads high.

So the thesis is **state first, action second**. The measured state is the most prominent thing on the page —
larger type, heavier weight, its own surface — and the form that changes the state is below or beside it,
never in front of it. An operator should be able to answer "what is happening?" and "which one is wrong?"
without filling anything in.

## Grammar and layout

- One page frame, `--content-frame: 1200px`, centred, with `--page-padding: 1.5rem` and
  `--control-radius: 8px` — the constants both families declare identically.
- Both references are **browser viewports**: chrome runs along the top edge with macOS-style window controls,
  a single tab and an address bar, and the page fills the rest. That framing is declared by both prompts and
  visible in both rasters, so it is part of what these boards depict.
- Page structure top to bottom, as both declare it: a brand header, then a navigation bar, then a main
  content area, then one or more content sections, then the working form, then a footer. `tr-04` declares two
  content sections and `tr-22` one, which is the difference between leading with metrics and leading with a
  table.
- The **summary region** is the top of the main area and holds the measured state: `tr-04` renders two metric
  tiles (current generation, cumulative monthly generation) plus an operational notice list; `tr-22` renders
  a filter bar over an inventory table whose active row is visually distinct from its neighbours.
- The **subject region** is where one subject is read in full: `tr-04` pairs a credit lookup with the result
  card it produces, and `tr-22` pairs a selected-tree profile card with the street photograph of that tree.
- The **log region** is the form, rendered open and inline in both boards. `tr-22` shows it below the subject
  region with its controls laid out on a grid and one full-width submit; `tr-04` shows its lookup inline
  beside the result it produces. Neither uses a wizard.
- The **status view** (`step4-filtered`) is the summary region narrowed to one filter or one risk band, so
  the shaded rows are the point rather than a scroll away.

**A divergence recorded rather than smoothed over, because it is systematic.** Both prompts instruct that the
content "runs past the left, right and bottom edges" with no visible page end, while also requiring a complete
footer. Both rasters resolve that contradiction the same way: the whole page is bounded inside the viewport
with a clean margin and a visible footer. This is now the third archetype in the corpus where the instruction
and the bytes disagree the same way, so a future generator should read these boards as framed compositions
rather than assuming the bleed was honoured.

**Two observed exceptions, recorded so they are not copied.** On the `tr-04` board one metric is labelled
"Current generation (kWh)" while its value is shown in `kW` — a unit mismatch between a label and its own
figure, which on a dashboard is the one error the design cannot afford. On the `tr-22` board the selected-tree
profile appears twice, once as a card and once as an overlay on the photograph. Both are artefacts of the
generation, not features of the system; the archetype's rule is one figure with one unit, and one panel per
subject.

## Typography

- A system UI sans-serif stack in both, as declared.
- Exactly one `h1` per board, but the two place it differently and this is worth knowing: `tr-04`'s `h1` is
  the co-op's own name in the brand header, and `tr-22`'s is the page's title over the dashboard. Either is
  within the declared rule; a generator should decide deliberately rather than assume.
- Roughly three tiers below the `h1`: section headings for the summary, subject and log regions, and a
  further tier for metric labels and sub-elements inside a card.
- **Numbers get their own treatment.** Both boards set the measured value larger and heavier than the label
  that names it, and set identifiers (`SH-9482-X`, `#CG-4083`) in a way that reads character by character.
  Table columns are aligned so a column of figures can be compared by scanning. This is the typographic
  expression of the thesis: the figure is the message.
- Form inputs carry visible labels above their fields. On both boards every control is labelled, and the
  placeholders present are format examples rather than substitutes for a label.

## Token usage

Presented as the archetype's roles, because the two families name the same roles with different prefixes and
identical values for the base. Each family's declared name is given for the base roles, and the observed use
is what the committed bytes show.

| Role | `tr-04` | `tr-22` | Value | Observed use |
| --- | --- | --- | --- | --- |
| Ground | *(not named)* | *(not named)* | `#ffffff` / near-white | The page ground of the dashboard in both boards. Neither prompt names a ground token, so this is an observation about the bytes rather than a declared value |
| Surface | `sh-panel` | `cg-card` | `#1e293b` | Cards, tables and form surfaces |
| Border | `sh-border` | `cg-border` | `#334155` | Hairlines on cards, tables and inputs |
| Text | `sh-text` | `cg-text` | `#f8fafc` | Headings and figures |
| Muted | `sh-muted` | `cg-muted` | `#94a3b8` | Labels, units, secondary metadata |
| Ink / dark band | `sh-dark` | `cg-slate` | `#0f172a` | The darkest value: body ink, and the full-width footer band on `tr-04`'s board |
| Accent — `tr-04` | `sh-sky` | — | `#0284c7` | The co-op's single primary action, the active navigation indicator, and the telemetry mark |
| Accent — `tr-22` | — | `cg-green` | `#047857` | The programme's single primary action, the active navigation pill, and the brand mark |
| Second chromatic — `tr-04` | `sh-yellow` | — | `#facc15` | Status and rating emphasis, not the primary action |
| Second chromatic — `tr-22` | — | `cg-lime` | `#84cc16` | Status and rating emphasis, not the primary action |

Two notes that a generator should carry forward. Both prompts say the accent "is the only chromatic colour
and carries the single primary action", yet each names **two** chromatic values; the rasters resolve it the
way the sentence means — one of the two carries the primary action, the other carries status or rating
emphasis, and they do not compete. And both prompts declare **a light palette**: the names `sh-dark`,
`sh-panel`, `cg-slate` and `cg-card` denote the darkest values in the set, which the boards use as ink and
card tone rather than as a dark page ground. Reading those names as "dark theme" would be a misreading of the
declaration, so it is recorded here in the opposite direction too — the declared palette and the rendered
boards agree that this is a light system.

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 8px`, `--control-border: 1px solid var(--…-border)` — the
  declared structural constants, identical in both families.
- Metric tiles and table rows keep a uniform height so a summary reads as a set rather than as a paragraph;
  on `tr-04` the two tiles sit side by side inside one card, on `tr-22` the rows of the inventory table are
  evenly spaced so the shaded row is legible as a selection rather than as a gap.
- The log form separates its rows enough for field-level feedback to appear without moving the fields below
  it, which matters on a dashboard where the form sits under live figures.

## Component hierarchy

1. **Brand header** — the operation's name and subtitle, and in `tr-04` the navigation controls it carries.
2. **Navigation bar** — the section links, with the active destination marked by the accent.
3. **Summary region** — the measured state: metric tiles for `tr-04`, a filter bar for `tr-22`.
4. **Data table or metric row set** — aligned figures with a per-row status, and one row or tile
   distinguishable as selected.
5. **Subject view** — one identified subject in full: an account's credits, or a tree's profile and history.
6. **Status marker** — the per-row badge or notice that says what needs attention, always with its text
   alongside the colour.
7. **Log form** — the write: the identified subject, the measurement, the period or action, and notes.
8. **Attribution and social proof** — member or resident voices with portraits and ratings.
9. **Footer** — contact details, a statement of purpose, and in `tr-04` a dark band closing the page.
10. **State panels** — the empty result state and any refusal feedback.

## Anti-patterns

- **A chart or graphic decorative enough to hide the number it reports.** Both prompts name this first,
  because a dashboard's whole claim is that the figure is readable.
- A posting control offered to a reader who cannot use it.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.
- A summary figure that disagrees with the rows beneath it, or a label whose unit disagrees with its value.
- An empty result rendered as a blank region rather than naming the filter that matched nothing.

These are the prompts' own prohibitions, kept as the archetype's rules. On both committed references the
prohibitions are respected, with the two exceptions recorded under *Grammar and layout* — the metric
labelled in kWh and shown in kW, and the duplicated profile panel.

## Rationale

Both instances have the same problem: something distributed is being looked after by people who are not
standing next to it. A co-op cannot see its roof generating, and a neighbourhood committee cannot watch every
young tree on its street. The dashboard exists to make the invisible state legible and to make the log of
what was done about it permanent.

That argues for figures before prose, status before navigation, and a summary that a person can trust without
auditing it. It also argues for the write being an increment to an existing subject rather than the creation
of a new record: the tree already exists, the account already exists, and what the operator adds is one
observation about it. Which is why this archetype's journey ends by reading the subject back — a dashboard
whose figures do not change after an action is a picture, not a dashboard.

## Provenance

- **The declarations:** [`tr-04/prompt.txt`](../../training/tr-04/prompt.txt) (sha256 `4c2793ec…`) and
  [`tr-22/prompt.txt`](../../training/tr-22/prompt.txt) (sha256 `1058e9cd…`), which name each palette, the
  shared structural constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** [`tr-04/reference.jpg`](../../training/tr-04/reference.jpg) (571002 bytes, sha256
  `7e48405e…`) and [`tr-22/reference.jpg`](../../training/tr-22/reference.jpg) (625799 bytes, sha256
  `4c6172ec…`), both 1376 × 768 and pinned in
  [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
  Each token's observed use, the two raster exceptions, the single-`h1` placement difference and the framing
  divergence were read out of those bytes.
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl`, families `tr-04` and `tr-22`, and
  the train-side pairs under `docs/train/design/`.
- **Not yet depicted:** the five journey states named in this document and in `plan.md`. They are planned and
  ungenerated, so this document is the declared system those boards will be generated against.
