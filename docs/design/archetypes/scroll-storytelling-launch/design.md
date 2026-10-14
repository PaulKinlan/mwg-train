---
archetype: scroll-storytelling-launch
type: scroll-storytelling-launch
boards: docs/design/archetypes/scroll-storytelling-launch/
register: docs/design/archetypes/scroll-storytelling-launch/PROVENANCE.md
---

# `scroll-storytelling-launch` — authored visual system

**Planning system, not a description of generated pixels.** Aether Audio and Aether One are fictional in this archetype. The supplied palette, subject and four named states govern this document; until authorised images exist, no value here is claimed to have been measured from a model output. Interactions are proposed in [`plan.md`](plan.md), not implemented by this design.

## Direction contract

**THESIS:** Reveal the driver as a physical assembly, not four interchangeable marketing cards. The visitor understands what is offered before the page begins to move.

**OWN-WORLD:** Obsidian equipment-room ground, restrained warm copper action, off-white precision labelling, a dark continuous stage; no floating browser or product-window frame.

**STORY:** See the complete instrument, separate and inspect its layers, choose its finish and pads, compare then inspect the proposed pre-order summary.

**FIRST VIEWPORT:** Narrow sticky chapter bar and progress rule above one expansive centred product photograph; headline beside/below the instrument, three legible brief-supplied badges and one £649 sample action.

**FORM:** Brief-pinned hardware launch; code-led planning until image spend is authorised. Impeccable concept-seed unavailable on this VM, so no seed key exists. Signature motion: optional scrubbed separation of the driver stack.

**FINISH:** Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Visual thesis

A precision audio instrument described through its actual parts rather than a glossy tile carousel. The first state is a calm, continuous obsidian field containing the full Aether One form; the second opens that form into an aligned exploded diagram; the third restores the whole object so finish and pads can be compared; the fourth turns to a clear engineering table. Copper marks decisions and diagrams sparingly. A launch visitor should be able to leave after the first viewport knowing what the fictional product is and what the next action would be, without mistaking the illustrative numbers for certified lab results.

The physical scene is a controlled listening studio with low ambient light; the dark ground follows that scene and the user's pinned colors rather than a generic “premium tech = neon black” convention. The four boards are **page-only 1376 × 768 visual references**, not four windows floating on a desktop and not proof of functional scrolling.

## Grammar and layout

- One continuous responsive document: named `#overview`, `#acoustics`, `#materials`, `#compare`, `#pre-order` chapters; a sticky chapter bar never obscures focused headings (use `scroll-margin-block-start`). The progress line is a decorative scroll cue, not an invented accessibility percentage.
- The hero occupies the first viewport at desktop width with a real subject photograph/render, not CSS pretending to be headphones. Reserve the media box's dimensions to prevent layout shift. The headline “Precision you can see through” balances against a single instrument, not a grid of features. On mobile, retain the same information in reading order: brand/nav, product, headline, badges, action.
- In Acoustics, the default DOM is a legible stepped sequence: full object, baffle, magnets, diaphragm, each with text. A sticky stage and CSS `view-timeline`/`animation-timeline` may separate the layers in supporting browsers, but the content exists before any animation. Limit animation to transform and opacity; never tie primary text visibility to scroll progress. The switchable frequency figure has two named series and a textual explanation even if no chart draws.
- The anchor-positioned layer labels are an enhancement over a grid/list of callouts. CSS `anchor-name` belongs on the layer, `position-anchor` on its explanatory callout; `@supports (anchor-name: --diaphragm)` opts in. Unsupported browsers and reduced-motion users get the same labelled layers directly beside the figure in DOM order. No authored connector uses fake precise measurements.
- In Materials, the large render retains its reserved dimensions and angle across finish choices; three finish buttons and two ear-pad buttons are visually distinct and keyboard operable. The sticky bottom selection bar displays the two choices, illustrative dispatch date and price without obscuring focus or footer on a small viewport. The View Transitions API only polishes a DOM change already complete without it.
- In Compare, a `showModal()` `<dialog>` becomes a slide-over panel with a native backdrop and a three-column comparison table. Desktop specification cells inherit parent grid tracks via `subgrid`; narrow viewports keep semantic row/column associations and horizontal scrolling within the comparison region, not the entire page. A native Close button and Escape dismiss. The same comparison content remains in flow if JavaScript is unavailable.

## Typography

- Product headline and chapter headings: Barlow Condensed or a licensed equivalent with a strong, accurately drawn numeric set; host the actual font file with its license before a functional site claims that face. Fallback to the platform sans until then, without fabricating a font asset.
- Supporting text, controls and tables: a readable system sans with consistent tabular numerals for prices, the headroom readout and 0.04% claim. Diagram labels use the same sans rather than monospace as a technical costume. A 65–75 character reading measure holds explanatory paragraphs.
- Body text is at least 16 CSS px with a generous line-height; small specification labels retain WCAG AA contrast on `#111827`. Headline ink is `#f8fafc`; copper never becomes low-contrast white-on-copper text.

## Token usage

| Token | Value | Role |
| --- | --- | --- |
| `--ground` | `#090d16` | Continuous page and modal backdrop ground |
| `--surface` | `#111827` | Comparison rows, restrained callout panels and sticky selection summary |
| `--copper` | `#f59e0b` | One primary action, selected finish outline, diagram focus and progress ink |
| `--ink` | `#f8fafc` | Headline, body and high-importance values |
| `--ink-muted` | `#cbd5e1` | Secondary explanatory text; never sole label of a choice |
| `--separator` | `#475569` | Diagram leaders and specification rules, used sparingly |
| `--danger` | `#fb7185` | Field errors accompanied by literal messages |

