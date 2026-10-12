---
archetype: survey-form
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/survey-form/
register: docs/provenance/assets/training-reference-boards.md
---

# `survey-form` — functional contract

The behaviour of the `record-form` type as the `survey-form` archetype implements it. This document is the
archetype's contract: what a respondent is asked, how the answers are kept, what the submission produces, and
what happens to the answers afterwards.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan documents
are. It is **not** checked against a generated demo, because there is no generated demo for the five-step flow
and no evaluation spec for this archetype — see *Implementation status*. Nothing here should be read as
describing running software.

**Three families implement this archetype**, and they split on one question — whether the questionnaire is one
page or several:

| Family | Side | Subject | Questionnaire | Output |
|---|---|---|---|---|
| `tr-10` | train | Greenwood Safe Streets — residential street safety and crosswalk feedback | one page, multiple questions | an aggregate results view |
| `tr-23` | train | Civic Warm Homes Partnership — home energy retrofit subsidy eligibility | one page, sequential questions | a computed grant eligibility report |
| `fam-10` | eval | municipal public transport commuter satisfaction | **stepped**, with a review summary and server-persisted drafts | a submission receipt, and an admin view of responses |

## Use case

A respondent answers **more than one question about one subject** and hands the answers to an organisation that
will do something with them collectively. Three roles appear across the families: the **respondent** answering,
the **analyst** reading aggregates (`tr-10`'s results view, `fam-10`'s admin view), and — in `tr-23` — the
**calculator** itself, which computes an outcome from the answers rather than merely storing them.

That last point is what stops this archetype being a generic form. In `tr-23` the submission produces a
**qualifying grant list** computed from the declared construction era, heating fuel and insulation; in `tr-10`
the responses **aggregate into percentages** across recorded hazard categories. The answers are the input to
something, and the contract asserts that the something is right: `tr-10`'s second assertion tests the aggregate
view, and `tr-23`'s second tests that the report still shows the saved characteristics and the qualifying
grants after a reload.

**The archetype's own first prohibition is about the questions themselves**: "a question whose scale labels swap
meaning between rows". Both training families state it, which makes consistent scale direction part of the
contract rather than a design nicety — a survey whose second rating runs high-to-low while its first runs
low-to-high produces answers that cannot be compared, and `tr-10` carries several rating and radio groups.

**`TYPE-AXIS.md` names this archetype** on the `record-form` row with two families, the type the axis marks as
covered. Those two are the training side's families; the evaluation-side family is additional rather than a
third training subject. Because it is named, this contract's type is quoted rather than derived — unlike
`job-board` and `library-catalogue`, which the same row counts but does not name.

## Routes and effects

| Route | Kind | Families | Effect |
|---|---|---|---|
| `GET /` | page | all three | serves the survey's landing view and its route into the questionnaire |
| `GET /survey` | page | `tr-10`, `fam-10` | serves the questionnaire |
| `POST /survey` | write | `tr-10` | persists a response and redirects to its receipt |
| `GET /survey/complete/:id` | read-by-reference | `tr-10`, `fam-10` | reads the receipt back by its reference |
| `GET /results` | page | `tr-10` | serves the aggregate view across recorded responses |
| `GET /calculator` | page | `tr-23` | serves the eligibility questionnaire |
| `POST /calculator/submit` | write | `tr-23` | computes eligibility and redirects to the report |
| `GET /reports/:id` | read-by-reference | `tr-23` | reads the saved characteristics and qualifying grant list |
| `GET /survey/step/:step` | page | `fam-10` | serves one step of the stepped questionnaire, keeping drafts |
| `POST /survey/step/:step` | write | `fam-10` | saves a step's data to the session and advances |
| `GET /survey/summary` | page | `fam-10` | serves the review summary before submission |
| `POST /survey/submit` | write | `fam-10` | finalises the submission |
| `GET /admin/responses` | page | `fam-10` | serves the staff view of finalised responses |

