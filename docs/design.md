# Design language for synthetic web applications

**Status:** proposed generation guidance, not a measured result or an implemented site. Applies to future independently authored web-app families; it does **not** alter the existing pilot/evaluation targets, sealed briefs, or training-pair acceptance. This is a *grammar for coherent projects*, not a single template to copy into every app. `docs/train/briefs/EXPANSION-PLAN.md` and `expansion-matrix.json` define product archetypes and roles; no prose prompt generator currently consumes this document.

## Principles

1. **Give each project a visual thesis.** Choose the subject, audience, scene and task before choosing a palette. One recognizable information hierarchy, consistent component anatomy and deliberate image/content treatment should survive across every route in a family. Do not assign a universal house brand to a storefront, game and wiki.
2. **Function decides composition.** Persuade (storefront, pricing), Operate (workspace, checkout, dashboard), Read (article, wiki), and Experience (game, interactive demo) use distinct layouts, even within the same product. Show the real task in the first viewport; preserve navigation and state across the rest of the flow.
3. **Use tokens, not an identical screenshot.** The existing [`base.css`](eval/targets/base.css) shows a conservative system-font, paper/ink/line/accent vocabulary with a 62rem content frame and visible 3px focus outline. Treat it as an accessible precedent, not as a mandate that every target share its geometry. Per-family content, density, imagery and layout remain distinct to protect the experiment's design diversity.
4. **Design every state.** Loading, empty, invalid, success, unavailable and permission-denied states belong to the same component system. Visual polish cannot substitute for a working route, durable receipt, playable game or authorization boundary.

## A usable token contract

These are **starting ranges** for a new family, not pixel-perfect evaluation thresholds. Record the chosen token values once in that family's source and use them consistently across its routes. Keep the product copy, imagery and type choices original to that family.

| Token | Default starting point | Variation rule |
| --- | --- | --- |
| `--ink`, `--muted`, `--surface`, `--ground`, `--line` | dark readable text; quieter secondary text; distinct card/page surfaces and a visible divider | Pick a light or dark scheme to fit the usage scene; check text and control contrast in both intended states. Color is not the only state cue. |
| `--action`, `--action-ink`, `--focus` | one decisive action hue with readable text; 3px visible focus outline, 2px offset | Preserve semantics across routes; use reserved caution/error colors for those states rather than styling every chip as a CTA. |
| `--space-*` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px | Put related label/control pairs closer than neighboring sections; use larger section breaks to signal hierarchy, not arbitrary whitespace. |
| `--radius-*` | 4 / 8 / 12px | Choose one corner character for controls/cards; avoid an unrelated radius on each component. Sharp editorial and soft utility systems are both valid. |
| `--measure` | roughly 60–75 characters for continuous reading; wider for tables/media | A reading column and a data grid need different widths. Never force long prose to span the full dashboard grid. |
| `--frame` | 62rem working starting point (as in `base.css`) | A game stage, illustrated product story or operations table may need a wider or edge-to-edge region while controls remain legible. |

### Type and headings

