# Unified Concepts Architecture & Fleet Execution Guide (`tr-01`..`tr-39`)

## 1. Why Archetype Patterns (`27`) and Training Families (`39`) Exist — and How They Unify

In `mwg-train`, there are two related levels of specification that previously drifted apart visually:

1. **Archetype Patterns (`27` categories under `/concepts/pattern/<archetype>`)**
   - An **Archetype** is the **abstract UX category and functional grammar** (e.g., `booking`, `expense-tracker`, `web-shop`, `dashboard`, `event-registration`).
   - **Why `27` Archetypes vs `39` Training Families (`tr-01`..`tr-39`) and `5` Held-Out Evaluation Targets (`A6`)?**
     - **Preventing Brand Memorization (One-to-Many Training Diversity):** If a model only saw *one* booking app or *one* expense tracker during training, it would overfit to that single brand's copy, colors, and field names instead of learning transferable Modern Web Guidance patterns. Therefore, high-frequency archetypes map to **multiple distinct training families**:
       - `booking` (`7` families: `tr-01` VeloFix Mobile Mechanic, `tr-03` Terraform Ceramics, `tr-17` Valley & Moor Veterinary, `tr-19` Estuary Rowing Club, `tr-21` Good Neighbour Transit, `tr-24` Market Cross Farmers Market, `tr-27` St. Jude's Chamber Music)
       - `web-shop` (`3` families: `tr-02` Foxhill Orchard, `tr-18` Weigh & Refill Pantry, `tr-26` Atlas Roasters)
       - `dashboard` (`2`: `tr-04`, `tr-22`), `directory-listing` (`2`: `tr-06`, `tr-14`), `docs-site` (`2`: `tr-13`, `tr-25`), `event-registration` (`2`: `tr-07`, `tr-30`), `expense-tracker` (`2`: `tr-15`, `tr-29`), `support-helpdesk` (`2`: `tr-08`, `tr-28`), `survey-form` (`2`: `tr-10`, `tr-23`)
       - Plus `15` specialized single-family archetypes (`tr-05`, `tr-09`, `tr-11`, `tr-12`, `tr-16`, `tr-20`, `tr-31`..`tr-39`).
     - **Held-Out Evaluation Separation (`A1` Training vs `A6` Evaluation):** Five archetypes (`account-recovery`, `booking`, `catalogue`, `contact-lead`, `event-registration`) carry **sealed `A6` held-out evaluation targets** (`data/A6_evaluation/targets/<archetype>/target.png`). Three of those (`account-recovery`, `catalogue`, `contact-lead`) have **zero** training families so evaluation measures generalization to unseen application categories.

2. **Why `/concepts/family/tr-15` (and other `tr-*` pages) Looked Mismatched Previously**
   - Each training family (`tr-01`..`tr-39`) had its own single reference board (`docs/design/training/tr-NN/reference.jpg`) generated from `docs/train/design/tr-NN/design.md` (e.g., `tr-15` = *Oakridge Tenant Co-operative — Maintenance Ledger & Expenses*, brick-red `#b91c1c`, USD `$`).
   - However, the 4-step Light & Dark Mode journey boards only existed once per archetype under `docs/design/archetypes/<archetype>/` (e.g., `expense-tracker` = *The Ledger*, spruce-teal `#0f766e`, GBP `£`).
   - Displaying the archetype's 4-step boards on `/concepts/family/tr-NN` caused two completely different visual designs and brands to appear on the same page.

3. **The Unified Concept Model (Every `tr-NN` Has Its Own 4-Step Light + Dark Journey)**
   - Every runnable training family (`tr-01`..`tr-39`) is a **self-contained Concept** with:
     - **One Brand & Aesthetic System:** `docs/train/design/tr-NN/design.md` (exact brand name, CSS custom property tokens, typography, and component hierarchy).
     - **One Client + Server Functional Plan:** `docs/train/design/tr-NN/plan.md` (routes, form controls, server write + read-back across reload, server search `?q=`, record mutation, and accessible validation refusal).
     - **One Unified 4-Step Light Mode + 4-Step Dark Mode Visual Journey (`8` boards per family = `312` boards across `tr-01`..`tr-39`):**
       - Light Mode: `docs/design/training/tr-NN/step1-overview.jpg`, `step2-interaction.jpg`, `step3-outcome.jpg`, `step4-validation.jpg`
       - Dark Mode: `docs/design/training/tr-NN/dark/step1-overview.jpg`, `dark/step2-interaction.jpg`, `dark/step3-outcome.jpg`, `dark/step4-validation.jpg`
       - Prompts & State Map: `docs/design/training/tr-NN/journey-prompts.json` (committed and verified deterministically against `manifest.jsonl`, `design.md`, and `plan.md`).
       - Provenance Register: `docs/provenance/assets/training-family-journeys.md`.
     - **Seven Target Code Directories:** `pilot/projects/tr-NN-{hono,raw,react,preact,vue,svelte,webcomponents}`, which receive the family's unified reference + 4-step Light/Dark boards in their generation prompts and are evaluated against the same client + server acceptance contract.

---

## 2. Single-Script Fleet Generation Architecture (`scripts/generate-family-journey-boards.mjs`)

To guarantee visual consistency across all `39` training families (`312` boards), generation is driven by a **single deterministic script**: [`scripts/generate-family-journey-boards.mjs`](../../scripts/generate-family-journey-boards.mjs), backed by [`src/train/family-journeys.mjs`](../../src/train/family-journeys.mjs).

### Multimodal Conditioning Graph (Per Family `tr-NN`)

Every board in a family's 8-board set (`4` Light + `4` Dark) is generated at `1376×768` (`16:9`) via `gemini-nano-banana-2.1` (`https://gemini.int.exe.xyz/v1beta/models/gemini-nano-banana-2.1:generateContent`) with strict multimodal `inlineData` (`image/jpeg`) conditioning:

1. **`step1-overview.jpg` (Light Mode Step 1 — Initial Overview & Ready Workspace):**
   - Conditioned on `docs/design/training/tr-NN/reference.jpg` (`inlineData` `image/jpeg`) + `docs/train/design/tr-NN/design.md` tokens + `plan.md` controls.
   - Locks the brand header, navigation bar, typography, card geometry, and Light Mode colour palette to `reference.jpg`.
2. **`step2-interaction.jpg` (Light Mode Step 2 — Active Form & Control Interaction):**
   - Conditioned on `reference.jpg` + `step1-overview.jpg` (`inlineData` `image/jpeg`).
   - Populates `form#<formSelector>` with the exact concrete `fill` and `select` values from `docs/train/design/tr-NN/plan.md`.
3. **`step3-outcome.jpg` (Light Mode Step 3 — Persisted Confirmation, Read-Back & Server Search):**
   - Conditioned on `reference.jpg` + `step1-overview.jpg` (`inlineData` `image/jpeg`).
   - Depicts the persisted record (`expectText`), updated running total/list after reload, active server search (`?q=<query>`), and inline update affordance (`<newValue>`).
4. **`step4-validation.jpg` (Light Mode Step 4 — Accessible Validation Refusal & Error Recovery):**
   - Conditioned on `reference.jpg` + `step2-interaction.jpg` (`inlineData` `image/jpeg`).
   - Depicts the accessible client + server validation refusal state (`role="alert"` banner naming the offending field, inline icon + text error message, no colour-only error, valid inputs preserved).
5. **`dark/step1-overview.jpg` (Dark Mode Step 1 Twin):**
   - Conditioned on `step1-overview.jpg` (`inlineData` `image/jpeg`), translating light surfaces to `#0b0f19` / `#111827` / `#1e293b` with `#334155` borders and `#f8fafc` text while preserving the family's signature accent colour.
6. **`dark/step2-interaction.jpg` .. `dark/step4-validation.jpg` (Dark Mode Steps 2–4 Twins):**
   - Conditioned on their corresponding Light Mode step (`step{k}.jpg`) AND `dark/step1-overview.jpg` (`inlineData` `image/jpeg`) so all 4 Dark Mode steps share identical dark surfaces and 1-to-1 content parity with Light Mode.

### Built-In Fail-Closed Quality Gates

Every generated image is verified before being written to disk:
- **Gateway Model Attestation:** Fails closed unless `payload.modelVersion === "gemini-nano-banana-2.1"`.
- **Exact Dimensions:** Fails closed unless JPEG SOF header measures `1376 × 768`.
- **Zero Browser Chrome:** Decodes JPEG pixels and runs `hasBrowserChrome(bytes)` from `scripts/check-archetype-frames.mjs` (automatically retrying up to 4 times if any macOS traffic-light dots or window borders appear).
- **Automatic Pinning & Provenance Registration:** Automatically updates `.fleet/frame-scan-pins.json` and writes `docs/provenance/assets/training-family-journeys.md`.

---

## 3. Fleet Operator & Agent Execution Commands

A single fleet agent can generate all 39 families in one resumable run, or execute them in 5 deterministic batches (`Batch 1`..`Batch 5`):

```bash
# 1. Inspect dry-run status and prompt SHA-256 digests (offline)
node scripts/generate-family-journey-boards.mjs

# 2. Generate all 39 families (resumable: skips any valid 1376x768 board already on disk)
node scripts/generate-family-journey-boards.mjs --write --skip-existing

# Or run by deterministic batch:
# Batch 1 (tr-01..tr-08):
node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-01,tr-02,tr-03,tr-04,tr-05,tr-06,tr-07,tr-08
# Batch 2 (tr-09..tr-16):
node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-09,tr-10,tr-11,tr-12,tr-13,tr-14,tr-15,tr-16
# Batch 3 (tr-17..tr-24):
node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-17,tr-18,tr-19,tr-20,tr-21,tr-22,tr-23,tr-24
# Batch 4 (tr-25..tr-32):
node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-25,tr-26,tr-27,tr-28,tr-29,tr-30,tr-31,tr-32
# Batch 5 (tr-33..tr-39):
node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-33,tr-34,tr-35,tr-36,tr-37,tr-38,tr-39

# 3. Verify all 312 boards (39 families x 8 boards), rewrite provenance register & frame pins
node scripts/generate-family-journey-boards.mjs --register
node scripts/generate-family-journey-boards.mjs --check

# 4. Run full repository verification suite
npm run check:all
npm test
```

---

## 4. Fleet Beads (`bd`) Under Major Epic `mwg-train-fij3`

| Bead ID | Type | Scope | Exact Command |
|---|---|---|---|
| `mwg-train-fij3` | Epic (P0) | All `39` families (`312` boards) | `node scripts/generate-family-journey-boards.mjs --write --skip-existing --register` |
| `mwg-train-fij3.1` | Task (P0) | Batch 1 (`tr-01`..`tr-08`, `64` boards) | `node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-01,tr-02,tr-03,tr-04,tr-05,tr-06,tr-07,tr-08` |
| `mwg-train-fij3.2` | Task (P0) | Batch 2 (`tr-09`..`tr-16`, `64` boards, incl. `tr-15` Oakridge Tenant Co-operative) | `node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-09,tr-10,tr-11,tr-12,tr-13,tr-14,tr-15,tr-16` |
| `mwg-train-fij3.3` | Task (P0) | Batch 3 (`tr-17`..`tr-24`, `64` boards) | `node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-17,tr-18,tr-19,tr-20,tr-21,tr-22,tr-23,tr-24` |
| `mwg-train-fij3.4` | Task (P0) | Batch 4 (`tr-25`..`tr-32`, `64` boards) | `node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-25,tr-26,tr-27,tr-28,tr-29,tr-30,tr-31,tr-32` |
| `mwg-train-fij3.5` | Task (P0) | Batch 5 (`tr-33`..`tr-39`, `56` boards) | `node scripts/generate-family-journey-boards.mjs --write --skip-existing --only tr-33,tr-34,tr-35,tr-36,tr-37,tr-38,tr-39` |
| `mwg-train-fij3.6` | Task (P0) | Finalize & Verify (`--register`, `--check`, `check:all`) | `node scripts/generate-family-journey-boards.mjs --register && node scripts/generate-family-journey-boards.mjs --check && npm run check:all` |