**On the methods.** The manifests declare routes as paths and carry no `method` key; the methods above are named
by the families' own assertions. `tr-10` names `POST /survey` and `GET /results`; `tr-23` names
`POST /calculator/submit` and `GET /reports/:id`; `fam-10` names four, with **status codes** — a step save
returning HTTP 200 or a 303 redirect, a refreshed step returning HTTP 200 with earlier answers retained, a
missing-required submission returning HTTP 400 **or** rendering validation messages linked by `role="alert"` or
`aria-describedby`, and the admin view returning HTTP 200. `GET /survey/summary` and `GET /` rest on their kind
column alone.

## Data and state

- **Stored on the server**, per every family's `server_persistence`: `tr-10` stores completed responses that
  aggregate into results; `tr-23` stores the assessment answers and the generated recommendations; `fam-10`
  stores **in-progress draft answers that persist across step navigation and full browser refreshes** as well as
  finalised submissions.
- **Draft state is the distinguishing feature of the evaluation-side family.** It asserts that partially
  completed answers survive a reload at a step, which no training family does — so a survey that loses a
  partially answered questionnaire on refresh fails on the evaluation side even if it passes on the training
  side.
- **The questions**, per family:

  | Family | Fields |
  |---|---|
  | `tr-10` | `respondent` (text, required, echoed), `location` (text, required), `hazard` (select, required: Speeding near school crosswalk, Poor crossing visibility, Missing pedestrian signal, Pavement obstruction), `rating` (select, required: 1 - Low concern, 2 - Moderate concern, 3 - High concern, 4 - Severe danger), `proposals` (textarea, optional) |
  | `tr-23` | `applicant` (text, required), `email` (email, required), `address` (text, required, echoed), `era` (select, required: Pre-1930, 1930-1965, 1966-1990, Post-1990), `heating` (select, required: Mains gas boiler, Oil heating, Electric storage heaters, Heat pump), `insulation` (select, required: Solid uninsulated, Cavity uninsulated, Partial cavity, External solid insulation), `notes` (textarea, optional) |
  | `fam-10` | the brief's journeys name travel frequency and routes, service ratings and punctuality, then demographics and suggestions; the field slugs are the evaluation side's own and are not restated here |

- **The ordered scales must run one way.** `tr-10`'s rating is an explicit four-point severity scale from low
  concern to severe danger, and `tr-23`'s three selects are ordered categorisations — construction era in
  chronological order, heating fuel, and insulation from least to most effective. The archetype's rule is that
  a scale's labels keep their meaning and direction wherever they appear.
- **Computed output is state.** `tr-23`'s grant list is derived from the answers and must survive a reload;
  `tr-10`'s percentages are derived from all responses and must be asserted, not merely displayed.

## Journey

**`tr-10`, the street-safety survey.** It starts at `/`, files `form#street-safety-survey-form` with
`input[name=respondent]` `Jo Delgado`, `input[name=location]` `Oak Avenue at 2nd Street` and
`textarea[name=proposals]` `Install a raised zebra crossing and flashing beacon`, selecting
`select[name=hazard]` `Poor crossing visibility` and `select[name=rating]` `2 - Moderate concern`. It expects
`Jo Delgado` echoed back by what the submit returns, then again after a reload. Its search leg queries
`/search?q=Delgado`, reads `#search-results`, expects `Jo Delgado` among them and the decoy `zzz-decoy` absent.
Its update leg rewrites `respondent` to `Jo Delgado (updated)`. Its intake steps submit `/intake` having
selected `select[name=hazard]` `Poor crossing visibility`, and `/intake/confirm` expects `Poor crossing
visibility` back.

Its three stated journeys are: read the survey introduction and complete the **multi-question** street safety
questionnaire; provide the street location, select hazard categories, and submit; and view the confirmation
receipt and reload to ensure submission integrity.

