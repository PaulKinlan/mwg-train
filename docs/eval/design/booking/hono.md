# Evening class booking — `hono` demo design contract

## Visual thesis

A small adult-education centre's booking page, read on a phone in the evening, so the form is the page;
the design's job is to make one decision cluster obvious and its error recovery calm. Recognisable by a
single narrow column, one accent, and an error treatment that names the field it belongs to.

Grammar: **Decision workbench / Operate** (`docs/design.md`), booking is named in that row.
This contract describes the project the generator writes for archetype `booking`, framework arm `hono`
(a router and tagged template engine, no build step).

## Grammar and layout

- One column, centred, `main { max-width: 42rem }`, `1.5rem` body padding, dropping to `1rem` below
  `30rem` (`@media (width <= 30rem)`).
- Order: page heading, one-line description, the form, then the record section that shows the
  student's own words back. The form is the first viewport; nothing is hidden behind a step.
- Route map (from the demo's own `spec.json`): `GET /` page, `POST /book` write redirecting to
  `/booking/:ref`, `GET /booking/:ref` read-by-reference, `GET /roster` list. The enhancement script
  also reads an internal JSON endpoint for the record it echoes; internal endpoints are described in
  **Component hierarchy** rather than here, because they are not part of the route contract.
- Mobile is the same single column with smaller page padding and a reduced `h1`; there is no separate
  mobile composition, so no content order changes between viewports.

## Typography

- Stack: `16px/1.5 system-ui, sans-serif`. No remote font, no third-party asset.
- Scale in use: `h1` `1.6rem` (`1.35rem` under `30rem`), body `1rem`, error text `0.875rem`,
  labels `font-weight: 600`.
- One heading level above the form (`h1`) and one inside the record section (`h2`), so the outline is
  real rather than a size effect.

## Token vocabulary

Custom properties the demo's `app/styles.css` defines:

| Token | Light | Dark (`prefers-color-scheme: dark`) |
| --- | --- | --- |
| `--fg` | `#16181d` | `#eef0f4` |
| `--bg` | `#ffffff` | `#14161a` |
| `--accent` | `#1b4fd8` | unchanged (`#1b4fd8`) |

Values used as literals rather than custom properties, so they cannot be themed per-demo:
`#8a8f98` control border, `#b3261e` error text and invalid border, `#fdecea` invalid field fill,
`#d5d8dd` table rule, `#1b1e24` dark-mode control fill, `0.4rem` control radius, `3px` focus outline
with `2px` offset, and the `30rem` and `42rem` breakpoints.

## Spacing rhythm

Steps in use: `0.15rem` error gap, `0.25rem` label-to-control gap within `.field`, `0.6rem` control
padding, `0.7rem 1.1rem` button padding, `1rem` between fields, `1.5rem` page padding, `42rem` content
frame. The rhythm is therefore label-to-control tight, field-to-field one step, page-to-content the
largest step: related things closer, sections further apart, no arbitrary gaps.

## Component hierarchy

Per route, top to bottom, from the demo's own `app/page.mjs`:

- `html` → `head` (charset, viewport, title, stylesheet link) → `body` → `main`.
- `main`: `h1` "Evening class booking"; `p` description; `form#booking-form[method=post][action=/book]`;
  `section.record[aria-labelledby=record-heading]` containing `h2#record-heading` and
  `div#record-echo[data-echo-field=notes]`.
- Inside the form: a live status region `div[role=alert][aria-live=assertive][data-form-status]`, then
  `div.field` containing the five label/control pairs, then `button[type=submit]`.
- Each pair: `label[for]` → `input`/`textarea` with `required`, `autocomplete`, and
  `aria-errormessage="<field>-error"` → a hidden `p.error-msg[id=<field>-error]` carrying the field's
  message. Fields: `name` (name), `email` (username), `address` (street-address), `postcode`
  (postal-code), `notes` (textarea, the echoed field).
- `body` also loads `/app/enhance.js` as a module, which is the only client code.

## States

- **Invalid**: implemented. `:user-invalid` styling plus a hidden-per-field error paragraph that is
  shown by CSS, with `aria-invalid` and the live region kept in step by `app/enhance.js` on `blur`,
  `input`, `change` and `submit`. Errors never appear before interaction, because the selector is
  `:user-invalid` rather than `:invalid`.
- **Success / persisted**: implemented as server state. The write redirects to `/booking/:ref` and the
  read route returns the stored row; the echo container is filled from `GET /api/record/:ref`.
- **Unavailable**: missing reference is implemented as a `404` plain document, not a styled page.
- **Loading**: declared only. The form is server-rendered and the echo fetch renders nothing while it
  is in flight, so there is no loading affordance.
- **Empty**: declared only. `GET /roster` with no stored rows and the read page are not given a
  distinct empty treatment.
- **Permission-denied / unavailable-backend**: deliberately absent; the demo has no accounts and no
  remote dependency to fail.

## Implementation status

What exists: `server.mjs`, `spec.json`, `package.json`, `app/styles.css`, `app/enhance.js` and `app/page.mjs`. All five fields, the echo round trip, the invariant error
announcement, light and dark colour schemes, and a visible `:focus-visible` outline.

What is declared but not implemented: a loading state for the echo fetch and an empty state for the
list route (both listed under **States** above rather than claimed as done).

Known gap worth recording rather than smoothing: the `list` route renders the same page template with
a different `title`, so `GET /roster` serves the booking form rather than a table of rows, even though
the stylesheet carries `table`/`th`/`td` rules and `GET /api/records` does return the rows. The design
contract states what the code does; the table styling is currently unused by this arm.

Not present at all: images, fonts, icons, client state, build step, or any third-party request.

## Rationale

Constraints rather than preferences: one page, no build step and no virtual DOM (arm definition), the
`:user-invalid` selector and the live region (an error must be named, not coloured), `setHTML` with a
`textContent` fallback so recorded text is inserted as inert content, and the single column, which
follows from the task (one form, one decision) rather than from style.

Preference: the narrow `42rem` frame and the `0.4rem` control radius. Both are one-line changes and
neither affects the route contract, so a future arm may vary them without touching behaviour.

## Provenance

Subject, copy and data are synthetic and authored in `pilot/archetypes.mjs` and the generator; there
are no third-party assets, fonts, logos or credentials. This contract describes
`pilot/frameworks.mjs` (`pageSource`, `stylesSource`, `serverSource`, `enhanceSource`) as it generates
the `hono` arm, and it is verified against a freshly generated project by
`npm run check:design-schema`. Conformance imagery is governed by
[`training-targets.md`](../../provenance/assets/training-targets.md) and
[`eval-targets.md`](../../provenance/assets/eval-targets.md). The uplifts used for scoring are derived
artifacts of this demo, not separate designs.
