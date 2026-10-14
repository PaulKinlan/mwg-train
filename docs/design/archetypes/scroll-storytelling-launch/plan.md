---
archetype: scroll-storytelling-launch
type: scroll-storytelling-launch
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/scroll-storytelling-launch/
register: docs/provenance/assets/design-reference-scroll-storytelling-launch.md
---

# `scroll-storytelling-launch` — functional contract

A proposed, fictional Aether Audio launch for **Aether One** planar magnetic headphones. The four visual states describe a site to build; neither images nor a functioning product, measurement, purchase flow, or actual shipping commitment are established by this plan. The eight contract headings follow [`PLAN_SECTIONS`](../../../../src/design/contract.mjs); the aesthetic system is in [`design.md`](design.md).

## Use case

A prospective listener explores the product's acoustics, selects a finish and ear-pad material, compares models and checks amplifier headroom before deciding whether to pre-order. The site's other actor is a launch editor: they must be able to withdraw an unavailable finish or revise an unverified acoustic claim, and that publication change must affect what the next listener can select. The editor flow is a **future capability**, not an implemented CMS or an image-only interaction. A static long-form brochure that cannot alter a product choice or calculator input does not satisfy this type.

All prices, shipping dates, model names and acoustic figures in this fictional brief are *illustrative art direction supplied for this archetype*, not verified commercial or laboratory facts. Do not turn the depicted pre-order button into a chargeable checkout or describe the curve as independently measured until a source exists.

## Routes and effects

| Route/section | Actor | Intended effect |
| --- | --- | --- |
| `GET /` (`#overview`) | listener | One launch document with accessible chapter links, visible scroll progress and the Aether One hero; the primary pre-order action opens an illustrative summary, not a payment capture. |
| `/#acoustics` | listener | Anatomical layers reveal as the section advances; selecting Diffuse Field Target or Aether One Measured (illustrative) changes the labelled curve and text description. |
| `/#materials` | listener | Select one of three finishes and one of two ear-pad materials; the main rendering, selection description and sticky summary update together. Selection survives switching chapters; no stock or account claim. |
| `/#compare` | listener | Button opens a modal `<dialog>` with three model columns, aligned specifications and a headroom calculator. It returns focus to the opener when dismissed. |
| `GET /pre-order?finish=...&pads=...` | listener | **Proposed only.** Shows a non-transactional selection review; never accepts card details or claims an order exists. Unknown variants are refused with an explicit recovery link. |
| `GET/POST /editor/launch` | editor | **Proposed only, not present.** After verified authorisation, publish availability/claim changes; a subsequent listener visit uses the revised version. An unauthenticated visitor cannot edit it. |

Chapter fragments are positions within one accessible document, not five fictitious server routes. The static chapter contents remain readable when scroll-driven CSS, JavaScript, or motion preferences disable enhancements.

## Data and state

- Product sample: `Aether One`, an illustrative £649 price and 18 Nov 2026 shipping label, 98 mm planar driver, 0.04% THD at 1 kHz and 310 g milled titanium **only as brief-supplied, unverified copy**. Additional models `Aether Studio Pro` (£899) and `Aether Reference` (£1,299) are comparison placeholders, not proven catalogued products.
- Finish is one of `Anodised Obsidian`, `Raw Bead-Blasted Titanium`, `Warm Brushed Copper`. Ear pads are `Perforated Lambskin` or `Acoustic Micro-Suede`. Both selectors are buttons with a single expressed selection, not decorative swatches; defaults are labelled and summary state follows them.
- The frequency curves are clearly marked **illustrative, not laboratory data** until data with provenance exists. Both options retain adjacent textual descriptions and do not rely on colour to identify the line.
- The calculator accepts an amplifier load impedance in ohms and sensitivity in **dB SPL per 1 mW** at a disclosed target SPL. Required power is `10 ** ((targetSPL - sensitivity) / 10)` mW; impedance is used separately for `V rms = sqrt((required_mW / 1000) * impedance_ohms)`. Thus changing impedance alters voltage, not the derived power when sensitivity is per mW. Label assumptions and round results; this is a planning formula, not a product measurement or a hearing-safety recommendation.
- Motion preference is the OS `prefers-reduced-motion` media feature with a visible `Reduced motion` toggle that can opt out even when the OS does not. A failed storage read/write cannot hide content or block the static chapters. The visual progress bar is decorative, not a fabricated numeric percentage.
- Editor revisions and listener choices have distinct authority: an editor may publish availability, but a listener cannot submit it. This boundary is not implemented by any existing design board.

## Journey

1. Open the hero. Read the product name, brief-supplied driver badges and £649 sample action. Use the sticky chapter nav to reach Acoustics; the current scroll segment is visually marked without hijacking wheel input or keyboard focus.
2. Scroll through the pinned exploded anatomy: baffle, dual magnet array and 2-micron diaphragm form a labelled spatial sequence. At least the text list remains in document order when native scroll timelines or anchor positioning are unavailable. Toggle the two labelled curve descriptions and hear/see the new selection state without requiring animation.
3. Enter Materials; choose `Warm Brushed Copper` and `Acoustic Micro-Suede`. The product view, accessible text, isolation description and sticky selection summary all change together. A supported same-document View Transition may animate this switch; its absence leaves an immediate, complete update.
4. Open Compare. The `<dialog>` traps focus natively, exposes model specifications in reading order and does not trap focus after close. Change a validated impedance and sensitivity input; the formula's mW and V rms outputs update. Close with Escape and confirm focus returns to the Compare button.
5. Enable Reduced motion and repeat chapters 2–4: the three anatomy layers become an immediately legible static stepped explanation, there is no continuously scrubbed image, and all variant, comparison and pre-order controls still work.
6. An editor (when that route is built and authenticated) withdraws a finish; a new listener visit cannot choose it and receives an explanation instead of a misleading order-ready summary. This is an **unimplemented** second-actor acceptance journey, not evidence present in the four pictures.

