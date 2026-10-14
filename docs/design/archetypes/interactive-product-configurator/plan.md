---
archetype: interactive-product-configurator
type: product-configurator
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/interactive-product-configurator/
register: docs/design/archetypes/interactive-product-configurator/PROVENANCE.md
---

# `interactive-product-configurator` — functional contract

**Atelier Velo**, a fictional made-to-order **Solstice Ti** titanium gravel/randonneur bicycle configurator. Four proposed storyboards are not a sold product, certified mechanical fit, available inventory, measured bike mass, accurate price quote or workshop reservation. The eight headings follow [`PLAN_SECTIONS`](../../../../src/design/contract.mjs); [`design.md`](design.md) owns visual direction. No real bicycle photograph, component CAD, SKU licence or sizing advice is present.

## Use case

A rider chooses frame geometry and finish, swaps a drivetrain/wheelset, discovers that a tyre/mudguard combination fails clearance constraints, then compares two saved builds before requesting a workshop slot. The visual preview must derive from the **same selected component IDs** as the bill of materials (BOM), and URL state, availability, estimates and mechanical compatibility must remain in sync. This is a product decision aid, not a static hero image. No reservation is confirmed until a backend has accepted a specific build and slot; no recommendation of clearance or safety may be inferred from a generated still.

The sample identity “Alpine Fast Packing”, “Four-Season Randonneur”, prices, weights and production lead times are invented demonstration copy. Any later commercial implementation needs licensed images, actual catalogue components and manufacturer-confirmed clearances.

## Routes and effects

| Proposed route / action | Outcome if built |
| --- | --- |
| `GET /configure/solstice-ti?size=56&finish=raw` | Parse whitelisted option IDs, reject unknown values, render initial frame/finish, geometry label, preview, BOM, price/weight/lead-time estimates and one open accordion step. |
| `GET /configure/solstice-ti?size=56&finish=bronze&wheels=carbon40&dynamo=son28` | Rehydrate a shareable build from URL values after validation and catalogue-version pinning; do not treat URL as a price or safety authority. |
| `POST /builds` | Save a validated build revision to a user-controlled saved list; issue an opaque ID, never overwrite another user's build via guessed query strings. A local-only demo must label saved state local, not server-confirmed. |
| `GET /builds/compare?a=...&b=...` | Compare exactly two authorised builds with like-for-like option, price, estimated mass and compatibility rows. Unknown/private IDs get explicit refusal. |
| `POST /workshop/reservations` | **Future backend only.** With current catalogue price, fit/compatibility pass, ownership and slot availability confirmed server-side, create one idempotent reservation or show no slot, stale quote, denied or booking failure. A painted “Save & Reserve Workshop Slot” button is not a booking. |

No Atelier Velo site, product backend, validated price list, URL contract or workshop inventory exists in this bead.

## Data and state

- `Component`: catalogued SKU ID, version, category, options, licensed image layer, currency-specific price delta, manufacturer-sourced mass estimate and tolerance, lead-time implication, inventory validity and compatibility constraints. Keep a distinct `unknown` when a mass or mechanical clearance is not certified. Never silently convert an unknown into zero real grams.
- `Build`: frame size (e.g. 56 cm), titanium finish, wheelset, groupset, tyres, mudguards and dynamo choices, catalogue revision, measured-vs-estimated flags, source build ID and one derived compatibility verdict. Price in integer pence to avoid rounding drift; mass in grams with an estimate/unknown marker. The sticky BOM lists every selected item, cost delta, mass delta if known and lead-time estimate before displaying a grand total.
- Frame/geometry example labels: Size 56 cm, Stack 578 mm, Reach 392 mm, Max Tyre 50c. These are **storyboard geometry labels**, not certified frame tolerances or a claim that 53 mm knobby tyres fit. Verify actual size-specific frame fork/rear bridge clearance before a real order.
- Initial **fictional fixture**: Raw Brushed Ti, £3,480, estimated 8.42 kg, suggested lead time 3 weeks; Bronze +£180, Slate Cerakote +£220. Step 2 changes wheelset to “40mm Deep Carbon Gravel” +£620 and illustration mass delta −310 g, and groupset to “1x12 Wireless Electronic Mullet” +£450. Thus £3,480 + £620 + £450 = **£4,550**. For this storyboard only, assume 0 g **illustrative** groupset difference, yielding 8.42 kg − 0.31 kg = **8.11 kg**. This is explicitly an arbitrary fixture assumption, not a measured component mass or quote; a real BOM must include true sourced masses/tolerances or show weight unknown. Build B (9.38 kg/£3,690) is an independently defined fictional saved comparison, not derivable from the Step 2 basket without its own itemised SKUs.
- Fit guard: “650b × 2.1-inch Knobby Trail” is a nominal 53.34 mm tread label, not a measured mounted width. “45mm Full-Coverage Alloy Mudguards” have a nominal 45 mm bridge; this **fails** even nominal width comparison. Candidate one-click replacements are “58mm Expedition Mudguards (+£35)” or “700c × 38mm Slick Tyres”. The first candidate's nominal bridge leaves only a rough 4.66 mm difference against 53.34 mm; this does **not** establish required tyre-to-guard clearance under real rim, inflation, flex, mud and frame/fork geometry. Re-run a manufacturer-verified minimum-clearance guard; if any required evidence is missing, show **fit unverified; reservation disabled** rather than declaring the switch safe. The slick alternative likewise must check wheel diameter, tyre/frame and mudguard compatibility, not merely width.
- The left preview is an authored/licensed layered side profile keyed by actual selected frame/wheel/tyre/finish IDs; geometry badges and optional animation are separate semantic text. A conceptual JPEG may show the chosen parts but never attests fit or image rights. Use `history.replaceState` with a validated canonical query when options change; support Back/Forward restoring view state, and avoid leaking personal information in a URL.

