# Provenance: which archetypes need reference boards for state coverage

- **Decision:** boards are needed wherever a state is defined by the archetype's own contract (`plan.md`) or
  asserted by a family in the manifests, and the comparator can reach it. On that test Wave 2 needs three boards it
  does not have, and seven archetypes outside Wave 2 need one or more. All of them depend on the capture work in
  mwg-train-bosi before any comparison can use them.
- **Decided:** 2026-10-12. Corrected twice the same day after review (mwg-train-pgcv, mwg-train-fjfn): the first
  version answered from the manifests alone, the second kept a body that contradicted its own conclusion.
- **Method:** the question is not "is a complete state set nicer" but "does anything compare a rendered arm
  against a board for this state, and can the capture reach that state". Both halves are answerable.

## What consumes a board

`scripts/check-cross-arm-parity.mjs` renders each arm, screenshots it, and compares it against the `step*.jpg`
boards in `docs/design/archetypes/<archetype>/`. When that directory holds no `step*.jpg` it raises a
`BOARDS_MISSING` finding saying "so nothing was compared against the reference design" - advisory by default,
failing under `--strict`, and reported rather than hidden. Boards are gated independently too:
`check-archetype-frames` requires them unframed and `check-board-captions` resolves each SHA-256 caption to a
file, with six tests behind both.

So a board is required where a comparison needs a target - `docs/design/archetypes/<archetype>/step*.jpg` is
what that comparison reads - and a board is only usable if the capture can reach the state it depicts. Both
conditions have to hold, and the sections below test each in turn.

## What defines a state: two sources, and the contract is the one that decides

The first version of this document consulted the manifests alone and treated an absent family row as an absent
state. That was the defect review found. The two sources answer different questions:

- **the contract (`docs/design/archetypes/<archetype>/plan.md`)** defines the states the archetype must render.
- **the manifests (`docs/train/briefs/manifest.jsonl`, `docs/eval/briefs/manifest.jsonl`)** record what each
  generated family asserts.

Neither substitutes for the other, and a state defined by either needs a board.

### Source 1: the functional contract

| Archetype | state its contract requires | board today |
| --- | --- | --- |
| catalogue | "the empty state is first class: the target ships a whole page for it (`demo/empty.html`) and the third board depicts it" (plan.md:97) | `step3-empty.jpg` - present |
| contact-lead | "on a missing field the server refuses the submission and re-renders the form; nothing is stored" (plan.md:54) | none |
| account-recovery | "an empty or malformed address is refused by the field's own constraint before submission" (plan.md:114) | none |
| event-registration | capacity refusal and accessible validation feedback (8 state mentions in plan.md) | none |

catalogue is the case that settles it. It carries `step3-empty.jpg`, and its plan says in the same sentence
that the board **depicts** the required empty page. So that board is a response to a contract-required state,
not the "supplied visual reference rather than a response to an assertion" that the first version called it. The
one Wave 2 archetype that has a state board is the one that demonstrates what state boards are for.

So Wave 2 needs three boards it does not have: contact-lead (mwg-train-cdp0), account-recovery
(mwg-train-uh0o), and event-registration (mwg-train-wkto). catalogue has the board its contract calls for.

### Source 2: the manifests

| Archetype | family rows | asserts an empty state | asserts an error state (any wording) |
| --- | --- | --- | --- |
| catalogue | 0 | no | no |
| contact-lead | 0 | no | no |
| account-recovery | 0 | no | no |
| event-registration | 9 | no | yes - 20 assertions |

The manifests record what a FAMILY asserts; the contract records what the ARCHETYPE requires - which is why
account-recovery and contact-lead show empty rows here while their own plans require a refusal state. Absent
rows are not absent states.

Two scope defects worth keeping visible, because both recurred during this work:

- the error column was first derived from an HTTP-4xx test alone, so prose assertions were invisible.
  event-registration's 20 come from tr-07 ("attempting to book more tickets than remaining capacity triggers an
  error"), tr-30 ("displays accessible error feedback if omitted"), fam-07 (capacity caps enforced) and fam-r02
  ("a validation error is announced to assistive technology"). An error state is not an HTTP status.
- a table asserting a universal has to be derived from the widest definition its sentence implies. Both
  corrections to this document were a universal built on a narrower source than the claim it supported.

### The seven archetypes outside Wave 2

Eight archetypes assert an empty state or a refusal and seven have no board directory at all:

| Archetype | asserts empty | asserts an error state | boards today |
| --- | --- | --- | --- |
| community-forum | no | yes | 0 |
| expense-tracker | no | yes | 0 |
| job-board | no | yes | 0 |
| library-catalogue | no | yes | 0 |
| restaurant-ordering | yes | yes | 0 |
| survey-form | no | yes | 0 |
| web-shop | yes | no | 0 |
| booking | yes | no | 5 - has boards |

`restaurant-ordering` is the sharpest: it asserts both and has a board for neither, so its parity comparison
reports `BOARDS_MISSING` for both.

## The blocker: the capture reaches only the homepage

`captureSignature` in `src/eval/render.mjs` navigates to `http://127.0.0.1:${port}/` and screenshots that page.
It captures ONE page, for every archetype and every arm. So no empty state and no error state can be compared to
anything, whatever boards exist: a board of a state the capture never reaches has no counterpart on the rendered
side.

This is the condition that governs every board task in this document, and it is why they are filed as dependent
rather than ready. It also corrects an assumption in the first two versions, which treated "a comparison needs a
target" as sufficient. It is necessary and not sufficient - the comparison also has to reach the state.

## Scope boundary for interaction boards (recorded 2026-10-13)

Every board in this document depicts an **asserted state**, and several of those states have no URL: a refusal
re-renders the form that was submitted. Those boards are classified `kind: 'interaction'` with a deliberately
null `path` in `board-states.json`, with a source naming the assertion they serve - the convention booking's
`step4-error.jpg` and the three Wave 2 refusal boards (contact-lead, account-recovery, event-registration)
established.

**What such a board does and does not do today.** It supplies the canonical visual specification for the
asserted state, and it resolves the board-missing side of the asset registry. It is **not** compared against any
rendered arm, because `check-cross-arm-parity` captures by URL path only: `captureSignature` navigates to a
root-relative path, so a state that exists only after a refused submission cannot be reached, and giving it a
path would compare an unrelated page and report the mismatch as a design difference. Interaction boards are
therefore **exempt from path-based comparator sweeps** until the instrument implements interactive driving
(simulating the submission that produces the refusal). That work belongs to the instrument, not to the board,
and a board task must not be blocked on it.

### The instrument half of that exemption is now implemented; the arm half is what remains (measured 2026-10-13)

The comparator can now drive a form. A board may carry a `drive` block (recipe plus a required `expectText`
marker, mwg-train-mr6t), so an interaction board without a URL is measurable and comparable - the recipe is part
of the board's identity, and `captureSignature` refuses a marker that is already on the page before the drive,
so a successful submission cannot be mistaken for the depicted refusal.

Drive recipes were then attempted for the seven nulled refusal boards and **all seven were removed**. An earlier
version of the table below gave the reason as the arm being unable to isolate a field at all. That is wrong and is
corrected here (mwg-train-8szu, raised by review): the arms DO isolate single fields, and one applies a value rule.
The measurements below come from driving each family's raw arm, one write route at a time, with every other field
satisfied - so each row says what the arm measurably does, against what the raster depicts:

