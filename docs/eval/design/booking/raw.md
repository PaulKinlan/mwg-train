---
archetype: booking
framework: raw
tokens:
  --fg: "#16181d"
  --bg: "#ffffff"
  --accent: "#1b4fd8"
literals:
  control-border: 1px solid #8a8f98
  control-radius: 0.4rem
  error-text: #b3261e
  invalid-fill: #fdecea
  table-rule: #d5d8dd
  dark-control-fill: #1b1e24
  dark-foreground: #eef0f4
  dark-background: #14161a
  focus-outline: 3px
  focus-offset: 2px
  narrow-breakpoint: 30rem
  content-frame: 42rem
  spacing-error-gap: 0.15rem
  spacing-field-gap: 1rem
  spacing-page-padding: 1.5rem
  spacing-button-padding: 0.7rem
antiPatterns:
  - a second accent colour competing with the primary action
  - an error shown before the user has interacted with the field
  - colour alone carrying an error, with no message naming the field
  - a modal, a step wizard, or any hidden part of the form
---

# Evening class booking — `raw` demo design contract

The aesthetic system for this demo. Its behaviour is specified separately in [`plan.md`](plan.md); the
frontmatter above is the single source of truth for the tokens, so this body describes what each one is for
rather than what it holds.

## Visual thesis

A small adult-education centre's booking page, read on a phone in the evening, so the form is the page;
the design's job is to make one decision cluster obvious and its error recovery calm. Recognisable by a
single narrow column, one accent, and an error treatment that names the field it belongs to.

Grammar: **Decision workbench / Operate** ([`docs/design.md`](../../../design.md)), booking is named in that
row. This contract describes the project the generator writes for archetype `booking`, framework arm `raw`
(platform, no framework): a server-rendered HTML string, no build step.

## Grammar and layout

- One column, centred, `main { max-width: 42rem }`, `1.5rem` body padding, dropping to `1rem` below
  `30rem` (`@media (width <= 30rem)`).
- Order: page heading, one-line description, the form, then the record section that shows the
  student's own words back. The form is the first viewport; nothing is hidden behind a step.
- Mobile is the same single column with smaller page padding and a reduced `h1`; there is no separate
  mobile composition, so no content order changes between viewports.
- The only internal endpoint the client calls is the record echo in **Component hierarchy** below. The
  routes themselves are specified in [`plan.md`](plan.md), where they are checked against the archetype's spec.

## Typography

- Stack: `16px/1.5 system-ui, sans-serif`. No remote font, no third-party asset.
- Scale in use: `h1` `1.6rem` (`1.35rem` under `30rem`), body `1rem`, error text `0.875rem`,
  labels `font-weight: 600`.
- One heading level above the form (`h1`) and one inside the record section (`h2`), so the outline is
  real rather than a size effect.

## Token usage

Three custom properties, and the roles they carry:

- `--fg` is all text, and it is the only ink. It is redefined under a dark colour scheme, so a rule that
  uses it needs no dark variant of its own.
- `--bg` is the page surface. It is redefined with `--fg` in the same block, which is what keeps the pair
  legible in both schemes.
- `--accent` is the single chromatic role: the primary button's fill and the focus ring. It is deliberately
  not redefined for dark mode, because one accent at both contrast levels is the point.

Everything else is a literal, listed in the frontmatter, and therefore not themeable per demo. The
anti-pattern below about a second accent follows from this: with one accent there is one primary action, and
a second colour would have to mean a second meaning.

## Spacing rhythm

Steps in use: `0.15rem` error gap, `0.25rem` label-to-control gap within `.field`, `0.6rem` control
padding, `0.7rem 1.1rem` button padding, `1rem` between fields, `1.5rem` page padding, `42rem` content
frame. The rhythm is therefore label-to-control tight, field-to-field one step, page-to-content the
largest step: related things closer, sections further apart, no arbitrary gaps.

## Component hierarchy

Top to bottom, from the demo's own `app/page.mjs`:

- `html` → `head` (charset, viewport, title, stylesheet link) → `body` → `main`.
- `main`: `h1` "Evening class booking"; `p` description; `form#booking-form[method=post][action=/book]`;
  `section.record[aria-labelledby=record-heading]` containing `h2#record-heading` and
  `div#record-echo[data-echo-field=notes]`.
- Inside the form: a live status region `div[role=alert][aria-live=assertive][data-form-status]`, then
  `div.field` containing the five label/control pairs, then `button[type=submit]`.
- Each pair: `label[for]` → `input`/`textarea` with `required`, `autocomplete`, and
  `aria-errormessage="<field>-error"` → a hidden `p.error-msg[id=<field>-error]` carrying the field's
  message.
- `body` also loads `/app/enhance.js` as a module, which is the only client code. It fills the record
  container from an internal JSON endpoint keyed by the reference in the URL, and keeps `aria-invalid` and
  the live region in step.

## Anti-patterns

- **A second accent colour.** One accent means one primary action; a second colour would imply a second
  meaning the design does not have.
- **An error before interaction.** The selector is `:user-invalid`, not `:invalid`, so a field the user has
  not left alone is never marked. Reporting an error the user has not caused is the failure this avoids.
- **Colour alone carrying an error.** The invalid border and fill are accompanied by a message paragraph
  naming the field, linked by `aria-errormessage`. A red border with no words is not an error state.
- **Hiding part of the form.** No modal, no wizard, no disclosure: the whole decision is on the page, which
  is why the layout can be a single column.
- **A themed literal.** Colour values written as literals cannot follow the colour scheme, so nothing that
  must change between light and dark may be a literal.

## Rationale

Constraints rather than preferences: one page, no build step and no virtual DOM (arm definition), the
`:user-invalid` selector and the live region (an error must be named, not coloured), and the single column,
which follows from the task (one form, one decision) rather than from style.

Preference: the narrow `42rem` frame and the `0.4rem` control radius. Both are one-line changes and
neither affects the route contract, so a future arm may vary them without touching behaviour.

## Provenance

Subject, copy and data are synthetic and authored in `pilot/archetypes.mjs` and the generator; there
are no third-party assets, fonts, logos or credentials. This contract describes
`pilot/frameworks.mjs` (`pageSource`, `stylesSource`, `serverSource`, `enhanceSource`) as it generates
the `raw` arm, and it is verified against a freshly generated project by
`npm run check:design-schema`. Conformance imagery is governed by
[`training-targets.md`](../../../provenance/assets/training-targets.md) and
[`eval-targets.md`](../../../provenance/assets/eval-targets.md). The uplifts used for scoring are derived
artifacts of this demo, not separate designs.
