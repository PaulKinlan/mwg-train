---
archetype: browser-puzzle-game
type: game
boards: docs/design/archetypes/browser-puzzle-game/
register: docs/design/archetypes/browser-puzzle-game/PROVENANCE.md
---

# `browser-puzzle-game` — authored visual system

**Planning, not generated-image evidence.** Signal Grid is a fictional game in a brief. The palette and four frames below describe intended art direction; no gameplay, solved puzzle, canvas output, Web Audio, streak data or model-produced pixels exist yet. Behaviour belongs to [`plan.md`](plan.md).

## Direction contract

**THESIS:** A bench-top signal-routing puzzle whose board is understandable before any glow or waveform begins; refuse a decorative 6 × 6 background that no one can play.

**OWN-WORLD:** Deep navy field, discrete slate cells, two specific cyan/amber signal tracks, disciplined white annotations and one distinct green solved state. Geometry, not neon fog, carries the game.

**STORY:** Inspect the two emitters, route nine components, diagnose a D4 collision, solve by reproducible moves, then share a spoiler-free grid.

**FIRST VIEWPORT:** Identity/timer/moves on a restrained top strip; large central 6 × 6 board with readable coordinates and source/receiver marks; component palette immediately below; rules one reach away.

**FORM:** Brief-pinned daily puzzle. Impeccable concept-seed unavailable on this VM, so no seed key exists. Signature feedback: finite beams change with placement, mirrored in an optional oscilloscope.

**FINISH:** Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Visual thesis

The board is a compact instrument panel, not a pixel-art wallpaper: a player can see each coordinate, beam route, target and tool at once. The first state is quiet navy until the player starts; the second introduces two geometric signal paths and their derived waveform; the third interrupts with a D4 hazard icon, dashed edge and explicit sentence; the fourth quiets the grid behind a focused native victory dialog. This makes the four reference states legible without implying a still image proves playable logic.

The scene is a puzzle desk at night, under task lighting: navy for prolonged focus, slate tile boundaries to support precision, cyan and amber to distinguish symbolic frequencies, green reserved for correctly locked receivers. Color is **never** the only route to understanding; each state retains text, shape and position. No macOS traffic lights or browser/window frame belongs to the page artwork.

## Grammar and layout

- One fluid page, with a `header` containing Signal Grid #142, elapsed clock, `moves / Par 14`, sound-off toggle, rules and stats buttons. `main` owns instructions, board and tool palette; an optional `aside` holds the oscilloscope and move history only after the player has useful state. On narrow screens, aside follows the board rather than squeezing its cells into unreadable slivers.
- Central game board is visually a 6 × 6 grid with coordinates A–F and 1–6. A DOM grid of 36 named buttons/cells is the interactive layer and source of accessible state; a high-DPI `<canvas>` paints **decorative** geometric beams aligned to those cells. Both project the same game-state model. The canvas is `aria-hidden="true"`; without canvas the DOM cells and receiver summary remain sufficient.
- Resizing writes `canvas.width = cssWidth * cappedDPR`, `canvas.height = cssHeight * cappedDPR` and **replaces**, rather than accumulates, `context.setTransform(dpr, 0, 0, dpr, 0, 0)`. Draw frames only while visible and active; pause/cancel the pending RAF on `visibilitychange`, Reset, victory and teardown. Do not animate a hidden oscilloscope.
- Keyboard grid follows roving tabindex: one cell `tabindex="0"`, others `-1`; Arrow moves the current coordinate, Space places the active component, Z undoes only when focus is in the game context, and Tab reaches the palette, rules and dialogs in DOM order. Visible focus uses an outline with offset, not glow alone. Pointer drag uses `setPointerCapture` plus `pointerup`/`pointercancel` release; page scrolling outside the board remains native.
- Toolbar controls name their action and shortcut and do not rely on four ambiguous symbols. “Splitter +” is explicitly the Phase Splitter referred to by the collision diagnostic; “Phase Filter” is a separate component. A visible action label accompanies the selected tool.
- Right-hand oscilloscope is a state-derived decorative waveform, not a real acoustic measurement. Place “Receiver A locked at 440 Hz — 1 receiver remaining” as plain text outside the canvas. Limit live-region announcements to meaningful state transitions; a 60 Hz canvas loop must not announce 60 times per second.
- Victory is a native `showModal()` `<dialog>` with heading, Close form, computed result, labelled browser-local stats and move distribution. Its background grid is present but inert while open. At 390 px width the dialog fits the viewport, the histogram labels remain visible, and focus can return to the board.

## Typography

- Interface and long-form rules: Atkinson Hyperlegible or another licensed, properly hosted high-legibility sans at a readable body size; until a real font asset exists, use the system sans fallback rather than claim a font was supplied.
- Timer, coordinate labels, move count and formula-like component symbols may use tabular numerals and a readable monospaced face **for alignment only**, not as a blanket technical costume. Each coordinate is visually distinct from tile occupants.
- Error label “Collision at D4” and victory heading lead their states; stats labels are subordinate to values. Green/cyan/amber text on navy must retain contrast at final rendered size, verified in a browser rather than inferred from color names.

