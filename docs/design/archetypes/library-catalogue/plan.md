---
archetype: library-catalogue
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/library-catalogue/
register: docs/provenance/assets/training-reference-boards.md
---

# `library-catalogue` — functional contract

The behaviour of the `record-form` type as the `library-catalogue` archetype implements it. This document is
the archetype's contract: how a catalogue is searched and filtered, what a member or researcher reserves out of
it, what the staff side sees, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan documents
are. It is **not** checked against a generated demo, because there is no generated demo for the five-step flow
and no evaluation spec for this archetype — see *Implementation status*. Nothing here should be read as
describing running software.

**Two families implement this archetype**, one on each side of the corpus, and their subjects are further apart
than the archetype's name suggests:

| Family | Side | Subject | Distinctive behaviour |
|---|---|---|---|
| `tr-16` | train | Heirloom Perennial Repository — rare perennial cuttings and seed strain index | a cultivar index filtered by sun tolerance and flowering season; the reservation is for **cuttings**, by quantity |
| `fam-16` | eval | local archive and antiquarian book collection catalogue | a staff view of pending reservations, HTTP status assertions, and a validated reservation date |

## Use case

A member of a **holding institution** — a plant repository, a local archive — finds one item in a catalogue
that is larger than they can browse, inspects what is known about it, and reserves it. Two roles, as in every
catalogue: the **researcher** searching and reserving, and the **staff** side that must see what has been
reserved.

What the archetype turns on is the **search and its filters**. `tr-16`'s first prohibited pattern is "a search
that matches nothing rather than saying so", which makes the empty state part of the contract rather than a
courtesy, and `tr-16`'s first assertion tests a filtered list rather than the write — `GET /cultivars?sun=full-sun`
returns only full-sun specimens. `fam-16` goes further and asserts that the search input has an accessible label
and that filters update the catalogue list dynamically. So this archetype is as much about narrowing a
collection as about recording a reservation against one item.

The two subjects also show how wide the archetype is. `tr-16` catalogues living cuttings: the reserved thing is
a quantity of stem, root or nodal cuttings taken from a named cultivar, and the index is filtered by growing
conditions. `fam-16` catalogues manuscripts: the reserved thing is a reading-room appointment for an item with
accession details, and the staff side is a loans desk. Both are the same behavioural contract — list, filter,
read one by reference, write one record, read the receipt back — which is why they are one archetype rather
than two.

`TYPE-AXIS.md` does not name this archetype on any row, so its type is derived rather than quoted. The
`record-form` row accounts for all thirty training families across exactly fifteen archetypes — naming
`booking` at seven families, `web-shop` at three, seven archetypes at two each, and counting the remaining six at
one family each — and the arithmetic closes: seven and three and fourteen and six make thirty families, and one
and one and seven and six make fifteen archetypes, which is every archetype in the training manifest. This
archetype has a single training family and is not among the named groups, so it is one of the six the row counts
rather than names. The type is `record-form` because the axis's own definition decides it — a list, a filter, a
read-by-reference view, a write producing one record, and a receipt addressed by reference — and because the
axis warns explicitly that reclassifying a subject change as a type change is the mistake it exists to prevent.

## Routes and effects

