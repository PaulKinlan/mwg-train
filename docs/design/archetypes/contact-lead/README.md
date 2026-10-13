# Contact lead — illustrative consultation-state visual references

- **Archetype:** `contact-lead`; consultation form, invalid-submit refusal and depicted success state.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below were edited (2026-10-11 UTC) to explicitly mandate a full-bleed web canvas and ban floating window frames. The generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so the updated hashes are strictly pinned.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual planning references only: not a working consultation form, a real submitted lead, a generated-site screenshot, a sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights, or a seed were supplied; the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible. Public visual review does not authorize training or commercial reuse.
- **Depicted content:** The London address, identity, named attendee, email address, response-time promise, reference token and PDF button are unverified illustrated placeholders. Do not send enquiries to the depicted contact or treat the success screen as evidence that an actual request was received. Form/accessibility behavior was not measured from these rasters.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-form.jpg`](step1-form.jpg) | Studio identity and consultation form | `1005f6c1404e40a51342c6dd48a7ba9c4d8127e36d9bf251bac0eea2f0bee76f` | 497305 |
| [`step2-success.jpg`](step2-success.jpg) | Depicted acknowledgement and sample lead reference | `cb5df48b6ff3a569a356f98d5e37fceb4c0e71a27dd52e07536d32d39135be64` | 397249 |
| [`step3-refusal.jpg`](step3-refusal.jpg) | Invalid-submit refusal: the form re-rendered with a banner and field errors, nothing stored (the contract-required state at plan.md:54, added by mwg-train-cdp0) | `6692bb286cb77d7af9bdb52430c4e2fa1fdb47a2c2bb9cf73dfaf7376ac74f38` | 462229 |

Hashes identify the handed-off JPEG bytes, not legal rights, visual accuracy or reproducibility. The depicted process includes details beyond the frozen contact-lead functional contract.

## Exact generation prompts

### `step1-form.jpg`

```text
High-fidelity, production-quality full-bleed edge-to-edge web canvas with no floating window and no exterior drop shadow of a modern web application UI for an architectural studio contact & lead consultation form. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Two-column layout: left column highlights studio identity, address in London, consultation process steps, and typical response time (< 24 hrs). Right column displays clean accessible contact form: Full Name, Work Email, Project Scope dropdown (Residential Renovation, Commercial Build, Interior Architecture), Budget range selector, Message textarea with character count, and 'Send Consultation Request' button. Accessible focus rings, modern system typography, balanced spacing.
```

### `step2-success.jpg`

```text
High-fidelity, production-quality full-bleed edge-to-edge web canvas with no floating window and no exterior drop shadow of a modern web application UI for an architectural studio contact consultation, Step 2: Submission Success State. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Centered card displaying verified submission confirmation: glowing green checkmark circle badge, headline 'Consultation Request Received', personalized subtext 'Thank you, Elena. Our lead architect will review your project details and reach out within 24 hours at elena@studio.com.', summary panel echoing project scope (Residential Renovation, Soho), reference token #LEAD-7301, and button 'Return to Home' + secondary 'Download Summary PDF'. Crisp typography, generous whitespace.
```

### `step3-refusal.jpg`

```text
Full-bleed desktop screenshot of a web application's own viewport: an architectural studio contact & lead consultation form, Invalid-Submit Refusal State. The application fills the entire 1376x768 frame edge to edge - no browser window, no OS title bar or traffic lights, no device frame, no page container, no rounded panel around the page, no surrounding background margin and no drop shadow around the interface. The only background visible is the application's own page colour (#0f172a), and it reaches all four edges. On that page: the studio's two-column consultation layout, left column carrying the studio identity, a London address block, a four-step consultation process list and a response-time pill reading under 24 hrs, right column carrying the contact form card (surface #1e293b) with Full Name, Work Email, Project Scope dropdown, Budget range selector, and a Message textarea with character count. The form is re-rendered after an empty submission was refused: a red error banner across the top of the form card reads 'Please complete the required fields to send your request', the Full Name, Work Email and Message fields are outlined in red with red helper text underneath reading 'This field is required', the emerald 'Send Consultation Request' button is unchanged, and no success confirmation appears anywhere because nothing was submitted or stored. Accessible focus states, modern system typography, generous padding.
```
