# Contact lead — illustrative two-step visual references

- **Archetype:** `contact-lead`; consultation form and depicted success state.
- **Generation:** 2026-10-09 UTC via the Google Antigravity OAuth `generate_image` tool. The generating lane reports its default model as `gemini-3-pro-image`; tool calls omitted an explicit `model` parameter and responses contained paths, not an attested model ID. Both requested `aspectRatio: "16:9"` and returned 1376 × 768 JPEGs. The exact tool-call prompt strings appear below.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual planning references only: not a working consultation form, a real submitted lead, a generated-site screenshot, a sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights, or reproducible generation seed/settings were supplied. Public visual review does not authorize training or commercial reuse.
- **Depicted content:** The London address, identity, named attendee, email address, response-time promise, reference token and PDF button are unverified illustrated placeholders. Do not send enquiries to the depicted contact or treat the success screen as evidence that an actual request was received. Form/accessibility behavior was not measured from these rasters.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-form.jpg`](step1-form.jpg) | Studio identity and consultation form | `da3e24a25265d96d100831dded90d4d930e53e9b0e47cfb36d24b2f024182a9e` | 483798 |
| [`step2-success.jpg`](step2-success.jpg) | Depicted acknowledgement and sample lead reference | `2afa857d88c56740f6ec58bc77fb5e2e9801c915791f1851e1e0e55d22984724` | 359025 |

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
