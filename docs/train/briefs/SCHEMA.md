# Training Brief Schema and Authoring Protocol

The training briefs (`docs/train/briefs/manifest.jsonl`) specify the synthetic project requirements used to train student models.

**What the briefs drive, and what they do not.** Each corpus project's form controls come from its own brief's `fields`, and the journey the harness drives is that brief's `journey` - authored from the brief's `topic`, `prompt`, `journeys` and `assertions`. All 30 families declare theirs (`npm run check:brief-schema -- --expect-all`), and every project records `schema_source: "brief"`. The `archetype` still supplies the server shape - how a record is stored and read back - so the archetype decides the plumbing, not the form. Declaring a schema is NOT the same as implementing the brief: the journey fills and chooses within ONE page, so it never spans two pages and never updates an existing record, and `tr-05` cannot declare every route its brief lists because the shared builder has no login route to declare. See `docs/train/corpus/README.md` for what that does and does not establish.

> **Deliberately NOT the sealed evaluation schema:**
> This schema is deliberately distinct from the held-out evaluation schema in `docs/eval/briefs/SCHEMA.md`.
> - **Different split vocabulary:** Every training row declares `split: "train"` and `stratum: "corpus"`, whereas the eval schema permits only `split in ["dev", "test"]` and strata `["A_familiar", "B_heldout_combination", "C_out_of_family", "R_repair"]`.
> - **Different purpose:** This manifest is the *input* for model training and corpus project generation; the evaluation manifest is the *sealed benchmark* held out for final model scoring.
> - **Different file:** Training rows live in `docs/train/briefs/manifest.jsonl`; eval rows live in `docs/eval/briefs/manifest.jsonl`.

## The Row

One JSON object per line in JSONL format.

| Field | Type | Description |
| --- | --- | --- |
| `brief_id` | string | Unique brief identifier matching `^[a-z0-9][a-z0-9-]{2,63}$`, e.g. `tr-07-v1`. |
| `family_id` | string | The prompt family in the `tr-` namespace (`tr-01` .. `tr-30`). **The split unit.** |
| `variant_of` | string \| null | Points to the family's canonical brief (`tr-XX-v1`) for variants; `null` for `-v1`. |
| `split` | `"train"` | Fixed to `"train"`. |
| `stratum` | `"corpus"` | Fixed to `"corpus"`. |
| `task` | `"generate"` \| `"repair"` | Task type. Repair rows require non-empty `seeded_defects`. |
| `archetype` | string | Product archetype (e.g. `booking`, `web-shop`, `dashboard`, `onboarding-auth`, etc.). |
| `topic` | string | Concise description of the small-business or community setting. |
| `locale` | string | Language/locale setting, e.g. `en-GB`, `en-US`. Fixed within family. |
| `framework` | enum | Scaffold framework: `none`, `react`, `svelte`, `vue`, `lit`, or `vanilla-ts`. |
| `prompt` | string | Natural-language customer request (1–3 sentences, min 80 characters). |
| `routes` | string[] | Array of route paths the project must expose (min 1). |
| `journeys` | string[] | User journeys that must function end-to-end (min 2). |
| `server_persistence` | string[] | Data/state that must persist across reloads or on the server (min 1). |
| `assertions` | string[] | Machine-verifiable functional oracle assertions (min 2). |
| `applicable_rules` | string[] | Valid Modern Web Guidance rule IDs from `docs/eval/rules.json` (min 1). |
| `required_rules` | string[] | Required rule subset from `applicable_rules` (2 to 4 entries). |
| `non_goals` | string[] | Explicitly out-of-scope capabilities. |
| `seeded_defects` | string[] | Planted defects to repair; empty array `[]` for `generate`, non-empty for `repair`. |
| `fields` | object[] | The form controls the brief's flow needs, authored from its own `topic`, `prompt`, `journeys` and `assertions`. Optional: a family without one is scaffolded from its archetype's form instead. |
| `journey` | object | The journey the harness drives through that form. Optional, and required in practice whenever `fields` is present. |

### `fields` and `journey`

A family that declares `fields` and `journey` gets a project built from ITS brief, rather than
wearing an archetype's form under a different title. Without them a generated project is an
archetype template: the fields and journey belong to the archetype (`booking`, `web-shop`, ...), so
a coffee-subscription brief would render whatever form that archetype happens to have.