## Journey

1. Open the full-bleed split page. Left ~60% sticky **visual preview stage** illustrates brushed titanium Solstice Ti in side profile, with Size 56 cm / Stack 578 mm / Reach 392 mm / Max Tyre 50c badges. Right ~40% has native `<details name="build-step">` accordions with **1. Frame Size & Titanium Finish** open, mutually exclusive finish inputs and Raw Brushed Ti selected. Sticky BOM shows fixture £3,480, est. 8.42 kg, suggested lead time 3 weeks. A control must update the same selected SKU in preview, URL and BOM.
2. Open **2. Drivetrain & Wheelset**; native exclusive details closes Step 1 but keeps its selected summary visible via text and optionally `:has(:checked)` styling. Choose 40mm Deep Carbon Gravel Wheelset (+£620, illustrative −310 g) and 1x12 Wireless Electronic Mullet (+£450, illustrative 0 g difference for this fixture). Preview layers change to deep carbon rims and tan-wall gravel tyres only when that selected variant actually includes them. BOM itemises £4,550 / **illustrative estimate** 8.11 kg; group mass assumption must be clearly marked. A supported `document.startViewTransition()` may animate the preview; same DOM state/focus and accessible option confirmations work without it.
3. Open **3. Tyres, Mudguards & Dynamo Lighting**. Choose 650b × 2.1-inch Knobby Trail Tyres and 45mm Full-Coverage Alloy Mudguards. An immediate text + icon error states exactly “Clearance conflict: 650b x 2.1\" tyres (53mm) exceed the 45mm mudguard bridge clearance”. Offer “Switch to 58mm Expedition Mudguards (+£35)” and “Switch to 700c x 38mm Slick Tyres” as **candidate change** buttons. Reselect, recompute fit and price once, and block reservation until clearance and wheel/frame combinations are actually verified. Selecting a button is not itself a certified fix.
4. Save Build A “Alpine Fast Packing” and Build B “Four-Season Randonneur” as fictional sample builds; open a labelled comparison sheet with A 8.11 kg / £4,550 and B 9.38 kg / £3,690, aligned component rows and explicit estimate flags. Show a separate **active draft C** link field containing `?size=56&finish=bronze&wheels=carbon40&dynamo=son28` only after draft C actually selects those values; do **not** imply the link represents either A (£4,550 with Raw Ti) or B (£3,690 with its own component list). Copy a validated canonical link and restore draft C's **same** selections and version after reload. “Save & Reserve Workshop Slot” opens a separate confirmation/availability flow; local-only concept labels it an *unplaced request*, never “Booked” from a still.

## Validation and states

- Use native, labelled radio groups and `<fieldset>/<legend>` for mutually exclusive options. `<details name="build-step">` provides exclusive disclosure where supported without bespoke tab widgets; `<summary>` is the first child of each `<details>` and its text remains meaningful when closed and selected values stay accessible even without `:has` CSS. A browser without mutual exclusivity can still reveal all steps safely; **never** lose selections or hide the sticky total because disclosures differ.
- Arithmetic tests use integer pence and grams against a pinned fixture catalogue. Each BOM line has units and sign, and a price/weight grand total derives solely from those same lines. Unknown mass stays unknown, not 0 g; illustrated 8.11 kg is allowed only while the explicit fixture group assumption is shown, not as real measured hardware.
- Mechanical fit validation runs against every relevant manufacturer specification (wheel diameter, mounted tyre width at actual rim, tyre/frame/fork/guard clearances, dynamo and wiring interference). A nominal label is insufficient for “compatible”. Show incompatible, unverified and verified states separately; every proposed resolution revalidates rather than flipping a CSS class to success.
- Malformed/tampered URL options and retired SKU/version yield a safe explanation and replacement choice without submitting an order. Saving requires informed user action; booking requires authenticated backend inventory and explicit final price, with idempotency and clear pending/confirmed/refused outcomes. No screenshot can prove it.
- Price, lead time, tax, shipping and exchange-rate terms must be disclosed before any real sale. A displayed 3-week lead time is fictional, not a slot guarantee.
- `document.startViewTransition()` is progressive motion, not part of state truth. Respect reduced motion; preserve keyboard focus and announce the selected option once, independent of animation. Do not use generated JPEGs as in-app layers unless licensed and approved for that use.

