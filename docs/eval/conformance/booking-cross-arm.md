# Cross-arm parity: booking

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Compares the 7 framework arms for `booking` with each other at 3 widths. Finds drift; does not gate it.

**What this measures:** layout and component structure. The underlying axes are structural, geometry and controls, and they are blind to text - two pages with different headings score 1.000. **What it does not do:** diff screenshots (no image decoder exists in this repository by design) or compare pixels against the reference boards, which are images.

**Arms:** hono, preact, raw, react, svelte, vue, webcomponents

**The budget is not a dial.** These are the repository's preregistered `IDENTITY_BUDGET` values from `src/eval/targets.mjs` (structural 0.75, geometry 0.9, controls 0.95, overall 0.8), used unchanged. If the arms disagree, the disagreement is reported - the thresholds are not moved until the report reads green.

## 390x844

- measured: hono, preact, raw, react, svelte, vue, webcomponents
- identity: structural 0.9908, geometry 1, controls 1, overall 0.9963
- weakest pair: hono/webcomponents overall 0.9871

No drift below budget at this width.

## 768x900

- measured: hono, preact, raw, react, svelte, vue, webcomponents
- identity: structural 0.9908, geometry 1, controls 1, overall 0.9963
- weakest pair: hono/webcomponents overall 0.9871

No drift below budget at this width.

## 1280x900

- measured: hono, preact, raw, react, svelte, vue, webcomponents
- identity: structural 0.9908, geometry 1, controls 1, overall 0.9963
- weakest pair: hono/webcomponents overall 0.9871

No drift below budget at this width.

## Reference boards

**Reference boards:** 0 analysed.

The boards are images, so what is compared is what they DECLARE - their palette - against each arm's computed tokens. Divergence here is expected on this repository: the generated arms use the pilot palette and have not adopted the boards' design.

| arm | token | declared | actual | viewports |
| --- | --- | --- | --- | --- |
| hono | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| hono | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| hono | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| hono | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| hono | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| raw | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| raw | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| raw | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| raw | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| raw | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| react | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| react | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| react | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| react | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| react | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| preact | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| preact | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| preact | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| preact | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| preact | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| vue | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| vue | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| vue | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| vue | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| vue | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| webcomponents | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| webcomponents | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| webcomponents | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| webcomponents | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| webcomponents | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| svelte | --bg | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |
| svelte | --surface | #1e293b | not declared | 390x844, 768x900, 1280x900 |
| svelte | --accent | #10b981 | #1b4fd8 | 390x844, 768x900, 1280x900 |
| svelte | --muted | #94a3b8 | not declared | 390x844, 768x900, 1280x900 |
| svelte | body-background | #0f172a | #ffffff | 390x844, 768x900, 1280x900 |

## Screenshots

Saved for inspection (untracked run directory, full-page, one per arm and width):

- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-hono-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-raw-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-react-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-preact-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-vue-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-webcomponents-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-svelte-390x844.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-hono-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-raw-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-react-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-preact-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-vue-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-webcomponents-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-svelte-768x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-hono-1280x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-raw-1280x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-react-1280x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-preact-1280x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-vue-1280x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-webcomponents-1280x900.png`
- `.conformance-corpus/cross-arm-1791574495042/screenshots/booking-svelte-1280x900.png`