| board (what the raster depicts) | the arm's write route, and what it measurably refuses | why no drive compares |
|---|---|---|
| job-board `step1-error`: the vacancy-posting form refused with inline errors on title and contact email | `POST /apply` - a candidate application (applicant, email, role, statement); each field alone reports `Missing: <field>` | the depicted posting form does not exist in the arm: a different form, for a different actor |
| community-forum `step3-refusal`: the reply composer refused on an empty required note body | `POST /notes` (author, entry, note); an empty note alone reports `Missing: note` | the refusal is reachable, but the arm's write is a parentless entry while the board's composer replies inside an existing thread - the same message on a different action |
| expense-tracker `step1-error`: a negative amount refused, with a top alert and an inline message beside the field | `POST /expenses` (member, vendor, category, amount); `amount=-1` alone reports `Below minimum: amount` | the refusal is reachable, but the arm renders one alert naming the field on a four-field form, where the raster shows a two-part refusal (a card-level alert plus a field message) on a richer form with a running-total panel - the same rule, a different rendered state |
| survey-form `step3-validation`: refused on unanswered mandatory RATING questions | `POST /survey` (respondent, location, hazard, comments) has no rating control; its select accepts any value (an unlisted option returns 303, not a refusal) | the depicted rule cannot be raised: the control it applies to does not exist in the arm, and the select it does have is not validated against its options |
| library-catalogue `step3-refusal`: refused without a researcher name and with an invalid date | `POST /request` (gardener, specimen, quantity); a missing name alone reports `Missing: gardener`; `quantity=-1` is accepted (303) | the depicted refusal is the missing name AND the invalid date together; the arm has no date control and no rule on its numeric field, so half of the depicted state cannot exist |
| restaurant-ordering `step1-error`: checkout refused on an empty order, with a path back to the menu | `POST /order` (customer, bread, window); an empty submission reports `Missing: customer, bread` | the arm has no cart: its write is a single order form, and empty reports missing fields - a field-level refusal, not the depicted empty-order refusal |
| web-shop `step1-empty`: an empty cart with checkout disabled and a path back to the ciders | `POST /checkout` (customer, email, items, collection); an empty submission reports `Missing: customer, email, items, collection` | the pictured state is not a refusal at all: it is a cart state with a disabled action, which no submission produces |

What the measurements do and do not support, because the corrected reason matters more than the table: an **empty**
submission does report every missing required field at once (3, 3, 3, 3 and 4 across the five families measured in
that round), so a board depicting one field in error is not reached by submitting empty. But a single field CAN be
isolated - satisfying every other field and omitting one reports that one alone (`Missing: member`), and the expense
arm applies a value rule (`Below minimum: amount`) - so "the arm cannot isolate a field" is not why these recipes
are absent. The reason is that a drive compares the **rendered state**, and these boards specify the planned
product's form while the arm renders a reduced one: the refusal exists on both sides, with different fields, wording
and layout. That is **arm work, not board work or instrument work**, parked as mwg-train-7ix4 with this measurement
on the bead, so a future attempt extends the generator first instead of re-deriving the table.

## What follows

1. **Capture coverage first, as its own tasks (mwg-train-bosi, closed; and mwg-train-j3o4).** `captureSignature` must be able to reach the
   states the assertions and contracts describe - a list after a filter returns nothing, a form after a refusal -
   before any board for those states can be compared to anything.
2. **Wave 2 boards required by the contract and manifests:** contact-lead (mwg-train-cdp0), account-recovery
   (mwg-train-uh0o), and event-registration (mwg-train-wkto, for its 20 manifest-asserted capacity and validation refusals). catalogue needs nothing.
3. **Seven boards outside Wave 2**, one per archetype, for the states each actually asserts -
   restaurant-ordering both, web-shop empty only, the rest error only, each named in its own bead.
4. **All ten depend on mwg-train-bosi (capture, closed) and mwg-train-j3o4 (comparator state wiring).** A board for a state the capture cannot reach is an artefact nothing
   reads, which is what the first version of this document would have produced seven of. (All 10 board tasks now have explicit dependency edges on mwg-train-j3o4 recorded in the tracker).

The decision is deliberately narrow: it does not claim the corpus needs uniform state coverage, and it does not
ask for artefacts that nothing can read.
