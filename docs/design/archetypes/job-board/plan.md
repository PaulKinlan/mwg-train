---
archetype: job-board
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/job-board/
register: docs/provenance/assets/training-reference-boards.md
---

# `job-board` — functional contract

The behaviour of the `record-form` type as the `job-board` archetype implements it. This document is the
archetype's contract: what a candidate can find, what they can submit, what the server does about it, and what
a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan documents
are. It is **not** checked against a generated demo, because there is no generated demo for the five-step flow
and no evaluation spec for this archetype — see *Implementation status*. Nothing here should be read as
describing running software.

One training family implements this archetype: **`tr-12`, CleanTech Trades Network** — heat pump and solar
installer apprenticeships, serving local trades employers and the people applying to them.

## Use case

A vacancy board for skilled trades, where the thing being listed carries terms that matter — a location, a
trade, a level, and an employer who is accountable for them — and the thing being submitted is a candidate's
application, which the applicant must be able to read back afterwards.

A **candidate** arrives with no account, filters the board to the trade they want, opens one vacancy, reads
its terms, and applies through a form attached to that vacancy. The application is stored on the server and
they land on a receipt addressed by its own reference, which still shows their details when they reload it.
An **employer** is the party the listing belongs to, and the listing is not useful without them: this is why
the archetype's first prohibition is "a posting with no stated location or terms".

This is the same behavioural type as `booking`, `event-registration` and the other `record-form` archetypes,
and differs from them in subject rather than in shape: a list page, a read-by-reference detail view, a write
that produces one record, and a receipt addressed by reference. `TYPE-AXIS.md` names exactly that pattern for
this type and warns against treating a subject change as a type change, which is why this archetype is filed
under `record-form` rather than as a type of its own. The axis row enumerates its larger groups by name and
counts the remainder as "1 each of 6 more" against all thirty families, and this archetype's single family is
one of those six — it is counted, not named.

