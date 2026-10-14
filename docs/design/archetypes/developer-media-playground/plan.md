---
archetype: developer-media-playground
type: developer-media-playground
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/developer-media-playground/
register: docs/design/archetypes/developer-media-playground/PROVENANCE.md
---

# `developer-media-playground` — functional contract

**Resonance Lab**, a fictional interactive WebAudio synth, CSS/shader playground and synchronised tutorial transcript studio. This is an offline design reference—not an executable editor, recorded audio, verified waveform, successful clipboard operation or safe arbitrary-code host. The eight headings follow [`PLAN_SECTIONS`](../../../../src/design/contract.mjs); [`design.md`](design.md) owns the visual language.

## Use case

A learner opens a Warm Analog Filter Sweep patch, runs it after a user gesture, hears/inspects a bounded audio preview, scrubs a sample tutorial waveform, searches timestamped transcript cues for “resonance”, applies a verified cue parameter change, recovers from a syntax error without running malformed code, then compares six presets and exports a validated shareable patch. Every on-screen oscilloscope, count, timestamp and diagnostic in the four boards is **fictional storyboard material**; no actual track, waveform, chapter timing or browser sound is supplied by the image prompts.

Code editing is a trust boundary. User-authored patch code or shader text MUST NOT execute on the viewer origin with `eval`/`Function` or unrestricted access to `document`, storage, network or audio output. A future implementation needs a constrained declarative patch schema or isolated sandbox with explicit origin, CSP, resource budgets and controlled message protocol before claiming a safe Run action. No executable playground is built here.

## Routes and effects

| Proposed action / route | Intended effect if implemented |
| --- | --- |
| `GET /lab?patch=warm-sweep` | Load a whitelisted preset and editable patch, transport and silent visual preview, with a clear “audio off until Run” state. Unknown/oversized patch IDs fail safely. |
| `POST /lab/compile` | Validate a bounded patch schema/sandboxed code without executing it on the parent origin; return line/column diagnostics and retain last-valid visual snapshot on failure. Do not start a new audio graph on a failed compile. |
| `Run` / `Stop` / transport | Only after an explicit user click or keyboard activation, create/resume an AudioContext, bound gain and duration, schedule scoped nodes and start/pause playback. Stop/release nodes on reset, page hide, navigation, error and unmount. |
| `GET /lessons/filter-envelope?at=42` | Load a **licensed or local sample** chapter transcript and time-aligned audio; after seek, update playhead and active cue from the same clock without claiming timing from a still. |
| `GET /lab/share?preset=...&params=...` | Parse validated, size-bounded public patch parameters and version; never place arbitrary executable code, credentials or private track URLs into a shareable query string. |
| `Export Patch` / `Copy Shareable Permalink` | Serialize a schema-versioned, validated JSON object or canonical public link; show copied success only after Clipboard API resolution, otherwise provide a manual-copy failure path. No remote persistence or customer-upload claim. |

There are no Resonance Lab routes today; the table is a spec for future independently browser-tested work.

## Data and state

- `Patch`: whitelisted oscillator detune, biquad lowpass cutoff, Q, envelope attack/release, safe CSS custom properties and visualizer settings, with schema version, units/ranges and a stable preset ID. An authored code pane may *display* `filter.frequency.setValueAtTime(680, ctx.currentTime)` but must not `eval` arbitrary pasted JS. If shader source is accepted later, isolate WebGL/WebGPU context and cap compilation/work to prevent hangs; no shader claim from a screenshot.
- `Compile`: explicit state `idle | validating | valid | invalid`; current editor text and last-valid patch are separate. A red diagnostic on line 12/col 54 must reference the actual parser's location, not a fabricated error unrelated to the shown text. For the mock state show the **unclosed** call `filter.frequency.setValueAtTime(680, ctx.currentTime` (missing `)`); the last valid audio graph is stopped/suspended and its visual snapshot labelled “Preview paused on last valid build”. New edits never silently continue playing stale audio.
- `Tutorial`: cue ID, UTC-independent seconds offset, text content, chapter, permitted source/license and audio-clock anchoring. The illustrative chapter is “Chapter 3: Shaping Subtractive Filter Envelopes”; a search for “resonance” returning **5 matches** requires five real indexed occurrences in a future local fixture. At position 00:42 of total 02:15, active cue [00:42] derives from actual media clock only in an implementation. `::highlight(search-match)` is transient paint only; it is not accessible semantics or an interactive text wrapper. Provide visible result count, searchable text, focusable result navigation and explicit active cue text/state.
- `Transport`: sample timeline 00:42 / 02:15, chapter markers, rate 1.25×, current playback state, selected output and user gesture permission. The sample ratio is a storyboard state, not supplied audio. The `<input type="range">` seek control has a visible label, min/max/step and `aria-valuetext` e.g. “42 seconds of 2 minutes 15 seconds”; seek is keyboard-operable even without a draggable waveform.
- `Layout`: three content regions (code/patch left, spectrum/macros upper right, waveform/lesson bottom) with accessible resize handle or control. `ResizeObserver` reports available pane width without a callback write loop; named `@container` queries adapt controls. Observers, `requestAnimationFrame`, AudioContext and highlight ranges are cleaned up on unmount/page hide; inactive tabs do not burn CPU or keep sound playing.
- `Presets`: exactly six fictional gallery entries—Warm Analog Pad, FM Bell Arpeggio, Acid Bassline 303, Sub-Bass Drone, Chiptune Lead, Binaural Rain. Names and miniature spectra are illustrations, not audio recordings or endorsement. Export only schema-safe parameters, never a raw privileged code blob.