## Token usage

| Token | Intended value | Role |
| --- | --- | --- |
| `--ground` | `#0b1120` | Page and behind-grid navy |
| `--tile` | `#1e293b` | Discrete grid cell and restrained controls |
| `--signal-cyan` | `#06b6d4` | 440 Hz path and source; paired with solid route glyph |
| `--signal-amber` | `#f59e0b` | 660 Hz path and source; paired with dashed/double route glyph |
| `--solved` | `#10b981` | Receiver lock only, with checkmark and text |
| `--ink` | `#f8fafc` | Names, rules, high-importance status |
| `--ink-muted` | `#cbd5e1` | Supporting labels, still contrast checked |
| `--hazard` | `#fb7185` | Collision marker with icon, dashed outline and words |

These are **authored, brief-driven tokens**, not extracted or measured from missing boards. The cyan/amber lines require distinct stroke patterns or tile indicators in monochrome and forced-colours modes; the D4 hazard has a symbol and sentence. Do not add a second lime glow simply to make a screen look “game-like”.

## Spacing rhythm

Board cells divide one available square into six equal tracks, with enough visual separation to avoid merging coordinates into beams. The palette rests directly below its board because it acts on those tiles; longer rules, waveform and history sit farther away. A visible status strip stays close enough to the board to name the affected receiver but does not jump layout on every move. On mobile, allow the page to scroll around the board and ensure each tile has an operable target; never solve an overflow by shrinking labels to unreadable sizes or clipping the board. Timer/streak figures use stable tabular widths so updates do not shake nearby buttons.

## Component hierarchy

1. **Game masthead:** Signal Grid #142 and date, timer, move/par count, labelled mute, How to Play and Stats.
2. **Instruction strip:** the win condition, coordinate convention and current tool; no learning by failure alone.
3. **Interactive 6 × 6 board:** 36 DOM cells plus a projection canvas, boundary emitters and receivers. Receiver identity persists when a path is clipped.
4. **Component palette:** Mirror `/`, Splitter `+`, Phase Filter and Eraser with shortcuts `1–4`; Undo `Z` and Reset with confirmation.
5. **Signal feedback:** derived waveform canvas and accompanying text receiver status; a single central `aria-live="polite"` announcer for discrete changes.
6. **D4 diagnostic:** high-contrast hazard symbol, dashed tile border, named coordinate and explicit phase-splitter/reroute recovery; no committed invalid move.
7. **Victory dialog:** solved message, locally computed statistics, distribution bars with text values, spoiler-free copy button and success/failure confirmation.

## Anti-patterns

- A canvas-only grid whose tiles cannot be focused/read by keyboard and assistive technology; keyboard shortcuts that steal focus from a text input.
- Infinite beams, oscillator tone or `requestAnimationFrame` loops after hidden, victory, reset or teardown; canvas scaling compounded every redraw.
- Web Audio created or played automatically on page load; a mute switch whose visual state disagrees with actual audio.
- A red tile alone for D4, a green tile alone for victory, or an `aria-live` status repeated on every waveform frame.
- A dialog drawn as a generic OS window with traffic lights, tab bar, address field, wallpaper or outside shadow. Four requested JPEGs are page-only artworks, not browser screenshots.
- Hard-coded “Solved in 14 moves”, fabricated streak persistence or a claimed clipboard success before a write resolves. The image prompt's storyboard values do not replace a tested solver.
- Confusing the fictional crossing rule with a scientific assertion about mixing two frequencies; a decorative oscilloscope is not lab data.

## Rationale

A puzzle earns attention only if choices visibly affect an intelligible state. The restrained board, coordinate marks and tool labels give the player a stable frame of reference; cyan/amber paths, geometry and prose explain the rules; the victory display waits on a computed condition. DOM and canvas have separate responsibilities, preventing attractive screenshots from masquerading as functional input or accessible output. Sound and background drawing stay optional to respect user choice and CPU/battery limits. The four images will remain illustrative planning references even after authorised generation; their quality and provenance must be inspected before publication.

## Provenance

- Functional contract and honesty boundary: [`plan.md`](plan.md). Exact four pending image briefs: [`README.md`](README.md). [Local pending provenance](PROVENANCE.md) records actual prompt hashes, absent JPEGs and no model attestations.
- The existing [`game` type axis](../../../train/briefs/TYPE-AXIS.md) is not satisfied by this authored document. A real family, replayable win and distinct editor boundary are still needed.
- Modern Web Guidance's accessibility guidance informed the native dialog, roving keyboard focus and intentionally quiet live region. The background-processing guide was inspected but its `content-visibility: auto`/`contentvisibilityautostatechange` event is not used: the playable board sits above the fold, while the required `visibilitychange` pause remains a separate browser lifecycle requirement. This is a design contract, not shipped JS.
- `excluded_from_training: true`; `approved_for_training: false` for any future generated visual reference absent owner clearance. No A6 target or A1 training row is modified.