**`tr-23`, the retrofit calculator.** It starts at `/`, files `form#eligibility-form` with
`input[name=applicant]` `Fiona Gallagher`, `input[name=email]` `fiona.gallagher@example.test`,
`input[name=address]` `42 Orchard Way, Lincoln` and `textarea[name=notes]` `Drafty bay windows on ground floor`,
selecting `select[name=era]` `1930-1965`, `select[name=heating]` `Heat pump` and `select[name=insulation]`
`Cavity uninsulated`. It expects `42 Orchard Way, Lincoln` echoed back and again after a reload. Its search leg
queries `/search?q=Orchard`, reads `#search-results`, expects the address and expects `zzz-decoy` absent. Its
update leg rewrites `address` to `42 Orchard Way, Lincoln (updated)`. Its intake steps submit `/intake` having
selected `select[name=era]` `1930-1965`, and `/intake/confirm` expects `1930-1965` back.

Its three journeys are: answer **sequential** questions about construction era, current boiler and loft
insulation; provide contact details and submit to compute eligible retrofit subsidies; and review the
customised grant eligibility report and reload to confirm the stored results.

**`fam-10`, the transit survey.** Quoted verbatim from `docs/eval/briefs/manifest.jsonl`:

1. "start the survey, fill step 1 (travel frequency and routes), proceed to step 2 (service ratings and
   punctuality), fill step 3 (demographics and suggestions), inspect review summary, submit, and receive a
   submission receipt ID"
2. "partially complete step 1 and step 2, reload the browser at /survey/step/2, and verify that previously
   entered responses in step 1 and step 2 are preserved from server-backed session state"
3. "attempt to advance to the next step with missing mandatory rating questions, verify inline accessible error
   validation highlights the invalid controls, correct them, and advance"

Mapped to the five planned boards: step 1 the introduction and the questionnaire's opening → `step1-intro`,
step 2 the questionnaire in full → `step2-questions`, step 3 validation with a refused submission →
`step3-validation`, step 4 the receipt and, on the evaluation side, the review summary and admin view →
`step4-receipt`, step 5 empty → `step5-empty`. On the evaluation side step 2 is genuinely a **stepped** flow and
the summary is a distinct board; on the training side it is one page, which the design document records as a
documented difference rather than an inconsistency.

## Validation and states

- **Required fields:** every family marks them. `tr-10` requires four of five, `tr-23` requires six of seven,
  and `fam-10` requires the rating questions of each step. The optional textarea in both training families is
  the only free-text field that may be left empty.
- **A refused submission names the field and is announced.** `tr-23`'s third assertion is that incomplete
  sections display **accessible warning messages and prevent submission**; `fam-10` requires
  `accessibility/accessible-error-announcement` and asserts messages linked by `role="alert"` or
  `aria-describedby`. `tr-10`'s third assertion requires that all rating scales and radio groups carry
  **programmatic labels** and support keyboard navigation.
- **Scales must not change meaning between rows.** This is the archetype's own first prohibition and it is a
  correctness rule, not a style one: answers to a scale whose direction varies cannot be compared or aggregated.
- **Validation timing is named on the evaluation side.** `fam-10` requires
  `forms/validate-input-after-interaction`, so validating only on submit, or before the respondent has had a
  chance to answer, is out of contract.
- **Declarative dialog and popover control is a named rule** on the evaluation side
  (`ui-behaviors/declarative-dialog-popover-control`) — unusual in this corpus, and worth keeping: any
  disclosure the survey uses is expected to use the platform's own control rather than a hand-rolled one.
- **Drafts must survive** on the evaluation side, across step navigation and a full browser refresh. A survey
  that holds answers only in the client loses the respondent's work, which the second journey asserts against.
- **Empty state:** a results or admin view with no responses renders an empty state naming that. Planned as
  `step5-empty`.

## Acceptance criteria

**`tr-10`:** (1) `POST /survey` persists response data and redirects to `/survey/complete/:id`. (2) `GET
/results` displays aggregate percentage responses across recorded hazard categories. (3) all rating scales and
radio groups have programmatic labels and keyboard navigation support.

