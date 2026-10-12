---
archetype: library-catalogue
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/library-catalogue/
register: docs/provenance/assets/training-reference-boards.md
---

# `library-catalogue` — aesthetic system

The look of the `record-form` type as the `library-catalogue` archetype implements it, expanded from the one
training reference into a full multi-step journey. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**One system, one board.** `tr-16` is the only training family, and its board is the only depiction this
archetype has. The evaluation-side family `fam-16` (a local archive of antiquarian books, eval split: test) has **no reference
board** in `docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this
document does not invent a look for it.

**How the system was established.** The palette is **declared** by the family's generation prompt
([`prompt.txt`](../../training/tr-16/prompt.txt)), and every observed use below was read out of the committed
reference by an independent vision pass — not inferred from token names or hex values. That discipline matters
in this corridor: the same corpus contains boards whose dark-named tokens are ink on a light ground, and this
board declares **two chromatic tokens** where its own rules say the accent is the only chromatic colour, so what
each one is actually used for cannot be guessed from the palette list.

## Visual thesis

A catalogue of rare perennials reads as a **living collection being kept alive by named people**. The reference
carries that in two moves: a hero that states the purpose rather than the brand — "Preserving Rare Perennials"
over "a living repository and lending catalogue of historic plant strains for our botanical society" — and a
reservation form headed "Reserve a Propagation Stem", which names the physical thing being handed over rather
than an abstract "request".

The board also treats the **catalogue grid as the main event**. Search and filters sit directly above the
specimens, the specimen cards carry their own attributes, and the form sits beside them rather than below. A
visitor can see what is available while they are reserving it, which is the same side-by-side argument the
darkroom board in the `support-helpdesk` archetype makes with a ticket list and a form.

## Grammar and layout

- Declared structural constants: `--content-frame: 1200px`, `--page-padding: 1.5rem`, `--control-radius: 8px`,
  `--control-border: 1px solid var(--hp-border)`.
- Declared page structure: a brand header, a navigation bar, a main content area, a content section, the working
  form, and a footer.
- **The reference arranges it as a two-column split.** The left column carries the hero, the search and filter
  row, and the specimen grid; the right column carries the reservation form, the member experiences, and the
  footer. The declared vertical order and the rendered split differ, which is recorded rather than smoothed
  over: the render is what a generator will be measured against visually.
- The **search and filters** are a labelled search field plus two selects and a filter action. On the reference
  those selects are sun requirements and **soil type**; the brief's stated journey filters by sun tolerance and
  **flowering season**. That divergence is recorded below rather than resolved here.
- The **specimen grid** is a three-column grid of cards, each carrying a photograph, the cultivar name, its
  attributes, a cutting count, a propagation note, and a request control.
- **There is no standalone specimen detail view on the reference** — the attributes are compressed onto the
  cards and echoed in the form's cultivar select. This is exactly what `step2-item` decomposes: a specimen
  deserves a page stating its accession and propagation detail rather than a card-sized summary.
- **Step 3 is the reservation form**, one column of one page, six labelled controls and a single submit; never a
  wizard, never a modal. **Step 4 is the receipt** and, on the evaluation side, the staff view of pending
  reservations — a state the reference does not depict at all.
- **Step 5 is the empty state**, and on this archetype it is not optional: the family's first prohibited pattern
  is "a search that matches nothing rather than saying so".

**A divergence that is NOT the usual one, and it corrects a claim made elsewhere in this corpus.** Four earlier
boards in this corpus resolved the prompt's contradictory crop instruction — content bleeding past the edges
*and* a complete visible footer — by bounding the whole page inside the viewport. **This board does neither.** The
catalogue grid is clipped mid-card along the bottom-left edge, so the page genuinely continues past the viewport
and the second row of specimens is cut off partway; while at the bottom right the footer and the member
experiences are fully visible. The reference therefore contains bleed and a complete footer at the same time, in
different columns. Any statement that these baselines uniformly resolve to a bounded page is wrong, and this
board is the counterexample.

## Typography

- A system UI sans-serif stack, as declared.
- **One `h1`, and it is the purpose rather than the brand**: "Preserving Rare Perennials", with the repository's
  name in the header above it. This is the fourth archetype where the boards put the desk's or site's purpose in
  the `h1`, and they are consistent about it.
- Three to four tiers are visible: the `h1`, the form and section headings, the cultivar names, and the labels
  and attribute metadata.
- **Cultivar names are the strongest text in the grid** — bold, slightly larger than the attributes beneath them
  — which is right for a catalogue: the name is the thing being selected, and the attributes are its qualifiers.
- Attribute metadata is set in the muted colour at regular weight, with figures inline ("14 cuttings available"),
  which is what makes two specimens comparable by scanning the same position in each card.

## Token usage

All values are declared; every observed use was read out of the committed bytes.

**Known conformance gap, recorded rather than retuned.** The declared control border is
`var(--hp-border)`, which is `#e2e8f0` and measures **1.23:1** on `#ffffff` and **1.18:1** on `#f8fafc`.
WCAG 2.1 1.4.11 requires 3:1 for UI component boundaries, so the inputs and selects this palette
describes do not meet it. `#7c8ba1` would clear the requirement on both surfaces (3.46:1 and 3.31:1),
but it is not in the family's generation prompt, so adopting it here would be a change to the
generation contract rather than a description of it, and this document would be describing a board
nobody generated. The remedy therefore belongs in `docs/design/training/tr-16/prompt.txt` and in a
regenerated reference; until that happens this document records the gap and does not claim a fix.

