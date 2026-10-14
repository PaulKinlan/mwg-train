# Account recovery — illustrative recovery-state visual references

- **Archetype:** `account-recovery`; reset request, invalid-address refusal and depicted inbox notice.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below are UNCHANGED - the generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so this is the same brief rendered by a named model, not a new brief.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are design-planning rasters, not a functional reset flow, a sent message, a verified link, a generated-site capture, a sealed evaluation target or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate image license clearance, exclusive rights or a seed were supplied - the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible; public visual review grants no training or commercial reuse permission.
- **Depicted content:** The `alex@example.com` address, promised 15-minute expiry, resend countdown and one-time recovery link are unverified illustrative text. Do not infer that mail was sent, that a token exists, or that the screens meet the frozen account-recovery security contract. No password or credential from a real user is present.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-request.jpg`](step1-request.jpg) | Reset-link request form | `1a6989fb1979ebd0c7a1b8691f4df0f0843fdec994a8328ad54fc1756d187da2` | 160681 |
| [`step2-sent.jpg`](step2-sent.jpg) | Depicted check-your-inbox notice | `c0a1d752ae068d34fcfb146c4ded4629192ca45a4d46b33ca9113f90984aaa4d` | 404248 |
| [`step3-refusal.jpg`](step3-refusal.jpg) | Invalid-address refusal: the field's own constraint refuses an empty or malformed address before submission, the error announced in text (the contract-required state at plan.md:114, added by mwg-train-uh0o) | `a51fb224518f52a8519d0c73bb0ffbc3e815fd124e935910fe906d7a2c6b1f00` | 141923 |

Hashes pin the handed-off JPEG bytes, not rights, generation reproducibility or security validity.

## Exact generation prompts

### `step1-request.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern enterprise identity & security web application UI for "Vanguard Identity", Step 1: Request Reset Link in crisp DAYLIGHT LIGHT MODE (#f8fafc cool alabaster page background reaching all four edges, #ffffff elevated authentication card with 1px #e2e8f0 hairline border, #0f172a deep ink typography, royal cobalt #2563eb primary action button). Top security header bar with Vanguard shield wordmark and "System Status: Operational" pill. Centered authentication card with heading "Reset Your Password", subtitle "Enter the work email associated with your Vanguard account and we'll send a one-time cryptographic recovery link.", floating-label email input with mail icon, prominent royal cobalt button "Send Recovery Link", passkey alternative link, and secondary link "Back to Sign In". Crisp Swiss geometric sans typography, accessible focus rings.
```

### `step2-sent.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern enterprise identity & security web application UI for "Vanguard Identity", Step 2: Email Sent Confirmation in sleek CARBON-INDIGO DARK MODE (#0c0a1d deep midnight-indigo page ground reaching all four edges, #16132d elevated surface card with #2e2952 border, luminous indigo #6366f1 accent, #f8fafc crisp white text). Top header shows an active "Dark appearance" toggle pill. Centered card displaying a glowing indigo envelope-check badge, headline "Check Your Inbox", clear copy "We sent a one-time recovery link to alex@example.com. The link expires in 15 minutes.", security fingerprint badge "Request ID: VG-8841-AUTH", notice "Didn't receive the email? Check spam or Resend in 58s", primary indigo button "Open Email App", and link "Return to Sign In".
```

### `step3-refusal.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Modern enterprise identity & security web application UI for "Vanguard Identity", Step 3: Invalid-Address Refusal State in crisp DAYLIGHT LIGHT MODE (#f8fafc cool alabaster page background reaching all four edges, #ffffff centered authentication card with #e2e8f0 border, #0f172a deep ink, royal cobalt #2563eb button). Same centered authentication card as Step 1 ("Reset Your Password"), refused by client/server constraint before submission: the email input contains malformed text "alex@@example" and is outlined in 2px crimson #dc2626 with aria-invalid styling and a rose #fef2f2 background tint; directly beneath the field, a bound error message with a warning icon reads "Enter a valid email address (e.g. name@domain.com)". The royal cobalt "Send Recovery Link" button and "Back to Sign In" link remain visible, and no sent confirmation appears anywhere.
```