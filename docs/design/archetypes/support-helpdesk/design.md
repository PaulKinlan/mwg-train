---
archetype: support-helpdesk
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/support-helpdesk/
register: docs/provenance/assets/training-reference-boards.md
---

# `support-helpdesk` — aesthetic system

The look of the `record-form` type as the `support-helpdesk` archetype implements it, expanded from the two
training families' landing references into a full multi-step journey. This document is written in the section
order [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**Two systems, and they are opposites — do not average them.** This archetype's training families are two
different designs rather than two renders of one, and they differ in exactly the way that is easiest to get
wrong:

| Family | Subject | Token prefix | Declared theme | Observed theme |
|---|---|---|---|---|
| `tr-08` | Grain & Silver Darkroom Co-op — equipment and chemistry helpdesk | `dr-` | no light/dark sentence; palette is near-black | **dark**, measured against the declared values |
| `tr-28` | Trailhead Youth Gear Locker — equipment repair and maintenance tickets | `th-` | "in a light palette" | **light**, as declared |

The evaluation-side family (`fam-08`, a community radio station) has **no reference board** in
`docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not
invent a look for it.

**How the two systems were established.** For each family the palette below is **declared** by that family's
generation prompt (`docs/design/training/<family>/prompt.txt`), and the observed uses were read out of the
committed reference by an independent vision pass — not inferred from the token names or their hex values.
That caution is not theoretical here: this corpus has already produced two boards whose dark-named tokens
denoted ink on a light ground, and this pair contains one board where the same dark values really are the page
ground. The difference can only be settled by looking.

## Visual thesis

A helpdesk's value is the ticket's **life after submission**. Both families say this in their first prohibited
pattern — "a ticket reference shown once and never recoverable again" — and both resolve it the same way: the
reference is a persistent, visible artefact, not a confirmation toast.

The darkroom does it more explicitly than the gear locker. Its third column is a **"Track a Ticket"** control
that asks for a reference code, so returning to a ticket is a first-class action on the landing page rather
than something the reporter must have bookmarked. The gear locker does it inside the list: ticket cards lead
with a reference like `#TY-10248` and stamp it in a distinct weight.

Beyond that the two theses diverge with their subjects. The darkroom reads as a **workshop board** — a
three-column operational display where the day's chemistry status, the ticket ledger, the submission form and
the desk's opening hours are all visible at once, on a low-glare dark ground appropriate to a room lit by a red
safelight. The gear locker reads as a **community service counter** — a light, reassuring, two-column page for
volunteers and youth-group leaders, where the form and the live ticket list sit side by side.

## Grammar and layout

Both families declare the structural constants `--content-frame: 1200px`, `--page-padding: 1.5rem`,
`--control-radius: 8px` and `--control-border: 1px solid var(--*-border)`, and both declare the same page
structure: a brand header, a navigation bar, a main content area, one content section, the working form, and a
footer.

- **`tr-08` is a three-column operational grid.** The left column carries "Active Tickets & Announcements" —
  one operational announcement about chemical status followed by two ticket cards. The centre column carries
  the "Submit a Ticket" form. The right column carries "Track a Ticket", then co-op member feedback, then
  "Helpdesk Info" with opening hours and an emergency escalation line. Nothing is hidden behind a step.
- **`tr-28` is a two-column page.** A hero splits a headline from an editorial photograph of the gear store,
  and below it the "Submit a Damage Ticket" form sits beside "Recent Active Tickets" and a group-leaders'
  testimonial row.
- **Both references are browser viewports** with chrome and an address bar — `https://grainsilver.community/`
  and `https://trailheadyouth.site/` — so both depict a tab, a URL, and the page as a framed composition.
- **Step 2 and step 3 are where the multi-step flow earns its name.** On both references the ticket list and
  the submission form share one screen, and neither shows a ticket **status page**, which is the thing the
  archetype's assertions actually test. `step2-form` and `step3-status` give the write and its receipt the
  room the landing board could not.
- **Step 4 is the staff side**, and it is the step the training families do not depict at all: neither
  reference shows an agent queue, a status change, or a reply. The evaluation-side family makes that the
  centre of its contract, so `step4-reply` is designed from the brief rather than from a board.
- **The empty state** (`step5-empty`) is a queue or search that names what matched nothing.

**A divergence recorded rather than smoothed over, because it is systematic.** Both prompts instruct that the
content "runs past the left, right and bottom edges" and that "you never see where the page ends
horizontally", while also requiring the complete footer to be visible. Both rasters resolve that contradiction
the way every board in this corpus has: the page is bounded, centred, and fully visible with its footer. This is
the fifth archetype where the same instruction resolves the same way, so these baselines should be read as
framed compositions rather than as bleed demos.

## Typography

- A system UI sans-serif stack, as declared by both families.
- **Exactly one `h1` on each reference, and in both cases it is the desk's purpose rather than the brand** —
  "Darkroom Maintenance & Supply Helpdesk" and "Keep Our Youth Outdoors, Safely Equipped". The brand sits in
  the header on both. This is the third archetype where the headline-versus-brand choice is visible, and the
  boards are consistent about putting the purpose in the `h1`.
- Three to four tiers are visible on each: the `h1`, section titles, ticket or card titles, and labels and
  metadata.
- **References are set as a distinct class of text on both boards.** `tr-08` sets ticket identifiers like
  `G&S-3810` in a bold prefix ahead of the title; `tr-28` sets `#TY-10248` in a distinctly weighted monospace
  style in the card's header row. On a helpdesk the reference is the record's identity, so typography carrying
  that weight is doing real work rather than decoration.
- Form controls carry **permanent visible labels** on both boards, with placeholder text used only as a format
  hint underneath — for example a serial-number field whose placeholder shows the expected `TY-XXXX-XX` shape.

## Token usage

All values are declared; every observed use was read out of the committed bytes.

**`tr-08`, Grain & Silver Darkroom Co-op — a dark desk.**

| Token | Value | Observed use |
| --- | --- | --- |
| `dr-bg` | `#09090b` | The page ground; measured in the raster at approximately `#0b0c0e`, matching within compression tolerance |
| `dr-surface` | `#18181b` | Card and form grounds |
| `dr-card` | `#27272a` | Raised card surfaces — tickets, feedback, info; measured at `#27272a` |
| `dr-border` | `#3f3f46` | Card and field hairlines; measured at `#3f3f46` |
| `dr-amber` | `#f59e0b` | The single accent: the submit button's fill, the active navigation item, and the feedback stars; the button measured at `#ef9813` |
| `dr-text` | `#f4f4f5` | Headings, card titles, active navigation text; measured at `#f4f4f5` |
| `dr-muted` | `#a1a1aa` | Subtitles, metadata labels, timestamps, placeholders; measured at `#a1a1aa` |

**`tr-28`, Trailhead Youth Gear Locker — a light desk.**

| Token | Value | Observed use |
| --- | --- | --- |
| `th-forest` | `#064e3b` | The single accent: the submit button's fill, the brand mark, and the active navigation underline |
| `th-yellow` | `#eab308` | Star ratings only — emphasis that does not compete with the primary action |
| `th-slate` | `#1f2937` | The footer band's ground, and dark ink where a heavier weight is needed |
| `th-card` | `#ffffff` | Card and form grounds |
| `th-border` | `#d1d5db` | Field and card hairlines |
| `th-bg` | `#f9fafb` | The page ground |
| `th-text` | `#111827` | Headings and body copy |
| `th-muted` | `#6b7280` | Labels, timestamps, helper text |

**A near-miss worth naming on the dark board.** `tr-08` declares no light/dark sentence, and its values are
near-black; read from the token names alone that would be an assumption, and this corpus has produced two
boards where exactly that assumption was wrong. The vision pass measured the raster instead, and it agrees —
but the agreement is a finding, not a premise.

## Spacing rhythm

- The declared constants are shared: a centred frame, page padding, an eight-pixel control radius, and a
  one-pixel border drawn in each family's own border token.
- **`tr-08` packs three columns into one screen**, which is what makes the chemistry status, the ledger, the
  form and the desk's hours simultaneously visible. That density is a property of the single landing board, not
  a spacing rule: a multi-step flow gives each region its own screen.
- **`tr-28` keeps a hero above the operational grid**, so the page breathes more, at the cost of the ledger and
  the form sharing the width below it.
- On both boards the ticket cards keep a uniform internal rhythm so the same metadata occupies the same
  position in each card — the comparison that makes a ledger readable.

## Component hierarchy

1. **Brand header** — the mark, the desk's name, the section navigation, and the active-item indicator.
2. **Hero or desk introduction** — the `h1` stating the desk's purpose, its supporting paragraph, and on
   `tr-28` an editorial photograph of the subject.
3. **Ticket submission form** — the labelled fields, the taxonomy selects, and the single primary action.
4. **Ticket card** — reference, title, reporter, category or equipment, urgency, status, and dates.
5. **Reference tracking** — `tr-08`'s dedicated "Track a Ticket" input; on `tr-28`, the reference printed in
   each card's header.
6. **Operational announcement** — `tr-08`'s chemical status card, carrying a last-checked and a next-due date.
7. **Attribution row** — member feedback or group-leader testimonials with portraits and ratings.
8. **Desk information** — `tr-08`'s opening hours and emergency escalation line; `tr-28`'s contact details.
9. **Footer** — identity, address, contact, the date the desk was read, and copyright.
10. **State panels** — the empty result state and any refusal feedback.

## Anti-patterns

- **A ticket reference shown once and never recoverable again.** Every family states this first, and both
  boards answer it visibly: `tr-08` with a dedicated tracking input, `tr-28` with the reference in every card's
  header.
- A second accent colour competing with the primary action. On the dark board amber carries the button, the
  active navigation item and the stars; on the light board forest green takes the action and yellow is confined
  to the stars.
- Placeholder text standing in for a visible label. Both boards label every field, using placeholders as format
  hints.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.
- A queue or ticket list with no status, or a ticket with no owner — the staff side is what makes the record
  useful.
- Collapsible content that traps keyboard focus, which the evaluation-side family requires explicitly.

### Raster defects recorded so a generator does not copy them

These are properties of the committed boards, not of the archetype.

- **`tr-08` dates one ticket in the wrong year.** A ticket card reads `Est. fix: Tue 13 Oct 2028`, and 13
  October falls on a Tuesday in 2026 rather than 2028. The footer also reads `© 2028` against a page dated
  11 October 2026.
- **`tr-08` truncates a select label**, rendering the category option as `Equipment Malfunctio...` because the
  two selects share a row.
- **`tr-08` contains a misspelling in a testimonial** ("sesslom" for "sessions").
- **`tr-28` duplicates and garbles a ticket's metadata**, printing `Status: Pending Repair` twice with a
  meaningless `Urgency Received` line between them.
- **`tr-28` renders both selects as statically stacked open lists** inside their field boxes rather than as
  closed controls — a depiction artefact, not a pattern to implement.
- **`tr-28` dates one ticket on the same day as the page** (`Submitted Sun, Oct 11, 2026` against a footer
  reading `Today's Date: Oct 11, 2026`), where the brief asks for events after that date.

## Rationale

The two designs are opposites because the two subjects are. A darkroom is a room kept dim and lit red; a board
that helps run it can share the low glare, and its audience — working photographers who know the equipment —
reads a dense operational display comfortably. A gear locker serves young people and volunteer group leaders,
whose need is reassurance rather than density, so its page is light, spacious, and leads with a photograph of
the equipment being lent out.

The shared decision is the one the archetype turns on: **the reference is visible on the landing page**. Both
boards spend prime space on it — one with an input dedicated to finding a ticket again, the other by putting the
reference at the top of every card — because a helpdesk that cannot be returned to is a complaint form, not a
desk.

## Provenance

- **The declarations:** `docs/design/training/tr-08/prompt.txt` (sha256 `fb70e20a…`) and
  `docs/design/training/tr-28/prompt.txt` (sha256 `d785385d…`), which name each palette, the structural
  constants, the page structure, the control labels and the prohibited patterns.
- **The depictions:** `docs/design/training/tr-08/reference.jpg` (1376 × 768, 630915 bytes, sha256
  `5c6b678c…`) and `docs/design/training/tr-28/reference.jpg` (1376 × 768, 650898 bytes, sha256
  `d49bbd4b…`). Every observed use, both layout structures, the `h1` placement, the tracking control, and the
  defects listed above were read out of those bytes by an independent vision pass. Both files and both prompts
  are pinned in
  [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (families `tr-08`, `tr-28`),
  `docs/eval/briefs/manifest.jsonl` (family `fam-08`), and the train-side pairs `docs/train/design/tr-08/`
  and `docs/train/design/tr-28/`.
- **Not depicted at all:** an agent queue, a ticket status page, a reply thread, or an empty state. The five
  journey boards in `plan.md` are planned and ungenerated, so this document is the declared system they will be
  generated against.
