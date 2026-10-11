# Event registration — illustrative two-step visual references

- **Archetype:** `event-registration`; event/ticket selection and depicted pass.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below were edited (2026-10-11 UTC) to explicitly mandate a full-bleed web canvas and ban floating window frames. The generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so the updated hashes are strictly pinned.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual design references only, not a real event, purchased ticket, issued badge, generated-site screenshot, sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights or a seed were supplied; the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible. Public visual review is not training or commercial reuse authorization.
- **Depicted content:** Event name/date/location, attendee name, capacity, ticket tiers/prices, confirmation and Wallet/PDF controls are unverified placeholders. The raster QR graphic is not a valid check-in pass; do not scan or use it. No registration or payment was performed to produce these images.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-event.jpg`](step1-event.jpg) | Event overview and attendee/ticket choices | `835a958739512d20e33a77392006d7179d4fd4dcea932f238c4d16176f727342` | 476978 |
| [`step2-pass.jpg`](step2-pass.jpg) | Depicted ticket pass and confirmation | `6d9652b8437048e3f921c588090bc71a671d6038f1d146dc0d3f78b31edd90b3` | 431314 |

Hashes identify the handed-off JPEG bytes, not their legal status or reproducibility. The illustrated ticket/payment details may exceed the frozen event-registration functional contract.

## Exact generation prompts

### `step1-event.jpg`

```text
High-fidelity, production-quality full-bleed edge-to-edge web canvas with no floating window and no exterior drop shadow of a modern web application UI for a design conference event registration. Step 1: Event Details & Ticket Selection. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Hero card with event banner 'Future Web 2026', date & venue (Oct 24-25, Barbican Centre London), capacity pill '142 / 200 seats filled'. Ticket tier selector: General Admission (£120) and Workshop Pass (£220) with increment steppers. Modern form fields for Attendee Name, Organization, Work Email, Dietary Preferences, and clear emerald CTA 'Continue to Payment'. Clean typography, generous spacing, high contrast.
```

### `step2-pass.jpg`

```text
High-fidelity, production-quality full-bleed edge-to-edge web canvas with no floating window and no exterior drop shadow of a modern web application UI for a design conference event registration, Step 2: Digital Ticket Pass & Confirmation. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Centered digital conference pass card with decorative notch, QR code check-in scanner graphic, attendee details (Sarah Jenkins, Principal Engineer), Pass Type: Workshop Pass (£220), Event: Future Web 2026, Date: Oct 24-25 Barbican London, verified 'Registration Confirmed' badge, and action buttons 'Save to Apple Wallet' and 'Download PDF Badge'. Clean modern typography, high contrast, generous whitespace.
```
