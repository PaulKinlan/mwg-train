---
archetype: survey-form
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/survey-form/
register: docs/provenance/assets/training-reference-boards.md
---

# `survey-form` — aesthetic system

The look of the `record-form` type as the `survey-form` archetype implements it, expanded from the two training
references into a full multi-step journey. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**Two systems, both light, and they differ in how the second chromatic token behaves.** The training families
are two different designs rather than two renders of one, and one detail among them is easy to get wrong:

| Family | Subject | Token prefix | Declared theme | Observed theme | Second chromatic token |
|---|---|---|---|---|---|
| `tr-10` | Greenwood Safe Streets — crosswalk and traffic survey | `ss-` | "in a light palette" | light | navy, used **structurally** — headings and the footer band |
| `tr-23` | Civic Warm Homes Partnership — retrofit subsidy calculator | `wh-` | "in a light palette" | light | blue, used **for the brand mark only** |

The evaluation-side family (`fam-10`, a municipal transit survey) has **no reference board** in
`docs/design/training/`; its journeys are prose in `docs/eval/briefs/manifest.jsonl`, and this document does not
invent a look for it.

**How the systems were established.** Each palette is **declared** by its family's generation prompt
(`docs/design/training/<family>/prompt.txt`), and every observed use below was read out of the committed
reference by an independent vision pass. That discipline is load-bearing in this corridor: the two boards
declare **two chromatic tokens each** while their own rules say the accent is the only chromatic colour, so
which token does what cannot be inferred from the palette list in either case.

## Visual thesis

A survey's job is to get an answer out of someone who has no obligation to give one. Both boards take that
seriously in the same way: they lead with **reasons to answer** before showing any questions. The crosswalk
survey puts three neighbours' testimonials above the form and states a deadline at the top of the hero. The
retrofit calculator opens with a named benefit — "Check your eligibility for home energy retrofit grants & heat
pump subsidies" — and a promise of what the respondent gets out of it, with two testimonials quoting a saving.

Then they diverge with their subjects. `tr-10` is a **civic consultation**: navy headings, a dark footer band,
a photograph of the street in question, and a single card of questions headed "Submit Your Feedback" with an
assurance that responses are stored on the server to prevent duplicates. It reads as a notice from an
association, which is what it is. `tr-23` is a **service that computes something for you**: warm cream ground,
peach borders, a house-with-heat-pump photograph, and a submit button that names the outcome — "Calculate My
Grants & Subsidies". It reads as an offer rather than a request.

## Grammar and layout

- Declared structural constants for both families: `--content-frame: 1100px`, `--page-padding: 1.5rem`,
  `--control-radius: 8px`, and `--control-border: 1px solid var(--*-border)`. Note the frame is **narrower** than
  the 1200px used by several other archetypes, which suits a single-column questionnaire.
- Both declare the same page structure: a brand header, a navigation bar, a main content area, one content
  section, the working form, and a footer.
- **Both references render that as two columns in the hero and a single form card below it.** The left column
  carries the headline, the supporting copy and the testimonials; the right carries an editorial photograph of
  the subject. The form is a single full-width card.
- **The questionnaire is one page on both boards.** Confirmatory detail: `tr-10`'s nine fields and the hazard
  and rating groups are all visible at once in one card, and `tr-23`'s seven controls likewise sit in a single
  card headed "Start Your Eligibility Check". **Neither board is stepped**, even though `tr-23`'s brief speaks
  of answering questions "sequentially". The genuinely stepped flow in this archetype exists only on the
  evaluation side, where the brief declares `/survey/step/:step`, a review summary, and drafts that survive a
  reload.
- **Both boards are bounded inside the viewport**, centred, with the footer fully visible and nothing cut off.
  This is the fourth and fifth board in this lane's reading to resolve the prompts' contradictory crop
  instruction that way — and the reason the claim must stay scoped: `tr-16`, examined on the previous bead, is a
  counterexample whose grid bleeds off the bottom left while its footer stays visible.
- **Step 2 is where the multi-step flow earns its name.** Neither board depicts a validation state, and the
  evaluation side asserts one about each step; `step2-questions` and `step3-validation` give the questionnaire
  and its refusal their own screens.
- **Step 4 is the outcome**, and **neither training board depicts any outcome at all** — no receipt, no
  aggregate results view, no computed grant report. The briefs assert all three. So the outcome states are
  designed from the briefs rather than from a board, which is the single largest gap in this archetype's
  references.
- **The empty state** (`step5-empty`) is a results or admin view with no responses, naming that.

## Typography

- A system UI sans-serif stack, as declared by both families.
- **Exactly one `h1` on each board**, and the two take different approaches worth recording. `tr-10` states the
  subject: "Community Crosswalk & Traffic Survey". `tr-23` states the **benefit to the reader**: "Check your
  eligibility for home energy retrofit grants & heat pump subsidies". Both keep the brand in the header.
