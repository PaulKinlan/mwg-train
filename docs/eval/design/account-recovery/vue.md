---
archetype: account-recovery
framework: vue
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

# Account sign-in and recovery — `vue` demo design contract

The aesthetic system for this demo. Its behaviour is specified separately in [`plan.md`](plan.md); the frontmatter above is the single source of truth for the tokens, so this body describes what each one is for rather than what it holds.

## Visual thesis

A sign-up and sign-in flow where the form dictates the page. Recognisable by a single narrow column, one accent, and an error treatment that names the field it belongs to.

Composition: `docs/design.md` sets out this repository's composition grammars, and no row there names `account-recovery`; this contract describes the page the generator writes for archetype `account-recovery`, framework arm `vue` Vue 3 SSR using `createSSRApp` and `vue/server-renderer`, with the template compiler run in process, no build step. All seven arms are server-rendered with NO client hydration; the only client code is the `/app/enhance.js` module.

## Grammar and layout

- One column, centred, `main { max-width: 42rem }`, `1.5rem` body padding, dropping to `1rem` below `30rem` (`@media (width <= 30rem)`).
- Order: page heading, one-line description, the signup form, then the record section that reflects the session data. The form is the first viewport; nothing is hidden behind a step. There is no header, no nav, no table, and no list markup.
- Mobile is the same single column with smaller page padding and a reduced `h1`; there is no separate mobile composition, so no content order changes between viewports.
- The only internal endpoint the client reads is the session echo in **Component hierarchy** below. Route definitions are kept to `plan.md`.

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

Steps in use: `0.15rem` error gap, `0.25rem` label-to-control gap within `.field`, `0.6rem` control padding, `0.7rem 1.1rem` button padding, `1rem` between fields, `1.5rem` page padding. The rhythm is therefore label-to-control tight, field-to-field one step, page-to-content the largest step: related things closer, sections further apart, no arbitrary gaps.

## Component hierarchy

Top to bottom, from the demo's own `app/page.mjs`:

- `html` → `head` (charset, viewport, title, stylesheet link) → `body` → `main`.
- `main`: `h1` "Account sign-in and recovery"; `p` description; `form#signup-form[method=post][action=/signup]`; `section.record[aria-labelledby=record-heading]` containing `h2#record-heading` and `div#record-echo[data-echo-field=displayName][data-echo-source=session]`.
- Inside the form: a live status region `div[role=alert][aria-live=assertive][data-form-status]`, then `div.field` containing the three label/control pairs, then `button[type=submit]` labelled "Submit".
- Each pair: `label[for]` → `input` with `required` and `aria-errormessage` → a hidden `p.error-msg` carrying the field's message. The `email` field sets `autocomplete=username`, `password` sets `autocomplete=new-password`, while `displayName` is echoed back but has no `autocomplete` attribute.
- `body` also loads `/app/enhance.js` as a module, which is the only client code. It fills the record container by reading the account back from the server session, and keeps `aria-invalid` and the live region in step. Note that this data source is the session rather than a stored record.

## Anti-patterns

- **A second accent colour.** One accent means one primary action; a second colour would imply a second meaning the design does not have.
- **An error before interaction.** The selector is `:user-invalid`, not `:invalid`, so a field the user has not left alone is never marked.
- **Colour alone carrying an error.** The invalid border and fill are accompanied by a message paragraph naming the field, linked by `aria-errormessage`.

## Rationale

Constraints rather than preferences: one page and no build step (arm definition), the `:user-invalid` selector and the live region (an error must be named, not coloured), and the single column, which follows from the task rather than from style.

Preference: the narrow layout and the control radius. Both are one-line changes and neither affects the route contract, so a future arm may vary them without touching behaviour.

## Provenance

Subject, copy and data are synthetic and authored in `pilot/archetypes.mjs` and the generator; there are no third-party assets, fonts, logos or credentials. This contract describes `pilot/frameworks.mjs` (`pageSource`, `stylesSource`, `serverSource`, `enhanceSource`) as it generates the `vue` arm, and it is verified against a freshly generated project by `npm run check:design-schema`. Conformance imagery is governed by [`training-targets.md`](../../../provenance/assets/training-targets.md) and [`eval-targets.md`](../../../provenance/assets/eval-targets.md). The uplifts used for scoring are derived artifacts of this demo, not separate designs.