## Journey

1. Open a dark three-pane site with Preset: Warm Analog Filter Sweep, Run (⌘↵), Share Permalink and Export Patch. Code pane shows labelled oscillator detune, filter and CSS properties. Upper-right spectrum has Cutoff 680 Hz, Resonance Q 4.2, Attack 45ms controls; bottom waveform displays a fictional 00:42 / 02:15 cursor, chapters and a 1.25× speed popover trigger. Default is silent: visual preview is an illustration until an actual Run gesture creates/resumes audio.
2. Switch the right pane to “Chapter 3: Shaping Subtractive Filter Envelopes”. Search “resonance”; exactly five indexed sample occurrences receive optional `CSS.highlights` visual treatment but the result count, focusable Next/Previous match navigation and cue timestamp remain standard text. [00:42] active cue follows the real transport time only when a media source exists. “Apply Cue Parameters to Editor” changes validated parameter fields with an explicit Undo, never executes transcript text as code or starts sound.
3. Edit line 12 to leave `filter.frequency.setValueAtTime(680, ctx.currentTime` unclosed. Run/compile refuses with a specific syntax diagnostic and a single accessible error announcement “SyntaxError at line 12, col 54: expected ')' to close setValueAtTime call — keeping last valid patch active”. Verify parser location against the actual editor before shipping; this exact string is illustrative pending a real parser. Right visualiser clearly says “Preview paused on last valid build”; suspend current audio and do **not** keep old output playing. Fix code, rerun after user gesture and clear the error only when a new patch succeeds.
4. Open a native `<dialog>` gallery/export sheet with six preset cards, mini spectra, schema-safe JSON patch preview and “Copy Shareable Permalink”. Validate version, size and public-only parameters. Show “Permalink copied!” only if `navigator.clipboard.writeText()` resolved; when denied/unavailable show select-and-copy instructions instead. Close/Escape restores focus to its opener, and no playback menu popover sits underneath the modal as an inaccessible focus target.

## Validation and states

- Differentiate stopped, user-gesture-required, loading, running, paused, suspended due to hidden tab, compile error, missing lesson audio, clipboard denied and export blocked. A rendered transport bar is not evidence of playback, and drawing a harmonic spectrum does not attest sampled audio.
- Bound gain, duration, node count, oscillator cutoff and Q; sanitize/validate URL, CSS property values and any editor input. Content from a shared patch must not reach same-origin JS, arbitrary audio device routing or network access. Sandbox capability design/security review is a separate prerequisite before adding Run.
- Transcript search uses `TreeWalker` text nodes, `Range` and `CSS.highlights` only when supported; clear old highlights on query/content changes and avoid `innerHTML` insertion. Because `::highlight()` is visually-only and not exposed to the accessibility tree, the textual hit count and active cue/state remain in semantic DOM. Unsupported browsers still expose text/search/navigation; any real `<mark>` fallback must preserve DOM semantics and carry a local `TODO(baseline/custom-highlights)` beside the fallback implementation.
- Timeline seek is a native labelled range slider with formatted `aria-valuetext`, keyboard increments and a visible current/total time label. Playback speed is a **nonmodal** popover of actual buttons, not a fake modal menu; native gallery/export `<dialog>` is distinct and focus-managed. Do not mark a button-group popover as `role="menu"` without full menu keyboard semantics.
- `ResizeObserver` measures only, writing changed values outside a mutation feedback loop; pane widths/clipped editor lines remain accessible at zoom and mobile widths. Pause visualiser and audio updates on `visibilitychange`; disconnect observers and release nodes on close.
- Code diagnostic location is tested from a real parser. Invalid code leaves editor text available for correction and retains a labelled still of the last-valid frame; it never starts or silently continues sound from that older patch. Copy failure does not display success or write fake clipboard evidence.