## Acceptance criteria

- Changing frame size/finish and wheelset/groupset updates one canonical SKU selection reflected in preview, URL and every BOM line, with price/mass arithmetic from a pinned fixture; Back/Forward and reload restore the same valid state without changing totals.
- Step 1 to Step 3 exclusive accordions remain keyboard operable, only one is open on supported browsers, and selected step summaries persist as text (not only a `:has` coloured border).
- Selecting Step 2 fixture parts yields £4,550 and only yields 8.11 kg while the explicitly synthetic groupset mass assumption and “est.” label are visible; real unknown mass yields no numeric total.
- The 650b × 2.1-inch + 45mm mudguard conflict blocks reservations with the exact text above; either offered change triggers complete fit revalidation, and 58mm mudguards are not falsely guaranteed safe from nominal width alone.
- Saved Build A/B compare by matching option rows with clear price/estimated-mass differences; private saved builds are not exposed by a guessed share link.
- A share link loads the exact selected canonical SKUs and catalogue revision. “Save & Reserve Workshop Slot” yields an actual confirmed reservation **only after** validated availability, explicit final price and backend acceptance; otherwise it truthfully says pending/refused/unavailable.
- Four independently approved and inspected page-only 1376 × 768 boards, if generated later, contain no browser/OS chrome; they alone prove none of the functional criteria above.

## Site Generation Prompt

Build the **fictional Atelier Velo — Solstice Ti** responsive product configurator as a usable web app, not a JPEG or a fake checkout. Draw a continuous #0f172a page canvas with #1e293b control panel, measured warm amber #f59e0b active accents and a roughly 60% preview and 40% builder split: sticky left licensed/locally authored layered bicycle side-profile with text geometry Size 56 cm, Stack 578 mm, Reach 392 mm, Max Tyre 50c; right native `<details name="build-step">` exclusive sections for frame/finish, drivetrain/wheelset and tyres/mudguards/dynamo. Site content must fill the viewport with no browser frame, macOS traffic lights, address bar or outside window shadow. Select Raw Brushed Ti for the initial fictional £3,480, est. 8.42 kg, 3-week lead-time basket. Selecting carbon40 wheelset +£620/−310 g and wireless mullet group +£450 updates preview and itemised BOM to £4,550; the 8.11 kg comparison sample must remain labelled an **illustrative** estimate with the groupset 0 g fixture assumption, never a measured bike. URL state uses validated `history.replaceState` and compatible Back/Forward handling; View Transitions only polish correctly synchronised preview layer swaps and reduced-motion/unsupported browsers still work.

For a 650b × 2.1-inch tyre paired with a 45mm bridge, show the precise clearance conflict and two candidate replacement actions; don't claim a 58mm guard safe until mounted tyre/frame/guard clearance has authoritative evidence. Keep a live BOM summary and accessible selected option text even when native details are closed. Compare fictional saved builds Alpine Fast Packing (8.11 kg/£4,550) and Four-Season Randonneur (9.38 kg/£3,690) in an aligned page-owned comparison sheet; show a shareable validated query only for its matching build. Booking is a distinct backend-required availability/price confirmation, **not** accomplished by a screenshot or local-only saved flag. Test selection and totals, incompatible/unverified/verified fit, keyboard disclosure, canonical link round-trip and refused booking before calling the product functional. Four separately authorised still images are design references only.

## Implementation status

**Planning only.** No functional configurator, licensed component images, manufacturer fit evidence, quote, saved build service, reserved workshop slot or four JPEGs exist here. The [`README.md`](README.md) prompts are offline text; no image model/gateway has been called. Any generated assets, true raster provenance, rights clearance and viewer/type-axis wiring require a separate authorised task. Sealed A6 and existing A1 training assets remain untouched.

## Provenance

- Design/layout direction: [`design.md`](design.md). Four exact page-only image prompts: [`README.md`](README.md). [Local pending provenance](PROVENANCE.md) holds prompt digests and absent output evidence.
- Type-axis context: [`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md), unchanged in this offline slice.
- Future images default `excluded_from_training: true` and `approved_for_training: false`; product imagery licences and workshop figures are not attested by this authoring work.
- Work: `mwg-train-07ka.5` offline docs/test only; a separate approval-gated task owns generation, vision, global asset register and /concepts wiring.
