# Signal Grid — game-board image briefs

**Status: Eight 1376 × 768 illustrative reference JPEGs are committed (four Light, four Dark).** Only the original Light Step 1 retains the `mwg-train-1ddf` generation record; the other seven were imported from scratch files without retained model/prompt attestation. [PROVENANCE.md](PROVENANCE.md) pins the exact current JPEGs and separates the original verdict from unverified replacements. Read the [functional plan](plan.md) and [authored design](design.md) without inferring that a playable game shipped.

**Rights and spending:** `excluded_from_training: true`, `approved_for_training: false`. A later model output needs independent rights and reuse clearance; the [consumer-account rights record](../../../provenance/accounts/google-antigravity-consumer.md) does not grant use of generated service content to develop a model. No image-model calls until explicit amount-scoped approval, exact model tariff and a fail-closed reservation exist. The fictional frequencies are puzzle tokens, not measured acoustic performance; 14-move win, 01:48 timer and browser-local streak figures in the final image are storyboard content, not observed statistics.

## Theme-control state

The header's two-option “Daylight / Night” control must depict which theme is active. The Light and Dark twins are the pair a reader compares to see that it does, so the control has to answer differently on the two pages: a filled segment alone is not enough, because at 1376 × 768 a tint difference that never changes between the twins is indistinguishable from decoration and conveys no state at all. The ACTIVE theme's segment is therefore filled **and** carries a check glyph; the other segment is flat and unmarked.

| Board | Depicted theme | Active segment |
| --- | --- | --- |
| `step1-board-initial.jpg` | Light | `DAYLIGHT` |
| `step2-midgame-interaction.jpg` | Light | `DAYLIGHT` |
| `step3-invalid-collision-state.jpg` | Light | `DAYLIGHT` |
| `step4-victory-stats-dialog.jpg` | Light | `DAYLIGHT` |
| `dark/step1-board-initial.jpg` | Night | `NIGHT` |
| `dark/step2-midgame-interaction.jpg` | Night | `NIGHT` |
| `dark/step3-invalid-collision-state.jpg` | Night | `NIGHT` |
| `dark/step4-victory-stats-dialog.jpg` | Night | `NIGHT` |

This table is the required state for the next generation, **not** an observation of the committed bytes. The four top-level boards are the Light page and the four `dark/` boards are its Night twin, so every step contributes one pair that must mark a different segment: the Daylight twin marks `DAYLIGHT`, the Night twin marks `NIGHT`. All eight committed boards predate this rule and currently emphasise the DAYLIGHT segment, including the four night-mode ones (bead `mwg-train-zeci`); they stay in the tree as the illustrative reference set they are, and nothing here claims they conform. `npm run check:state-controls` fails if the table, an authored prompt or the depicted theme stop agreeing, or if the Light and Dark twin of **any** step end up marking the same segment.

## Dialog chrome

The Step 4 brief asks for a native site-owned `<dialog>`, so the victory panel must be drawn without OS window controls: no minimise, maximise or close glyphs, no `- [] X` triad, monochrome or coloured. Every step's prompt already rules out browser chrome, window frames and tab bars; that wording did not stop a generated victory panel being drawn with a window-control set, so the Step 4 exclusion now names the glyphs themselves and repeats it at the dialog.

`npm run check:archetype-frames` holds the pixels to it: the frame scan now reads a minimise bar followed by two box-sized glyphs on one baseline in the top-right corner as window chrome, next to the macOS dot detection it already had. Both committed Step 4 boards carry a monochrome `- [] X` set in the dialog's top-right corner (bead `mwg-train-m5ws`), so they are recorded as reviewed deviations in [`.fleet/frame-scan-pins.json`](../../../../.fleet/frame-scan-pins.json) instead of being passed silently - a replacement at either path is decoded and fails the gate until it is reviewed. They stay in the tree as the illustrative boards they are, and nothing here claims they conform.

## Exact proposed image prompts

Each block requests one **1376 × 768 (16:9)** full-page JPEG. They represent successive visual states of ONE dark navy Signal Grid site, not four OS or browser windows. Keep tile coordinates, emitter positions, tool labels, color/pattern language and the puzzle identity coherent across the set; final geometry/solver must still be verified by a future functional implementation. No image hash or model identity is implied by a text prompt.

