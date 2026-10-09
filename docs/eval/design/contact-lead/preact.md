---
archetype: contact-lead
framework: preact
tokens:
  --fg: "#16181d"
  --bg: "#ffffff"
  --accent: "#1b4fd8"
literals:
  border: "#8a8f98"
  error: "#b3261e"
  errorFill: "#fdecea"
  rule: "#d5d8dd"
  darkControlFill: "#1b1e24"
  radius: "0.4rem"
  focusWidth: "3px"
  focusOffset: "2px"
  narrow: "30rem"
  wide: "42rem"
antiPatterns:
  - a second accent colour competing with the primary action
  - an error shown before the user has interacted with the field
  - colour alone carrying an error, with no message naming the field
---

# Public-service enquiry form — `preact` demo design contract

The aesthetic system for this demo. Its behaviour is specified separately in [`plan.md`](plan.md); the frontmatter above is the single source of truth for the tokens, so this body describes what each one is for rather than what it holds.

## Visual thesis

A council service enquiry form, read on any device; the design's job is to make input clear, validated, and confirmed. Recognisable by a single narrow column, one accent, and an error treatment that names the field it belongs to.

Composition: [`docs/design.md`](../../../design.md) sets out this repository's composition grammars, and no row there names `contact-lead`; this contract describes the page the generator writes for archetype `contact-lead`, framework arm `preact` Preact SSR through `renderToString` from `preact-render-to-string`, no hydration. All seven arms are server-rendered with NO client hydration; the only client code is the `/app/enhance.js` module.

## Grammar and layout

- One column, centred, `main { max-width: 42rem }`, `1.5rem` body padding, dropping to `1rem` below `30rem` (`@media (width <= 30rem)`).
- Order: page heading, one-line description, the form, then the record section that shows the enquirer their submission. The form is the first viewport; nothing is hidden behind a step.
- Mobile is the same single column with smaller page padding and a reduced `h1`; there is no separate mobile composition, so no content order changes between viewports.
- The only internal endpoint the client calls is the record echo in **Component hierarchy** below. The routes themselves are specified in [`plan.md`](plan.md), where they are checked against the archetype's spec.

## Typography

- Stack: `16px/1.5 system-ui, sans-serif`. No remote font, no third-party asset.
- Scale in use: `h1` `1.6rem` (`1.35rem` under `30rem`), body `1rem`, error text `0.875rem`, labels `font-weight: 600`.
- One heading level above the form (`h1`) and one inside the record section (`h2`), so the outline is real rather than a size effect.

## Token usage

Three custom properties, and the roles they carry:

- `--fg` is all text, and it is the only ink. It is redefined under a dark colour scheme, so a rule that uses it needs no dark variant of its own.
- `--bg` is the page surface. It is redefined with `--fg` in the same block, which is what keeps the pair legible in both schemes.
- `--accent` is the single chromatic role: the primary button's fill and the focus ring. It is deliberately not redefined for dark mode, because one accent at both contrast levels is the point.

Everything else is a literal, listed in the frontmatter, and therefore not themeable per demo. The anti-pattern below about a second accent follows from this: with one accent there is one primary action, and a second colour would have to mean a second meaning.

## Spacing rhythm

Steps in use: `0.15rem` error gap, `0.25rem` label-to-control gap within `.field`, `0.6rem` control padding, `0.7rem 1.1rem` button padding, `1rem` bottom margin for `.field`, `1.5rem` page padding, `42rem` content frame. The rhythm is therefore tight within the form field container, page-to-content the largest step: related things closer, sections further apart, no arbitrary gaps.

## Component hierarchy

Top to bottom, from the demo's own `app/page.mjs`:

- `html` → `head` (charset, viewport, title, stylesheet link) → `body` → `main`.
- `main`: `h1` "Public-service enquiry form"; `p` description; `form#enquiry-form[method=post][action=/enquiry]`; `section.record[aria-labelledby=record-heading]` containing `h2#record-heading` and `div#record-echo[data-echo-field=message][data-echo-source=record][data-echo-param=""]`.
- Inside the form: a live status region `div[role=alert][aria-live=assertive][data-form-status]`, then a single `div.field` containing three label/control pairs, then `button[type=submit]`.
- Each pair: `label[for]` → `input`/`textarea` with `required` and `aria-errormessage="<field>-error"`, with `autocomplete` on `name` and `email` but not on the `message` textarea → a hidden `p.error-msg[id=<field>-error]` carrying the field's message.
- `body` also loads `/app/enhance.js` as a module, which is the only client code. It fills the record container from an internal JSON endpoint keyed by the reference in the URL, and keeps `aria-invalid` and the live region in step.

## Anti-patterns

- **A second accent colour.** One accent means one primary action; a second colour would imply a second meaning the design does not have.
- **An error before interaction.** The selector is `:user-invalid`, not `:invalid`, so a field the user has not left alone is never marked. Reporting an error the user has not caused is the failure this avoids.
- **Colour alone carrying an error.** The invalid border and fill are accompanied by a message paragraph naming the field, linked by `aria-errormessage`. A red border with no words is not an error state.

## Rationale

Constraints rather than preferences: one page and no build step (arm definition), the `:user-invalid` selector and the live region (an error must be named, not coloured), and the single column, which follows from the task (one form, one decision) rather than from style.

Preference: the narrow `42rem` frame and the `0.4rem` control radius. Both are one-line changes and neither affects the route contract, so a future arm may vary them without touching behaviour.

## Provenance

Subject, copy and data are synthetic and authored in `pilot/archetypes.mjs` and the generator; there are no third-party assets, fonts, logos or credentials. This contract describes `pilot/frameworks.mjs` (`pageSource`, `stylesSource`, `serverSource`, `enhanceSource`) as it generates the `preact` arm, and it is verified against a freshly generated project by `npm run check:design-schema`. Conformance imagery is governed by [`training-targets.md`](../../../provenance/assets/training-targets.md) and [`eval-targets.md`](../../../provenance/assets/eval-targets.md). The uplifts used for scoring are derived artifacts of this demo, not separate designs.
