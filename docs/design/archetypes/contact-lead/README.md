# Contact lead — illustrative consultation-state visual references

- **Archetype:** `contact-lead`; consultation form, invalid-submit refusal and depicted success state.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below were edited (2026-10-11 UTC) to explicitly mandate a full-bleed web canvas and ban floating window frames. The generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so the updated hashes are strictly pinned.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. Visual planning references only: not a working consultation form, a real submitted lead, a generated-site screenshot, a sealed evaluation target, or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate license clearance, exclusive rights, or a seed were supplied; the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible. Public visual review does not authorize training or commercial reuse.
- **Depicted content:** The London address, identity, named attendee, email address, response-time promise, reference token and PDF button are unverified illustrated placeholders. Do not send enquiries to the depicted contact or treat the success screen as evidence that an actual request was received. Form/accessibility behavior was not measured from these rasters.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-form.jpg`](step1-form.jpg) | Studio identity and consultation form | `d2e215fd7f8047606069818583c4160f0002a194dee58f22e50f570124d8e6ec` | 484041 |
| [`step2-success.jpg`](step2-success.jpg) | Depicted acknowledgement and sample lead reference | `f1c840aa1527daec74837cdde69ae94d7b4b3cde3eb82af702f0797985dcd6c3` | 314966 |
| [`step3-refusal.jpg`](step3-refusal.jpg) | Invalid-submit refusal: the form re-rendered with a banner and field errors, nothing stored (the contract-required state at plan.md:54, added by mwg-train-cdp0) | `1c2e3377fef36e2a23a91b7f4e7c9bf1bd9a6b3be1ffcfe6f53527439cbf8925` | 407366 |

Hashes identify the handed-off JPEG bytes, not legal rights, visual accuracy or reproducibility. The depicted process includes details beyond the frozen contact-lead functional contract.

## Exact generation prompts

### `step1-form.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern Swiss architectural monograph & studio consultation UI for "Atelier Wren Architecture · London", Step 1: Consultation Request Form in ARCHITECTURAL TRAVERTINE LIGHT MODE (#f4f4f0 warm travertine/chalk page ground reaching all four edges, #ffffff precision form surface, exposed 1px solid #d4d4d0 structural grid hairlines, #18181b stark graphite neo-grotesque typography, international orange / vermilion #ea580c primary CTA button). Two-column Swiss grid layout: left column presents studio identity, Clerkenwell London address, 4 numbered consultation stages (01 Feasibility, 02 Spatial Brief, 03 Planning, 04 Detail), and response SLA pill "< 24 hrs response". Right column displays an accessible consultation form: Full Name, Work Email, Project Scope dropdown (Residential Renovation, Civic Timber Build, Gallery Retrofit), Budget Band radio pills, Project Brief textarea with character counter, and bold vermilion button "Send Consultation Request".
```

### `step2-success.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern Swiss architectural monograph & studio consultation UI for "Atelier Wren Architecture · London", Step 2: Submission Confirmation in MONOLITH CAST-IRON DARK MODE (#18181b architectural cast-iron dark ground reaching all four edges, #27272a precision dossier card with 1px #3f3f46 structural grid lines, #fafaf9 chalk white typography, #ea580c vermilion accent and #22c55e verified check badge). Centered architectural dossier card displaying a crisp green check badge, headline "Consultation Request Received", personalized subtext "Thank you, Elena. Senior Partner Marcus Vance will review your spatial brief and respond within 24 hours at elena@studio.com.", structured specification table echoing Project Scope (Residential Renovation, Soho) and Reference Token "#LEAD-7301", primary vermilion button "Return to Practice Index", and secondary button "Download Dossier PDF".
```

### `step3-refusal.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Full-bleed desktop viewport of "Atelier Wren Architecture · London" consultation form, Step 3: Invalid-Submit Refusal State in ARCHITECTURAL TRAVERTINE LIGHT MODE (#f4f4f0 travertine page ground reaching all four edges, #ffffff form card with exposed 1px #d4d4d0 structural grid lines, #18181b graphite typography, #ea580c vermilion button). Left column keeps the Clerkenwell London address, four-step consultation list, and "< 24 hrs" pill. Right column shows the consultation form re-rendered after an empty submission was refused: a stark crimson error banner (#fef2f2 fill, #dc2626 border) across the top of the form card reads "Please complete the required fields to send your request", and the Full Name, Work Email, and Message fields carry 2px #dc2626 red outlines with inline helper text "This field is required". The vermilion "Send Consultation Request" button remains unchanged and no confirmation state appears.
```
