# Event registration — illustrative two-step visual references

- **Archetype:** `event-registration`; event/ticket selection and depicted pass.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below were edited (2026-10-11 UTC) to explicitly mandate a full-bleed web canvas and ban floating window frames. The generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so the updated hashes are strictly pinned.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual design references only, not a real event, purchased ticket, issued badge, generated-site screenshot, sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights or a seed were supplied; the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible. Public visual review is not training or commercial reuse authorization.
- **Depicted content:** Event name/date/location, attendee name, capacity, ticket tiers/prices, confirmation and Wallet/PDF controls are unverified placeholders. The raster QR graphic is not a valid check-in pass; do not scan or use it. No registration or payment was performed to produce these images.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-event.jpg`](step1-event.jpg) | Event overview and attendee/ticket choices | `e55cc58b71b4ac39242682e90e4554897cc0fbb1f3911174251d8a2da0ba3046` | 470870 |
| [`step2-pass.jpg`](step2-pass.jpg) | Depicted ticket pass and confirmation | `0315a4fdc6386db4182a5bc119126892ee66d422a0708acb5d474da7d5f68a3a` | 511185 |
| [`step3-refusal.jpg`](step3-refusal.jpg) | Capacity and validation refusal: the registration form after a refused submission - omitted-field validation and a ticket selection exceeding remaining capacity, both announced in text (the contract-required states at plan.md:34 and the tr-07/fam-r02 assertions; added by mwg-train-wkto) | `4ae22312d61d4ed5e284e81e450fb93e498eb39b83042c66c2979c0736966717` | 569492 |

Hashes identify the handed-off JPEG bytes, not their legal status or reproducibility. The illustrated ticket/payment details may exceed the frozen event-registration functional contract.

## Exact generation prompts

### `step1-event.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for a flagship web platform & design festival, "Future Web 2026 · Barbican Centre London", Step 1: Event Details & Ticket Selection in BARBICAN BRUTALIST CONCRETE DAYLIGHT MODE (#f3f1ed raw architectural concrete page ground reaching all four edges, #ffffff crisp modular ticket cards with bold 2px #18181b brutalist ink borders, electric royal violet #7e22ce primary CTA button, festival coral-crimson #e11d48 capacity pill). Architectural grid hero header reading "Future Web 2026 · 24–25 Oct 2026 · Barbican Centre, London" with high-contrast pill "142 / 200 seats filled". Two-column layout: left shows ticket tier cards for "General Admission (£120)" and "Workshop Pass (£220)" with tactile quantity steppers; right shows accessible registration fields for Attendee Name, Organisation, Work Email, Dietary / Access Needs, and bold electric-violet button "Continue to Payment".
```

### `step2-pass.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for "Future Web 2026 · Barbican Centre London", Step 2: Digital Ticket Pass & Confirmation in BACKSTAGE VELVET-PLUM DARK MODE (#130d1d deep velvet-plum page ground reaching all four edges, #211733 perforated lanyard pass card with #a855f7 neon-violet and #fb7185 coral accents, #faf5ff crisp white typography). Centered digital conference badge with lanyard slot notch, verified emerald "Registration Confirmed" pill, attendee details ("Sarah Jenkins · Principal Web Engineer"), Pass Type "Workshop Pass (£220)", Event "Future Web 2026 · Oct 24–25 · Barbican London", a crisp illustrative QR code check-in graphic, and action buttons "Save to Wallet" and "Download PDF Badge".
```

### `step3-refusal.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Full-bleed desktop viewport of "Future Web 2026 · Barbican Centre London" event registration, Step 3: Capacity & Validation Refusal State in BARBICAN BRUTALIST CONCRETE DAYLIGHT MODE (#f3f1ed architectural concrete page ground reaching all four edges, #ffffff modular registration card with 2px #18181b borders, #7e22ce royal violet button). Event header shows "Future Web 2026" and capacity badge reading "197 / 200 seats filled". The form is shown after a refused submission: a stark crimson error banner (#fef2f2 fill, #be123c border) at the top of the card reads "Registration could not be completed", the Attendee Name input is outlined in red with helper text "This field is required", and a red capacity notice beside the General Admission stepper (set to 4) reads "Only 3 General Admission tickets remain — your selection of 4 exceeds the remaining capacity".
```
