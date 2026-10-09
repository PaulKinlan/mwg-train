# Event registration — illustrative two-step visual references

- **Archetype:** `event-registration`; event/ticket selection and depicted pass.
- **Generation:** 2026-10-09 UTC via the Google Antigravity OAuth `generate_image` tool. The generating lane reports its default model as `gemini-3-pro-image`; no explicit `model` was sent and tool responses contain paths, not an attested model ID. Both requested `aspectRatio: "16:9"` and returned 1376 × 768 JPEGs. Prompts below reproduce the exact recorded tool-call arguments.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual design references only, not a real event, purchased ticket, issued badge, generated-site screenshot, sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights or reproducible generation seed/settings were supplied. Public visual review is not training or commercial reuse authorization.
- **Depicted content:** Event name/date/location, attendee name, capacity, ticket tiers/prices, confirmation and Wallet/PDF controls are unverified placeholders. The raster QR graphic is not a valid check-in pass; do not scan or use it. No registration or payment was performed to produce these images.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-event.jpg`](step1-event.jpg) | Event overview and attendee/ticket choices | `62f1a32c31af6d389127ce26b253b29c705a754eaf381a1c6a958b6d1ac0ad1d` | 409753 |
| [`step2-pass.jpg`](step2-pass.jpg) | Depicted ticket pass and confirmation | `f8fa1f4c0d51fab2b77ebc4e968e9ffcf172fceeb55c3a77bfbcf126eeeea967` | 390791 |

Hashes identify the handed-off JPEG bytes, not their legal status or reproducibility. The illustrated ticket/payment details may exceed the frozen event-registration functional contract.

## Exact generation prompts

### `step1-event.jpg`

```text
Modern web application UI for a design conference event registration. Step 1: Event Details & Ticket Selection. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Hero card with event banner 'Future Web 2026', date & venue (Oct 24-25, Barbican Centre London), capacity pill '142 / 200 seats filled'. Ticket tier selector: General Admission (£120) and Workshop Pass (£220) with increment steppers. Modern form fields for Attendee Name, Organization, Work Email, Dietary Preferences, and clear emerald CTA 'Continue to Payment'. Clean typography, generous spacing, high contrast.
```

### `step2-pass.jpg`

```text
Modern web application UI for a design conference event registration, Step 2: Digital Ticket Pass & Confirmation. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Centered digital conference pass card with decorative notch, QR code check-in scanner graphic, attendee details (Sarah Jenkins, Principal Engineer), Pass Type: Workshop Pass (£220), Event: Future Web 2026, Date: Oct 24-25 Barbican London, verified 'Registration Confirmed' badge, and action buttons 'Save to Apple Wallet' and 'Download PDF Badge'. Clean modern typography, high contrast, generous whitespace.
```
