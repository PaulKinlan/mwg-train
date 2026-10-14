---
archetype: interactive-product-configurator
type: product-configurator
boards: docs/design/archetypes/interactive-product-configurator/
register: docs/design/archetypes/interactive-product-configurator/PROVENANCE.md
---

# `interactive-product-configurator` — authored visual system

**Design before imagery.** The Atelier Velo Solstice Ti, geometry, component weights/prices, fit and comparison are fictional. No real bike render, photograph, product licence, measured mass or paid model raster exists. [`plan.md`](plan.md) defines a prospective functional contract, not a sold bicycle or accepted workshop reservation.

## Direction contract

**THESIS:** One coherent build from layer preview to BOM to link—never independent decorative mock numbers.

**OWN-WORLD:** Quiet specialist workshop, titanium finish and clean studio side profile; editorial notes and careful material labels rather than luxury checkout theatrics.

**STORY:** Frame/finish → drivetrain/wheel swap → truthful fit conflict → saved build comparison and unplaced slot request.

**FIRST VIEWPORT:** 60% visual and 40% builder split with geometry, open Step 1 and a sticky transparent itemised BOM summary at 1376 px.

**FORM:** Brief-pinned bicycle configurator. The Impeccable concept seed was unavailable on this VM; no seed key exists.

**FINISH:** Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Visual thesis

A rider should see the change they just made on a recognisable bike, in an honest price/weight line, and in a shareable build state. A deep-carbon wheel selection must not paint a different frame finish; tan-wall tyres must be selected explicitly or included by the declared wheelset SKU. A precise but calm compatibility refusal is more valuable than a persuasive button falsely declaring a physically unsafe guard safe. The comparison sheet uses aligned component rows so two complete builds can be inspected—not just two aspirational photos and a “book now” CTA.

All four requested images are proposed full-page 1376 × 768 references, not photographs or product evidence. The figure is a stylised studio **illustration proposal** with no claimed licence, manufacturing geometry or physical clearance verification. A generated bike silhouette cannot validate manufacturer specs or give price/stock guarantees.

## Grammar and layout

- Continuous deep #0f172a ground; right panel #1e293b; warm amber #f59e0b active option/highlight, pale neutral type and subtle metal texture limited to the bicycle preview. No fake operating-system window. Left preview approximately 60% of desktop and sticky within the configurator's scroll region; right steps occupy about 40% and a sticky bottom BOM bar stays legible without covering controls.
- Side-profile preview layers are named and aligned by stable attachment points: frame+fork, wheel/rim, tyre, drivetrain, mudguard/dynamo. Only layers corresponding to **validated selected SKUs** change, preserving orientation and scale. Supply visible text alternative listing frame size/finish, wheelset, tyres and assembly status. In a real site use licensed illustrations and test exact stacking across all combinations; no such layers ship here.
- Geometry badges: Size 56 cm, Stack 578 mm, Reach 392 mm, Max Tyre 50c as fictitious catalogue labels, not fit advice. Keep units in the text and enough contrast over titanium; if a generated image smears the fine print, reject/rework it.
- Right builder uses native `<details name="build-step">` for **exclusive disclosures**, each with a labelled `<summary>` and a persistent selected-values line outside its hidden content. Within each step, native radio `<fieldset>`/`legend` choices receive visible checked states; `:has(:checked)` may decorate card/swatch but not supply the only accessible selection summary. Place `<summary>` first inside each `<details>`, without nested option inputs or buttons in the summary. The `details-name` exclusive behaviour is not yet Baseline Widely Available: without it, multiple steps may stay open safely, or a future JS exclusivity fallback must carry a local `TODO(baseline/details-name)` adjacent to that JS. No custom faux tabs or positive `tabindex`.
- Step 1 offers Raw Brushed Ti, Anodised Bronze +£180, Slate Cerakote +£220. Step 2 offers 40mm Deep Carbon Gravel Wheelset (+£620, illustrative −310 g) and 1x12 Wireless Electronic Mullet (+£450, **fixture mass difference 0 g**). Show BOM cost £4,550 and **illustrative** 8.11 kg only under that assumption, not as measured actual components. A real unknown weight renders “Weight pending verified part masses”, not false precision.
- Step 3 has an icon + text warning: “Clearance conflict: 650b x 2.1\" tyres (53mm) exceed the 45mm mudguard bridge clearance”. Replacement buttons “Switch to 58mm Expedition Mudguards (+£35)” and “Switch to 700c x 38mm Slick Tyres” are **candidates**, not “fixed” badges. Keep fit state visibly unverified until real mounted tyre, rim, frame, fork and mudguard specs clear. Disable booking until then.
- Step 4 comparison is a page-owned panel or drawer with two saved builds in the same table-like component rows, named A Alpine Fast Packing 8.11 kg/£4,550 and B Four-Season Randonneur 9.38 kg/£3,690, both sample estimates. A separate active **draft C** permalink (Bronze finish + carbon40 + son28) appears inside a **site link field**, not a browser address bar; its parts and price must not be presented as Build A/B. Confirmation text distinguishes “Saved locally / Slot request not placed” from a real backend-confirmed workshop reservation.
- `document.startViewTransition()` may interpolate one preview visual swap, with a unique `view-transition-name` for the selected layer, after state is already validated. Respect reduced motion, avoid animating a whole long BOM, restore focus/announce the changed option after the swap and perform the same immediate update without the API. View Transitions are not yet Baseline Widely Available; immediate DOM update remains the base path without a polyfill. If a future implementation adds a separate temporary motion fallback, put `TODO(baseline/view-transitions)` immediately beside it. Motion never authorises a mechanical or booking state.