| Token | Value | Observed use |
| --- | --- | --- |
| `hp-sage` | `#15803d` | **Brand identity only**: the leaf mark and the repository's wordmark and subtitle. It fills no control and carries no action |
| `hp-purple` | `#7c3aed` | **Every interactive accent**: the filter action's fill, the per-card request links, and the primary submit's fill |
| `hp-card` | `#ffffff` | Card and form-input grounds, including the specimen cards and the review cards |
| `hp-border` | `#e2e8f0` | The hairlines framing cards, controls, selects and reviews, as the generation prompt declares |
| `hp-bg` | `#f8fafc` | The page ground |
| `hp-text` | `#1e293b` | The `h1`, section headings, cultivar names, form labels and review copy |
| `hp-muted` | `#64748b` | The hero subtitle, placeholders, card attribute metadata and footer contact details |

**The two-chromatic question, answered by observation.** The prompt declares both `hp-sage` and `hp-purple` while
stating that "the accent is the only chromatic colour and carries the single primary action". On the rendered
board the green is **not** an accent at all: it is the brand identity, used in the logo and the wordmark and
nowhere else in the interface. The purple is the accent, and it carries the filter action, the card-level
request links, and the submit. So the palette's second chromatic token is a brand colour rather than a
competing accent — and that distinction is only visible by looking, since the declaration alone does not say
which token is which.

**A real tension worth recording.** Purple fills the filter action and the primary submit **identically**. The
rule the prompt states is that the accent "carries the single primary action", and on this board it carries the
primary action *and* a list-filtering control. That is not a second accent, but it does weaken the hierarchy the
rule is protecting: the page has one chromatic action colour used for two different ranks of action. A generator
should give the filter a secondary treatment — an outline or a text treatment in the accent — so the submit
alone reads as the primary.

## Spacing rhythm

- The declared constants are shared with the rest of this corpus: a centred frame, page padding, an eight-pixel
  control radius, and a one-pixel border in the family's own border token.
- The search and filter row sits between the hero and the grid with enough separation to read as an operable
  band rather than as part of the hero.
- Cards sit on a three-column grid with uniform internal rhythm, so that sun requirements, cutting counts and
  propagation notes occupy the same positions in every card — the comparison the grid exists to support.
- The form's controls are separated enough for field-level feedback to appear without displacing the controls
  below them, which matters because the submit generates a voucher whose result must be legible.

## Component hierarchy

1. **Brand header** — the leaf mark, the repository's name and subtitle, and the section navigation.
2. **Hero** — the purpose headline, its supporting sentence, an open-day badge, and an editorial photograph of
   the collection.
3. **Search and filter band** — the labelled search field, the attribute selects, and the filter action.
4. **Specimen card** — photograph, cultivar name, attributes, cutting count, propagation note, and the request
   control that scopes the form to that specimen.
