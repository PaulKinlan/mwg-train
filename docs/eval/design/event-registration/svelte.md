---
archetype: event-registration
framework: svelte
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

# Event registration with capacity — `svelte` demo design contract

The aesthetic system for this demo. Its behaviour is specified separately in [`plan.md`](plan.md); the frontmatter above is the single source of truth for the tokens, so this body describes what each one is for rather than what it holds.

## Visual thesis

A single-page registration form for a limited-capacity event, where the user's focus is required to accurately select their attendee type and provide their details. The design is a focused, single-column composition that makes the controls obvious and error recovery calm, using a single accent colour to indicate the primary action.

Composition: `docs/design.md` sets out this repository's composition grammars, and no row there names `event-registration`; this contract describes the page the generator writes for archetype `event-registration`, framework arm `svelte` a `.svelte` template compiled to `app/page.compiled.mjs` and rendered on the server through `svelte/server`; the generated tree also carries `app/page.svelte`. All seven arms are server-rendered with NO client hydration; the only client code is the `/app/enhance.js` module.

## Grammar and layout

- One column, centred, `main { max-width: 42rem }`, `1.5rem` body padding, dropping to `1rem` below `30rem` (`@media (width <= 30rem)`).
- Order: page heading, one-line story description, the form itself, then the record section that echoes the submission. The form is the first viewport; nothing is hidden behind a step.
- Mobile view retains the single column structure, reducing only the padding and heading size; there is no structural rearrangement or content order changes between viewports.
- The layout relies exclusively on native document flow and CSS grid for the field groupings, with no client-side rendering engine involved.

## Typography

- Stack: `16px/1.5 system-ui, sans-serif`. No remote font, no third-party asset.
- Scale in use: `h1` at `1.6rem` (dropping to `1.35rem` under `30rem`), default body text `1rem`, labels at `font-weight: 600`, and error text sized at `0.875rem`.
- Only two heading levels are used on the page: one heading above the form (`h1`) and one inside the record section (`h2`), creating a real document outline rather than a mere size effect.

## Token usage

Three custom properties, and the roles they carry:

- `--fg` is the primary ink colour for all text. It is redefined under a dark colour scheme in the same block, ensuring a rule that uses it needs no dark variant of its own.
- `--bg` is the page surface. It is redefined alongside `--fg` to guarantee the pair remains legible in both schemes.
- `--accent` defines the singular chromatic interaction colour used for the submit button and focus rings. It intentionally remains unchanged for dark mode, preserving the semantic meaning of a single primary action.

Everything else is a literal, listed in the frontmatter, and therefore not themeable per demo.

## Spacing rhythm

Steps in use: `0.15rem` error gap, `0.25rem` label-to-control gap within `.field`, `0.6rem` padding inside controls, `0.7rem 1.1rem` for the submit button, `1rem` below the `.field` block, `1.5rem` page padding, and `42rem` for the content frame. The rhythm is therefore tight between related elements (label-to-control) and looser between structural sections.

## Component hierarchy

Top to bottom, from the demo's own `app/page.svelte` (compiled to `app/page.compiled.mjs`):

- `html` → `head` (charset, viewport, title, stylesheet link) → `body` → `main`.
- `main`: `h1` "Event registration with capacity"; `p` description ("Registration for a limited-capacity event, with a server-enforced waitlist."); `form#registration-form[method=post][action=/register]`; `section.record[aria-labelledby=record-heading]` containing `h2#record-heading` and `div#record-echo[data-echo-field=name][data-echo-source=record][data-echo-param=""]`.
- Inside the form: a live status region `div[role=alert][aria-live=assertive][data-form-status]`, then a single `div.field` containing three label and control combinations, then `button[type=submit]`.
- Each pair inside `.field`: `label[for]` → control (`input` for `name` with no `autocomplete`, an `input` for `email` with `autocomplete="email"`, and a `select` for `ticket` offering standard, accessible, and student options) with `required` and `aria-errormessage="<field>-error"` → a hidden `p.error-msg[id=<field>-error]` carrying the field's message.
- `body` also loads `/app/enhance.js` as a module, which is the only client code. It fills the record container and keeps the live region in step.

## Anti-patterns

- **A second accent colour.** One accent means one primary action; introducing a second colour would falsely imply a secondary action of equal weight.
- **An error before interaction.** The CSS relies on `:user-invalid` so that unmodified blank fields are never marked in red. Reporting an error the user has not caused is the failure this avoids.
- **Colour alone carrying an error.** The visual red border is coupled with an explicit error paragraph linked by `aria-errormessage`, guaranteeing the message is not lost to those who cannot perceive the colour.

## Rationale

Constraints rather than preferences: one page, one compile step and no virtual DOM (arm definition), the single page HTML structure, the lack of client hydration for layout, the use of `:user-invalid` for quiet error states, and the linear one-column form which simplifies the registration flow. The `select` element provides a constrained set of ticket types natively without requiring custom dropdown logic.

Preference: the narrow `42rem` content frame and the `0.4rem` control radius are aesthetic choices. Neither affects the functional contract, so future arms may vary them without altering behaviour.

## Provenance

Subject, copy and data are synthetic and authored in `pilot/archetypes.mjs` and the generator; there are no third-party assets, fonts, logos or credentials. This contract describes `pilot/frameworks.mjs` (`pageSource`, `stylesSource`, `serverSource`, `enhanceSource`) as it generates the `svelte` arm (`app/page.mjs`, `app/page.svelte`, `app/page.compiled.mjs`, `app/styles.css`, `server.mjs`, `app/enhance.js`, `package.json`, `spec.json`), and it is verified against a freshly generated project by `npm run check:design-schema`. Conformance imagery is governed by [`training-targets.md`](../../../provenance/assets/training-targets.md) and [`eval-targets.md`](../../../provenance/assets/eval-targets.md). The uplifts used for scoring are derived artifacts of this demo, not separate designs.
