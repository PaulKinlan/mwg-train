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

| Archetype | asserts an empty state | asserts an error state (any wording) |
| --- | --- | --- |
| catalogue | no | no |
| contact-lead | no | no |
| account-recovery | no | no |
| event-registration | no | **yes - 20 assertions** |

**Correction, and it changes the argument.** The first version of this table tested for `HTTP 4xx/5xx` and
recorded event-registration as asserting no error state. That was wrong: the manifests assert errors in prose
without a status code. tr-07 asserts "attempting to book more tickets than remaining capacity triggers an
error"; tr-30 asserts the form "displays accessible error feedback if omitted"; fam-07 asserts capacity caps
are enforced; fam-r02 asserts "a validation error is announced to assistive technology". Twenty assertions
across four of its families. The scope of the probe was the defect - an error state is not the same thing as
an HTTP status, and a table asserting a universal has to be derived from the widest definition its sentence
implies.

So the honest position is narrower than the first version claimed. One of Wave 2's four archetypes does assert
error states, so an error-state board for event-registration is not vacuous. catalogue carries
`step3-empty.jpg` while asserting no empty state, which remains a supplied visual reference rather than a
response to an assertion.

## Where the gap actually is

An archetype that DOES assert such a state and has no `step*.jpg` has a comparison that cannot run. Eight
archetypes assert one or both, and seven of them have no board directory at all:

| Archetype | asserts empty | asserts 4xx/5xx | boards today |
| --- | --- | --- | --- |
| community-forum | no | yes | 0 |
| expense-tracker | no | yes | 0 |
| job-board | no | yes | 0 |
| library-catalogue | no | yes | 0 |
| restaurant-ordering | yes | yes | 0 |
| survey-form | no | yes | 0 |
| web-shop | yes | no | 0 |
| booking | yes | no | 5 (has boards) |

`restaurant-ordering` is the sharpest case: it asserts both an empty state and a 4xx refusal and has no
reference board for either, so its parity comparison reports `BOARDS_MISSING` for both.

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
