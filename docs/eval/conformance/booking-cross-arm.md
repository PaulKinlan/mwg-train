# Cross-arm parity: booking

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Compares the 7 framework arms for `booking` with each other at 3 widths, and compares every arm screenshot against the reference boards in pixels. Finds drift; does not gate it unless `--strict` is passed.

**What this measures:** layout and component structure between arms (structural, geometry, controls - blind to text), and real pixels against the boards. **What it does not do:** a per-pixel image diff; the board comparison uses colour distribution, luminance, ink coverage and coarse band structure, and two images can share all of those while looking different.

**Arms:** hono, preact, raw, react, svelte, vue, webcomponents

**The budget is not a dial.** These are the repository's preregistered `IDENTITY_BUDGET` values from `src/eval/targets.mjs` (structural 0.75, geometry 0.9, controls 0.95, overall 0.8), used unchanged. If the arms disagree, the disagreement is reported - the thresholds are not moved until the report reads green.

## 390x844

- measured: hono, preact, raw, react, svelte, vue, webcomponents
- identity: structural 0.9908, geometry 1, controls 1, overall 0.9963
- weakest pair: hono/webcomponents overall 0.9871

No drift above budget at this width.

## 768x900

- measured: hono, preact, raw, react, svelte, vue, webcomponents
- identity: structural 0.9908, geometry 1, controls 1, overall 0.9963
- weakest pair: hono/webcomponents overall 0.9871

No drift above budget at this width.

## 1280x900

- measured: hono, preact, raw, react, svelte, vue, webcomponents
- identity: structural 0.9908, geometry 1, controls 1, overall 0.9963
- weakest pair: hono/webcomponents overall 0.9871

No drift above budget at this width.

## Reference boards

**Reference boards:** 5 analysed.

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

These visual metrics compare quantised colour distribution, mean luminance, ink coverage, and the SHAPE of the 32-band mean-luminance profile horizontally and vertically across rendered images. Shape is judged by correlation between the two profiles, so it does not depend on how bright either image is. Two profiles with NO variation have the same shape - a flat line - and score 0 on the shape term; one flat against one varied cannot be compared and fails closed at 1 FOR THAT TERM, rather than being scored as identical. The distance between two images averages THREE terms - that shape difference, the difference in their mean luminance, and the difference in their contrast (twice the difference in spread) - because shape alone cannot see contrast, brightness alone saturates, and shape plus brightness together scored a half-dark/half-light image as identical to a flat one of the same mean. Measured on the reference boards, ink coverage is 98.6-99.5% for all five, which is why ink is not a term. They do not establish that a layout, component hierarchy, or specific design element is correct, nor do they verify semantic markup or typography. Two completely different designs can share global luminance, ink density and colour histograms while looking visually distinct to a human.

Boards analysed: `step1-browse.jpg`, `step2-form.jpg`, `step3-confirmation.jpg`, `step4-error.jpg`, `step5-empty.jpg`.

| arm | viewport | closest board | distance | finding codes | screenshot |
| --- | --- | --- | --- | --- | --- |
| hono | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-hono-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| raw | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-raw-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| react | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-react-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| preact | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-preact-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| vue | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-vue-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| webcomponents | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-webcomponents-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| svelte | 390x844 | `step2-form.jpg` | 0.3949 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-svelte-390x844.png` |
| | | _terms_ | shape 0.4365 / brightness 0.777 / contrast 0.0194 (rows) | shape 0.338 / brightness 0.7769 / contrast 0.0218 (columns) | |
| hono | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-hono-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| raw | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-raw-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| react | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-react-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| preact | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-preact-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| vue | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-vue-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| webcomponents | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-webcomponents-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| svelte | 768x900 | `step5-empty.jpg` | 0.4174 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-svelte-768x900.png` |
| | | _terms_ | shape 0.4411 / brightness 0.8299 / contrast 0.0018 (rows) | shape 0.385 / brightness 0.8299 / contrast 0.0168 (columns) | |
| hono | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-hono-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |
| raw | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-raw-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |
| react | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-react-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |
| preact | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-preact-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |
| vue | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-vue-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |
| webcomponents | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-webcomponents-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |
| svelte | 1280x900 | `step2-form.jpg` | 0.4371 | BOARD_PALETTE_NOT_SHARED, BOARD_LUMINANCE_DIVERGES, BOARD_INK_DIVERGES, BOARD_STRUCTURE_DIVERGES | `booking-svelte-1280x900.png` |
| | | _terms_ | shape 0.5327 / brightness 0.8031 / contrast 0.088 (rows) | shape 0.3547 / brightness 0.8031 / contrast 0.0412 (columns) | |

The distance is the average of THREE terms, computed for the 32 row bands and the 32 column bands of mean luminance and then averaged across those two: how differently the two profiles are SHAPED (one minus their correlation, halved, and 1 when one profile has no variation), how different their average brightnesses are, and how different their CONTRAST is (twice the difference in spread). Stated here because a distance nobody can recompute is a number nobody can check, and the band values and the per-pair terms are in the JSON beside it. Reachable range: a pure brightness difference cannot exceed 0.333, and the highest the average can go is about 0.873 - a flat profile at one extreme against a maximally banded one, where shape fails closed at 1 and brightness and contrast are both high. It does NOT reach 1: any maximal brightness difference forces both profiles flat, which zeroes the other two terms. Nearer is closer; the closest board is named per arm, not assumed.

## Between the arms, in pixels

63 arm pairs were compared in pixels across 3 widths (21 per width on average). The budget is 0.05: the arms are one specification rendered by seven frameworks from one stylesheet, so they should be near-identical, and the CLOSEST pair measured in this run is reported here as the empirical floor for rendering noise rather than asserted.

- Closest pair (the floor): `webcomponents` vs `svelte` at 1280x900, distance 0 - terms: rows shape 0 / brightness 0 / contrast 0; columns shape 0 / brightness 0 / contrast 0
- Furthest pair: `hono` vs `preact` at 390x844, distance 0 - terms: rows shape 0 / brightness 0 / contrast 0; columns shape 0 / brightness 0 / contrast 0

No pair of arms diverged in pixels by more than 0.05.

## Screenshots

Saved for inspection (untracked run directory, full-page, one per arm and width):

- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-hono-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-raw-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-react-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-preact-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-vue-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-webcomponents-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-svelte-390x844.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-hono-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-raw-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-react-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-preact-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-vue-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-webcomponents-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-svelte-768x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-hono-1280x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-raw-1280x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-react-1280x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-preact-1280x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-vue-1280x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-webcomponents-1280x900.png`
- `.conformance-corpus/cross-arm-1791580362163/screenshots/booking-svelte-1280x900.png`