| Route | Kind | Families | Effect |
|---|---|---|---|
| `GET /` | page | both | serves the repository's landing view and its route into the catalogue |
| `GET /cultivars` | page | `tr-16` | serves the cultivar index, filterable (the family's first assertion filters it by `sun`) |
| `GET /cultivars/:id` | read-by-reference | `tr-16` | serves one specimen: its propagation notes and available cutting counts |
| `POST /request` | write | `tr-16` | creates a cutting reservation and redirects to its receipt |
| `GET /requests/:id` | read-by-reference | `tr-16` | reads the reservation back by its own reference |
| `GET /catalog` | page | `fam-16` | serves the archive catalogue, filtered dynamically by its controls |
| `GET /catalog/:id` | read-by-reference | `fam-16` | serves one record: its accession details |
| `POST /reserve/:id` | write | `fam-16` | creates a reading-room reservation, redirecting to the receipt with HTTP 303 |
| `GET /reservation/:ref` | read-by-reference | `fam-16` | reads the reservation back by its reference |
| `GET /admin/loans` | page | `fam-16` | serves the staff view listing pending reservations |

**On the methods.** The manifests declare routes as paths and carry no `method` key, so the methods above are
only as firm as their source, and here the two sides differ sharply. `tr-16` states its write in its second
assertion (`POST /request`) and its filters by query string in its first. `fam-16` names methods for three routes
and gives two of them **status codes** — `POST /reserve/:id` redirecting with HTTP 303, `GET /reservation/:ref`
returning HTTP 200 after a reload, and a missing researcher name returning HTTP 400 — so the evaluation-side
family is the first in this corpus whose assertions pin protocol behaviour rather than only page content. The
staff view `GET /admin/loans` is named with its method and status by the fourth assertion.

## Data and state

- **Stored on the server**, per both families' `server_persistence`: `tr-16` keeps cultivar availability counts
  and member cutting requests; `fam-16` keeps catalogue records and researcher reservations, and states
  explicitly that submitted reservations **appear on the staff view** and persist across reloads.
- **The catalogue item** carries the attributes its index is filtered by. For `tr-16` those are a cultivar name,
  a sun tolerance and a flowering season, with propagation instructions and an available cutting count on the
  detail view. For `fam-16` they are an accession record for a manuscript or book.
- **The reservation** differs by family in what it records:

  | Family | Reserved thing | Fields |
  |---|---|---|
  | `tr-16` | a quantity of cuttings | `gardener` (text, required), `email` (email, required), `cultivar` (text, required, echoed), `cutting` (select, required: Stem cutting, Root cutting, Nodal cutting), `quantity` (number, required), `notes` (textarea, optional) |
  | `fam-16` | a reading-room appointment | researcher details and a reservation date, per the family's journeys; the field slugs are the evaluation side's own and are not restated here |

- **The taxonomy is the collection's, not a shared list.** `tr-16`'s cutting types are three kinds of
  propagation material; `fam-16`'s filters are subject and keyword. The archetype fixes the shape — a required
  select and at least one filter over the list — not the values.
- **The reference** addresses the reservation, and both families assert it survives a reload.
- **The staff view** exists only on the evaluation side, and it is what makes this archetype more than a
  catalogue with a form: reserved items have to be visible to whoever fulfils them.

## Journey

**`tr-16`, the perennial repository.** It starts at `/`, files `form#cutting-request-form` with
`input[name=gardener]` `Dr Linnaeus Fox`, `input[name=email]` `linnaeus.fox@botanical.test`,
`input[name=cultivar]` `Salvia nemorosa Caradonna`, `input[name=quantity]` `3` and `textarea[name=notes]` `Keep
moist for root propagation`, selecting `select[name=cutting]` `Root cutting`. It expects `Salvia nemorosa
Caradonna` echoed back by what the submit returns, then again after a reload. Its search leg queries
`/search?q=Salvia`, reads `#search-results`, expects `Salvia nemorosa Caradonna` among them and the decoy
`zzz-decoy` absent. Its update leg rewrites `cultivar` to `Salvia nemorosa Caradonna (updated)`. Its intake
steps submit `/intake` having selected `select[name=cutting]` `Root cutting`, and `/intake/confirm` expects
`Root cutting` back.

Its three stated journeys put the **filter** first, ahead of the write: search the cultivar repository and
filter by sun tolerance and flowering season; inspect the botanical propagation instructions and the available
cutting counts for a specimen; then submit a reservation, receive a collection voucher, and reload to confirm
the details. That ordering is the contract, not a description.

**`fam-16`, the archive.** The row states three journeys rather than a fixture, and they are the contract for the
evaluation-side family. Quoted verbatim:

1. "search the archive catalogue by keyword or subject, select a historical manuscript, review accession
   details, submit a reading room reservation request with researcher details and date, and receive a
   reservation reference"
2. "reload the reservation confirmation page /reservation/:ref, verifying that the manuscript title,
   reservation code, and appointment date persist from server storage"
3. "attempt to submit a reservation without a researcher name or with an invalid reservation date, verify inline
   accessible error messages, correct the fields, and successfully reserve"

Mapped to the five planned boards: step 1 the catalogue and its filters → `step1-catalogue`, step 2 one item's
detail → `step2-item`, step 3 the reservation form → `step3-reserve`, step 4 the receipt and the staff view →
`step4-receipt`, step 5 empty → `step5-empty`. Step 5 is not optional here: the empty search is the first thing
this archetype's rules prohibit ignoring.

## Validation and states

- **Required fields:** every family marks them. `tr-16` requires five of its six, leaving `notes` optional;
  `fam-16` requires the researcher name and validates the reservation date.
- **A search that matches nothing must say so.** This is `tr-16`'s first prohibited pattern and is therefore
  the archetype's own rule. Planned as `step5-empty`.
- **Refusals carry protocol and message.** `fam-16` asserts that a missing researcher name returns HTTP 400
  **with an associated inline error message**, and that an invalid date is refused; both training-side
  behaviours remain available through `forms/required-field-feedback`, which both families carry.
- **Announcing the error is part of the contract.** `fam-16` carries `accessibility/accessible-error-announcement`
  among its applicable rules, so an error that is visible but not announced is a defect.
- **The search itself is an accessible control.** `fam-16`'s fifth assertion requires the catalogue search input
  to have an accessible label, and requires the filter controls to update the list dynamically — so a filter
  that only works on submit, or that is announced ambiguously, fails the contract.
- **Address autofill is a named rule** on the evaluation side (`forms/autofill-address-form`), which is unusual
  in this corpus and worth noting: the reservation form is expected to cooperate with browser autofill rather
  than defeat it.
- **A reservation without an owner or a reference is a defect**, for the same reason as elsewhere in this type:
  the staff side has to be able to find it.

## Acceptance criteria

**`tr-16`:** (1) `GET /cultivars?sun=full-sun` returns only full-sun perennial specimens. (2) `POST /request`
creates a cutting reservation and redirects to `/requests/:id`. (3) `GET /requests/:id` displays the requested
plant name and quantity after page refresh.

**`fam-16`:** (1) `POST /reserve/:id` with researcher details creates a reservation and redirects to
`/reservation/:ref` with HTTP 303. (2) `GET /reservation/:ref` after browser reload returns HTTP 200 displaying
the reserved item title and appointment date. (3) submitting a reservation request with missing researcher name
returns HTTP 400 with an associated inline error message. (4) `GET /admin/loans` returns HTTP 200 listing all
pending reservation requests with their reservation references. (5) catalogue search input has an accessible
label and filter controls update the catalog list dynamically.

All eight criteria are quoted from the two manifests rather than restated.

## Implementation status

**Not implemented as a five-step flow.** Being precise about what does exist:

- **One landing reference exists**, for the training family only:
  [`tr-16/reference.jpg`](../../training/tr-16/reference.jpg) — 1376 × 768, 677798 bytes, sha256 `f0b6b720…` —
  pinned in the [training reference register](../../../provenance/assets/training-reference-boards.md) alongside
  its declared prompt, [`prompt.txt`](../../training/tr-16/prompt.txt). It depicts **one page at one scroll
  position**, and it is not a picture of the five states above.
- **The evaluation-side family has no reference board here.** There is no `fam-16` board in
  `docs/design/training/`, and the evaluation side's assets are not this directory's to depict.
- **The five journey boards are planned, not generated.** `step1-catalogue`, `step2-item`, `step3-reserve`,
  `step4-receipt` and `step5-empty` exist in no ref, and this directory holds no committed board of its own.
- **The train-side pair and target do exist:** `docs/train/design/tr-16/{plan,design}.md` and
  `docs/train/targets/tr-16/index.html`.
- **What the engine offers is capability, not implementation.** The shared engine can render a list, a
  read-by-reference page and a write, and this family uses those for the cultivar index and a reservation
  receipt. No family in the corpus supports a list whose filter results are asserted, a staff view of pending
  reservations, or a refusal carrying an HTTP status code.
- **No evaluation spec:** there is no `docs/eval/specs/library-catalogue.json`. This contract is validated by
  section order and internal consistency, not against a spec.
- **The briefs:** two training rows (`tr-16-v1`, `tr-16-v2`) and three evaluation rows (`fam-16-v1` through
  `fam-16-v3`); each family's variants are the same contract in a different voice.

## Provenance

- **The behaviour** is derived from `docs/train/briefs/manifest.jsonl` (family `tr-16`) and
  `docs/eval/briefs/manifest.jsonl` (family `fam-16`). Route names, field slugs, control types, option lists,
  the form selector, fill values, select values, the search leg, the update leg, the intake steps, the stated
  journeys and all eight acceptance criteria are quoted from those rows rather than invented.
- **The reference** is the training family's generated board, digest-pinned in
  `docs/provenance/assets/training-reference-boards.md`; the prompt that declared it is committed beside it.
  The five journey boards are planned and unpinned.
- **The axis position** is derived from `docs/train/briefs/TYPE-AXIS.md` rather than quoted: this archetype is
  not named on any row, and its type follows from the `record-form` row's own accounting, which closes over all
  thirty training families and exactly fifteen archetypes.
