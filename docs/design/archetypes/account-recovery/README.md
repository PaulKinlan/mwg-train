# Account recovery — illustrative recovery-state visual references

- **Archetype:** `account-recovery`; reset request, invalid-address refusal and depicted inbox notice.
- **Generation:** 2026-10-11 UTC: REGENERATED with an explicitly named model, replacing the 2026-10-09 boards (the owner rejected those on sight; bead `mwg-train-c1c`). The first set was produced with no explicit `model` and so fell back to `gemini-3-pro-image`, and its records could report that model but never attest it. `scripts/generate-archetype-boards.mjs` now passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway and refuses to write a board unless the response's own `modelVersion` attestation equals it, so every board here is gateway-attested as `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each board returned a 1376 × 768 JPEG. The prompts below are UNCHANGED - the generator reads them out of this file and refuses to run unless the Wave 2 prompts reproduce the digest register byte-for-byte, so this is the same brief rendered by a named model, not a new brief.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are design-planning rasters, not a functional reset flow, a sent message, a verified link, a generated-site capture, a sealed evaluation target or training/conformance evidence.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md).
- **Rights boundary:** The [Google consumer-account terms record](../../../provenance/accounts/google-antigravity-consumer.md) prohibits using AI-generated service content to develop machine-learning models. No separate image license clearance, exclusive rights or a seed were supplied - the generation settings are now recorded, and no seed was set, so the boards remain non-reproducible; public visual review grants no training or commercial reuse permission.
- **Depicted content:** The `alex@example.com` address, promised 15-minute expiry, resend countdown and one-time recovery link are unverified illustrative text. Do not infer that mail was sent, that a token exists, or that the screens meet the frozen account-recovery security contract. No password or credential from a real user is present.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-request.jpg`](step1-request.jpg) | Reset-link request form | `4426e0ca71c31013499a820fb8a21aa866b097ddcde61a1b8da302e194b447e2` | 382476 |
| [`step2-sent.jpg`](step2-sent.jpg) | Depicted check-your-inbox notice | `331771485fc540ef064ab9118e627fa860fb304815d62ab1090e4dbcd7bd57e4` | 389480 |
| [`step3-refusal.jpg`](step3-refusal.jpg) | Invalid-address refusal: the field's own constraint refuses an empty or malformed address before submission, the error announced in text (the contract-required state at plan.md:114, added by mwg-train-uh0o) | `a66fd4abe71f8a6cbe4a87b796e4d0fc74083aaa10af704a8b11560854aee97d` | 327161 |

Hashes pin the handed-off JPEG bytes, not rights, generation reproducibility or security validity.

## Exact generation prompts

### `step1-request.jpg`

```text
Modern web application UI for account recovery and password reset, Step 1: Request Reset Link. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Centered authentication card with company logo, heading 'Reset Your Password', clear subtitle 'Enter the email associated with your account and we\'ll send a secure one-time recovery link.', email address input with clear floating label and email icon, prominent emerald button 'Send Recovery Link', and secondary link 'Back to Sign In'. Modern accessible design, crisp system fonts, subtle border lines.
```

### `step2-sent.jpg`

```text
Modern web application UI for account recovery, Step 2: Email Sent Confirmation. Dark slate theme (#0f172a, card surface #1e293b, emerald green #10b981). Centered card displaying clean glowing email inbox icon, headline 'Check Your Inbox', friendly copy 'We have sent a password reset link to alex@example.com. The link expires in 15 minutes.', notice 'Didn\'t receive the email? Check your spam folder or Resend in 58s', and button 'Open Email App' + link 'Return to Sign In'. Modern accessible design, generous padding, balanced spacing.
```

### `step3-refusal.jpg`

```text
Full-bleed desktop screenshot of a web application's own viewport: an account recovery and password reset form, Invalid-Address Refusal State. The application fills the entire 1376x768 frame edge to edge - no browser window, no OS title bar or traffic lights, no device frame, no page container, no rounded panel around the page, no surrounding background margin and no drop shadow around the interface. The only background visible is the application's own page colour (#0f172a), and it reaches all four edges. On that page: the same centered authentication card (surface #1e293b) as the reset-request step, with the company logo, heading 'Reset Your Password', subtitle 'Enter the email associated with your account and we'll send a secure one-time recovery link.', and the email address input with its floating label and email icon. The address field is refused by its own constraint before submission: the input is outlined in red with aria-invalid styling, and a bound error message is revealed directly beneath the field reading 'Enter a valid email address (e.g. name@domain.com)' with a small red warning icon - the error is announced in text, not just colour. The emerald 'Send Recovery Link' button is present and unchanged, the secondary 'Back to Sign In' link remains, and no confirmation or sent state appears anywhere because the recovery route was never reached. Modern accessible design, crisp system fonts, subtle border lines, generous padding.
```