- `tr-10` shows three tiers — the `h1`, the form card's `h2` ("Submit Your Feedback"), and small-caps section
  labels such as "What Neighbors Are Saying". `tr-23` shows two clearly, the `h1` and the card's `h2` ("Start
  Your Eligibility Check").
- **Question labels are the strongest text inside the form on both boards**, set in a semibold weight, with
  placeholders in the muted colour beneath them. That matters for this archetype because the label is the
  question: a survey whose labels are quiet has quiet questions.

## Token usage

All values are declared; every observed use was read out of the committed bytes.

**`tr-10`, Greenwood Safe Streets.**

| Token | Value | Observed use |
| --- | --- | --- |
| `ss-amber` | `#d97706` | The single accent and **the primary action**: the submit button's fill, and the testimonial stars |
| `ss-navy` | `#1e3a8a` | **Structural** rather than an accent: the brand title, the page `h1`, the form card's `h2`, the active navigation underline, and the full-width footer band |
| `ss-card` | `#ffffff` | Card and input grounds |
| `ss-bg` | `#f8fafc` | The page ground |
| `ss-border` | `#cbd5e1` | Field, card and testimonial hairlines |
| `ss-text` | `#0f172a` | Headings, labels and body copy |
| `ss-muted` | `#64748b` | Subtitles, placeholders and footer text |

**`tr-23`, Civic Warm Homes Partnership.**

| Token | Value | Observed use |
| --- | --- | --- |
| `wh-orange` | `#c2410c` | The single accent and **the primary action**: the submit button's fill, the logo's roof, and the active navigation underline |
| `wh-blue` | `#0369a1` | The **brand mark only**: the logo's body and the wordmark text. It appears on no control |
| `wh-card` | `#ffffff` | The form card's ground |
| `wh-bg` | `#fffbeb` | The page ground — a warm cream rather than a cool grey, which is what gives the page its character |
| `wh-border` | `#fed7aa` | The card's and fields' borders — a pale peach rather than a neutral grey, so the border carries the accent's hue at low intensity |
| `wh-text` | `#1c1917` | The `h1`, the card's `h2`, labels and body copy |
| `wh-muted` | `#78716c` | The partnership subtitle and placeholders |

**The two-chromatic question, answered by observation, and the two boards answer it differently.** On `tr-23`
the second token is **brand identity and nothing else** — blue appears in the logo mark and the wordmark and on
no control — so orange unambiguously carries the single primary action. On `tr-10` the second token is
**structural**: navy is not a brand tint but the dark anchor of the page, carrying the headings, the active
navigation indicator and the whole footer band. It never fills a button, so it does not compete for the
primary action; but a generator should understand that navy is load-bearing chrome rather than decoration, and
that recolouring it would restyle the page rather than tint a logo.

**One distinction worth keeping between the boards.** `tr-23`'s border token is a pale peach, so the accent's
hue appears at low intensity in every field's outline as well as in the button. `tr-10`'s border is a neutral
grey-blue and does not. Both are declared, so both are correct for their family — but they are not
interchangeable treatment of "the accent".

## Spacing rhythm

- The declared constants are shared: an eleven-hundred-pixel frame at this archetype, page padding, an
  eight-pixel control radius, and a one-pixel border in each family's own border token.
- The form is a **single card** on both boards, with its controls laid out on an internal grid — `tr-10` uses a
  two-column arrangement for its fields, and `tr-23` groups applicant details, property details and the
  property selects. Field-level feedback must appear without displacing the controls beneath it, since both
  families assert accessible error messaging.
- Both boards place the testimonials above the form, which is the layout expression of the thesis: the
  reassurance comes before the ask.
- `tr-10` repeats its accent in the stars above the form and the button below it, which frames the questions
  between two instances of the same colour. `tr-23`'s stars are set in the text colour rather than the accent,
  so its orange appears only in the button, the logo and the nav indicator — a quieter relationship between
  accent and emphasis.

## Component hierarchy

1. **Brand header** — the mark, the organisation's name, any partnership line, and the section navigation.
2. **Hero** — the `h1`, its supporting paragraph, a deadline or date stamp, and an editorial photograph.
3. **Attribution row** — neighbour testimonials or grant-scheme testimonials with portraits and ratings, placed
   **above** the form.
4. **Questionnaire card** — the section heading and the labelled questions.
5. **Question controls** — the text fields, the ordered selects, the rating group, and any free-text area.
6. **Validation feedback** — planned as `step3-validation`: per-field messages that name the field, announced
   accessibly, and a refused submission.
7. **Receipt** — planned as `step4-receipt`: the reference the submission is read back by.
8. **Outcome views** — planned as `step4-receipt` and absent from both boards: the aggregate results view
   (`tr-10`), the computed grant report (`tr-23`), the review summary and admin view (the evaluation side).