Use local/system fonts by default (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`); no remote font requests, third-party icon fonts or copied brand assets in corpus/evaluation targets. A system serif can be used for a specific reading-world rationale, but do not make *every* blog serif and *every* SaaS page mono. Define a per-family type scale approximately: supporting text 0.875rem, body 1rem at 1.5–1.65 line height, section heading 1.25–1.6rem, page heading 1.9–2.8rem (fluid only where it improves composition). Maintain a real h1→h2→h3 outline; size does not determine semantic rank. Headings need more room above than below; paragraph spacing should support reading and scanning, not identical repeated gaps. Tables and status labels use tabular numbers when alignment matters, never microscopic labels to fake sophistication.

### Layout grid and responsive rules

Start with a fluid page frame and a 12-column desktop planning grid, **not** a fixed 1440px canvas: 16–32px side padding, 16–24px gutters, and a reading measure independent of the canvas width. A medium viewport can use 6–8 columns; below the content's natural break (often near 44rem in the current target stylesheet), use one column with 16px side padding and preserve content order. The actual breakpoint follows where the controls/content stop fitting; test both a 390px mobile viewport and a 1280–1440px desktop viewport. A table can scroll within its own labelled region or transform into labelled rows; never clip price/feature labels. Sidebars move below the primary content unless they contain essential navigation, which must remain discoverable. A two-column checkout keeps order context adjacent on desktop and places the total before final confirmation on mobile. Avoid horizontal page overflow at 200% text zoom.

### Light and dark modes

Pick the default from the use scene, then define both light and dark semantic tokens **if the product offers a theme switch or follows system preference**. `--ground`, `--surface`, `--ink`, `--muted`, `--line`, `--action`, `--action-ink`, `--focus`, and error/success colors must each have mode-specific values; merely inverting colors loses component hierarchy. Preserve text/control contrast, visible focus and readable chart differentiation in both modes. Use native `color-scheme` for built-in controls when matching the chosen theme. Persist an explicit user choice only if the brief requires it, and avoid a flash that renders the wrong mode as content loads. A single-mode design is acceptable if no switching is promised; do not add a fake toggle.

### Component anatomy

- **Navigation:** product identity, current location and the next relevant task are discoverable; current item has a textual/semantic cue, not color alone. Long-lived tools may use a rail; public reading has a table of contents; checkout reduces distraction without hiding recovery.
- **Cards and rows:** each item has one primary object/name, distinguishing facts, status/price when relevant and one clear action. Images have stable aspect ratio and purposeful crop; missing images get a real empty treatment. A product card uses image → name → distinguishing variant/availability → price → inspect/select, with the whole card *not* made into a nested-button target. A pricing tier uses tier name → audience/use case → price and billing unit → included limits → explicit exclusions → choose action; feature rows align across tiers in a comparison table when buyers need a direct comparison. Toggling billing period updates amount, cadence and any qualified discount together, and the chosen tier is carried into the signup/checkout summary. Cards do not replace a comparison table where aligned differences matter.
- **Buttons and links:** one primary action per decision cluster; secondary/quiet variants for reversible actions. Distinguish navigation links from state-changing buttons. Give controls generous touch area, clear disabled reasons where useful, and visible keyboard focus.
- **Forms:** persistent visible labels, associated hints/errors, grouped related fields, autocomplete where applicable, an explicit submit/result state, and a recovery route. Error text identifies the field and repair action rather than relying on color. Password, checkout and payment simulation use no real credentials.
- **Feedback:** loading preserves spatial context; validation appears after interaction or submit; success identifies what changed and where to find it after reload. Async failure offers retry without losing safe user input. Modals are not a substitute for a normal page journey.
- **Media/visualizations:** charts expose a readable summary and underlying values; demos expose changed input and output; games expose controls, current state, terminal state and restart. Decorative motion never hides content, and reduced-motion preference is respected when motion is authored.

## Layout grammars: compose, do not trace

| Grammar | Primary archetypes | Distinct structure | Mobile response |
| --- | --- | --- | --- |
| **Field notes / Read** | `reading-reference`, plus explainers/courses from `play-learning` | Search/TOC rail + restrained reading column + optional interactive diagram; citations and related paths below the argument | TOC collapses to an accessible disclosure or page navigation; diagram stacks after its explanation. |
| **Object ledger / Persuade** | `commerce`, plus events from `services-participation` | Editorial product/offer grid + clear detail pane and next action; pictures are content rather than background decoration | Grid becomes 1–2 columns; product facts and add/select action stay adjacent; basket summary does not cover controls. |
| **Decision workbench / Operate** | `business-identity`, plus checkout/pricing from `commerce` and booking from `services-participation` | Aligned comparison/table or task list with contextual form/summary; persistent selection or status follows the journey | Comparison scrolls or reorganizes with labels intact; summary follows the decision, not a fixed overlay. |
| **Stage / Experience** | games and interactive demos from `play-learning` | The playable/executable surface leads; controls, instructions, output and recovery occupy predictable zones | Keep controls reachable without obscuring the stage; scale the experience, do not shrink text to preserve desktop geometry. |

A fan site may combine Field notes with an Object ledger-style media collection; a B2B public pricing page may use Persuade while its authenticated workspace uses Operate. These are *composition grammars*, not cluster-shared scaffolds: invent the exact order, proportions and content for each family, and prevent near-duplicate targets crossing training/evaluation splits.

## Rough layout references — not targets

These three original AI-generated **concept boards** show composition directions only. They are not pages, accuracy evidence, accessibility audits, approved prices, target designs or training inputs. Text within the images is model-generated placeholder text and may be misspelled, invented or internally inconsistent; **never copy it as factual content or as assertions**. Source, hashes, rights status and exclusion are recorded in [`design-layouts.md`](provenance/assets/design-layouts.md). The board images must not be promoted to A1/A6 target manifests or supplied as model training examples without separate approval.

- [Object ledger / storefront](design/layout-storefront.jpg) — asymmetrical products, detail choices and basket summary. Useful for comparing hierarchy, not product copy or price arithmetic.
- [Decision workbench / SaaS](design/layout-saas.jpg) — plan differences next to workspace signup; placeholder feature bars and error treatment are **illustrative/unverified**, and must be replaced by coherent family-authored fixtures.
- [Field notes / wiki + explainer](design/layout-explainer.jpg) — TOC, reading column, before/after stage and slider. The sketch's diagram and labels are **not scientific evidence or sources**; author actual sourced or clearly synthetic content.

## Prompt handoff for future families

A family author should provide: archetype and screen mode(s); audience and primary/secondary role journeys; chosen grammar and one-sentence visual thesis; content/asset provenance; tokens and heading scale; navigation/route map; component anatomy and state examples; desktop/mobile behavior; rule IDs applicable to the actual interaction; and browser assertions for the visible and server-backed outcomes. Two prompt voices within one family may change phrasing but **must not change** these structured obligations. A renderer or prompt generator should never hardcode the boards as layouts: family-specific design must remain independently authored and conformance-tested. The current repo has no generator wired to this document, so these are authoring instructions, not evidence that a model already obeys them.

**Rights boundary:** [`training-targets.md`](provenance/assets/training-targets.md) and [`eval-targets.md`](provenance/assets/eval-targets.md) govern actual corpus conformance imagery. Use invented organizations/data and self-authored or separately rights-cleared visual assets; do not include personal details, remote fonts, stock photos, logos or production payment/auth credentials. Synthetic visual references remain excluded from training unless a separate provenance and approval gate says otherwise.