## Validation and states

- Invalid, blank, zero, negative or excessively large impedance/sensitivity inputs show a plain-language error next to their labelled field; stale calculator outputs are not presented as valid. Conversion units and assumed target SPL are visible.
- Unsupported scroll timeline or anchor positioning defaults to a fully visible static anatomy/list layout; no polyfill or scroll listener is required to read the claims. The `@supports` test includes *both* `animation-timeline` and `animation-range` to avoid partial support; an `@media (prefers-reduced-motion: reduce)` override removes the continuous effect. The explicit toggle overrides motion in the same direction.
- Native `<dialog>.showModal()` handles modal focus/inert background; labelled Close button in a `method="dialog"` form and Escape dismiss it. If JavaScript is unavailable, the comparison table remains accessible in normal page flow (not hidden behind an inert trigger).
- An unavailable selected finish is cleared or identified after an editor revision; a prospective buyer never receives a purchase link for it. An unknown query variant returns a refusal, not a silently substituted product.
- No images or prices are treated as verified products; draft/absent boards and unimplemented routes are labelled honestly in the gallery.

## Acceptance criteria

- A first-time visitor can identify Aether One, the illustrative price and the chapter navigation without scrolling past an unrelated hero.
- The anatomy layers remain legible in reading order with JavaScript disabled, native scroll timelines unsupported, anchor positioning unsupported and reduced motion enabled.
- Moving through the chapter markers changes only a decorative progress indicator; all anchors remain keyboard reachable and the entire page remains scrollable.
- Choosing a finish and pads changes both the accessible selected state and sticky summary; changing only the finish does not reset the pads.
- Switching curve views changes labelled text and curve state; no invented numeric lab dataset is attributed to a source.
- The comparison dialog opens, traps focus and closes with both Escape and its Close button, restoring focus to the opener; the inline no-JS comparison remains readable.
- With sensitivity in dB SPL per 1 mW, a sensitivity change changes required mW and V rms; changing only impedance changes V rms and leaves mW unchanged.
- Invalid calculator values produce field-specific errors and no apparently valid stale output.
- An authorised editor's withdrawal is visible to a fresh listener and a listener cannot edit availability. This is a future criterion, not passed by the images.
- Four page-only, 1376 × 768, separately authored illustrative JPEGs represent the chapter states without OS/browser chrome; their SHA digests and model attestation are recorded only after authorised generation and visual inspection.

## Site Generation Prompt

Build a responsive, accessible Aether Audio product launch website for the fictional **Aether One** reference planar magnetic headphones. Use an obsidian `#090d16` page ground, `#111827` lifted surfaces, copper `#f59e0b` restrained action accent and legible `#f8fafc` headlines. In the first viewport place the product hero photograph centrally, the exact headline “Precision you can see through”, illustrative specification badges (98 mm Planar Driver; 0.04% THD @ 1 kHz; 310 g Milled Titanium), sticky named chapter navigation, a visible progress rule, Reduced motion toggle and “Pre-order £649” sample action. Do **not** draw a browser frame, traffic lights, address bar or desktop wallpaper as page content. Show a clear “fictional concept / measurements unverified” note in the functional site.

Keep all chapter content in semantic HTML. The Acoustics chapter uses CSS scroll-driven effects as an optional progressive enhancement for a pinned exploded driver diagram with visible baffle, magnets and diaphragm; supply a static, stacked text-and-image explanation for unsupported browsers and reduced-motion users. Enhance baffle/magnet/diaphragm callouts with CSS Anchor Positioning only when supported; the base layout must remain labelled and unclipped. A two-choice frequency comparison changes its labelled curve *and* adjacent description, marking the supplied “Measured” name as illustrative. The Materials chapter uses buttons for the three supplied finishes and two ear-pad options, updates a genuine product illustration/render and the sticky bottom selection summary, then may use `document.startViewTransition()` when available and not reduced-motion; the immediate DOM update is the default. The Compare chapter opens a modal native `<dialog>` with a three-model, CSS-subgrid-aligned comparison, focus restoration, and a validated impedance/sensitivity calculator using the formula and units above. Show the sample shipping date and prices as illustrative, never complete a real checkout or claim payment was accepted. Keep links, focus, labels, field errors and static chapter reading accessible on keyboard and mobile. Do not implement a model-called demo or treat the four boards as proof any interaction works.

## Implementation status

**Planning only.** No live Aether site, authenticated editor, acceptance browser run or approved training/evaluation pair exists. The README supplies four image *instructions*; JPEG files and generation provenance remain pending an amount-scoped approval for the specified model gateway. No model call has been made for this archetype. Viewer wiring may name pending states, but must not claim a board exists until bytes actually land. The sealed A6 targets and the A1 training manifest are untouched.

## Provenance

- Type axis and planned status: [`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md).
- Aesthetic decisions: [`design.md`](design.md). Exact future image prompts: [`README.md`](README.md).
- [Reference asset register](../../../provenance/assets/design-reference-scroll-storytelling-launch.md): deliberately records missing SHA and model evidence until four authorised outputs are actually verified. `excluded_from_training: true`; `approved_for_training: false`.
- Work: `mwg-train-07ka.1`. No existing image grants commercial rights, model identity or performance claims. No new evaluation target is authorised.
