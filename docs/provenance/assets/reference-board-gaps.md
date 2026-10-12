# Provenance: which archetypes need reference boards, decided from the assertions

- **Decision:** Wave 2 does not need additional empty or error-state boards. Seven OTHER archetypes do.
- **Decided:** 2026-10-12, from the manifests, the board comparator and the board inventory rather than from
  a preference about coverage.
- **Method:** the question is not "is a complete state set nicer" but "does anything compare a rendered arm
  against a board for this state". That is answerable, so it was answered.

## What consumes a board

`scripts/check-cross-arm-parity.mjs` renders each arm, screenshots it, and compares it against the
`step*.jpg` boards in `docs/design/archetypes/<archetype>/`. When that directory holds no `step*.jpg`, it
raises a `BOARDS_MISSING` finding saying "so nothing was compared against the reference design". That is
advisory by default and failing under `--strict`, and it is reported rather than hidden - the instrument is
honest about the hole. Boards are also gated independently: `check-archetype-frames` requires them unframed
and `check-board-captions` resolves each SHA-256 caption to a file, with six tests behind both.

So a board is required where a comparison needs a target, and nowhere else.

## Why Wave 2 does not need them

Wave 2 is nine boards across four archetypes: `catalogue`, `contact-lead`, `account-recovery` and
`event-registration`. Checked against all 139 family rows in `docs/train/briefs/manifest.jsonl` and
`docs/eval/briefs/manifest.jsonl`:

There are TWO sources for "does this archetype have a state that needs a board", and the first version of
this document only consulted one of them. That was the defect review found.

### Source 1: the functional contract (`plan.md`). This is the one that decides.

An archetype's own plan defines the states it must render. Three of Wave 2's four do, and two of those have no
board for the state they require:

| Archetype | state its contract requires | board today |
| --- | --- | --- |
| catalogue | "the empty state is first class: the target ships a whole page for it (`demo/empty.html`)" (plan.md:97) | `step3-empty.jpg` - present |
| contact-lead | "on a missing field the server refuses the submission and re-renders the form; nothing is stored" (plan.md:54) | none |
| account-recovery | "an empty or malformed address is refused by the field's own constraint before submission" (plan.md:114) | none |
| event-registration | capacity refusal and accessible validation feedback (plan.md, 8 state mentions) | none |

catalogue settles the argument against the first version of this document. It carries `step3-empty.jpg`, and
its plan says in the same sentence that the board DEPICTS the required empty page - so the board is a response
to a contract-required state, not the "supplied visual reference rather than a response to an assertion" that
the first version called it. The archetype with a board is the one that proves boards belong to contract states.

### Source 2: the manifests. A different question, and not a substitute.

| Archetype | family rows | asserts an empty state | asserts an error state (any wording) |
| --- | --- | --- | --- |
| catalogue | 0 | no | no |
| contact-lead | 0 | no | no |
| account-recovery | 0 | no | no |
| event-registration | 9 | no | yes - 20 assertions |

The manifests record what a FAMILY asserts; the contract records what the ARCHETYPE requires. They are not
interchangeable, and the first version of this table treated an absent manifest row as an absent state. That is
how it recorded account-recovery and contact-lead as needing nothing while their own plans require a refusal
state. event-registration's 20 error assertions (tr-07 capacity refusal, tr-30 accessible validation feedback,
fam-07 capacity caps, fam-r02 assistive-technology announcement) are the second source pointing the same way.

A second scope defect in the first version, worth keeping because it recurs: the error column was derived from
an HTTP-4xx test alone, so prose assertions - "triggers an error", "displays accessible error feedback" - were
invisible. An error state is not an HTTP status.
## The blocker that makes the previous recommendation wrong

`captureSignature` in `src/eval/render.mjs` navigates to `http://127.0.0.1:${port}/` and screenshots that page.
It captures ONE page, the homepage, for every archetype and every arm. So the comparator cannot compare an
empty state or an error state to anything, whatever boards exist: a board of a state the capture never reaches
has no counterpart on the rendered side.

That reverses the recommendation this document first made. Seven state-specific board tasks were filed on the
reasoning that a board is needed where a comparison needs a target. The comparison does not reach those targets
either, so the boards would be produced and never read. Boards are still worth having as visual planning
references - that is what catalogue's `step3-empty.jpg` is - but they are not the thing standing between the
corpus and state coverage. The capture paths are.

## What follows

1. The comparator's state coverage comes first, as its own task: `captureSignature` must be able to reach the
   states the assertions describe (a list after a filter returns nothing, a form after a refusal) before any
   board for those states can be compared against anything.
2. The earlier board tasks are re-scoped, not deleted: each now reads as a visual planning reference for a
   state its archetype asserts, explicitly not as a comparison target, and each depends on the capture work.
3. event-registration joins the list, because it does assert error states - twenty of them, including capacity
   refusal and accessible validation feedback - and the first version of this document wrongly recorded it as
   asserting none.

The decision is deliberately narrow: it does not claim the corpus needs uniform state coverage, and it does
not ask for artefacts that nothing can read.