### `step1-board-initial.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of a fictional web game named “Signal Grid — Daily Puzzle #142 · 14 Oct 2026”, STEP 1: Initial Daily Puzzle Board & Component Palette in TACTILE DAYLIGHT ARCADE MODE (NYT Games / Playdate / Teenage Engineering aesthetic). Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Use #fffbeb warm cream paper for the page ground, #ffffff crisp tactile grid tiles with 2px #18181b ink borders, deep teal #0d9488 for the symbolic 440 Hz source and warm ochre-amber #d97706 for the symbolic 660 Hz source, and sharp #18181b ink labels. At the top within the SITE page, a compact Signal Grid #142 header bar shows timer “00:00”, “Moves 0 / Par 14”, a labelled Web Audio “Sound off” toggle, “Daylight / Night” theme pill, “How to Play” and “Stats” buttons; in that header bar the “Daylight / Night” theme pill shows the DAYLIGHT segment filled with a check glyph and the NIGHT segment flat and unmarked. Centre a large, readable 6×6 puzzle grid with column coordinates A–F and row coordinates 1–6, source emitters labelled “440 Hz Teal” and “660 Hz Amber” at the perimeter, and two matching receiver symbols at the perimeter; the cells begin empty. Below the board, show four tactile hardware-style placeable component buttons “Mirror /” (1), “Splitter +” (2), “Phase Filter” (3), “Eraser” (4), plus compact keyboard hints “Arrows move · Space place · Z undo”. Warm cream page ink continues to every image edge.
```

### `step2-midgame-interaction.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the SAME fictional “Signal Grid — Daily Puzzle #142 · 14 Oct 2026” WEB PAGE, STEP 2: Active Signal Routing & Live Waveform Oscilloscope in TACTILE DAYLIGHT ARCADE MODE. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Maintain #fffbeb warm cream ground, #ffffff 6×6 tile grid with crisp #18181b borders, A–F and 1–6 coordinates, symbolic deep teal #0d9488 440 Hz and warm amber #d97706 660 Hz source/receiver identity, and the same site-owned top bar and tactile component toolbar as step 1, where the “Daylight / Night” theme pill shows the DAYLIGHT segment filled with a check glyph and the NIGHT segment flat and unmarked. The central board now depicts NINE placed components (mirrors, a splitter and phase filter), two finite readable signal routes with solid teal and dashed amber stroke patterns reflecting across tiles, and a first receiver visibly locked. Place a labelled right-hand dark-screen oscilloscope <canvas> panel (#18181b inset screen) with a clean combined interference waveform. Beneath it a compact move-history stack shows recent placements, an “Undo (Z)” button and Reset. A legible status line outside the canvas states “Receiver A locked at 440 Hz — 1 receiver remaining”. The single page fills the entire image.
```

### `step3-invalid-collision-state.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the SAME fictional “Signal Grid — Daily Puzzle #142 · 14 Oct 2026” WEB PAGE, STEP 3: Rejected Phase Collision at tile D4 in TACTILE DAYLIGHT ARCADE MODE. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Keep #fffbeb warm cream paper ground, #ffffff crisp tactile 6×6 grid tiles with 2px #18181b ink borders, A–F and 1–6 coordinates, deep teal #0d9488 and warm ochre-amber #d97706 paths, the same top bar, toolbar and right-hand oscilloscope panel; in the top bar the “Daylight / Night” theme pill shows the DAYLIGHT segment filled with a check glyph and the NIGHT segment flat and unmarked. Show the teal and amber beams attempting a head-on crossing at D4. D4 has a high-contrast coral-red #f43f5e hazard icon, dashed border and textual “Collision at D4” badge. A clearly legible inline diagnostic banner states “Incompatible frequencies crossed on D4 — place a Phase Splitter or reroute”. The affected receiver says “Signal clipped”. Show the recovery choices “Splitter +” and “Undo (Z)”. Page ink reaches every image edge.
```

### `step4-victory-stats-dialog.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the SAME fictional “Signal Grid — Daily Puzzle #142 · 14 Oct 2026” WEB PAGE, STEP 4: Solved Puzzle & Streak Statistics dialog in TACTILE DAYLIGHT ARCADE MODE over the retained Daylight page. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup, and NO OS window controls on the dialog or on any panel (no minimise, maximise or close glyphs, no “- [] X” triad, monochrome or coloured). Retain the #fffbeb warm cream paper ground and #ffffff 6×6 A–F/1–6 tile grid with the deep teal #0d9488 and warm ochre-amber #d97706 routes; in the retained top bar the “Daylight / Night” theme pill shows the DAYLIGHT segment filled with a check glyph and the NIGHT segment flat and unmarked. Both receivers in the background now have #10b981 emerald LOCKED state with checkmarks and text. Centre a native site-owned <dialog> victory panel (#ffffff crisp card with 2px #18181b ink border, no title bar and no window controls of any kind) over a dimmed IN-PAGE backdrop. The dialog heading reads “Puzzle solved”, its summary reads “Solved in 14 moves (Par 14) · 01:48”. Show four labelled statistic figures: “Played 38”, “Win 97%”, “Current Streak 12”, “Best Streak 19”, and a horizontal move-distribution histogram. Include a Close control, deep teal “Copy Spoiler-Free Grid” button and a small “Copied to clipboard!” confirmation badge.
```

## Committed boards; provenance and behaviour still pending

All eight Light/Dark JPEGs exist in this tree, and [PROVENANCE.md](PROVENANCE.md) pins their current byte hashes, sizes and measured dimensions. **Only the original Light Step 1 has an attested generation record.** The other seven are committed scratch imports without retained response `modelVersion`, input prompts or individual vision receipts; the authored blocks above are not evidence of their generation inputs. Do not label those replacements as `gemini-3.1-flash-image` or infer identity from a configured model or from `npm run check:archetype-frames`, which checks appearance rather than model provenance. Any authorised future replacement needs a fresh response, exact input prompt, byte/dimension evidence and full-resolution frame/coordinate/error-marker inspection in a separately reviewed asset register. No still image proves a 14-move solution or functioning Canvas/WebAudio/clipboard interaction; a separate browser-driven test must establish those claims.
