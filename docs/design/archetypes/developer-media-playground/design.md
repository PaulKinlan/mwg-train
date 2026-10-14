---
archetype: developer-media-playground
type: developer-media-playground
boards: docs/design/archetypes/developer-media-playground/
register: docs/design/archetypes/developer-media-playground/PROVENANCE.md
---

# `developer-media-playground` — authored visual system

**Offline design only.** Resonance Lab has no working audio graph, shader preview, media track, transcript, editor parser, clipboard evidence or JPEG. The [plan](plan.md) defines future behaviour with code isolation; still references never prove it.

## Direction contract

**THESIS:** Code, sound and lesson transcript as three linked surfaces, with real errors and audio permission visible rather than a decorative spectrum.

**OWN-WORLD:** Dark recording bench, violet parameter editing, cyan transport/timing cues and sober diagnostics; no OS audio workstation imitation.

**STORY:** Safe silent preset → search timed lesson cue → malformed patch with paused last-valid preview → gallery/export with conditional clipboard success.

**FIRST VIEWPORT:** Left code, upper-right live-looking visualiser/macros and full-width lower transport with readable timestamp at 1376 px.

**FORM:** Brief-pinned developer-media studio; Impeccable concept seed unavailable on this VM, no seed key claimed.

**FINISH:** Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Visual thesis

The operator should be able to follow one causal thread: filter code on the left, cutoff/resonance macros on the right, one explicit sound/transport clock beneath, and a transcript cue that can apply those parameters. A live-looking waveform must not claim audio has played. A syntax failure must leave an honest “last valid visual frame” rather than counterfeit current output; playback is paused, not silently sourced from stale code. Export affordances describe a validated patch, not a browser tool's OS Save dialog.

Each requested 1376 × 768 visual is a full-bleed **site page**, not a screenshot of macOS, Chrome, a music application or a framed IDE. Four illustrative states need truthful labels: audio permission, search hit count, parser diagnosis and copy success are intended behaviour, not evidence from a JPEG.

## Grammar and layout

- Ground #090d16, code pane #111827, stage #1e293b, selected edit violet #8b5cf6 and waveform/cue cyan #06b6d4. Use separators and syntax colour sparingly; error red appears with text/underline, never as the sole diagnostic.
- Top transport offers Preset: Warm Analog Filter Sweep, Run (⌘↵), Share Permalink and Export Patch. A visible “Audio off until Run” state prevents an illustration from implying autoplay; an actual Run requires a user gesture in a future site.
- Left editor takes enough width for numbered source lines and indentation; do not shrink line 12 below legibility. Upper-right panel either shows harmonic spectrum and knobs Cutoff 680 Hz, Resonance Q 4.2, Attack 45ms or the timed Chapter 3 transcript; the bottom full-width timeline holds 00:42 / 02:15, chapter markers, native labelled range seek and 1.25× speed popover trigger.
- The transcript search term “resonance” matches five true tokens only in a future fixture. Visual `CSS.highlights` + `::highlight(search-match)` can paint transient text ranges without rewriting DOM; it does **not** expose them to assistive technology. Show “5 matches”, a focusable Next/Previous navigation list, [00:42] active cue text and a real “Apply Cue Parameters to Editor” button. Custom highlights may use colour/background/underline but not padding or font-size; retain a DOM-visible focus/active indicator. If unsupported, match text and navigation remain usable even without paint; a future `<mark>` fallback must preserve nodes and have a `TODO(baseline/custom-highlights)` adjacent to its code.
- A syntax error on line 12 displays missing `)` in the actual sample, red gutter icon and underline plus one bottom `role="alert"` message. The stage badge says “Preview paused on last valid build”; prevent a running audio graph from hiding behind the old image. The exact line/col string requires a real parser before it can be functional evidence.
- The final gallery/export sheet is a native modal `<dialog>` with six named patch cards, miniature labelled spectra, schema-safe JSON preview and a copyable URL control. No success toast unless clipboard actually resolved; a failed copy uses a visible manual-copy instruction. Dialog gets focus, Escape closes, and focus returns to the opener; playback-speed popover is separate and nonmodal.
- Pane resizing has a labelled keyboard width control plus pointer affordance. `ResizeObserver` measures layout to place the stage and timeline without feedback loops, while named `@container` queries reflow macros/transcript at available pane width; at narrow widths, code and stage stack above a fully reachable transport.

