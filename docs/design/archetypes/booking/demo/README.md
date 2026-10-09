# Booking Archetype: Modern Visual Design Target

- **Archetype:** `booking` (Evening class booking)
- **Status:** Illustrative visual design target and demonstration.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`.
- **Boundaries:**
  - **Not the sealed evaluation target:** This demonstration does not modify or replace `docs/eval/targets/booking/` (whose manifest digest is pinned by `EVAL_TARGETS_SEAL`).
  - **Not part of pilot:** This demo lives outside `pilot/**` and `data/A6_evaluation/**`. The frozen pilot corpora (`pilot/CORPUS.json`, `pilot/TRAINING_CORPUS.json`, and generated arm trees) remain byte-identical.
  - **Not training data:** Kept purely for visual verification and operator inspection.

## Purpose

This directory provides an honest, browser-verifiable implementation of the visual language established by the five Nano Banana reference boards in `docs/design/archetypes/booking/` (`step1-browse.jpg` through `step5-empty.jpg`), applied directly to the archetype's real functional contract in `docs/eval/specs/booking.json`.

The reference boards depicted an expanded journey (weekly timetable grid, 2D desk seat picker, QR pass receipts). This demo adopts their **visual language** onto the archetype's **actual contract flow**, without inventing timetable, seat-picker, or receipt endpoints.

## Visual Language Derivations

1. **Palette Foundations (Boards 1 & 2):**
   - Deep slate canvas (`#0f172a`), card surfaces (`#1e293b`), borders (`#334155`).
   - Emerald action accents (`#10b981`), hover state (`#059669`), and focus ring glow (`rgba(16, 185, 129, 0.25)`).
   - High-contrast text (`#f8fafc`) paired with muted slate secondary metadata (`#94a3b8`).
   - Dark form controls (`#0f172a` surface with 1px slate border).
2. **Decision Workbench & Left Summary Card (Board 2):**
   - Container-query powered two-column layout (`@container (min-width: 720px)`) adapting into a stacked column on mobile.
   - Left-column class summary card displaying course title, meeting times, location, instructor, seat availability badge, and prominent bold price (`Total Price: £45`).
   - Right-column form card featuring clean field spacing, quiet secondary link (`← Go Back`), and prominent primary CTA (`Continue to Confirmation →`).
3. **Multi-Step Progress Tracker (Boards 1, 2, 3):**
   - Spaced multi-step indicator with numbered and checked circles, connector lines, emerald active ring, and step labels.
4. **Accessible Error & Validation State (Board 4):**
   - Prominent red alert banner (`#ef4444` / `rgba(239, 68, 68, 0.15)`) with `role="alert"` and `aria-live="assertive"`.
   - Field-level validation deferral via `:user-invalid`, paired with explicit non-color error icons (`✕`) and descriptive guidance.
5. **Confirmation & Empty State Variants (Boards 3 & 5):**
   - Static variants provided for the Digital Receipt Pass (`confirmation.html`) and Honest Empty State (`empty.html`).

## Contract Conformance (`docs/eval/specs/booking.json`)

The interactive demo (`index.html`) satisfies all required contract selectors and fields:
- **Form selector:** `form#booking-form` (action `/book`, method `post`)
- **Fields:**
  - `name`: `Full name` (autocomplete `name`, required)
  - `email`: `Email` (type `email`, autocomplete `username`, required)
  - `address`: `Delivery address` (autocomplete `street-address`, required)
  - `postcode`: `Postcode` (autocomplete `postal-code`, required)
  - `notes`: `Anything we should know?` (textarea, required)
- **Echo container:** `#booking-notes`
- **Fill verification:** Compatible with Ada Lovelace journey (`Ada Lovelace`, `ada@example.test`, `12 Bridge Row`, `AB1 2CD`, `Window seat please`).

## Modern Web Guidance (MWG) Applied

- **`dark-mode` & `color`:** Declared `<meta name="color-scheme" content="light dark">`, `:root { color-scheme: light dark; }`, `light-dark()` custom properties, minimum 4.5:1 text contrast and 3:1 non-text boundary contrast, plus `@media (forced-colors: active)` support.
- **`validate-input-after-interaction` & `required-field-feedback`:** Visual feedback deferred via `:user-invalid` (avoiding premature eager validation). Format hints placed above inputs (`.field-hint`) to prevent popover collisions.
- **`accessible-error-announcement`:** `aria-errormessage` links on all fields, accompanied by a JavaScript bridge dynamically synchronizing `aria-invalid="true"` on blur, input, and submit.
- **`responsive-design` & `size-aware-styling`:** Component-driven responsive layout using CSS Container Queries (`container-type: inline-size` on `.workbench-shell`), fluid typography with `clamp()`, and mobile-optimized touch targets.
- **`css`:** Modern cascade architecture, native CSS nesting, logical properties (`padding-inline`, `margin-block`), and no global `*` resets that break cascade layers.

## Files

- `index.html`: Main interactive booking demo (Step 2 registration with Step 4 validation states and Ada Lovelace journey simulation).
- `styles.css`: Single shared modern stylesheet.
- `confirmation.html`: Static variant of Step 3 Digital Receipt Pass.
- `empty.html`: Static variant of Step 5 Honest Empty Schedule State.
- `compare.html`: Side-by-side visual comparison page linking the reference boards directly to the implementation.
