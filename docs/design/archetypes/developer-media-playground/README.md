# Resonance Lab — design-reference prompts

**Status: Four 1376 × 768 unframed reference JPEGs are generated and committed (`mwg-train-bwnk`).** See [PROVENANCE.md](PROVENANCE.md) for the exact prompt SHA-256 digests, committed JPEG SHA-256 digests, byte lengths, `1376 × 768` dimensions, and vision review. No AudioContext, playable sound, verified shader/code sandbox, source transcript, synchronised waveform or clipboard receipt exists here. The [functional plan](plan.md), [visual design](design.md) and [local provenance](PROVENANCE.md) describe proposed web-page states, not evidence that a media demo works.

**Rights/spend:** `excluded_from_training: true`, `approved_for_training: false`. The [consumer-account rights record](../../../provenance/accounts/google-antigravity-consumer.md) does not confer reuse of future generated images to train another model. A separate owner-approved amount, exact image-model tariff and fail-closed reservation are required before any `--write` gateway call. No audio sample/tutorial licence is established either.

## Exact proposed image prompts

Each standalone block is a **1376 × 768 (16:9)** page-only JPEG request. Retain the same Resonance Lab preset, chapter, timeline and palette across all four. A painted playhead, five painted search highlights, parser diagnostic or “copied” toast cannot prove a running application, licensed recording or clipboard permission.

### `step1-split-pane-playground.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the FICTIONAL Resonance Lab WebAudio Synth, CSS/Shader Playground & Tutorial Studio, STEP 1: Split-Pane Playground with Transport in DEEP OBSIDIAN-PLUM SYNTH STUDIO DARK MODE. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Use #130f1e deep amethyst-charcoal page ground, #1d172e code editor pane, #261e3d synth stage, electric magenta #ec4899 envelope accent and acid-lime #a3e635 playhead/harmonic accents. Top page-owned transport: preset selector “Preset: Warm Analog Filter Sweep”, “Run · ⌘↵”, “Studio Dark / Daylight Docs” theme switch, “Share Permalink”, “Export Patch”, plus “Audio off until Run” status. LEFT tall pane: numbered patch/code editor showing oscillator detune, biquad lowpass filter and CSS custom-property sample lines. TOP RIGHT: illustrative harmonic-spectrum visualiser in magenta/lime, rotary-labelled parameter controls “Cutoff 680 Hz”, “Resonance Q 4.2”, “Attack 45ms” with readable numbers. BOTTOM full-width site timeline: stereo waveform drawing, visible time “00:42 / 02:15”, chapter markers, labelled waveform seek slider and “1.25× Speed” playback popover trigger. Ensure page reaches all image edges.
```

### `step2-transcript-search-highlight.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the SAME FICTIONAL Resonance Lab WEB PAGE, STEP 2: Tutorial Transcript Search and Time Cue in HIGH-CONTRAST DAYLIGHT DOCUMENTATION MODE. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Use #faf8ff crisp lavender-alabaster page ground, #ffffff editor and transcript panes with #e9d5ff borders, #1e1b4b deep indigo ink, vivid violet #7c3aed controls and #0d9488 teal playhead. Keep the labelled numbered patch editor at LEFT and the site waveform timeline at BOTTOM indicating “00:42 / 02:15”. RIGHT pane now shows chapter heading “Chapter 3: Shaping Subtractive Filter Envelopes”, a visibly labelled search field containing “resonance”, text “5 matches”, and five readable instances of that word with warm yellow #fef08a CSS Custom Highlight paint plus underlined non-colour match indicators. One active transcript cue “[00:42]” is visibly aligned with the waveform playhead and has a text active state, Next/Previous match controls, and an inline button “Apply Cue Parameters to Editor”. Only the page canvas, no OS window or external shadow.
```

### `step3-syntax-diagnostic-state.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the SAME FICTIONAL Resonance Lab WEB PAGE, STEP 3: Invalid Patch and Paused Last-Valid Visual Preview in DEEP OBSIDIAN-PLUM SYNTH STUDIO DARK MODE. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Keep the #130f1e amethyst-charcoal ground, #1d172e code surface, #261e3d right stage, electric magenta #ec4899 / acid-lime #a3e635 accents and original three-pane transport/waveform. In LEFT numbered editor, line 12 MUST show a visibly unclosed expression “filter.frequency.setValueAtTime(680, ctx.currentTime” with a missing closing parenthesis, one red gutter marker and underlined incomplete call. Along BOTTOM of page, an accessible diagnostic bar states “SyntaxError at line 12, col 54: expected ')' to close setValueAtTime call — keeping last valid patch active”. In RIGHT visualiser, a prominent badge reads “Preview paused on last valid build” and transport reads “Audio paused”. No browser/OS error dialog or outside frame.
```

### `step4-preset-gallery-and-export-dialog.jpg`

```text
Create one high-fidelity illustrative 1376×768 16:9 image of the SAME FICTIONAL Resonance Lab WEB PAGE, STEP 4: Native Preset Gallery and Patch Export Dialog in HIGH-CONTRAST DAYLIGHT DOCUMENTATION MODE. Render only a full-bleed, edge-to-edge WEB PAGE canvas. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. Preserve the #faf8ff daylight studio ground and #1e1b4b indigo typography with #7c3aed violet and #ec4899 magenta accents. A clearly SITE-OWNED open native <dialog> modal (#ffffff surface with #d8b4fe border) overlays the recognizable three-pane Resonance Lab underneath. Inside show six selectable fictional preset cards, each with labelled mini spectrum art: “Warm Analog Pad”, “FM Bell Arpeggio”, “Acid Bassline 303”, “Sub-Bass Drone”, “Chiptune Lead”, “Binaural Rain”. Below, show a readable schema-versioned JSON patch export sample with safe cutoff/Q/attack parameters; a page button says “Copy Shareable Permalink” and an ILLUSTRATIVE resolved-success state reads “Permalink copied!”. Also show a Close button with focus affordance.
```

## Pending verification

A no-write `node scripts/generate-archetype-boards.mjs --only developer-media-playground` prompt inventory can establish that four text blocks exist and all JPEGs are absent; it cannot supply a model response. After separate **authorised** image generation, record actual model identity/settings, original JPEG byte count/SHA-256/measured dimensions, full-resolution page-only visual inspection, and any source→derived change with both hashes. Run `npm run check:archetype-frames` on real JPEGs. A separate browser-driven app implementation must prove WebAudio gesture and suspension, isolated patch parsing, accessible transcript/seek, actual diagnostic position, clipboard promise handling and export schema before any functionality claim.
