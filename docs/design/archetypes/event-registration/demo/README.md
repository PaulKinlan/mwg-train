# Event registration — standalone visual target demo

- **Archetype:** `event-registration`; illustrated event form and decorative pass.
- **Status:** Hand-written static visual target with browser-local interactive previews, not model-generated site output.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Both linked Wave 2 JPEGs have the same exclusion and [consumer-account rights boundary](../README.md). Neither the demo nor boards are training, conformance or evaluation material.
- **Not the sealed evaluation target:** this directory is outside `pilot/**`, `data/A6_evaluation/**` and `docs/eval/targets/event-registration/**`; it changes no sealed hashes or generated arm trees.
- **No committed screenshots:** [`compare.html`](compare.html) shows the two original JPEGs beside live HTML iframes. Open directly or from a static server; no build, CDN, web fonts, external assets, payment provider or network request is required.

## What the boards contributed

1. **Board 1 (`step1-event.jpg`):** Future Web 2026 hero, venue, the illustrated 142-of-200 capacity pill, General Admission/Workshop Pass steppers at **illustrative** £120/£220, attendee name, organization, email and dietary fields, and a green "Continue to Payment" CTA. The demo keeps these visible elements, adapts the tier rows to one column on phones, computes a local **not-charged** estimate and uses dark ink on `#10b981` to correct the board's low-contrast white-on-emerald button text. Its graphic ribbon is hand-written SVG, not reused pixels from the image.
2. **Board 2 (`step2-pass.jpg`):** a notched ticket, QR graphic and confirmed/Wallet/PDF labels. The demo's pass is conspicuously labelled **not valid for entry**. Its three-corner badge contains a large "DEMO" label rather than a scannable QR payload, and Wallet/PDF controls are disabled. The on-board `Sarah Jenkins` name is an illustrative preview value only; a real form submission echoes the locally entered name safely as text.

The illustrated event, dates, Barbican venue, capacity, prices, person, ticket tier, pass and QR should not be treated as real data. No seats are checked or held. No money is collected. No ticket or reference is issued.

## Behavior and frozen-contract boundary

| Surface | Browser-local preview | What is **not** implemented |
| --- | --- | --- |
| [`index.html`](index.html) | `form#registration-form` has the real spec's `name`/`email` fields (both required) and an unserved `POST /register` action, plus board-only optional organization/dietary fields. Native validation refuses empty/invalid entries. The two bounded quantity inputs/steppers select the board's illustrative tiers; the displayed amount is computed from both counts. The input/submit/stepper controls stay disabled until the JS submit handler is installed; a valid submit is intercepted and opens the local pass preview. | Server `POST /register`, real payment, seat reservation, inventory, waitlist, SQLite records, redirects and durable reload. No POST leaves the browser in the working demo. |
| `index.html?view=pass` | Directly opens the second visual state with a fictional sample name. The same pass view follows a valid demo submit and shows the entered attendee name and selected tiers as text; Edit details returns to the form. | A valid QR code, issued reference, confirmed registration, real purchase, Wallet/PDF artifact or check-in eligibility. |
| [`compare.html`](compare.html) | Original JPEGs beside live iframe views; each can be opened full-size. | A pixel-match or conformance score; no screenshots of generated sites are committed. |

The frozen [`event-registration` spec](../../../../eval/specs/event-registration.json) requires a **different** ticket selector (`standard`, `accessible`, `student`), server-issued `/registration/:ref` durable echo, and capacity **3** with the fourth registrant waitlisted. Those are not the board's General/Workshop pricing or its "142 of 200" figure. This static visual demo follows the requested **board tier design**, not the spec's ticket value set, and cannot prove or replace the spec's server-enforced capacity/security behavior. The [functional plan](../../../../eval/design/event-registration/plan.md) itself documents that the generated implementation's capacity rule is declared but not enforced. Do not count this demo as a functional server fix. There is no Wave 2 error or empty board for this family, and none is invented here.

## Verification

Run `node scripts/verify-event-registration-demo.mjs` from the repository root. A bounded Chrome browser drives quantity increments/decrements, bounds, computed estimate, native required-field/email validation, successful *local* preview, safe echo and return, two actual JPEGs and live comparison iframes, and zero horizontal overflow at 390px, 768px, and 1280px. The verifier writes screenshots to `/tmp/xvd-event-shots/` and JSON to `/tmp/xvd-event-verify.json` (not the repository). `npm run check:baseline-label` classifies this README as design documentation; the parent board README remains provenance.
