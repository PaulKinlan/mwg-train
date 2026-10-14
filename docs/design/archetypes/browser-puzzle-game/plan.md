---
archetype: browser-puzzle-game
type: game
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/browser-puzzle-game/
register: docs/design/archetypes/browser-puzzle-game/PROVENANCE.md
---

# `browser-puzzle-game` — functional contract

**Signal Grid**, a fictional daily wavelength-and-circuit logic game. The exercise specifies Puzzle **#142 · 14 Oct 2026** and four proposed image states; none is a functioning game or verified solved board. This plan follows the eight [`PLAN_SECTIONS`](../../../../src/design/contract.mjs); the visual system is in [`design.md`](design.md).

## Use case

A player opens a daily 6 × 6 puzzle, learns the component rules, routes cyan 440 Hz and amber 660 Hz signals to matching receivers, sees why a collision is invalid, then solves, examines browser-local statistics and shares a spoiler-free result. A second actor, the puzzle editor, publishes a versioned puzzle definition and may withdraw a defective one; a subsequently arriving player must see the revised availability. This authoring route is a **future capability**, not an existing server or a role demonstrated by any JPEG. A decorative grid with a congratulatory modal but no deterministic play/undo/restart loop is not a game.

The frequencies and “phase short-circuit” are **invented puzzle symbols/rules**; the game is not an acoustics or circuit simulator. The illustrated solved state, 14-move par, 01:48 elapsed time and streak counts are storyboard samples, not observed play or account-wide achievements.

## Routes and effects

| Route/action | Actor | Intended effect |
| --- | --- | --- |
| `GET /` | player | Show puzzle identity #142 and date, clear instructions, deterministic initial 6 × 6 board, sound-off control, timer `00:00`, moves `0 / Par 14`, palette and daily-state recovery. |
| `GET /?puzzle=142` | player | Load the same versioned daily definition; unknown IDs have an explicit unavailable state, never silently substitute a puzzle or pretend solved. |
| Place/rotate/remove component | player | Apply a legal move at one tile, recompute finite signal paths/receivers, update board, move history and live text status; invalid placement shows why without committing a move. |
| Undo / Reset | player | Undo restores the preceding state; Reset asks for confirmation if progress exists, then returns to the same pinned puzzle start. |
| Victory / Share | player | When **both** receivers lock at correct frequencies without an invalid collision, stop the timer and open native `<dialog>` with browser-local stats and a spoiler-free grid copy action. No content is sent to a server. |
| `GET/POST /editor/puzzles/142` | editor | **Proposed only.** After authorisation, publish/withdraw a bounded puzzle definition; new players see its status. Never exposed to an unauthenticated player. |

Puzzle **#142** is a stable identity, not `new Date()` implicitly rolling the board to some later day. No network leaderboard, real account or verified daily feed is asserted.

## Data and state