## Typography

Use a licensed or system sans with enough character differentiation for mm/g/£/kg, paired with a restrained monospace for BOM deltas and build links. Option labels remain full words even when swatches are selected; summary strings name the selected SKU. Make the tolerance/error text no smaller than adjacent price text and ensure a focus-visible outline around each option. A crisp rendered “8.11 kg” is still an estimate; the source qualifier is visually attached to it, not hidden in fine print.

## Token usage

| Token | Intended value | Role |
| --- | --- | --- |
| `--ground` | `#0f172a` | Unbroken full-page canvas |
| `--panel` | `#1e293b` | Builder accordion/comparison |
| `--accent` | `#f59e0b` | Selected finish, summary and action |
| `--text` | `#f8fafc` | Primary labels and BOM |
| `--text-muted` | `#cbd5e1` | Units/qualification notes |
| `--error` | `#fb7185` | Fit conflict with text and icon |
| `--line` | `#475569` | Sparse specification separators |

These tokens are brief-defined intent, not sampled from an absent render or tested contrast results. Warm amber on a dark panel is not proof of accessible contrast; browser verification remains required.

## Spacing rhythm

Let the bicycle preview breathe on the left while keeping option names and prices close enough to scan. The open accordion gets vertical room for labelled radios; collapsed headings remain large enough for selected summaries. BOM line items stay visible at sticky bottom but reserve safe-area space and never overlap the active option or comparison sheet. On narrow screens stack the visual stage first and the builder immediately after, make the BOM sticky only when it does not obscure the focused field; avoid forcing the 60% visual and 40% builder desktop split on a 390 px viewport.

## Component hierarchy

1. **Brand/model header:** Atelier Velo, Solstice Ti, stage count and build-sharing affordance.
2. **Preview:** side-profile layered illustration and explicit geometry labels with textual selected-component fallback.
3. **Exclusive steps:** frame/finish, drivetrain/wheelset, tyres/mudguards/dynamo with native summary/option controls.
4. **BOM:** every delta, total in GBP and estimated/unknown mass, lead-time caveat, compatibility status.
5. **Fit guard:** specific conflicting components, manufacturer-evidence boundary and candidate resolution controls.
6. **Comparison sheet:** two named saved builds, per-row differences and page-owned canonical permalink field.
7. **Slot request:** explicit intent, current price/availability disclosure, pending/confirmed/refused separation.

## Anti-patterns

- Fake clickable swatches as image pixels, unrelated preview and BOM choices, weights treated as known 0 g because a component mass is missing, or a summary pill visible only through colour.
- Advertising 58mm mudguards as safe for 53mm nominal tyre solely because the numbers are ordered; mounted width, frame/fork and clearance margins are not in a model output.
- “Save & Reserve” instantly displaying a confirmed workshop booking when no slot inventory, authorised backend or transaction was used.
- A generated photograph presented as a rights-cleared Atelier Velo product asset or a 3-week lead time asserted as real availability.
- A URL string drawn as a browser address bar, traffic-light window dots, OS desktop shadow or in-page screenshot nested inside a frame.
- View Transition snapshots swallowing keyboard focus or hiding a changed BOM/fit error; selecting an option changes the visual layer while leaving the URL/compare state stale.

## Rationale

The expensive choice is mechanical compatibility, not colour animation. Semantic native disclosures make a three-step build browsable and searchable; a real constraint guard keeps non-fitting choices from being presented as purchase-ready. Layer transitions can clarify which wheel or finish changed but do not establish fit, price or rights. Exact arithmetic in the fixture demonstrates *internal* consistency of one example (£3,480 + £620 + £450 = £4,550; 8.42 kg − 0.31 kg = 8.11 kg under a declared fictional group assumption), while product truth requires a sourced SKU/BOM. A shareable URL is a selection snapshot, never a signed reservation.

## Provenance

- [Functional plan](plan.md) contains route/state/fit and booking contracts. [Four pending prompts](README.md) specify visual illustrations only; [local pending provenance](PROVENANCE.md) binds prompt text and marks image bytes/model evidence absent.
- Modern Web Guidance influenced native named `<details>` for exclusive, searchable disclosure and focus/reduced-motion routing for same-document View Transitions. No feature was shipped or browser-tested by these design files.
- Future JPEGs default `excluded_from_training: true`, `approved_for_training: false` pending separate rights clearance. No real product imagery, geometry or customer build data is present in this archetype.