These values are **brief-specified design tokens**, not values extracted from absent JPEGs. Validate contrast on the built result. Copper-filled buttons take dark `--ground` text; a selected state has both an outline/text marker and `aria-pressed`, not colour alone.

## Spacing rhythm

The hero has negative space around the instrument, and the chapter bar is only tall enough for legible controls. A chapter begins after its predecessor finishes; dense anatomy labels and specification rows earn quiet margins before the next large product view. Use fluid inline padding and content-sized controls instead of scaling every dimension from a 1376 px raster. On mobile, keep the bottom selection bar below focusable chapter content and account for dynamic viewport chrome without drawing that chrome into a reference image.

## Component hierarchy

1. **Chapter masthead:** Aether Audio name; five chapter links; reduced-motion toggle with an expressed state; visible but non-numeric progress line.
2. **Hero instrument:** one informative image with alt describing the product, headline, three illustrative spec badges and the £649 sample CTA. Do not lazy-load the first-viewport image; later figure images may be lazy-loaded with width and height reserved.
3. **Acoustic stage:** exploded physical layers, linked labels, two-choice illustrative frequency figure and persistent explanatory prose.
4. **Materials bench:** finish and pad selectors, product view and selection feedback; one bottom summary of current choices, sample date and price.
5. **Comparison drawer:** modal `<dialog>` with heading, close control, three aligned product columns and labelled impedance/sensitivity calculator. The inline comparison is its no-JS source of truth, not a second drifting data table.
6. **Footer and attribution:** explicit fictional concept/measurement status, no payment collection, keyboard-accessible chapter navigation.

Suggested progressive-enhancement contract (not shipped CSS):

```css
/* The default anatomy is fully visible and readable. */
.anatomy-steps { display: grid; gap: 1.5rem; }
/* TODO(baseline/scroll-driven-animations): Remove only the unsupported-browser presentation branch when supported; retain the reduced-motion static layout. */
@supports ((animation-timeline: scroll()) and (animation-range: 0% 100%)) {
  .anatomy-stage { view-timeline: --driver block; }
  .anatomy-layer { animation: separate auto linear both; animation-timeline: --driver; animation-range: entry 10% cover 75%; }
}
/* TODO(baseline/anchor-positioning): Remove the unsupported-browser spatial layout branch once native anchors meet the project's Baseline target; keep labels in DOM order. */
@supports (anchor-name: --driver-layer) {
  .driver-layer { anchor-name: --driver-layer; }
  .driver-label { position-anchor: --driver-layer; position-area: center end; }
}
@media (prefers-reduced-motion: reduce) {
  .anatomy-layer { animation: none; transform: none; opacity: 1; }
}
```

The example expresses support boundaries, not a claim that all browsers support `view-timeline` or that a single anchor name can position every individual layer: a real build assigns unique anchors per layer and tests placement at all sizes.

## Anti-patterns

- Browser chrome, macOS traffic lights, address bars, tabs, OS wallpaper or an exterior window shadow baked into any board; the JPEG itself is the page canvas.
- Product shape drawn from a generic CSS circle or a borrowed photo without provenance; the central image must depict an actual authored subject and remain unwarped.
- Hero badges invented as independently measured facts; a chart labelled “Measured” without a source and an “isolation delta” with made-up dB values are likewise prohibited. The illustration may show the provided words with an explicit concept disclaimer, not a performance attestation.
- Parallax/scrub animation that hides text in Firefox or for reduced-motion users, a scroll event handler that blocks navigation, or a global `animation-duration: 0.01ms` accessibility workaround.
- View transitions as the only way to swap content; labels anchored outside the stage and clipped on narrow screens; an inert or hidden comparator when scripts do not execute.
- Model/comparison cards with identical empty stats or a calculator whose formula treats impedance as changing mW while sensitivity is explicitly per mW.
- Simulated purchase flow that asks for payment, alleges a placed order or implies the sample shipping date is a business commitment.

## Rationale

The four states form one cause-and-effect narrative: the listener first encounters the object, learns why its layers matter, then decides which material version to consider and checks whether the accompanying setup is plausible. The brief's metallic copper is an action/material cue rather than a neon outline. Meaning survives without movement because the layer names, text order, selected labels and comparison table are primary; supported CSS motion only illustrates the relation. The present deliverable is an authored direction, not an image-model result, and visual approval must wait for licensed source assets and the four authorised, inspected board bytes.

## Provenance

- Functional assertions: [`plan.md`](plan.md). Exact pending image instructions: [`README.md`](README.md).
- [Local pending provenance](PROVENANCE.md) labels all four missing outputs and their absent digests; images, rights and model attestation cannot be inferred from prompts.
- Modern Web Guidance was consulted for native scroll timelines and motion, CSS anchor support, semantic dialog and layout. Anchors and scroll-driven effects are not Baseline widely available here; the default static steps preserve the content, with explicit support gates and reduced-motion override. No feature is claimed implemented by this planning document.
- The sealed A6 targets and A1 corpus are unaffected. `excluded_from_training: true`; `approved_for_training: false` for any future illustrative board absent separate clearance.
