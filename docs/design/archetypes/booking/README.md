# Visual Design Reference: Booking (Evening Class Studio)

- **Archetype:** `booking`
- **Taxonomy Group:** `services-participation`
- **Composition Grammar:** Decision workbench / Operate
- **Theme Palette:** Deep slate background (`#0f172a`), card surfaces (`#1e293b`) with 1px border (`#334155`), emerald green action accents (`#10b981`), muted text (`#94a3b8`).
- **Exclusion from training:** `excluded_from_training: true`, `approved_for_training: false` (Visual Reference Design only).
- **Rights boundary:** Training and output reuse rights were not supplied; excluded from training.
- **Handoff and Provenance:** REGENERATED on 2026-10-11 UTC with `model: gemini-nano-banana-2.1` passed explicitly to the project's model gateway, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and fell back to `gemini-3-pro-image`, which its records could report but never attest. `scripts/generate-archetype-boards.mjs` now requires the gateway's own `modelVersion` attestation to equal the requested model before it writes a board, and all five boards are attested `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192. The prompts are unchanged from the recorded tool calls.
- **Illustrative content warning:** Names, contact details, domains, dates, class prices, seat availability, paid receipts and QR codes in the raster mockups are unverified placeholders. Do not treat them as real bookings or payment proof; do not scan the depicted QR code as an application action. These JPEGs are visual references, not functioning interfaces.

## Brand identity

This archetype supports **two coexisting brand identities**. The journal owner confirmed on 2026-10-13 that both
are kept (*"we probably need both"*, bead `mwg-train-4xg`): neither is an error, and neither is drift to be renamed.

- **Evening Class Studio** — the primary brand. It is this document's heading and the wordmark all five reference
  boards render, and it is the name a framework build of this archetype renders by default.
- **Learning Hub** — the supported variant. The interactive demo under [`demo/`](demo/README.md) implements the same
  archetype under this name, and states it in its own brand element and in the titles of its three product pages
  (`index.html`, `confirmation.html`, `empty.html`). Its comparison page describes the artefact rather than
  adopting a name, so it states neither brand.

The two names describe one archetype - the same contract, the same journey, the same copy structure - rendered
under either brand. What must not happen is a page that mixes them: a document carrying the primary brand in its
body and the variant in its title is the contradiction this section exists to prevent. A build therefore renders
one identity consistently, and records which.

The decision travels with the extracted assets, not only with this document: each demo document's copy slot records
the brand its own title states, and
[`decisions.json`](../../../../assets/archetypes/booking/decisions.json) lists `Learning Hub` as a supported variant of the
`Evening Class Studio` primary brand. `npm run check:archetype-assets` fails if a copy slot states a brand that is
neither the set's brand nor a declared variant, or if a declared variant is no longer stated by the target.

## Multi-Step Journey & State Reference Boards

1. **Step 1: Browse & Schedule Selection**
   - File: `step1-browse.jpg` (SHA-256: `807321bfa27cf76aa50e0c6003486e5b14de83a2ff84a019465d824fce24de0c`)
   - Model: `gemini-nano-banana-2.1` (gateway-attested)
   - Prompt: "Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity, production-quality unframed desktop web application UI of an evening craft & culinary workshop booking web application, \"Evening Class Studio\", Step 1: Browse & Schedule Selection in WARM CERAMIC DAYLIGHT LIGHT MODE (#fbf8f3 warm kiln-clay paper background reaching all four edges, #ffffff tactile course cards with 1px #e7e5e4 warm stone borders, #1c1917 espresso ink, #c2410c terracotta glaze primary action buttons). Top navigation with studio emblem, \"Evening Class Studio\", Search bar, \"Light / Evening mode\" toggle, and Bookings badge. Interactive weekly schedule matrix (Monday–Friday 6:00 PM–9:00 PM) displaying tactile studio course cards: \"Wheel-Thrown Stoneware Pottery (6:30 PM)\", \"Japanese Woodblock Printmaking\", \"Artisan Sourdough & Fermentation\", each with instructor portrait avatar, studio room badge, price £45.00, warm amber pill \"4 seats remaining\", and terracotta \"Book Bench\" button. Editorial serif headings paired with crisp sans UI text."
   - Intent: Production weekly schedule matrix with class cards, instructor avatars, capacity indicators, and direct 'Book Now' actions.

2. **Step 2: Details & Seat Selection**
   - File: `step2-form.jpg` (SHA-256: `0b6e5cefb03cd40201a0fc5ae1a7b22c8b7627231d14d8669aef3837b431f6df`)
   - Model: `gemini-nano-banana-2.1` (gateway-attested)
   - Prompt: "Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity, production-quality unframed desktop web application UI of \"Evening Class Studio\", Step 2: Details & Workbench Seat Selection in WARM CERAMIC DAYLIGHT LIGHT MODE (#fbf8f3 warm kiln-clay paper background reaching all four edges, #ffffff surface cards with 1px #e7e5e4 stone border, #1c1917 espresso ink, #c2410c terracotta glaze primary actions). Top navigation intact with step indicator \"Step 2 of 3 · Reserve Bench\". Two-column booking workbench: Left column is a tactile workshop summary card for \"Wheel-Thrown Stoneware Pottery (Monday 6:30 PM – 8:30 PM · Kiln Room B · Instructor: Dr. Evelyn Reed)\" with clay/glaze materials included and total £45.00. Right column shows an accessible reservation form: Full Name (\"Alex Thompson\"), Email Address (\"alex@example.com\"), Phone Number (\"+44 7700 900123\"), Apron/Access notes, and an interactive 2D studio pottery-wheel bench map (rows A–D, showing terracotta selected wheel bench B3, warm stone available wheels, and hatched reserved wheels). Primary terracotta button \"Confirm Booking (£45.00)\"."
   - Intent: Cohesive two-column checkout view with left order summary card and right personal details form + interactive 2D desk seat picker.

3. **Step 3: Confirmation & Digital Receipt**
   - File: `step3-confirmation.jpg` (SHA-256: `c7fb544c6d12593de72dffad6ddb974c71a19c9a1f64f39a4f47765bc6eeae8d`)
   - Model: `gemini-nano-banana-2.1` (gateway-attested)
   - Prompt: "Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity, production-quality unframed desktop web application UI of \"Evening Class Studio\", Step 3: Booking Confirmation & Digital Studio Pass in WARM ESPRESSO EVENING DARK MODE (#1c1917 rich kiln-charcoal background reaching all four edges, #292524 warm basalt ticket card with #44403c border, #ea580c warm terracotta-amber accent, #15803d sage-green verified badge, #fafaf9 warm ivory text). Top navigation shows \"Evening Class Studio\", Browse Workshops, My Bookings (active badge 1), and Evening Mode indicator. Centered perforated studio pass card: verified check badge, serif headline \"Booking Confirmed!\", booking reference \"#BK-92841\", workshop details (Wheel-Thrown Stoneware Pottery, Monday 26 Oct 2026, 6:30 PM – 8:30 PM, Kiln Room B, Wheel Bench B3, Instructor: Dr. Evelyn Reed), attendee \"Alex Thompson\", payment receipt \"Paid £45.00 · Materials included\", a crisp illustrative QR code for studio check-in, and buttons \"Add to Calendar\" and \"Download PDF Receipt\"."
   - Intent: Digital pass card with booking reference `#BK-92841`, scannable entry QR code, receipt breakdown, and calendar/download actions.

