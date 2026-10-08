# Training Brief Schema and Authoring Protocol

The training briefs (`docs/train/briefs/manifest.jsonl`) specify the synthetic project requirements used to train student models and generate the training corpus.

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
   - Briefs are synthetic and must contain NO owner-identifying material (no real personal names, emails, addresses, phone numbers, or Paul Kinlan's details).
   - Only obviously fictional or neutral entities and `.test` domains are permitted.
6. **Task & Defect Contract:**
   - Generation rows must have `seeded_defects: []`.
   - Repair rows must have `seeded_defects` with at least one concrete defect description.