## Acceptance criteria

- A real browser opens the default preset silent, activates Run only after a user gesture, hears bounded output if audio is available, sees a spectrum tied to the running graph and can stop/suspend/release the nodes. If audio is blocked, it reports why rather than claiming live playback.
- Keyboard users resize panes and seek to 00:42 via range control, select 1.25×, move through chapter markers and receive accurate formatted `aria-valuetext` and cue text without depending on the waveform canvas.
- A licensed sample transcript containing five “resonance” tokens returns five correct matches; CSS custom highlighting may colour them but never supplies the only semantic indication. Active [00:42] follows the same transport clock as audio and seeking.
- Applying a cue updates validated parameter fields and offers Undo without running arbitrary transcript/editor content. A malformed line-12 expression produces an actual location-aware error, pauses audio and preserves only a clearly labelled last-valid **visual** snapshot.
- Export JSON includes only whitelisted, versioned parameters; a canonical permalink round-trips them without embedded executable source or secrets. Clipboard denial yields an honest manual-copy path; success text appears only after an actual write resolves.
- Four 1376 × 768 full-bleed page-only JPEGs, if separately approved/generated/inspected, depict states without browser/OS chrome but do **not** prove audio, sync, code safety or clipboard functionality.

## Site Generation Prompt

Build **Resonance Lab** as a responsive interactive synth, CSS/shader teaching playground and transcript studio in a single full-bleed #090d16 web page with #111827 code and #1e293b stage surfaces, deliberate violet #8b5cf6/cyan #06b6d4 cues. This is a functional application spec, not four screenshot replicas: left syntax-highlighted patch editor with numbered lines and bounded oscillator detune/biquad filter/CSS custom-property schema; upper right harmonic spectrum and macros Cutoff 680 Hz, Resonance Q 4.2, Attack 45ms; bottom keyboard-operable waveform scrubber 00:42 / 02:15, chapter markers and 1.25× playback popover. Transport includes preset selector, Run (⌘↵), Share Permalink, Export Patch. Audio starts only from explicit user activation, uses bounded WebAudio nodes and releases/suspends them on stop/tab hidden. Never execute arbitrary pasted JavaScript or shaders with parent-origin privileges. No browser chrome, OS frame, macOS traffic lights, address bar or exterior desktop shadow in any proposed reference image.

Switch right pane to Chapter 3 transcript, support “resonance” search with five actual fixture matches and CSS Custom Highlight API as optional visual paint while accessible text, hit count and active cue remain semantic. Link cue [00:42] to real transport only when a source exists. A missing closing parenthesis on line 12 must produce a real location-aware diagnostic and pause audio while retaining a labelled last-valid **visual** snapshot. The six-card native gallery/export dialog contains a schema-safe patch JSON, validates shareable URL state and reports Clipboard API success only on fulfilment. ResizeObserver/container queries adapt split panes without loops; actual browser tests must verify audio gesture, seek/transcript sync, safe compile refusal, exported JSON and denial recovery. Static images are illustrative, not media evidence.

## Implementation status

**Planning only.** No sound asset, AudioContext, waveform data, verified code sandbox, transcript recording, clipboard receipt, four JPEGs or executable Resonance Lab experience has been produced. The four [`README.md`](README.md) blocks are offline prompts; no paid image model has been called. A separate owner-approved generation task must add JPEGs with actual provenance, rights review, viewer wiring and type-axis update; functional media implementation is independently testable work. Sealed A6 and current A1 training assets are unchanged.

## Provenance

- Visual design: [`design.md`](design.md). Four exact pending page-only prompts: [`README.md`](README.md). [Local pending provenance](PROVENANCE.md) records SHA-256 prompt text and absent JPEG/model evidence.
- Existing family context: [`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md), unchanged in this offline authoring branch.
- Future assets are `excluded_from_training: true`, `approved_for_training: false` absent separate rights clearance; preset audio and transcript are fictional not licensed media files.
- Work `mwg-train-07ka.6` covers offline docs/tests only; image generation, vision, global asset register and /concepts integration wait for separate approval.
