# Which declared routes are actually served

The corpus says each project *declares* every route its brief lists, and `npm run check:route-conformance`
holds that true. **Declaring is not serving.** The generated server hardcodes which paths it answers, so a
route can be present in `spec.json` and answer 404 when a user follows it. This file records the measured
answer, so the corpus never again implies behaviour from a declaration.

Measured on commit `842a4d6` on 2026-10-08.

## Method

`npm run check:served-routes -- --families <the 30 family ids> --limit 30 --out <file>` starts each
selected project's server on an ephemeral port and probes every route in its `spec.json`:

- each route is probed with its **declared method**, because a POST-only route answering 404 to a GET says
  nothing about whether it is served;
- a status below 400 is **served**, and so is any other 4xx, because the handler ran and rejected the
  request (422 on a validation failure proves the route exists);
- 404 and 405 are **not served**; 500+ or a connection failure is an **error**;
- a `read-by-reference` route is probed with the reference **the server itself returned** after a record was
  created through the write route. Probing it with a made-up ref returns 404 for correct reasons, and an
  earlier version of this measurement read that as the route being missing.

## Scope

30 projects, **one framework per family** (every framework of a family declares the same routes), 135 declared
routes. This is not all 210 projects: the per-family picture is complete, the per-framework picture is not
measured.

## Result

| route kind | served | declared |
|---|---|---|
| `page` | 30 | 30 |
| `write` | 29 | 29 |
| `read-by-reference` | 29 | 29 |
| `list` | 1 | 41 |
| `write-account` | 1 | 1 |
| `read-session` | 1 | 1 |
| `list-detail` | 0 | 4 |

**91 of 135 declared routes in this sample are served (67.4%).**

Within the measured 30 projects, every page, every write route, and every read-by-reference route
answers, and the gap is entirely in listings. That is a statement about these declared routes in these
30 projects, not about the corpus as a whole: the per-framework picture, and the 170 projects whose
journeys were never driven, are outside this measurement. `tr-05`'s missing login and profile flow is
a separate gap again - it is a route the brief lists and the project cannot declare, so it does not
appear as a 404 above.

## What the gap is, precisely

The server answers only the five list paths it hardcodes (`/roster`, `/inbox`, `/attendees`, `/cart`,
`/search`); a list route at any other path 404s. Exactly one list route in this sample sits on a hardcoded path: `/cart` (tr-02-hono).

So 42 distinct route paths 404 across 44 of these routes:

```
list `/services` (x2)
list `/ciders` (x1)
list `/kilns` (x1)
list `/schedule` (x1)
list `/generation` (x1)
list `/credits` (x1)
list `/makers` (x1)
list `/disciplines` (x1)
list `/events` (x1)
list `/tickets` (x2)
list `/courses` (x1)
list-detail `/courses/:id` (x1)
list `/results` (x1)
list `/menu` (x1)
list `/jobs` (x1)
list-detail `/jobs/:id` (x1)
list `/docs` (x1)
list-detail `/docs/:slug` (x1)
list `/soil-tests` (x1)
list `/stops` (x1)
list `/expenses` (x1)
list `/cultivars` (x1)
list-detail `/cultivars/:id` (x1)
list `/products` (x1)
list `/basket` (x1)
list `/skiffs` (x1)
list `/safety-log` (x1)
list `/tunes` (x1)
list `/rides` (x1)
list `/dispatch` (x1)
list `/trees` (x1)
list `/canopy-summary` (x1)
list `/calculator` (x1)
list `/pitches` (x1)
list `/market-layout` (x1)
list `/interviews` (x1)
list `/subscriptions` (x1)
list `/concerts` (x1)
list `/gear` (x1)
list `/funds` (x1)
list `/ledger` (x1)
list `/cleanups` (x1)
```

That is the shared builder's gap, and it is the scope of the builder bead (functional `list` and
`list-detail` routes, plus tr-05's login and logout). Within the measured sample only 2 of the 7 route
kinds in use are affected, and pages, writes and record read-back all work.

## History

The first measurement reported 4/14 routes served (28.6%) and listed every write route and every
read-by-reference route as missing. Both were probe artifacts, not gaps: write routes were probed with GET,
and read routes with a reference that had never been created. Corrected on the same projects the figure is
71.4%. Had it been recorded uncorrected, the builder bead would have been scoped against two gaps that do
not exist.
