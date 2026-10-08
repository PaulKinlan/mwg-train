# Held-out brief schema and authoring protocol

The evaluation briefs are **authored before any training run** and are the sealed test material.
This file is the contract: `docs/eval/briefs/manifest.jsonl` is the machine-readable source of
truth, and `scripts/validate-briefs.mjs` enforces every rule below. A brief that the validator
rejects is not part of the evaluation.

## Why JSONL and not prose files

A brief has a prompt *and* a functional oracle *and* a rule bundle *and* a family it belongs to, and
the protocol's central rules (whole families in one split, variants sharing a property set, rules
that exist in the pinned guidance snapshot) are all cross-row or cross-file invariants. Keeping
them in one parsed file means those rules are checked by code rather than by a reviewer's eye, and
`family_id` cannot drift from the file it was written in.

## The row

One JSON object per line. Unknown fields are rejected, so a typo fails loudly.

| field | type | meaning |
| --- | --- | --- |
| `brief_id` | string | unique, `^[a-z0-9][a-z0-9-]{2,63}$` |
| `family_id` | string | the cluster; **the unit of the train/dev/test split** |
| `variant_of` | string \| null | the canonical row (`…-v1`) for a variant; `null` for `-v1` |
| `split` | `dev` \| `test` | `dev` is for tuning prompt wording and judge thresholds; `test` is sealed |
| `stratum` | `A_familiar` \| `B_heldout_combination` \| `C_out_of_family` \| `R_repair` | see the preregistration |
| `task` | `generate` \| `repair` | a repair row also carries `seeded_defects` |
| `archetype` | string | from the archetype vocabulary below |
| `topic` | string | short free text, the business/topic setting |
| `locale` | string | e.g. `en-GB`; within a family this is fixed |
| `framework` | `none` \| `react` \| `svelte` \| `vue` \| `lit` \| `vanilla-ts` | the scaffold |
| `prompt` | string | the exact text handed to the model, verbatim |
| `routes` | string[] | URL paths the build must expose, e.g. `["/", "/bookings", "/bookings/:id"]` |
| `journeys` | string[] | user journeys that must work end to end |
| `server_persistence` | string[] | what must survive a reload or be stored server-side |
| `assertions` | string[] | machine-checkable statements; this is the functional oracle |
| `applicable_rules` | string[] | MWG rule ids that apply, from `docs/eval/rules.json` |
| `required_rules` | string[] | subset of `applicable_rules` that must be demonstrably applied |
| `non_goals` | string[] | what the brief explicitly does not ask for |
| `seeded_defects` | string[] | repair rows only: the defects planted in the given site |

## The invariants the validator enforces

1. **Whole families in one split.** Every row whose `family_id` is X has the same `split`. A family
   that trains and tests would measure recall of that family's phrasing, not the rule.
2. **Property-set invariance within a family.** These fields must be *identical* across all variants
   of a family: `archetype`, `topic` (the business setting), `locale`, `framework`, `task`,
   `routes`, `journeys`, `server_persistence`, `assertions`, `applicable_rules`, `required_rules`,
   `non_goals`, and `seeded_defects`. Only `prompt`, `brief_id` and `variant_of` may differ.
   This is the definition of "the same output": a paraphrase may legitimately change copy, layout
   and aesthetics, and it may **not** change the archetype, the routes, the journeys, the
   server-side behaviour, the applicable rule set or which rules are required.
3. **Variants are evaluation items, never training items.** Families in this manifest are held out
   in full; the corpus manifest carries its own `family_id`s and no `family_id` may appear in both.
4. **Rules exist in the pinned snapshot.** Every id in `applicable_rules`/`required_rules` is
   `category/guide` as listed in `docs/eval/rules.json`, and `required_rules ⊆ applicable_rules`.
5. **Cardinality.** In-family families have at least two variants (the invariance test needs them).
   `C_out_of_family` and `R_repair` families may be single-variant.
6. **Prompts differ.** Variants of one family must not share a prompt, and two families must not
   share a prompt either; near-duplicate prompts inside a family are only acceptable if they are
   *rephrasings of the same request*, which is the point of the variant.
7. **Repair rows** must carry at least one `seeded_defect`; generation rows must not carry any.

## Archetype vocabulary

One per in-family family: `booking`, `web-shop`, `blog-cms`, `dashboard`, `onboarding-auth`,
`directory-listing`, `event-registration`, `support-helpdesk`, `course-enrolment`, `survey-form`,
`restaurant-ordering`, `job-board`, `docs-site`, `community-forum`, `expense-tracker`,
`library-catalogue`.

`C_out_of_family` rows may use a novel archetype name of their own, and `R_repair` rows reuse the
archetype of the site they repair.

## Strata

- **`A_familiar`** — familiar archetype, familiar rules, unfamiliar business/topic and phrasing.
- **`B_heldout_combination`** — a *combination* the corpus never contained: e.g. an accessible
  multi-step form with server-side rendering and session handling, where training had forms and SSR
  separately. This is the stratum that tests composition rather than recall.
- **`C_out_of_family`** — novel briefs and already-modern sites; measures regression and
  over-application (a brief whose site is already modern must not be "fixed" into something worse).
- **`R_repair`** — the same defect must be fixed however the request is phrased. This rides a
  separate adapter and is a secondary endpoint, not part of the primary one.

## Authoring rules for a brief

- Write the prompt as a client would: outcome, constraints, content, audience. Do not name the MWG
  rules, the guide ids or the checks in the prompt text - the rule bundle is the oracle, not a hint.
- The functional task must be observable through the browser and the server: a journey that writes
  state must reload and still see it. Prefer behaviour over appearance.
- `assertions` must be checkable without judgement: name the DOM, the request, the stored value or
  the status code. "Looks good" is not an assertion.
- Keep 2-4 `required_rules` per row. A row requiring twelve rules measures nothing about any of
  them, and a row requiring none cannot distinguish a model that applied guidance from one that did
  not.
- Do not copy text, copy, branding or assets from any real site.
- `C_out_of_family` rows must include at least five *already-modern* briefs labelled in `non_goals`
  with `already-modern: no uplift required`.

## Example row

```json
{"brief_id":"fam-01-v1","family_id":"fam-01","variant_of":null,"split":"dev","stratum":"A_familiar","task":"generate","archetype":"booking","topic":"veterinary clinic appointments","locale":"en-GB","framework":"none","prompt":"Build a small booking site for a veterinary clinic. Owners pick a service, choose a slot from the clinic's availability, and confirm with their name, email and pet's name. The confirmation must be stored on the server, and reloading the confirmation page must show the same booking. Staff can view today's bookings. Validate the details before confirming and make the form easy to complete with a keyboard.","routes":["/","/book","/booking/:id","/staff"],"journeys":["choose a service, pick a slot, submit details, see a confirmation with a reference","reload the confirmation URL and see the same booking","submit an invalid email and see the error next to the field, then correct it and succeed"],"server_persistence":["the booking exists after a reload and is listed under /staff"],"assertions":["POST /book creates a booking and redirects to /booking/:id","GET /booking/:id after a reload shows the same reference and details","an invalid email produces an inline error and no booking is created","every input has a programmatically associated label"],"applicable_rules":["forms/autofill-address-form","accessibility/accessibility","ui-atoms/position-aware-tooltips","css/atrule-support-conditionals"],"required_rules":["forms/autofill-address-form","accessibility/accessibility"],"non_goals":["no payment","no accounts for clients"],"seeded_defects":[]}
```
