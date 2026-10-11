# Contact lead — illustrative two-step visual references

- **Archetype:** `contact-lead`; consultation form and depicted success state.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below are UNCHANGED - the generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so this is the same brief rendered by a named model, not a new brief.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual planning references only: not a working consultation form, a real submitted lead, a generated-site screenshot, a sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights, or a seed were supplied; the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible. Public visual review does not authorize training or commercial reuse.
- **Depicted content:** The London address, identity, named attendee, email address, response-time promise, reference token and PDF button are unverified illustrated placeholders. Do not send enquiries to the depicted contact or treat the success screen as evidence that an actual request was received. Form/accessibility behavior was not measured from these rasters.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-form.jpg`](step1-form.jpg) | Studio identity and consultation form | `2f66292d8c0f8e8800f8ce737cb83acf303d97dda38c5fc20299807a676454cf` | 486223 |
| [`step2-success.jpg`](step2-success.jpg) | Depicted acknowledgement and sample lead reference | `382dfbfe8865811372dd6ca32446fb711ae815232328d7b8f42b6f18c7cfed7f` | 414215 |

Hashes identify the handed-off JPEG bytes, not legal rights, visual accuracy or reproducibility. The depicted process includes details beyond the frozen contact-lead functional contract.

## Exact generation prompts

### `step1-form.jpg`

```text
Modern web application UI for an architectural studio contact & lead consultation form. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Two-column layout: left column highlights studio identity, address in London, consultation process steps, and typical response time (< 24 hrs). Right column displays clean accessible contact form: Full Name, Work Email, Project Scope dropdown (Residential Renovation, Commercial Build, Interior Architecture), Budget range selector, Message textarea with character count, and 'Send Consultation Request' button. Accessible focus rings, modern system typography, balanced spacing.
```

### `step2-success.jpg`

```text
Modern web application UI for an architectural studio contact consultation, Step 2: Submission Success State. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Centered card displaying verified submission confirmation: glowing green checkmark circle badge, headline 'Consultation Request Received', personalized subtext 'Thank you, Elena. Our lead architect will review your project details and reach out within 24 hours at elena@studio.com.', summary panel echoing project scope (Residential Renovation, Soho), reference token #LEAD-7301, and button 'Return to Home' + secondary 'Download Summary PDF'. Crisp typography, generous whitespace.
```
