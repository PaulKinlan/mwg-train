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

## Against the reference boards, in pixels

These visual metrics compare quantised colour distribution, mean luminance, ink coverage, and coarse 32-band horizontal and vertical structure across rendered images. They do not establish that a layout, component hierarchy, or specific design element is correct, nor do they verify semantic markup or typography. Two completely different designs can share identical global luminance, ink density, and colour histograms while looking visually distinct to a human.

Boards analysed: `step1-browse.jpg`, `step2-form.jpg`, `step3-confirmation.jpg`, `step4-error.jpg`, `step5-empty.jpg`.

| arm | viewport | closest board | distance | finding codes | screenshot |
| --- | --- | --- | --- | --- | --- |
| hono | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-hono-390x844.png` |
| raw | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-raw-390x844.png` |
| react | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-react-390x844.png` |
| preact | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-preact-390x844.png` |
| vue | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-vue-390x844.png` |
| webcomponents | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-webcomponents-390x844.png` |
| svelte | 390x844 | `step3-confirmation.jpg` | 0.925 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-svelte-390x844.png` |
| hono | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-hono-768x900.png` |
| raw | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-raw-768x900.png` |
| react | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-react-768x900.png` |
| preact | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-preact-768x900.png` |
| vue | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-vue-768x900.png` |
| webcomponents | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-webcomponents-768x900.png` |
| svelte | 768x900 | `step3-confirmation.jpg` | 0.9512 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-svelte-768x900.png` |
| hono | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-hono-1280x900.png` |
| raw | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-raw-1280x900.png` |
| react | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-react-1280x900.png` |
| preact | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-preact-1280x900.png` |
| vue | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-vue-1280x900.png` |
| webcomponents | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-webcomponents-1280x900.png` |
| svelte | 1280x900 | `step3-confirmation.jpg` | 0.9652 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-svelte-1280x900.png` |

The distance is the mean absolute difference across the 32 row bands and the 32 column bands, averaged - stated here because a distance nobody can recompute is a number nobody can check. Nearer is closer; the closest board is named per arm, not assumed.

## Screenshots

Saved for inspection (untracked run directory, full-page, one per arm and width):

- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-hono-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-raw-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-react-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-preact-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-vue-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-webcomponents-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-svelte-390x844.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-hono-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-raw-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-react-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-preact-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-vue-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-webcomponents-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-svelte-768x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-hono-1280x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-raw-1280x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-react-1280x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-preact-1280x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-vue-1280x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-webcomponents-1280x900.png`
- `.conformance-corpus/cross-arm-1791574570198/screenshots/booking-svelte-1280x900.png`