| `fields[]` | Type | Description |
| --- | --- | --- |
| `slug` | string | Identifier; normally the same as `name`. |
| `name` | string | The control's `name` attribute. Unique within the form. |
| `type` | enum | One of `text`, `tel`, `email`, `date`, `time`, `number`, `select`, `search`, `textarea`. |
| `label` | string | Human-readable label. |
| `required` | boolean | Must be stated explicitly, never implied by absence. |
| `autocomplete` | string \| null | Optional autofill token (`name`, `tel`, `email`, `street-address`, ...). |
| `options` | string[] | Required for a `select` (at least two); refused on any other type. |
| `echoed` | boolean | Optional. On exactly one text or textarea field: the field the read page shows the saved record back through. |

| `journey` | Type | Description |
| --- | --- | --- |
| `startPath` | string | Absolute path serving the form, normally `/`. |
| `formSelector` | string | `form#<id>`; the builder derives the form id from it. |
| `fill` | object | Map of `input[name=x]` / `textarea[name=x]` selector to the value typed in. A `<select>` must not appear here: the browser driver cannot type into one. |
| `select` | object | Map of `select[name=x]` selector to the option to choose. The option must be one the field offers and must not be its first, since an untouched select already submits that. Every `select` field marked `required` must appear here, or the journey leaves it on its default and the value the server stores is the markup's rather than the brief's. |
| `steps` | object[] | Optional. Pages the flow visits BEFORE the form page, each `{ path, fill?, select?, submit? }`, for a flow that spans more than one page. `startPath` stays the form page, so the validation-failure journey and the rule and security checks still start where the form is, and exactly one step is named `submit` so the acceptance decision still resolves the form's POST. **No family uses this yet**: the shared builder serves only a handful of paths, so a second page would 404 until the builder work lands (a separate bead). |
| `expectText` | string | Text asserted on the read page; must be exactly the value typed into the echoed field. |

Both variants of a family must carry identical `fields` and `journey` - they are the same brief
at two frameworks, so a form that differed between them would make the pair comparison meaningless.
`node scripts/set-brief-schema.mjs <patch.json>` writes them to both variants, validating the whole
patch before writing anything, and `npm run check:brief-schema` reports which families are still
riding the archetype's form. The rules above are enforced by `src/train/brief-schema.mjs`, which
the scaffold also applies at build time, so a brief cannot validate here and fail to build.

## Invariants and Integrity Rules

1. **Family Split Unit & Disjointness:**
   - `family_id` is the split unit across training and evaluation.
   - All training families MUST use the `tr-` prefix (`tr-01` .. `tr-30`).
   - A training `family_id` must NEVER appear in `docs/eval/briefs/manifest.jsonl`.
   - Disjointness is checked fail-closed via `scripts/check-disjoint.mjs` and `scripts/validate-briefs.mjs --corpus`.
2. **Property-Set Invariance Across Variants:**
   - Variants within a family differ ONLY in `prompt`, `brief_id`, and `variant_of`.
   - All other 14 fields (`archetype`, `topic`, `locale`, `framework`, `task`, `stratum`, `routes`, `journeys`, `server_persistence`, `assertions`, `applicable_rules`, `required_rules`, `non_goals`, `seeded_defects`) MUST be identical across variants of the same family.
3. **Cardinality:**
   - Exactly 2 variants per family (`-v1` canonical and `-v2` variant).
4. **Rule Vocabulary:**
   - Every rule in `applicable_rules` and `required_rules` must exist in `docs/eval/rules.json`.
   - `required_rules` must be a strict subset of `applicable_rules` with 2 to 4 items.
5. **No Owner-Auth or Identifying Material (PREREGISTRATION.md §8a):**
   - Briefs are synthetic and must contain NO owner-identifying material (no real personal names, emails, addresses or phone numbers). This schema describes that rule without naming anyone, because the gate scans the whole tree and would flag this file too.
   - Only obviously fictional or neutral entities and `.test` domains are permitted.
6. **Task & Defect Contract:**
   - Generation rows must have `seeded_defects: []`.
   - Repair rows must have `seeded_defects` with at least one concrete defect description.