9. **Footer** — the organisation, contact details, and on `tr-23` a next-review date.
10. **State panels** — the empty results state and any refusal feedback.

## Anti-patterns

- **A question whose scale labels swap meaning between rows.** The prompt names this first in both families, and
  it is this archetype's own rule: a scale's labels must keep their meaning and their direction wherever they
  appear, or the answers cannot be compared or aggregated. On the boards the rule is not violated — `tr-10`
  carries a single five-point severity scale running from "1 (Very Safe)" to "5 (Extremely Dangerous)", and
  `tr-23` carries no ordered scale at all.
- A second accent colour competing with the primary action. Neither board violates it: on `tr-23` the second
  token is brand-only, on `tr-10` it is structural chrome and never a button fill.
- Placeholder text standing in for a visible label. Both boards label every control.
- A modal or step wizard hiding part of the form.
- Colour alone carrying an error state with no message naming the field.
- A survey that loses a partially completed questionnaire on reload. The evaluation side asserts against
  exactly that, so client-only answer state is a defect even where the training families would not catch it.

### Raster defects and divergences recorded so a generator does not copy them

These are properties of the committed boards, not of the archetype. Two of them matter more than the rest
because copying the board would produce **wrong controls**, not merely a different look.

- **`tr-10`'s controls disagree with its brief's fields.** The brief declares `hazard` as a **select** with four
  options and `rating` as a **four-point select**. The board renders hazard as a **five-option checkbox group**
  ("Speeding / Reckless Driving", "High Traffic Volume", "Lack of Marked Crosswalks", "Inadequate Signage",
  "Poor Pedestrian Visibility") and severity as a **five-point radio group** from "1 (Very Safe)" to "5
  (Extremely Dangerous)". The brief's `location` is a **text input**; the board renders a **select**. A
  generator following the board would implement three controls that do not match the contract.
- **`tr-23`'s select options disagree with its brief's wording.** The board shows "1950–1966 (Mid-century)",
  "Mains Gas" and "Uninsulated solid walls" where the brief declares "1930-1965", "Mains gas boiler" and "Solid
  uninsulated". The option *lists* are closed on the board, so only the defaults are visible and the full
  taxonomy cannot be checked from the image.
- **Neither board depicts an outcome.** No receipt, no aggregate results view, no computed report, and no
  validation state appears anywhere on either board; both are captured unsubmitted, with `tr-10` pristine and
  `tr-23` showing default selections in its three selects.
- **`tr-23` truncates a placeholder**, rendering "e.g. 12 Orchard Lane, Westshi" where "Westshire" was
  intended.
- **Both boards' stars are set differently**: `tr-10` in its accent amber, `tr-23` in the text colour. Neither
  is a defect, but they are not the same treatment.

Dates on both boards do check out: `tr-10`'s deadline reads Sunday, November 15, 2026 and that is a Sunday;
`tr-23`'s stamp reads Sunday 11 October 2026 and its next-review date Monday 19 October 2026, and both fall on
the stated weekdays.

## Rationale

Both subjects need a respondent to volunteer time, and both designs spend their first screen earning it — the
crosswalk survey with neighbours' complaints and a deadline, the retrofit calculator with a named saving and a
promise of free advice. That is the archetype's central design problem, and the two boards solve it the same
way while looking quite different.

The differences follow from what each organisation is. A neighbourhood association has authority it wants to
look calm and civic, so navy chrome and a dark footer band suit it, and the accent is reserved for the one
action it wants taken. A grant partnership is offering a calculation, so its ground is warm, its borders carry
a wash of the accent, and its button names the result rather than the act of submitting. Both keep the second
chromatic token away from any competing action — one by making it brand-only, the other by making it chrome.

## Provenance

- **The declarations:** `docs/design/training/tr-10/prompt.txt` and `docs/design/training/tr-23/prompt.txt`,
  which name each palette, the structural constants, the page structure, the control labels and the prohibited
  patterns.
- **The depictions:** `docs/design/training/tr-10/reference.jpg` (1376 × 768, 560725 bytes, sha256
  `9973cdf1…`) and `docs/design/training/tr-23/reference.jpg` (1376 × 768, 582634 bytes, sha256 `bfc83830…`).
  Every token's observed use, both layouts, the single-page questionnaire on both, the absence of any outcome
  state, the control and option divergences from the briefs, and the defects listed above were read out of
  those bytes by independent vision passes. Both files and both prompts are pinned in
  [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl` (families `tr-10`, `tr-23`),
  `docs/eval/briefs/manifest.jsonl` (family `fam-10`), and the train-side pairs `docs/train/design/tr-10/` and
  `docs/train/design/tr-23/`.
- **Not depicted at all:** a receipt, an aggregate results view, a computed grant report, a validation state, a
  stepped questionnaire, or an empty state. The five journey boards in `plan.md` are planned and ungenerated, so
  this document is the declared system they will be generated against.
