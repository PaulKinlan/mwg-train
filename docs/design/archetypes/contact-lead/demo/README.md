# Contact-lead Archetype: Modern Visual Design Target

- **Archetype:** `contact-lead`.
- **Status:** Illustrative visual design target and demonstration.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`.
- **Boundaries:**
  - **Not the sealed evaluation target:** this demonstration does not modify or replace
    `docs/eval/targets/contact-lead/` (whose manifest digest is pinned by `EVAL_TARGETS_SEAL`).
  - **Not part of pilot:** this demo lives outside `pilot/**` and `data/A6_evaluation/**`. The frozen
    pilot corpora (`pilot/CORPUS.json`, `pilot/TRAINING_CORPUS.json`, and the generated arm trees)
    remain byte-identical.
  - **Not training data:** kept purely for visual verification and operator inspection.
  - **Not a conformance result:** nothing here asserts a match with the boards or a pass against the
    contract. It is hand-written markup, not a measured outcome.
  - **No committed screenshots:** every comparison on `compare.html` is either the reference board JPEG
    itself or a live iframe of the file beside it.

## Purpose

This directory is a browser-verifiable implementation of the visual language established by the two
reference boards in `docs/design/archetypes/contact-lead/` (`step1-form.jpg`, `step2-success.jpg`),
aimed at the contact-lead functional contract in `docs/eval/specs/contact-lead.json`.

The boards depict a private architecture studio's consultation form and its acknowledgement card. The
spec's own title for this family is "Public-service enquiry form", and its story is a council service
that takes enquiries and shows the enquirer their reference. **The two disagree about the subject, and
this demo follows the boards** for identity, copy and layout while keeping the spec's contract shape —
the field set, the required fields, the form id and the echo container. That mismatch is stated here
rather than papered over: any future reader comparing this directory with the spec's story should know
which one the pixels came from.

It is standalone raw HTML and CSS with **no build step, no bundler, no framework, no web fonts and no
network requests**. It opens from the filesystem or from any static server.

## What each board contributed

1. **Board 1 — studio identity and the consultation form (`step1-form.jpg`).**
   A two-column page: the left column carries the studio mark and name, an address block with a pin
   icon, a four-step "our consultation process" list with one icon per step, and a response-time pill
   reading "under 24 hrs"; the right column is a raised card headed "Request a consultation" with Full
   Name, Work Email, a Project Scope dropdown (Residential Renovation, Commercial Build, Interior
   Architecture), a Budget control, a Message box with a `0/500` character counter, and a full-width
   emerald "Send Consultation Request" button. The page sits on a faint drafting grid. The demo runs
   the same two columns from `56rem` and one column below it.
2. **Board 2 — the acknowledgement card (`step2-success.jpg`).**
   A centred card with a glowing emerald check badge overlapping its top edge, the headline
   "Consultation Request Received", the sentence "Thank you, Elena. Our lead architect will review your
   project details and reach out within 24 hours at elena@studio.com.", an inset panel with a "Project
   scope" row and a "Reference token" row holding `#LEAD-7301`, and two buttons: an emerald "Return to
   Home" and an outlined "Download Summary PDF". The board's thin top bar ("Step 2 · Successful contact
   consultation", a centre mark, "Log in" and "Sign up") is **not** copied — this page is not a
   product's second step and has no accounts, so its own demo navigation takes that strip's place.

## Layout and palette decisions

- **Palette (from the boards):** page `#0f172a`, card surfaces `#1e293b`, inset field surfaces
  `#162032`, the summary panel and secondary button `#243248`, dividers `#334155`, control borders
  `#64748b`, action emerald `#10b981` (hover `#059669`, active `#047857`), primary text `#f8fafc`,
  muted text `#94a3b8`, small emerald text and icons `#34d399`. A single dark scheme with
  `color-scheme: dark`: both boards are dark, no theme switch is promised, and a fake light mode would
  be worse than none.
- **The drafting grid** behind board 1 is drawn as two CSS gradients on `body` at 7% slate, not as an
  image, so it costs no request.
- **Type:** the system font stack only, with a monospace stack available for code. Field labels stay in
  sentence case with no `text-transform`, so the visible label text ("Full Name", "Work Email",
  "Message") matches the DOM text exactly; only the structural headings ("Address", "Our consultation
  process", "Request a consultation") and the response pill's label are uppercased in CSS.
- **Breakpoints** use range syntax (`@media (width <= 30rem)`, `(width >= 48rem)`, `(width >= 56rem)`,
  `(width >= 60rem)`), following the pilot stylesheets. The 68rem frame holds two columns from 56rem;
  `compare.html` adds the 48rem and 60rem tiers for its comparison layout and iframe scaling.
- **Icons** — the studio mark, the address pin and the four process glyphs — are one in-document SVG
  sprite tinted by `currentColor`. No image file, no icon font, no request.
- **Motion:** the stylesheet authors no transition and no animation, so the
  `prefers-reduced-motion: reduce` block is a guard rather than an effect — it exists so that a future
  transition cannot ship unguarded, not because anything moves today.
- **The emerald badge glow** is two `box-shadow` rings, drawn to match board 2's glow without animating.
- **Demo chrome:** every page carries the demo's own top bar and state switcher so the form, the
  success view and the comparison can be reached from one another. Board 1 has no site chrome at all,
  and board 2's strip is a marketing bar this demo does not reproduce.

## Contrast decisions (measured)

The boards draw white labels on emerald buttons and a white check on the emerald badge. White on
`#10b981` measures **2.54:1**, below the 4.5:1 needed for text and below the 3:1 needed for a graphical
object, so the demo keeps the boards' emerald fill and puts a dark ink (`#04231a`) on it instead:
**6.57:1**. Control borders use `#64748b` rather than the decorative divider grey, which would not have
cleared 3:1 against either the page or the field surface.

Measured pairs, 21 in total; 20 meet their threshold and the 21st is the board's combination that was
deliberately not copied:

| Pair | Ratio | Threshold |
| --- | ---: | ---: |
| body text `#f8fafc` on the page `#0f172a` | 17.06:1 | 4.5 |
| text on a card `#1e293b` | 13.98:1 | 4.5 |
| text on the summary panel `#243248` | 12.35:1 | 4.5 |
| input text on the field surface `#162032` | 15.60:1 | 4.5 |
| muted text on the page | 6.96:1 | 4.5 |
| muted text on a card | 5.71:1 | 4.5 |
| note text on the inset surface `#162032` | 6.36:1 | 4.5 |
| summary row label on the panel | 5.04:1 | 4.5 |
| button label and badge check ink `#04231a` on emerald | 6.57:1 | 4.5 |
| emerald icons and status text `#34d399` on the page | 9.29:1 | 4.5 |
| emerald status text on a card | 7.61:1 | 4.5 |
| process icon glyph on its 18% emerald tile | 6.95:1 | 4.5 |
| brand glyph on its 18% emerald tile | 5.62:1 | 4.5 |
| focus ring `#10b981` against the page | 7.04:1 | 3 |
| focus ring against a card | 5.77:1 | 3 |
| control border `#64748b` against the page | 3.75:1 | 3 |
| control border against the field surface | 3.43:1 | 3 |
| pill border against a card | 3.07:1 | 3 |
| hover border `#94a3b8` against the page | 6.96:1 | 3 |
| invalid-field border `#ef4444` against the field surface | 4.34:1 | 3 |
| **the board's white on emerald — not copied** | **2.54:1** | 4.5 |

One thing is below its threshold and is not claimed: the 1px tinted border around each process icon
measures **2.06:1** against the page. It is decoration around a glyph that itself measures 6.95:1, and
it is not a control boundary or a state cue, so it is left faint rather than promoted to a control
border.

## Contract shape (`docs/eval/specs/contact-lead.json`)

| Contract element | Present in the demo | What it actually does here |
| --- | --- | --- |
| `GET /` (page) | `index.html` | The form page itself, opened as a static file. |
| `POST /enquiry` (write, `303` to `/enquiry/:ref`) | `form#enquiry-form`, `method="get"`, `action="success.html"` | Submits by **native GET navigation** to the static success page, with the answers in the query string. There is no server, no `303`, no stored row and no server-issued reference. The submit is deliberately **not** intercepted by script, so the journey completes with JavaScript disabled. |
| `GET /enquiry/:ref` (read-by-reference) | `success.html` | Reads `name`, `email`, `scope`, `budget` and `message` out of its **own query string** and writes them back as text. There is no lookup by reference and no stored enquiry; the reference token is the board's fixed sample. |
| `GET /inbox` (list) | Not implemented | There is no list route, no other enquirer's enquiry and nothing to list. |
| `input[name="name"]` (text, required) | `index.html`, label "Full Name" | Sent as typed. Required, and an empty submit is refused by the browser's own validation. |
| `input[name="email"]` (email, required) | `index.html`, label "Work Email" | Sent as typed. Required; the browser checks the address shape before it will submit. |
| `textarea[name="message"]` (required, echoed) | `index.html`, label "Message" | Sent as typed, capped at 500 characters by `maxlength`, and echoed on the success page. |
| `echo.field = message`, `echo.container = #enquiry-message` | `success.html` | The summary panel's "Your message" block carries the id. Its text is the submitted message, so the echo a journey checks for really is the enquirer's own text. |
| `journey.expectText = "Grace Hopper"` | `success.html` | The submitted name is written into the acknowledgement sentence, so the spec's fill values appear on the success page. |
| `validation.required_fields`, `on_missing` | The three `required` attributes | The browser refuses an empty submit and shows its own message. The spec has the **server** refuse and re-render; here nothing is ever posted, so nothing is refused server-side. |
| `state.engine = sqlite`, `records` table | Not implemented | No database, no file, no process. |
| `persistence.reload_assertion` | Partly | The answers survive a reload of `success.html?…` because they are in the URL, not because anything was stored. **The reload assertion could pass here for the wrong reason**, which is why the write/read routes are marked absent. |
| `session: false` | Matches | No cookie, no storage, no per-visitor state. This is the one contract row the demo satisfies by doing nothing. |

## The board's other two controls

Board 1 shows two controls the spec does not score. Both are drawn in the same style as the three
contract fields.

| Control | Markup | Required? | Why |
| --- | --- | --- | --- |
| Project Scope | `select[name="scope"]` with exactly `Residential Renovation`, `Commercial Build`, `Interior Architecture`, in the board's order | **No** | The board's success card echoes the scope, so it is what the enquiry is shaped by — but the spec's own journey fills only the three contract fields and submits, and a required select opening on an empty placeholder would make that journey fail the browser's validation. It therefore opens on the board's own first option, and the success page always has a scope to echo. Its slug values are mapped back to their labels when echoed. |
| Budget | `select[name="budget"]`, "(optional)" in its label, first option "Not sure yet" with an empty value | **No** | A budget range is a soft signal and is often unknown at first contact, and board 1's open dropdown covers this part of the card, so the ranges are not visible in the raster. The ranges shown (four bands plus "Not sure yet") are **this demo's invention**, not the board's. |

## What this demo does NOT do

It is a static design target. Stated plainly:

- **It does not run the spec's server routes.** `GET /`, `POST /enquiry`, `GET /enquiry/:ref` and
  `GET /inbox` have no implementation in this directory. The form carries `method` and `action` so the
  contract shape is readable, and the action points at the static `success.html`.
- **It does not send, store, log or email an enquiry.** Nothing leaves the browser. There is no server
  process, no database, no `records` table and no queue.
- **It does not look an enquiry up by reference.** `success.html` reads its own URL. `#LEAD-7301` is the
  sample drawn on board 2 and is the same on every visit; it is not issued, checked or unique.
- **It does not keep the submitted values out of the URL.** They travel in the query string, so they
  appear in the address bar and in the browser's history. For a real enquiry that would be a privacy
  problem, and it is a consequence of having no server rather than a design decision.
- **It does not generate a PDF.** "Download Summary PDF" says so, in a live region, when clicked.
  There is no file, no blob and no print stylesheet.
- **It does not authenticate anyone, and has no "Log in"/"Sign up".** Board 2 shows that chrome; this
  demo has no accounts and does not draw controls it cannot honour.
- **It does not present the studio's details as fact.** The name "ARKHITECTS Studio", the address at 15
  Golden Square, the contact address, the four process steps, the "under 24 hrs" promise and the
  reference token are the boards' illustrative placeholders. Nothing here has verified them, and the
  page and its footer say so.
- **It does not survive JavaScript being off with a personalised success page.** The form still submits
  and the success page still loads, but that page reads the answers back out of the URL with a script,
  so without one it shows the board's sample values and says as much in a `<noscript>` note.
- **It does not prove its own quality.** No browser was started while these files were written and no
  screenshot of this demo is committed; `compare.html` shows the result so a reader can judge it
  directly. That is a statement about how these files were authored, not about the tree.

### Where the backend work belongs

Server persistence and the backend endpoints are not missing from this directory — they belong to a
different part of the pipeline. The routes, the SQLite `records` table, the server-issued reference and
the reference lookup are implemented when a family is **generated and evaluated**, where a real server
is started and scored against the spec. This directory is a design reference: it shows the intended
result so a reader, a reviewer or a future implementation can see what the generated markup is aiming
at. Reading it as an unimplemented backend would be a category error, which is why the limits above are
stated per contract rather than left to inference.

## Safety of the echoed values

`success.html` writes the submitted name, email, scope and message into the page. Every one of them is
written with `textContent` — never injected as markup — because the enquirer controls all four. A value
such as `<img src=x onerror=alert(1)>` is rendered as those characters. The page also sets
`overflow-wrap: anywhere` on the sentence, the summary values and the message, so an unbroken string
cannot push the card sideways.

## Files

- `index.html`: board 1 — the studio identity column and the contract form (`form#enquiry-form`), the
  live character counter, and the note about what submitting really does.
- `success.html`: board 2 — the centred acknowledgement card, the sample reference token, the echo
  container `#enquiry-message`, the two buttons and the sample/`noscript` notes.
- `compare.html`: both boards beside the live pages at a true 1280 × 900 and 390 × 844 iframe viewport,
  with what each board contributed and where the demo departs from it.
- `styles.css`: the single stylesheet — tokens, the two-column consultation layout, form controls, the
  success card, focus states, forced colours, reduced motion and the responsive tiers.
- `README.md`: this file.

## Verification

What was checked while writing, and what was not:

- Both inline scripts pass `node --check`.
- `styles.css` parses with PostCSS (124 rules, 478 declarations, six at-rules, 32 custom properties, 30
  `var()` references) and every `var()` resolves to a declaration somewhere in the file. The first
  parsed rule is `:root`. That last point is a real check rather than a formality: the header comment
  writes the pilot path as `pilot/projects/<name>/app/styles.css` **on purpose**, because the usual
  glob contains a comment-closing sequence inside a block comment, which ends the comment early and
  folds the `:root` block into a rule whose selector matches nothing — leaving every token undefined.
- A structural pass over the three pages checks tag balance, duplicate ids, every `label for`, every
  `aria-describedby` / `aria-labelledby` target, and every `<use href="#…">` sprite reference; it
  confirms the contract selectors and attributes (`form#enquiry-form`, the three field types and their
  `required`, the scope options, the `#enquiry-message` container, the CTA text), that no page
  references a remote script, font or image, and that no script uses an HTML-injection API. The same
  pass run against a deliberately broken copy of this directory (a renamed echo container, a dropped
  `required`, a renamed scope option, a mismatched `maxlength`) reports all four faults, so it is not
  vacuous.
- The two shipped scripts were run against a stubbed DOM to drive their real logic: 20 checks covering
  the echo of a submitted name, email, scope and message, the sample note appearing only when no
  enquiry was submitted, markup in a submitted value staying text, the fallback for an unknown scope
  and a missing message, the download button's message, and the character counter at 0, mid-range, 500
  and back below the limit. This is a simulation of the scripts, not a browser.
- Contrast was measured for 21 foreground/background pairs; 20 pass their threshold and the 21st is the
  boards' white-on-emerald combination that was deliberately not copied. One decorative tinted border
  is below 3:1 and is stated as decoration rather than claimed as a control boundary.
- **Not done here:** no browser was started, so nothing in this directory is evidence that the pages
  render or behave in one. No screen reader, no second engine, no 200% zoom or reflow check, and no
  functional acceptance run against the live spec journey. The last of those is what a
  browser-driven harness for this demo would supply.