5. **Specimen detail** — planned as `step2-item`: the accession and propagation record a card cannot hold.
6. **Reservation form** — the member's name and email, the cultivar under a required select, the cutting type,
   the number of cuttings, and propagation notes.
7. **Voucher or receipt** — the reference the reservation is read back by, planned as `step4-receipt`.
8. **Staff view** — the evaluation side's list of pending reservations, planned as `step4-receipt` and absent
   from the reference.
9. **Attribution row** — member experiences with portraits, ratings and dates.
10. **Footer** — address, contact and copyright.
11. **State panels** — the empty result state and any refusal feedback.

## Anti-patterns

- **A search that matches nothing rather than saying so.** The prompt names this first, and it is the archetype's
  own rule: a filtered catalogue must say what it did not find. Planned as `step5-empty`.
- A second accent colour competing with the primary action. On this board the second chromatic token is brand
  identity rather than an accent, which is acceptable — but see the tension recorded under *Token usage* about
  the same accent filling both the filter and the submit.
- Placeholder text standing in for a visible label. Both the search field and every form control carry permanent
  visible labels; placeholders are format hints.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.
- A card whose stated availability disagrees with itself, or with the specimens listed.

### Raster defects recorded so a generator does not copy them

These are properties of the committed board, not of the archetype.

- **Two of the three specimen cards print their cutting count twice.** The *Acanthus mollis* card prints
  "14 cuttings available" twice and the *Achillea millefolium* card prints "19 cuttings available" twice,
  while the *Campanula lactiflora* card prints a single "8 cuttings available". The count is the number a
  reservation is made against, so a repeated count is a correctness defect rather than a cosmetic one.
- **The filter dimensions disagree with the brief.** The board filters by sun requirements and soil type; the
  family's stated journey filters by sun tolerance and flowering season. Flowering season is absent from the
  board.
- **A stray label stack** appears above the cutting-type select, reading "Cutting type" over an unexplained
  "Select with".
- **Each review card carries two portraits** — a reviewer avatar on the left and a second small thumbnail on the
  right.
- **The layout is a two-column split** rather than the declared top-to-bottom page structure, with the footer
  under the right-hand column.
- **One reviewer is a fictional television character**, which is a content choice rather than a defect but is
  worth not propagating.

Dates on the board do check out: the open-day badge reads Saturday 17 October 2026 and 17 October 2026 is a
Saturday, and both review dates fall after the page's reference date. The three cultivar names are all real
cultivars, which is worth recording because a generator inventing botanical names would be worse than one
copying these.

## Rationale

The subject is stewardship: a repository whose purpose is to keep rare strains alive by lending propagating
material out. That argues for a design where the collection is visible and countable — a grid of named
specimens with availability figures, not a marketing page — and where reserving feels like collecting something
specific rather than submitting an enquiry. Hence "Reserve a Propagation Stem" and "Submit Reservation &
Generate Voucher" rather than "Contact us".

The green-purple split is the design's most interesting decision and the one most easily copied wrongly. Green
is the living thing and belongs to the identity; purple is the interface and carries every action. A generator
reading only the palette list would see two chromatic tokens and could easily swap them, which would put the
brand colour on the buttons and drain the design of its meaning.

## Provenance

- **The declaration:** [`prompt.txt`](../../training/tr-16/prompt.txt), which names the palette, the structural
  constants, the page structure, the six control labels and the prohibited patterns.
- **The depiction:** [`reference.jpg`](../../training/tr-16/reference.jpg), 1376 × 768, 677798 bytes, sha256
  `f0b6b720…`. Each token's observed use, the two-column split, the grid, the absent detail view, the
  asymmetrical bleed at the bottom left, the clipped second row, the pre-filled form and every defect listed
  above were read out of those bytes by an independent vision pass. Both files are pinned in
  [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (family `tr-16`),
  `docs/eval/briefs/manifest.jsonl` (family `fam-16`), and the train-side pair `docs/train/design/tr-16/`.
- **Not depicted at all:** a specimen detail page, a reservation receipt, a staff view of pending reservations,
  or an empty state. The five journey boards in `plan.md` are planned and ungenerated, so this document is the
  declared system they will be generated against.