What distinguishes it from `booking` and `event-registration` in practice is the **filter**, not the form. A
vacancy board is a list that has to be narrowed before it can be used, and the archetype's assertions test the
filter (`/jobs?trade=heat-pumps`) rather than only the write. The subject carries a taxonomy — trade, level —
that the detail view and the application both have to respect.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | serves the network's landing view and its entry points into the board |
| `GET /jobs` | page | serves the vacancy list, filterable (the archetype's assertion filters it by `trade`) |
| `GET /jobs/:id` | read-by-reference | serves one vacancy: its location, trade, level and terms |
| `POST /jobs/:id/apply` | write | stores one application against that vacancy |
| `GET /applications/:id` | read-by-reference | reads the submitted application back by its own reference |

**On the methods.** The manifest declares routes as paths and carries no `method` key, so the methods above
are only as firm as their source: `POST /jobs/:id/apply` and `GET /applications/:id` are named by this
family's second and third assertions, and `GET /jobs` appears with its query string in its first. Every other
route's method is a reading of its kind column rather than something the row states — `GET /` and
`GET /jobs/:id` rest on that reading alone, and `/jobs/:id` in particular is the one method in this table with
neither an assertion nor a page kind behind it.

## Data and state

- **Stored on the server**, per the row's `server_persistence`: the job vacancy listings and the submitted
  candidate applications.
- **The listing** carries the terms a candidate decides on: a trade, an apprenticeship level, and the
  employer the vacancy belongs to. The filter's values come from the row — `trade` is one of Heat Pump
  Technician, Solar PV Installer or Renewable Energy Specialist, and `experience` is one of Level 2 Trainee,
  Level 3 Apprentice or Adult Career Changer.
- **The application** carries `applicant` (a full name, echoed back and the reference the receipt reads by),
  `email` (an email input), `phone` (a telephone input), `trade` and `experience` (the two selects), and
  `qualifications` (a textarea holding the candidate's introduction). All are required.
- **Write route:** `POST /jobs/:id/apply` stores one application against its vacancy, and the assertion says
  it **redirects** to the receipt — so the reference is produced by the write rather than the candidate
  constructing one.
- **Read route:** `GET /applications/:id` reads the application back by that reference, which is what makes a
  refresh the test of server persistence rather than of client state.

## Journey

The declared journey:

- it starts at `/`;
- it narrows the board to a trade and opens one vacancy at `/jobs/:id`;
- it submits `form#apprenticeship-application-form` with fills — `input[name=applicant]` `Taylor Brooks`,
  `input[name=email]` `taylor.brooks@example.test`, `input[name=phone]` `+44 7700 900543` and
  `textarea[name=qualifications]` `Level 2 plumbing diploma with hands-on electrical basics` — and selects
  `select[name=trade]` `Solar PV Installer` and `select[name=experience]` `Level 3 Apprentice`;
- and it expects to find `Taylor Brooks` echoed back by what the submit returns, then again after a reload,
  which is what proves the application was stored rather than rendered once.
- Its search leg queries `/search?q=Taylor`, reads results from `#search-results`, expects `Taylor Brooks`
  among them and the decoy `zzz-decoy` absent — the decoy being what stops the assertion passing on an empty
  result list.
- Its update leg rewrites `applicant` to `Taylor Brooks (updated)`, which is the journey's proof that a
  submitted value can be amended rather than only appended.
- The row's `journey.steps` add the two intake legs: `/intake` submits the form having selected
  `select[name=trade]` `Solar PV Installer`, and `/intake/confirm` expects to read `Solar PV Installer` back.

Mapped to the five planned boards: step 1 board → `step1-listings`, step 2 vacancy → `step2-vacancy`,
step 3 application form → `step3-apply`, step 4 the filtered board → `step4-filtered`, step 5 empty →
`step5-empty`.

## Validation and states

- **Required fields:** all six — `applicant`, `email`, `phone`, `trade`, `experience` and `qualifications`.
- **On a missing required field:** the server refuses the submission and re-renders the form with feedback
  naming the field. The family carries `forms/required-field-feedback` among its applicable rules, so this is
  an assertion about the target rather than a nicety.
- **Accessibility:** the family requires `accessibility/accessibility` and, among its applicable rules,
  `ui-atoms/responsive-table` — a vacancy list is a table of terms, and it has to stay usable when narrowed.
- **A listing without terms is a defect, not a style choice.** The prompt's own first prohibition is "a
  posting with no stated location or terms", so a vacancy rendering without the location, trade or level it
  was listed with is a correctness failure rather than a visual one.
- **Empty state:** a filter or search with no match renders an empty state naming what did not match.
  Planned as `step5-empty`.

## Acceptance criteria

1. `GET /jobs?trade=heat-pumps` returns only heat pump apprenticeship listings.
2. `POST /jobs/:id/apply` saves the applicant's submission and redirects to `/applications/:id`.
3. `GET /applications/:id` returns the submitted application details upon page refresh.

Criteria 1–3 are the family's own assertions, quoted from `docs/train/briefs/manifest.jsonl`.

## Implementation status

**Not implemented as a five-step flow.** Being precise about what does exist, because "tr-12 already exists"
is exactly the half-truth this axis was written to stop:

- **The landing reference does exist.** The family's single reference board is
  [`docs/design/training/tr-12/reference.jpg`](../../training/tr-12/reference.jpg) — 1376 × 768, 633801 bytes,
  sha256 `ab796689…` — pinned in the
  [training reference register](../../../provenance/assets/training-reference-boards.md) alongside its
  declared prompt, [`prompt.txt`](../../training/tr-12/prompt.txt) (sha256 `033175a6…`). It depicts a
  **landing page at one scroll position**: the board and its filters, one vacancy read in full, and the
  application form, all on one screen. It demonstrates no behaviour whatsoever, and it is not a picture of the
  five states above.
- **The five journey boards are planned, not generated.** `step1-listings`, `step2-vacancy`, `step3-apply`,
  `step4-filtered` and `step5-empty` exist in no ref, and this directory holds no committed board of its own.
- **The train-side pair and target do exist:** `docs/train/design/tr-12/{plan,design}.md` and
  `docs/train/targets/tr-12/index.html`. They describe the single-step target bound to the canonical brief
  row, which is a different artefact from this archetype contract.
- **What the engine offers is capability, not implementation.** The shared engine can render a list, a
  read-by-reference page and a write, and this family uses those for listings and a receipt. No family in the
  corpus supports a query-filtered list whose results are asserted, or an application that carries the terms
  of the vacancy it was made against.
- **No evaluation spec:** there is no `docs/eval/specs/job-board.json`; that directory is the sealed A6
  evaluation set. This contract is validated by section order and internal consistency, not against a spec.
- **The brief:** two rows, `tr-12-v1` and `tr-12-v2`, which the train-side pair describes as the same contract
  in a different voice.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl`, family `tr-12`. Route names, field
  slugs, control types, option lists, the form selector, fill values, select values, the search leg, the
  update leg, the intake steps and all three acceptance criteria are quoted from that row rather than
  invented.
- **The reference** is the family's generated board, digest-pinned in
  `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it.
  The five journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`: this archetype is counted among the
  `record-form` families, the one type the axis marks as covered, and is one of the six the row counts rather
  than names.
