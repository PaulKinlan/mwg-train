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

| Archetype | asserts an empty state | asserts a 4xx/5xx error |
| --- | --- | --- |
| catalogue | no | no |
| contact-lead | no | no |
| account-recovery | no | no |
| event-registration | no | no |

None of the four asserts an empty state and none asserts a refusal. An empty-state or error-state board for
them would depict a state that no assertion in the corpus checks and that the comparator would therefore have
nothing to compare against. `catalogue` already carries `step3-empty.jpg`, and that is consistent with this:
the board is a supplied visual reference, not a response to an assertion.

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

## What follows

Seven generative board tasks, one per archetype, each asking for boards for the states that archetype
actually asserts - not a uniform empty/error/success triple. Filed as beads and referenced from this
document's log rather than listed here, because the beads are the ledger.

This is the decision the bead asked for, and it is narrow on purpose: it does not claim the corpus needs
uniform state coverage, and it does not ask for boards where nothing would read them.
