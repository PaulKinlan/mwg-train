---
archetype: fan-community-site
type: fan-community
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/fan-community-site/
register: docs/provenance/assets/design-reference-fan-community-site.md
---

# `fan-community-site` — functional contract

The behaviour of the `fan-community` type from the archetype type axis. This document is the type's
contract: what a fan and a moderator can do, what the server does about it, and what a journey can
assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan
documents are. It is **not** checked against a generated demo, because there is no generated demo for
this type - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

A fan registry for a small animation studio. A **fan** browses a canon collection of artefacts,
bookmarks the ones they care about, and contributes one of their own - which is **not public when it is
submitted**. A **moderator** decides whether a contribution becomes visible and records why. A visitor
with no account sees the published collection and never a pending contribution.

Those are the two roles, and the reason this is a type rather than a subject is that they hold different
**permissions** over the same state: the fan cannot make their own contribution visible, and the
moderator's decision changes what every visitor can see. A version of this in which the second actor
merely edits their own record is the record-form type wearing a fan site's nouns - the failure the axis
exists to catch. The axis names the pair (`fan` / `moderator`) and the observable it demands:
*"contribution status and moderated visibility change appropriately"*.

## Routes and effects

| Route | Actor | Effect |
| --- | --- | --- |
| `GET /` | visitor, fan | The collection: canonical artefacts (title, section, media-type chip, contributor handle, favourite count) and the contributions that are **published**, newest first. Accepts `?q=` for a search over titles and contribution notes, `?section=` for one section, and `?sort=` (`newest` \| `favourites`). A visitor sees no pending, held or needs-changes row, and no moderator control. An unknown `?section=` is an empty result, not an error. |
| `GET /artefact/:slug` | visitor, fan | One artefact in full, with its contributor and - for a signed-in fan - whether this fan has bookmarked it. An unknown slug is a 404 that names the slug and offers the collection. |
| `GET /contribute` | fan | The composer: title, section, media link, notes, tags, with the review step stated **before** submission rather than after it. |
| `POST /contributions` | fan | Submits one contribution. It is written with status `submitted` and the response is the fan's own list, where the new row's status is visible. It does **not** appear in `GET /` for anyone yet. Validation failure returns the composer with the values kept. |
| `GET /contributions` | fan | The fan's own contributions, each with its status word and, when a moderator has decided against it, the **reason quoted** beside it; plus the fan's bookmarks. Fan-scoped: another fan's list is not reachable from here. |
| `POST /contributions/:id/revise` | fan | Resubmits a contribution that a moderator returned, leaving the status `submitted` again and keeping the earlier decision in the history. Only the fan who wrote it may revise it. |
| `POST /bookmarks` | fan | Toggles one bookmark on one artefact for the signed-in fan. It survives a reload and is scoped to that fan. |
| `GET /moderation` | moderator | The queue: pending, held and published contributions with counts. A fan asking for it is refused, not shown a disabled version. |
| `POST /moderation/:id` | moderator | Records a decision - `approve`, `hold` or `needs_changes` - with a **reason** that the fan will see. Approval is what makes a contribution appear at `GET /`; `hold` keeps it out but keeps it in the fan's list with the reason. |

The engine can already express a list, a read-by-reference page, a write and a form in kind. What this
type needs beyond that is **permission as state**: a session that carries a role, and a visibility rule
the server applies to every read of the collection.

## Data and state

- `artefact`: `slug` (unique, stable), `title`, `section`, `media_type` (`character` \| `set` \|
  `ephemera` \| `interview`), `contributor_handle`, `notes`, `favourites`.
- `contribution`: `id`, `title`, `section`, `media_link`, `notes`, `tags[]`, `author` (the fan),
  `status` (`draft` \| `submitted` \| `held` \| `needs_changes` \| `published`), `submitted_at`,
  `updated_at`.
- `moderation_decision`: `id`, `contribution_id`, `decision`, `reason`, `decided_by` (the moderator),
  `decided_at`. A decision is appended, never overwritten, so the reason the fan was shown stays
  attached to the version that was decided on.
- `bookmark`: `fan` + `artefact`, unique together. Owner-scoped state, which is what makes a bookmark
  belong to a person rather than to the page.
- **Visitor state: none.** Browsing the published collection requires no session, no cookie and no query
  state; two identical requests with and without cookies return the same published bodies. That is a
  real constraint, not an omission.
- **Fan state:** a session, so a bookmark and a contribution can be attributed. Within this corpus the
  session is **seeded**, and real credential verification is out of scope here and tracked as a
  capability - [`mwg-train-ksn`] adds hashed credential verification plus a workspace that carries a
  second role, which is exactly the dependency this type has. Saying so matters: a session that
  authenticates nobody must not be presented as sign-in.
- **Moderator state:** a session whose role is `moderator`. The role is a server-side fact, not a page
  the user navigates to: a fan cannot become a moderator by asking for `/moderation`.
- `notes` and other user-supplied long fields are rendered as **text**, never as markup, and a test must
  assert it, or the type's write path is an injection surface.
- The moderation boundary is enforced **on the request and on the read**: the decision route checks the
  role, and the collection query filters by status. Hiding a control is not the control.

## Journey

Fan, in one pass:

1. Open the collection as a signed-out visitor. Every row is published; there is no "pending" row and no
   moderation control anywhere on the page.
2. Sign in as a fan. Filter by a section, search for a phrase, and open an artefact.
3. Bookmark it. Reload the page: the bookmark is still there.
4. Open the composer and submit a contribution.
5. The fan's own list now shows it with the status word *In review*, and it is **not** in the public
   collection - the same request a visitor makes does not return it.