4. **Step 4: Error & Validation State**
   - File: `step4-error.jpg` (SHA-256: `94ba77e82cb82c54fe13ad1bd3a0eb47fc13eda81213e79f323a2a176a3e541c`)
   - Model: `gemini-nano-banana-2.1` (gateway-attested)
   - Prompt: "Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity, production-quality unframed desktop web application UI of \"Evening Class Studio\", Step 4: Error & Seat Collision State in WARM CERAMIC DAYLIGHT LIGHT MODE (#fbf8f3 warm kiln-clay paper background reaching all four edges, #ffffff form card with #e7e5e4 border, #1c1917 espresso ink, #c2410c terracotta primary button). Prominent crimson alert banner (#fef2f2 fill, #b91c1c border and text) at the top of the reservation form reads: \"Please correct the highlighted fields to complete your booking\". Full Name (\"Alex Thompson\") is valid, while Email Address is outlined in 2px red #b91c1c with inline helper text \"Enter a valid email address (e.g. name@domain.com)\". On the 2D studio wheel-bench grid, bench B3 shows an amber-red collision callout badge: \"Bench B3 was just reserved by another maker. Please select an open wheel.\""
   - Intent: Accessible error banners, field-level inline validation messages, and seat conflict collision alerts.

5. **Step 5: Honest Empty State**
   - File: `step5-empty.jpg` (SHA-256: `f3ccd1a115af983f0a9903f14725c7747d9d77a0f193eaaa61bc2923bc5ecc56`)
   - Model: `gemini-nano-banana-2.1` (gateway-attested)
   - Prompt: "Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity, production-quality unframed desktop web application UI of \"Evening Class Studio\", Step 5: Honest Empty Schedule State in WARM ESPRESSO EVENING DARK MODE (#1c1917 rich kiln-charcoal background reaching all four edges, #292524 warm stone empty-state card with #44403c border, #ea580c terracotta-amber primary button, #fafaf9 warm ivory text). Weekly schedule filter bar shows \"Sunday\" and category chip \"Advanced Porcelain Glazing\" active. Centered empty-state card features a clean ceramic vessel line icon, editorial serif heading \"No Workshops Scheduled for this Selection\", helpful copy \"Our kilns cool down on Sundays and no sessions match this filter. Explore weekday evening classes or clear your filter.\", primary terracotta button \"Reset Filters\", and secondary link \"View Full Monthly Timetable\"."
   - Intent: Clean empty schedule filter state with calendar icon and filter reset action.
