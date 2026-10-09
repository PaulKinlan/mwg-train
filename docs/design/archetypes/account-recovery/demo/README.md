# Account recovery — standalone visual target demo

- **Archetype:** `account-recovery`; Wave 2 request and depicted inbox notice.
- **Status:** Hand-written static visual target and interactive design preview, not generated-site output.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. The linked JPEGs carry the same exclusion and the [source and rights boundary](../README.md). Do not add either the demo or the reference images to model-training, evaluation or conformance inputs.
- **Not the sealed evaluation target:** `docs/eval/targets/account-recovery/` and `data/A6_evaluation/` are untouched. This demo is not in `pilot/**`, is not a test result and does not implement the sealed account/session contract.
- **No committed screenshots:** [`compare.html`](compare.html) presents the two unchanged JPEGs beside live `index.html` iframes. Run on a static server or open the HTML files directly; no build, CDN, external assets, network requests or credentials are necessary.

## Translation from references

The two reference boards show an email-only reset request and an inbox confirmation sketch. This demo adopts their centered slate card (`#0f172a` page, `#1e293b` card), abstract mark, floating email label, emerald `#10b981` CTA, and outlined inbox icon. Its successful submit changes only local page state; the emailed-link, 15-minute expiry, and resend in the board are **not** implemented. The primary CTA uses dark `#04231a` text on emerald instead of the board's white because the white-on-emerald contrast falls below normal-text requirements. Text and controls remain readable in mobile and forced-colors modes. No images are reused as page backgrounds or trainable targets.

| Surface | Actual behavior |
| --- | --- |
| [`index.html`](index.html) | `form#reset-form` uses `input[name=email][type=email][required]`, native constraint validation, `:user-invalid` after interaction, and an ARIA invalid-state bridge. Its `POST /reset` action states the **unserved** contract route, but JavaScript intercepts the submit; the field and button stay disabled until the handler has initialized so a JS-disabled page cannot submit. A valid entry displays a local inbox preview containing the user-entered email as text, never as markup. |
| `index.html?state=sent` | Direct visual preview for the second board using the source's illustrative `alex@example.com` text. It displays the no-email-sent warning; no request or token is created. |
| [`compare.html`](compare.html) | Both original JPEGs and both live, interactive `index.html` states rendered in labeled iframes. The images retain their own [exact prompts, SHA-256 hashes, byte counts and consumer-rights boundary](../README.md). |

The countdown is only a visible local preview timer. At zero, **Restart preview** resets it without sending or requesting anything. **Open Email App** remains disabled because no message exists and no app is guaranteed; its adjacent explanation is visible. “Back to Sign In”/“Return to Sign In” stay within the preview; there is no sign-in page in this directory. A reader can enter a non-sensitive address to inspect the UI, but should not enter a real account address: the demo echoes it locally and does not store it.

## Distinct from the functional contract

[`docs/eval/specs/account-recovery.json`](../../../../eval/specs/account-recovery.json) defines **sign-up** (`form#signup-form`, email/password/displayName, server session cookie and display-name echo) and a declared `POST /reset` → `GET /reset/:ref` journey. The boards depict only the **reset-request** portion. This demo therefore does **not** implement signup, sessions, cookie flags, persistence, actual reset endpoints, tokens, delivery, a security claim, an expiry guarantee, or an error-state board. `form#reset-form` is a visual proxy only; it is not a substitute for that spec. No real password field is created and no password is requested or stored. The reference board's `alex@example.com` and success text are unverified illustrations, not a test result.

## Verification

Run `node scripts/verify-account-recovery-demo.mjs` from the repository root. It opens a bounded headless browser with a read-only local static server, checks native validation, inert submit, valid preview transition and echoed address, countdown behavior, keyboard return, both comparison iframes, JPEG decoding, and overflow at 390px, 768px, and 1280px; it places screenshots and machine-readable evidence in `/tmp/xvd-recovery-*`, not the repository. This check verifies the **static demo** only. `npm run check:baseline-label` classifies this README as design documentation; the source-board README and central record remain provenance.
