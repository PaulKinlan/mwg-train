# Which declared routes are actually served

The corpus says each project *declares* every route its brief lists, and `npm run check:route-conformance`
holds that true. **Declaring is not serving.** A route can be present in `spec.json` and answer 404 when a
user follows it, which is precisely what this file exists to catch. The generated servers answered only a
hardcoded handful of list paths, so every declared `list` route outside that handful 404'd: this file
recorded it, `mwg-train-ndr` fixed it, and the measurement below is the re-run that confirms it. The
records stay here, because a declaration is still not a served route until something measures it.

Measured on the tree at `cad0c62` on 2026-10-10, re-run for `mwg-train-ndr`; the previous run was on
commit `842a4d6` on 2026-10-08 and reported the `list` gap this file now records as closed.

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
| `list` | 41 | 41 |
| `write-account` | 1 | 1 |
| `read-session` | 1 | 1 |
| `list-detail` | 0 | 4 |

**131 of 135 declared routes in this sample are served (97.0%).**

Within the measured 30 projects, every page, every write route, every read-by-reference route and every
`list` route answers. The entire remaining gap is `list-detail`: four of the eight projects that declare a
detail route answer it with the list page instead. That is a statement about these declared routes in these
30 projects, not about the corpus as a whole: the per-framework picture, and the 170 projects whose
journeys were never driven, are outside this measurement. `tr-05`'s missing login and profile flow is
a separate gap again - it is a route the brief lists and the project cannot declare, so it does not
appear as a 404 above.

## What the gap is, precisely

Every declared `list` route is now served. The four that remain are `list-detail` routes, declared as
`/courses/:id`, `/jobs/:id`, `/docs/:slug` and `/cultivars/:id` on the four projects below. They are
matched with their concrete probe path, and each answers 404:

```
list-detail `/courses/:id`   (tr-09-hono, course-enrolment)
list-detail `/jobs/:id`      (tr-12-hono, job-board)
list-detail `/docs/:slug`    (tr-13-hono, docs-site)
list-detail `/cultivars/:id` (tr-16-hono, library-catalogue)
```

The list routes that used to be listed here - `/services`, `/ciders`, `/kilns`, `/schedule`, `/generation`,
`/credits`, `/makers`, `/disciplines`, `/events`, `/tickets`, `/courses`, `/results`, `/menu`, `/jobs`,
`/docs`, `/soil-tests`, `/stops`, `/expenses`, `/cultivars`, `/products`, `/basket`, `/skiffs`,
`/safety-log`, `/tunes`, `/rides`, `/dispatch`, `/trees`, `/canopy-summary`, `/calculator`, `/pitches`,
`/market-layout`, `/interviews`, `/subscriptions`, `/concerts`, `/gear`, `/funds`, `/ledger`, `/cleanups` -
are all served now. They answered 404 because the generated server emitted a fixed set of listing paths
(`/roster`, `/inbox`, `/attendees`, `/cart`) for every project rather than the route the project's own
brief declares, and the list-page handlers that derive the path from the brief sat behind a capability flag
no archetype ever set.

So 2 of the 7 route kinds in use are still affected, down from 3, and the whole of that is `list-detail`.

## History

**The `list` gap, closed (2026-10-10, `mwg-train-ndr`).** The 29 of the 30 training families that declare a
`list` route now opt in to the derived list-page handlers, so each server answers the path its own brief
declares. `list` went from 1 of 41 to 41 of 41, and the sample from 91 of 135 (67.4%) to 131 of 135
(97.0%). It cost corpus bytes: serving a route the brief declares means a handler and a page renderer per
project, so the training trees grew about 5% and every figure derived from them moved with them.

The first measurement reported 4/14 routes served (28.6%) and listed every write route and every
read-by-reference route as missing. Both were probe artifacts, not gaps: write routes were probed with GET,
and read routes with a reference that had never been created. Corrected on the same projects the figure is
71.4%. Had it been recorded uncorrected, the builder bead would have been scoped against two gaps that do
not exist.