- Board is 6 columns `A`–`F` (left to right) by 6 rows `1`–`6` (top to bottom); `D4` is unambiguous. Boundary source and receiver definitions are immutable for a versioned puzzle. Illustrative initial sources are **440 Hz Cyan** and **660 Hz Amber**; receiver A wants 440 Hz and receiver B wants 660 Hz.
- Components: **Mirror /** reflects a beam according to its orientation, **Splitter +** separates paths including the game's “phase-splitter” escape from collisions, **Phase Filter** admits one of the two symbolic frequency classes, and **Eraser** removes a placed component. Palette labels and shortcut keys `1`–`4` are visible. Define each component's transition table in an actual puzzle fixture before implementation; a board illustration is not such a table.
- Beam propagation is finite: visit state `(tile, direction, frequency)` at most once, with an explicit bound of `6 × 6 × 4 × 2` states; a loop ends as an error/unsolved state, not an infinite render or audio loop. A head-on crossing of incompatible frequencies at an unprotected tile is the fictional collision rule. Receiver lock is computed from the paths, not from painted tile colours.
- A legal placement/rotation/erase is one move in the history. A rejected placement remains a ghost preview and does **not** increment the committed move counter. Undo replays one previous immutable state; Reset restores the published puzzle version. Timer uses monotonic elapsed time while the page is visible and play is active; hidden/paused time is excluded and display time is not a proof of a win.
- Local progress and stats are keyed by puzzle ID **and definition version** in `localStorage`. Validate the stored shape and bounds before hydrating; absence/quota/security errors degrade to in-memory play with a visible notice. A browser-local streak is not a cross-device/account statistic.
- The grid's DOM layer is 36 labelled interactive cells with a roving `tabindex` and logical row/column labels; both pointer and keyboard actions call the same game transition. Two canvases are visual projections only: a high-DPI grid for beams and an oscilloscope for the derived combined waveform. Text instructions, statuses and receiver outcomes remain available without canvas or sound.
- Sound is OFF until a player explicitly opts in. Only a user gesture creates/resumes Web Audio; a short tone on accepted actions never becomes required feedback. Mute, hidden tab, reduced motion or unavailable audio make the game silent without changing its rules. On the document's `visibilitychange` event, cancel the `requestAnimationFrame` loop and suspend audio when hidden; resume at most one loop when visible again.

## Journey

1. Open puzzle #142. Read “How to Play”; the `6 × 6` grid, two sources/receivers, `0 / Par 14`, 00:00 timer, four labelled components and shortcut hints are visible. Mute is on. Starting the game is an explicit user action so sound cannot autoplay.
2. Choose Mirror `/` with key `1` or the toolbar; move focus with arrows among the 36 DOM cells, place with Space, or use pointer capture for a drag. The same state transition and named tile is reported whichever input is used. A midgame storyboard depicts nine placed components, beam routing, an oscilloscope and “Receiver A locked at 440 Hz — 1 receiver remaining”. That screenshot is **not** a claim a published fixture reaches the state.
3. Preview a mirror that would route the two symbolic signals head-on into `D4`. Reject the move; mark `D4` with a hazard icon **and** dashed outline, show “Collision at D4” plus the exact diagnosis “Incompatible frequencies crossed on D4 — place a Phase Splitter or reroute”, and label the receiver “Signal clipped”. The committed move count/history remain unchanged. Undo (`Z`, outside text inputs) or choosing the Splitter + recovers.
4. Continue legally until both receivers have correct frequencies, then show a victory dialog. The proposed board art uses “Solved in 14 moves (Par 14) · 01:48”, played 38, win 97%, current streak 12, best streak 19 — **illustrative storyboard numbers**. A real implementation must compute the solved state, time and browser-local stats instead of hard-coding them. Copy a spoiler-free result; acknowledge “Copied to clipboard!” only after a successful write, with a truthful recovery/error state if clipboard permission fails.
5. Close the dialog with Escape or Close and return focus to the board/result opener. Reload the same puzzle and recover the validated local state; reset returns to the pinned initial board, not a different day. A second actor's future withdrawal of a defective puzzle must make a fresh visit show “Puzzle unavailable” instead of an old victory.

## Validation and states

- Reject out-of-grid cells, an occupied/nonplaceable emitter tile, invalid component type/orientation, unsupported puzzle version and cyclic path overrun with a named recovery. The collision state is expressed with icon, pattern, words and a receiver explanation, not cyan-vs-amber colour alone.
- Pointer capture is paired with `pointerup` and `pointercancel` cleanup. Do not call `touch-action: none` on the entire document; native page scroll remains usable outside the board. Keyboard arrows stay within grid, Home/End may move to row edges, Space places, Z undoes only in the game context, and Tab escapes the grid to the toolbar/dialog.
- A single `aria-live="polite"` status announces **discrete** receiver changes, invalid moves and success, not every oscillator frame. An urgent collision may use a focused diagnostic instead of an assertive flood. Screen-reader users can inspect a textual cell list and a description of the waveform; canvas pixels are not the only source of state.
- The canvas backing store is reset to `CSS size × min(devicePixelRatio, capped ratio)` on resize; the context transform is replaced with `setTransform`, not compounded with every frame. Cancel stale animation IDs on hide, reset, victory and teardown; a hidden tab cannot keep synthesizing audio or painting.
- No audio autoplay. `AudioContext` support/security failure leaves controls labelled and the complete visual/text game operational. `localStorage` can throw and saved JSON can be corrupt; neither may crash the board. Clipboard failure never announces “Copied”.
- Stats dialog uses `.showModal()` so the browser makes the background inert and traps focus; no handwritten focus trap. Close form and Escape work; if scripts fail, a nonmodal textual rules/results section still explains the puzzle.

## Acceptance criteria

- A deterministic fixture for Puzzle #142 supplies legal starting state, stable source/receiver coordinates, component transition table and a verified solution of exactly 14 accepted moves before the 14-move artwork can be considered accurate.
- Each mouse/touch placement and keyboard placement reaches the **same** board state, move count and receiver status; roving focus visits all 36 cells without requiring canvas pixels.
- The 9-piece midgame can be reached with explicit moves, undo reverses a legal step, and Reset returns to the identical #142 start rather than a random seed.
- Collision preview on `D4` refuses the placement and shows an icon, dashed outline, exact diagnostic and clipped receiver; history and committed move count do not advance.
- The finite path evaluator terminates on reflections/splits/loops; it cannot win with one locked receiver or with a collision.
- A solved board stops its timer and shows computed stats in native dialog; closing via Escape or Close restores focus, and clipboard success/failure have distinct honest messages.
- Sound defaults off, begins only on explicit gesture, and the visibility lifecycle stops both frames and audio; disable audio or canvas and every rule/state remains textually usable.
- Reloading validates browser-local state; malformed saved data and blocked storage fall back to a fresh in-memory board with an explicit notice, never a fake streak.
- An editor can withdraw a puzzle without granting a player editor capability, and a fresh player sees the withdrawal. This is a future criterion, **not met by planning art**.
- Four page-only 1376 × 768 boards accurately illustrate start, 9-piece intermediate, rejected D4 collision and solved dialog without browser chrome; hashes/model attestation/vision notes follow only after an authorised model response and independent inspection.

## Site Generation Prompt

Build **Signal Grid — Daily Wavelength & Circuit Logic Puzzle**, an accessible, actually playable browser game pinned to Puzzle #142 on 14 Oct 2026. Use `#0b1120` navy ground, `#1e293b` grid tiles, `#06b6d4` cyan and `#f59e0b` amber symbolic signals, and `#10b981` only for genuinely solved receivers. Never render browser chrome, macOS traffic lights, tabs, address bars, OS wallpaper or exterior window shadows as site content. The top bar names the puzzle, timer and `0 / Par 14` start, sound-off toggle, How to Play and Stats. The centre contains an accessible 6 × 6 DOM grid (A–F by 1–6) with a high-DPI decorative beam `<canvas>` projected from the same state, 440 Hz Cyan and 660 Hz Amber boundary emitters, target receivers, and a bottom toolbar Mirror /, Splitter +, Phase Filter and Eraser with shortcuts `1–4`, Arrows, Space and Z. Above the fold, a first-time player can find instructions and place a tile without guessing what a symbol means.

Define the puzzle fixture and solver BEFORE presenting a 14-move win: finite visited-state propagation, explicit reflection/split/filter rules, collision detection on head-on incompatible frequencies and receiver locks by computed path. Support pointer capture and a full keyboard roving grid using one pure transition function. Display a midgame state with nine components and “Receiver A locked at 440 Hz — 1 receiver remaining”, plus a live oscilloscope `<canvas>` whose waveform is generated from symbolic state rather than pretending to be a laboratory measurement. A mirror preview that collides at D4 gives the exact diagnosis “Incompatible frequencies crossed on D4 — place a Phase Splitter or reroute”, a non-colour hazard mark and “Signal clipped”; refuse the invalid move and leave undo history intact. A verified win opens `<dialog>` with calculated moves/time and **browser-local** statistics, histogram and “Copy Spoiler-Free Grid”, confirming clipboard success only after an actual write. Keep a textual grid/receiver summary and a single debounced `aria-live="polite"` notifier; neither canvas nor Web Audio may be required to play. Audio opt-in follows a user gesture; suspend on hide, cancel RAF loops on visibility loss, validate localStorage progress, and degrade safely when storage/audio/clipboard fail. The supplied victory numbers are illustrative until a reproducible browser-driven journey actually reaches them.

## Implementation status

**Planning only for functionality.** No playable Signal Grid site, puzzle fixture, proven 14-move solution, editor route or local streak record exists for this archetype. Eight illustrative JPEG boards are committed; the original Light Step 1 has a generation record, but seven replacement/imported boards lack retained model responses or generator prompts (see [local provenance](PROVENANCE.md)). The four authored prompt blocks in [`README.md`](README.md) cannot attest the seven imports. The sealed A6 evaluation set and current A1 training manifest are untouched. The proposed editor role and any new image-generation pass require separate implementation, spend approval and independent review.

## Provenance

- Type-axis context: [`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md) (existing `game` type remains unsatisfied by this planning document).
- Aesthetic brief: [`design.md`](design.md). Authored unframed Light image briefs: [`README.md`](README.md). [Local provenance](PROVENANCE.md) pins eight existing JPEGs while marking seven replacement/imported boards unverified.
- `excluded_from_training: true`; `approved_for_training: false` for future illustrative images absent an owner-cleared rights record. No source licence or verified gameplay claim arises from a generated still.
- Work: `mwg-train-07ka.2` offline deliverable, with image generation, taxonomy and viewer wiring deferred to a separately approved follow-up.