6. The moderator holds it with a reason. The fan's list shows the status *Needs changes* and quotes the
   reason; the fan revises and resubmits, and the status returns to *In review*.

Moderator, in one pass:

7. Open the queue as a fan first: the request is refused with a stated reason, so the boundary is proved
   by a request rather than by the absence of a button.
8. As the moderator, approve one contribution and hold another, giving each a reason.
9. As the visitor again, reload the collection: the approved contribution is present and the held one is
   absent - twice, because a visibility rule that is not deterministic is not a rule.

## Validation and states

- A submission with no title or no notes is refused, keeps everything the fan typed, and names the
  offending field beside it - a message, not a red border alone.
- A media link that is present but not a URL shape is refused with the field named; an absent one is
  allowed, because not every contribution has a picture.
- An unknown section, or a sort value outside the two declared, is refused rather than silently
  ignored.
- A decision with no reason is refused: the fan is shown the reason, so a reason is part of the state
  change, not a courtesy.
- A fan requesting the queue, or deciding on a contribution, is refused with a stated reason - and the
  assertion uses the fan's **own valid session**, so the refusal cannot be the session check in
  disguise.
- A fan revising someone else's contribution is refused; the refusal is a permission answer, not a 404
  that hides the existence of the record.
- The empty collection and the no-search-matches state are distinct, and each says which one it is.
- An unknown artefact slug, or a decision on an unknown contribution, is a 404 naming what was not
  found.
- Every moderation status is distinguishable by its **word**, not by colour alone: `submitted`, `held`,
  `needs_changes` and `published` each carry text, and the mark is not the only signal.

## Acceptance criteria

1. `GET /` with no cookie returns published artefacts and published contributions only: no row whose status is `submitted`, `held`, `needs_changes` or `draft` appears anywhere in the body, and no moderation control is rendered.
2. `GET /?q=<a phrase that appears in one published contribution's notes>` returns that contribution and `GET /?q=<nonsense>` returns the no-matches state quoting the query.
3. `POST /contributions` with a valid contribution by a fan returns a page whose text contains the new title and the status word for `submitted`, and the same contribution is **absent** from `GET /` for a visitor before any decision.
4. `POST /contributions` with an empty title submits nothing, returns the composer with the field error, and leaves the collection unchanged.
5. `POST /contributions` with notes containing markup renders that markup as text when the contribution is later published.
6. `GET /moderation` as a fan returns a permission refusal that names the reason, using the fan's own session; as the moderator it returns the queue.
7. `POST /moderation/:id` with `approve` makes the contribution appear in a visitor's `GET /`; with `hold` it does not, and the fan's own list shows the decision word and the quoted reason.
8. `POST /moderation/:id` with no reason is refused and changes no status.
9. A bookmark made by one fan survives a reload and is not visible to a second fan.
10. The same collection requests with cookies absent and with a fan's cookie return the same published bodies.

## Implementation status

**Not implemented. Nothing drives these routes today, and the five boards are the only artefact of this
type that exists.** Being precise about what does exist, because "the engine already renders lists and
forms" is exactly the half-truth this axis was written to stop:

- The shared engine (`pilot/frameworks.mjs`) can render a list, a read-by-reference page, a write and a
  form, and the training families use those for record lists and receipts. That is *capability*, not
  implementation: no family in the corpus has a **status** whose transitions are server-enforced, and
  none has a route that a session's role decides. The engine's session exists but carries no role.
- There is no specification for this type under `docs/eval/specs/` (that directory is the sealed A6
  evaluation set) and no family row in `docs/train/briefs/manifest.jsonl`. This type is A1 planning
  material; it is not a training pair and not an evaluation target.
- The five reference boards are generated, vision-reviewed and digest-pinned
  ([register](../../../provenance/assets/design-reference-fan-community-site.md)); they are pictures of the
  intended states - collection, composer, the fan's own list with status, the moderator queue, and the
  visitor's view - and they demonstrate no behaviour whatsoever.
- What is required before this type could be called implemented, in the order it becomes true, is
  recorded on bead `mwg-train-efg`: a session that carries a role (the capability this depends on is
  the second role in `mwg-train-ksn`, which the engine is gaining), a status field whose transitions only the server performs, a decision route with a permission check proved by a request, a
  visibility filter applied to every collection read, and a driven journey asserting the ten criteria
  above.

## Provenance

- Type axis and the coverage table this type comes from: [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md).
- Reference boards, prompts and their digests: [`docs/design/archetypes/fan-community-site/README.md`](README.md)
  and [`docs/provenance/assets/design-reference-fan-community-site.md`](../../../provenance/assets/design-reference-fan-community-site.md).
  Those boards are `excluded_from_training` and not approved for training; they are planning
  references, and their depicted content (community name, titles, handles, notes, counts) is invented.
- Aesthetic system for the same type: [`design.md`](design.md) beside this file.
- Expansion naming this archetype (`fan-community-site`) with its roles `fan` and `moderator` and the
  observable it must produce: [`docs/train/briefs/expansion-matrix.json`](../../../train/briefs/expansion-matrix.json).
- Where this type's claims stand in the coverage table: *partial* today - `community-forum` has notes
  and a thread route, and has neither a contribution edit path nor a moderation state.
- Work: bead `mwg-train-efg` (type axis and the content-only template). Capability dependency: the
  role-bearing session and credential verification of `mwg-train-ksn`.
