# Visual Design Reference: Booking (Evening Class)

- **Archetype:** `booking`
- **Taxonomy Group:** `services-participation`
- **Composition Grammar:** Decision workbench / Operate
- **Theme Palette:** Deep slate background (`#0f172a`), card surfaces (`#1e293b`), emerald green action accents (`#10b981`), muted slate text (`#94a3b8`).
- **Exclusion from training:** `excluded_from_training: true`, `approved_for_training: false` (Visual Reference Design only).
- **Handoff and provenance boundary:** Copied on 2026-10-09 from the untracked `docs/design/archetypes/booking/` directory in the canonical checkout, at the project coordinator's direction. The exact generating model, prompt, any input references and reuse rights were not supplied. Hashes below pin the handed-off bytes, not their legal status or reproducibility. Do not use as training/evaluation data, a production asset, a real transaction record or conformance evidence without separate provenance/rights review.
- **Illustrative content warning:** Names, contact details, domains, dates, class prices, seat availability, paid receipts and QR codes in the raster mockups are unverified placeholders. Do not treat them as real bookings or payment proof; do not scan the depicted QR code as an application action. These JPEGs are visual references, not functioning interfaces.

## Multi-Step Journey & State Reference Boards

1. **Step 1: Browse & Schedule Selection**
   - File: `step1-browse.jpg` (SHA-256: `28a0a800a95c43a2438ec705fdf4870576294c48e9f7e5bcae3bf5e3165ee010`)
   - Intent: Depicts a weekly timetable with class slots, instructors, seat availability tags, search, and category chips; no interaction is implemented in the image.
2. **Step 2: Details & Seat Selection**
   - File: `step2-form.jpg` (SHA-256: `8b287a45bce89a120df1e6f28c9db1a312146cafdb41650e1b52b6a8853b0fff`)
   - Intent: Depicts a form flow (Step 2 active), class summary, sample £45 price, personal-detail fields, seat-selection diagram and CTA. The raster itself has no working form or picker.
3. **Step 3: Confirmation & Digital Receipt**
   - File: `step3-confirmation.jpg` (SHA-256: `7af6ced0121c3705c64134fabdbe00c805024388eabb11b184035323b7c402e4`)
   - Intent: Illustrative confirmation mockup with placeholder reference `#BK-84920`, QR-like pass badge, sample class summary and purported receipt/calendar actions. No booking or payment was verified.
4. **Step 4: Error & Validation State**
   - File: `step4-error.jpg` (SHA-256: `a87a6249167f60cc7a049d2d9f8c614fc83737335a281b642990b5f2820cfbd1`)
   - Intent: Depicts error banners, field-level error messages and unavailable-seat alerts; a JPEG cannot demonstrate accessible error announcements.
5. **Step 5: Honest Empty State**
   - File: `step5-empty.jpg` (SHA-256: `adbaa0f41b1c3c5567404d84246ce48e8854ec1a79236165119faf2c775888ce`)
   - Intent: Empty schedule filter outcome with clear messaging and recovery actions.