## Typography

Use a licensed/self-hosted code face only if a font asset exists, else an honest system monospace in editor and sample JSON. Body/controls use a legible sans; keep `680 Hz`, `Q 4.2`, `45ms`, chapter names, timestamps and syntax line/column distinct at zoom. A 00:42 cue is text, not solely a tiny waveform tick. Accessible names are visible on macros, seek slider, transport and preset cards; no shortcut glyph replaces “Run”.

## Token usage

| Token | Intended value | Role |
| --- | --- | --- |
| `--ground` | `#090d16` | Full-page continuous studio |
| `--code-surface` | `#111827` | Patch/editor area |
| `--stage-surface` | `#1e293b` | Spectrum, lesson and gallery |
| `--edit` | `#8b5cf6` | Selected parameters |
| `--clock` | `#06b6d4` | Waveform playhead and active cue |
| `--ink` | `#f8fafc` | Main code/labels |
| `--muted` | `#cbd5e1` | Quiet units and keyboard hints |
| `--invalid` | `#fb7185` | Diagnostic with explicit text |

Tokens are brief-specified intent, not measured values from a raster. Browser contrast, text legibility and focus outlines remain untested until a runnable site exists.

## Spacing rhythm

Top transport is compact but full-width; editor and visualiser share the prime middle, and bottom waveform is a deliberate readout area rather than a decorative stripe. Keep cue labels close to timestamp and key-value macro names close to values. A persistent error bar needs enough height to read and an accessible dismiss/correction path without covering code. On mobile, stacking retains editor, spectrum/transcript and waveform in document order; the source and seek controls never disappear behind a clipped resizer.

## Component hierarchy

1. **Transport header:** preset, Run/Stop, share/export and explicit audio permission/status.
2. **Code/patch pane:** numbered lines, safe parameter editing, syntax error marker and focusable diagnostic route.
3. **Spectrum/macros pane:** bounded frequency/Q/attack controls and source-labelled visualiser.
4. **Lesson pane:** search input, count, semantic cue list, active time and Apply action; highlight is decoration.
5. **Waveform timeline:** native range seek, chapter markers, formatted `aria-valuetext`, nonmodal speed popover.
6. **Error bar:** single accessible diagnostic, last-valid visual badge and suspended sound state.
7. **Preset/export dialog:** six named cards, schema-safe JSON, validated permalink and honest clipboard result.

## Anti-patterns

- A spectrum animating on page load with no user gesture/audio graph, or a timed transcript matched to a GIF rather than the media clock.
- Using `::highlight()` as accessible search result semantics; injecting untrusted transcript via `innerHTML` to create spans; claiming five hits with no five source matches.
- Running arbitrary editor JS on the viewer origin, infinite shader compilation, unrestricted WebAudio gains or a stale old patch continuing to sound after a syntax error.
- `role="alert"` re-announced on every keystroke and a speed popover mislabeled as a modal while the actual gallery lacks focus management.
- “Permalink copied!” appearing before Clipboard API fulfilment or when permission is denied; JSON patch leaking raw arbitrary code/private media URLs.
- Browser chrome, window traffic lights, address bar, tab strip, OS workstation chrome or external desktop shadow around reference boards.

## Rationale

WebAudio's user-gesture rule demands a visible silent default and real Run/Stop state. Search highlights support a fast visual skim, but their paint never replaces normal transcript text, hit navigation or active-cue semantics. A native seek slider and native dialog avoid reimplementing basic keyboard/focus interactions; named container queries allow each split pane to adapt. Most importantly, safe patch representation and execution isolation are prerequisite to making this a developer playground, not optional polish. The offline image briefs cannot certify any of these requirements.

## Provenance

- [Functional plan](plan.md) defines gesture, code isolation, transcript and clipboard acceptance. [Four offline prompts](README.md) define illustrated site-only states; [local pending provenance](PROVENANCE.md) binds prompt bytes and records absent image/model evidence.
- Modern Web Guidance informed the Custom Highlight API's paint-only accessibility limitation and native slider `aria-valuetext`; no actual Highlight ranges, audio output or browser test was created in this branch.
- Future assets default `excluded_from_training: true` and `approved_for_training: false` until separately cleared. No licensed sample audio, video or tutorial text is shipped.
