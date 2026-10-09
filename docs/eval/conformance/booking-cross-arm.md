# Cross-arm parity: booking

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Compares the 7 framework arms for `booking` with each other at 3 widths. Finds drift; does not gate it.

**What this measures:** layout and component structure. The underlying axes are structural, geometry and controls, and they are blind to text - two pages with different headings score 1.000. **What it does not do:** diff screenshots (no image decoder exists in this repository by design) or compare pixels against the reference boards, which are images.

**Arms:** hono, preact, raw, react, svelte, vue, webcomponents

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

## Against the reference boards

The boards are images, so what is compared is what they DECLARE - their palette - against each arm's computed tokens. Divergence here is expected on this repository: the generated arms use the pilot palette and have not adopted the boards' design.

| arm | token | declared | actual |
| --- | --- | --- | --- |
| hono | --bg | #0f172a | #ffffff |
| hono | --surface | #1e293b | not declared |
| hono | --accent | #10b981 | #1b4fd8 |
| hono | --muted | #94a3b8 | not declared |
| raw | --bg | #0f172a | #ffffff |
| raw | --surface | #1e293b | not declared |
| raw | --accent | #10b981 | #1b4fd8 |
| raw | --muted | #94a3b8 | not declared |
| react | --bg | #0f172a | #ffffff |
| react | --surface | #1e293b | not declared |
| react | --accent | #10b981 | #1b4fd8 |
| react | --muted | #94a3b8 | not declared |
| preact | --bg | #0f172a | #ffffff |
| preact | --surface | #1e293b | not declared |
| preact | --accent | #10b981 | #1b4fd8 |
| preact | --muted | #94a3b8 | not declared |
| vue | --bg | #0f172a | #ffffff |
| vue | --surface | #1e293b | not declared |
| vue | --accent | #10b981 | #1b4fd8 |
| vue | --muted | #94a3b8 | not declared |
| webcomponents | --bg | #0f172a | #ffffff |
| webcomponents | --surface | #1e293b | not declared |
| webcomponents | --accent | #10b981 | #1b4fd8 |
| webcomponents | --muted | #94a3b8 | not declared |
| svelte | --bg | #0f172a | #ffffff |
| svelte | --surface | #1e293b | not declared |
| svelte | --accent | #10b981 | #1b4fd8 |
| svelte | --muted | #94a3b8 | not declared |

## Screenshots

Saved for inspection (untracked run directory, full-page, one per arm and width):

- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-hono-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-raw-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-react-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-preact-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-vue-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-webcomponents-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-svelte-390x844.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-hono-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-raw-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-react-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-preact-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-vue-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-webcomponents-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-svelte-768x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-hono-1280x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-raw-1280x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-react-1280x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-preact-1280x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-vue-1280x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-webcomponents-1280x900.png`
- `.conformance-corpus/cross-arm-1791574072546/screenshots/booking-svelte-1280x900.png`

