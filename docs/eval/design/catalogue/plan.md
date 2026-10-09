---
archetype: catalogue
spec: docs/eval/specs/catalogue.json
---

# Searchable reference catalogue — functional specification

The behaviour of the `catalogue` archetype, bound to [`catalogue.json`](../../specs/catalogue.json) rather than
restated from it: every claim below is checked against that spec, and the spec is what
`node scripts/rebuild-from-spec.mjs --family catalogue` rebuilds the project from. Acceptance criteria are
quoted verbatim, so angle brackets in them are literal rather than markup.

This document describes what every arm of the family does. What each arm *looks like* is in that arm's
`design.md` beside this file.

## Use case

A parts catalogue with server-side search, paging and a session cart. The user supplies three fields: `query`, `quantity` and `item`.

## Routes and effects

| Route | Kind | Effect |
| --- | --- | --- |
| `GET /` | page | render the catalogue page with the search form and the cart form |
| `GET /search` | search | read q from the query string, search the records, and render the results with q reflected in the page |
| `POST /cart` | write-session | store the part number against the session and redirect back to the cart |
| `GET /cart` | read-session | read the session and render what it stores |

What the spec does not define, the family does not serve. There is no edit and no delete, and search is the
only route that narrows the list: it reads `q` from the query string and renders the matching records rather
than storing anything. The cart is session state, written and read by `POST /cart` and `GET /cart`, so it is
not a stored row and is not part of what the spec's persistence describes.

## Data and state

- **Engine:** `sqlite`
- **Write route:** `/cart`
- **Read route:** `/cart`

## Journey

1. Start at `/`.
2. Fill `form#search-form`: `input[name=q]` with "bearing".
3. Expect text: "bearing".

## Validation and states

- **Required fields:** `q`, `item`
- **On a missing field:** a search with no query renders an empty result set rather than refusing
- **On success:** a cart post stores the part number against the session and redirects to /cart

## Acceptance criteria

- the echoed query is the value this attempt typed, reflected by the server after a GET reload
- the cart write is read back from the session, and the part number posted is unique to this attempt so an older row cannot satisfy it
- an optional field is not made required by the uplift: the project never asked the user for it

## Implementation status

What exists in every arm is exactly what the spec declares. Where we cannot check an implementation detail, we treat it as declared rather than done.

## Provenance

The story, fields, validation, journey and acceptance criteria are the durable spec
[`docs/eval/specs/catalogue.json`](../../specs/catalogue.json), authored on 2026-10-08 and kept in step with the
generator by `test/spec.test.mjs`. This document is checked against that spec by
`npm run check:design-schema`; the routes and fields are also exercised end to end by the corpus harness.
