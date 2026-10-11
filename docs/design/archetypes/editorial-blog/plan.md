---
archetype: editorial-blog
type: blog
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/editorial-blog/
register: docs/provenance/assets/design-reference-editorial-blog.md
---

# `editorial-blog` — functional contract

The behaviour of the `blog` type from the archetype type axis. This document is the type's contract:
what a reader and an author can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan
documents are. It is **not** checked against a generated demo, because there is no generated demo for
this type yet - see *Implementation status*. Nothing here should be read as describing running
software.

## Use case

A community publication. A **reader** arrives with no account, finds an article from an index, opens
it, and can send someone the exact address of what they read. An **author** writes one article and
publishes it, and publishing makes it reachable at its own address.

Those are the two roles, and they are the reason this is a type rather than a subject: the reader
never writes and the author's one action changes what every reader can see. A version of this in which
the only actor fills in a form is the record-form type wearing a blog's noun - the failure the axis
exists to catch.

## Routes and effects

| Route | Actor | Effect |
| --- | --- | --- |
| `GET /` | reader | The index: published articles, newest first, each with headline, standfirst, byline, date, reading time and tags. Accepts `?q=` for a search over headline, standfirst and body, and `?tag=` for a single tag filter. An unknown `?tag=` is an empty result, not an error. |
| `GET /article/:slug` | reader | One published article, in full, addressed by its own stable slug. An unknown slug is a 404 that names the slug and offers the index. |
| `POST /articles` | author | Publishes one article: `headline`, `standfirst`, `byline`, `section`, `tags`, `body`. Writes it, assigns it a slug, and redirects to `GET /article/:slug` so the author sees the address a reader would get. |
| `GET /drafts` | author | The author's unpublished drafts, so a saved-but-unpublished article is not mistaken for a published one. |

Three of these four the shared engine can already express in kind - a list, a read-by-reference, a
write. The difference that matters is **identity**: this type's read route is addressed by a stable
slug that survives reloads and can be shared, not by a reference handed to the one actor who just
submitted.

## Data and state

- `article`: `slug` (unique, derived from the headline with a deterministic numeric suffix on
  collision), `headline`, `standfirst`, `byline`, `section`, `tags[]`, `body`, `published_at`,
  `status` (`draft` | `published`).
- The write is server-side and durable: reloading the article route returns the same article, which
  is what makes the address worth copying.
- Reader state: **none**. Reading requires no session, no cookie and no query state; the address alone
  determines what is shown. That is a real constraint, not an omission - a blog whose articles are only
  readable in the session that created them is the record-form type again.
- Author state: a session, so publishing can be attributed. A production deployment needs credential
  verification for that session; **the engine has no login**, so within this corpus the author session
  is seeded and credential verification is out of scope here and tracked as a capability
  (`mwg-train-ksn`). Saying so is the point: an author session that authenticates nobody must not be
  presented as sign-in.
- The body is rendered as **text**, never as markup, and a test must assert it, or the type's one
  user-supplied long field is an injection surface.

## Journey

Reader, in one pass:

1. Open the index. It lists the three seeded articles with their tags.
2. Search for a phrase that one article's body contains. The index narrows and the query is still
   visible in the field.
3. Open that article. Its headline, byline, date, tags and body are shown in full.
4. Copy the address, open it again in a fresh navigation, and see the **same** article - the assertion
   that separates this type from a receipt page.

Author, in one pass:

5. Open the composer. Fill a headline, standfirst, byline, section, tags and body.
6. Publish. The result is a page whose own address is the new article's slug, and the article now
   appears in the index.
7. As the reader again, open that address directly and see the article that was published.

## Validation and states

- Missing `headline` or `body` publishes nothing, keeps what was typed, and names the offending field
  beside it - a message, not a red border alone.
- An over-long headline or a body beyond the declared limit is refused with the limit named.
- Search with no matches shows a no-results state that quotes the query back, offers the tags that do
  have articles, and has one clear action to clear the search.
- An empty index (no published articles at all) is a distinct state from no search matches, and says
  which one it is.
- An unknown slug is a 404 naming the slug, with a link to the index.
- Publishing the same headline twice yields two distinct slugs rather than overwriting the first
  article.
- Errors are readable text with an accessible association to the field, not colour alone: the mark at
  the top of the form names what to fix.

## Acceptance criteria

1. `GET /` lists every published article and no draft.
2. `GET /?q=<a phrase from one body>` returns exactly the articles whose text contains it, and `GET /?q=<nonsense>` returns the no-results state quoting that query.
3. `GET /article/<slug>` returns the same article across two independent navigations, and 404s for an unknown slug.
4. `POST /articles` with a valid article makes it appear in the index and reachable at its slug.
5. `POST /articles` with the headline empty publishes nothing, returns the form with the field error, and leaves the index unchanged.
6. A published body containing markup renders that markup as text.
7. Two articles with the same headline are both reachable, at different slugs.
8. Reading the index, an article and a search result requires no cookie: the same requests with cookies absent return the same bodies.

## Implementation status

**Not implemented. Nothing drives these routes today, and the boards are the only artefact of this
type that exists.** Being precise about what does exist, because "the index and the detail route are
already in the engine" is exactly the kind of half-truth this axis was written to stop:

- The shared engine (`pilot/frameworks.mjs`) can render a list, a read-by-reference page and a write,
  and the training archetypes use those for record lists and receipts. That is *capability*, not
  implementation: `docs-site` and `community-forum` show submitted records, not published articles
  addressed by stable slugs, and no family in the corpus has an author role that changes what a
  reader can see.
- There is no specification for this type under `docs/eval/specs/` (that directory is the sealed A6
  evaluation set) and no family row in `docs/train/briefs/manifest.jsonl`. This type is A1 planning
  material; it is not a training pair and not an evaluation target.
- The four reference boards are generated and independently reviewed
  ([register](../../provenance/assets/design-reference-editorial-blog.md)); they are pictures of the
  intended states and demonstrate no behaviour whatsoever.
- What is required before this type could be called implemented, in the order it becomes true, is
  recorded on bead `mwg-train-efg`: a stable slug identity (the engine has none), a tag filter and a
  search over stored content rather than over the current actor's submissions, an author session
  distinguished from a reader's session, and a driven journey asserting the eight criteria above.

## Provenance

- Type axis and the coverage table this type comes from: [`docs/train/briefs/TYPE-AXIS.md`](../../train/briefs/TYPE-AXIS.md).
- Reference boards, prompts and their digests: [`docs/design/archetypes/editorial-blog/README.md`](README.md)
  and [`docs/provenance/assets/design-reference-editorial-blog.md`](../../provenance/assets/design-reference-editorial-blog.md).
  Those boards are `excluded_from_training` and not approved for training; they are planning
  references, and their depicted content (names, dates, prose) is invented.
- Aesthetic system for the same type: [`design.md`](design.md) beside this file.
- Expansion naming this archetype (`editorial-blog`) with its roles: [`docs/train/briefs/expansion-matrix.json`](../../train/briefs/expansion-matrix.json).
- Work: bead `mwg-train-efg` (type axis and the content-only template). Capability dependencies:
  stable slugs and author sessions are named there; real credential verification is `mwg-train-ksn`.