**`tr-23`:** (1) `POST /calculator/submit` computes subsidy eligibility and redirects to `/reports/:id`. (2)
`GET /reports/:id` returns the saved property characteristics and qualifying grant list on reload. (3)
incomplete form sections display accessible warning messages and prevent submission.

**`fam-10`:** (1) `POST /survey/step/:step` saves step data to a server session and returns HTTP 200 or 303
redirect to next step. (2) `GET /survey/step/2` after full browser refresh returns HTTP 200 with step 1
responses retained in the active session. (3) submitting a step with missing required fields returns an HTTP 400
or renders validation messages with `role="alert"` or `aria-describedby` linkage. (4) `POST /survey/submit`
finalizes the submission and redirects to `/survey/complete/:id` where the receipt ID remains readable on
reload. (5) `GET /admin/responses` returns HTTP 200 showing aggregated or individual finalized survey records.

All eleven criteria are quoted verbatim from the two manifests.

## Implementation status

**Not implemented as a five-step flow.** Being precise about what does exist:

- **Two landing references exist, one per training family**:
  [`tr-10/reference.jpg`](../../training/tr-10/reference.jpg) — 1376 × 768, 560725 bytes, sha256 `9973cdf1…`,
  the street-safety survey — and [`tr-23/reference.jpg`](../../training/tr-23/reference.jpg) — 1376 × 768,
  582634 bytes, sha256 `bfc83830…`, the retrofit calculator. Each is pinned in the
  [training reference register](../../../provenance/assets/training-reference-boards.md) alongside its declared
  prompt. Each depicts **one page at one scroll position**, and neither is a picture of the five states above.
- **The two boards are different designs**, with different token prefixes (`ss-` and `wh-`), different palettes,
  and a different content frame from the other archetypes examined. A generator must not average them.
- **The evaluation-side family has no reference board here.** There is no `fam-10` board in
  `docs/design/training/`, and the evaluation side's assets are not this directory's to depict.
- **The five journey boards are planned, not generated.** `step1-intro`, `step2-questions`, `step3-validation`,
  `step4-receipt` and `step5-empty` exist in no ref, and this directory holds no committed board of its own.
- **The train-side pairs and targets do exist:** `docs/train/design/{tr-10,tr-23}/{plan,design}.md` and
  `docs/train/targets/{tr-10,tr-23}/index.html`.
- **What the engine offers is capability, not implementation.** The shared engine can render a list, a
  read-by-reference page and a write, and these families use those for the questionnaire and a receipt. No
  family in the corpus supports a **stepped** questionnaire with server-persisted drafts, an aggregate results
  view, or a computed report.
- **No evaluation spec:** there is no `docs/eval/specs/survey-form.json`. This contract is validated by section
  order and internal consistency, not against a spec.
- **The briefs:** four training rows (`tr-10-v1`, `tr-10-v2`, `tr-23-v1`, `tr-23-v2`) and three evaluation rows
  (`fam-10-v1` through `fam-10-v3`); each family's variants are the same contract in a different voice.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (families `tr-10`, `tr-23`) and
  `docs/eval/briefs/manifest.jsonl` (family `fam-10`). Route names, field slugs, control types, option lists,
  form selectors, fill values, select values, search legs, update legs, intake steps, stated journeys and all
  eleven acceptance criteria are quoted from those rows rather than invented; the evaluation-side journeys are
  quoted verbatim.
- **The two references** are the training families' generated boards, digest-pinned in
  `docs/provenance/assets/training-reference-boards.md`; the prompts that declared them are committed beside
  them. The five journey boards are planned and unpinned.
- **The axis position** is quoted from `docs/train/briefs/TYPE-AXIS.md`, where `survey-form` is named on the
  `record-form` row — the one type the axis marks as covered — with two families, both of them training-side.
