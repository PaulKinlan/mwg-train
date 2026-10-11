---
archetype: product-card-comparison
type: card
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/product-card-comparison/
register: docs/provenance/assets/design-reference-product-card-comparison.md
---

# `product-card-comparison` — functional contract

The behaviour of the `card` type from the archetype type axis. This document is the type's contract:
what a chooser and the catalogue's owner can do, what the server does about it, and what a journey can
assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs)
requires of a plan (`PLAN_SECTIONS`), so it is reviewable the same way the evaluation side's plan
documents are. It is **not** checked against a generated demo, because there is no generated demo for
this type - see *Implementation status*. Nothing here should be read as describing running software.

## Use case

A catalogue of comparable things - the boards use graphics cards, and the type is not about hardware:
it is about any set of options described by the **same attribute names**, which is what makes comparing
possible at all. A **prospect** arrives wanting one, and may either pick directly from a card or tick
Compare on two or three and line them up first. A **catalogue owner** publishes and retires options, and
retiring one is what makes a carried selection refusable.

Those roles need one clarification, because two source documents name them differently and the axis's
rule is that a type earns its place only when a second actor's journey changes the state the first actor
sees. The [expansion matrix](../../../train/briefs/expansion-matrix.json) names the archetype's roles as
`prospect` and `comparison-shopper`; the [type axis](../../../train/briefs/TYPE-AXIS.md) names the chooser
and the catalogue owner, with the observable *"a selection is refused for a retired option"*. Both are
honoured by being explicit about what each contributes to the type:

- the two **consumer intents** are the type's two journeys: the quick buyer selects from one card, and
  the comparison shopper builds a comparison set and only then lets their selection advance. That is a
  real state difference - a comparison set exists, and it is transient session state rather than a
  property of any card;
- the **owner's** publish/retire lifecycle is what makes a selection more than a click: a retired option
  is refused at the step that follows, so the second actor's action changes the first actor's journey
  after the first actor believed they were finished.

Without the owner's half this is a gallery with a button; without the comparison's half it is a
catalogue with no reason to show aligned attributes. Neither half alone is a type.

## Routes and effects

| Route | Actor | Effect |
| --- | --- | --- |
| `GET /` | prospect, comparison shopper | The catalogue: every **published** card with its name, category, price and comparable attributes, a `Select` action and a `Compare` toggle. Accepts `?q=` over names and attribute values, `?category=`, `?sort=` (`price_asc` \| `score_desc`), and `?include=retired` for the owner only. A retired card is never listed to a consumer. An unknown `?category=` is an empty result, not an error. |
| `GET /card/:slug` | prospect | One card in full. A **retired** card is still readable and says it is retired - identity is durable, availability is not - and it offers no `Select`. An unknown slug is a 404 naming the slug. |
| `POST /compare` | comparison shopper | Adds or removes one card in the session's comparison set (2 to 3 cards). A fourth is refused with a reason. No account is required: the set is transient session state. |
| `GET /compare` | comparison shopper | The comparison: one row per attribute **key in the catalogue's fixed order**, one column per card in the set, the differing rows marked, and a `Select this card` action in each column. With fewer than two cards it is the empty comparison state, not an empty table. |
| `POST /select` | prospect | Selects one card, writing it into the session as the carried selection, and redirects to `GET /selection`. A **retired** card is refused with a stated reason and changes nothing. |
| `GET /selection` | prospect | The carried selection: the chosen card's name, price and attributes, the action that changes it, and the comparison set still retained. If the selected card has been retired since it was chosen, this route refuses the selection and says so rather than rendering it as current. |
| `POST /selection/clear` | prospect | Clears the selection so the next step starts unset. The comparison set is unaffected. |
| `GET /catalogue` | catalogue owner | The owner's list: every card with its published/retired state and the action that changes it. A consumer asking for it is refused, not shown a read-only copy. |
| `POST /cards/:slug/retire` | catalogue owner | Retires a card (or republishes one). Retiring removes it from every consumer listing and makes an existing selection of it refusable at `GET /selection`. |

The engine can already render a list, a read-by-reference page and a write; it has no notion of a
**set of things being compared**, no attribute vocabulary whose rows can be aligned, and no
selection that survives into the following step. Those three are the type.

## Data and state

- `card`: `slug` (unique, stable), `name`, `category`, `attributes` (a map keyed by the catalogue's
  attribute vocabulary), `price_minor` + `currency`, `score`, `status` (`published` \| `retired`),
  `media`.
- **The attribute vocabulary is part of the contract**: a catalogue declares its attribute keys once,
  in a fixed order, and every card is described in those names. A card that does not declare a key is
  shown as **not declared** in that row, never as a blank, a zero or an inherited value - otherwise two
  cards that differ look equal.
- `comparison`: a set of **2 to 3** card slugs held in the session. It is **transient** by design: a new
  session starts with none, and the page says so rather than drawing an empty table.
- `selection`: one card slug held in the session, plus the moment it was chosen. It survives the step
  that follows the choice - that is what "carried" means - and it is re-checked against the catalogue on
  every read, so a retirement between the choice and the next step is caught.
- `price`: integer minor units plus a currency, end to end. A price is never a float and no rounding is
  performed to display one; a total that needed arithmetic would be this type's `checkout` neighbour,
  not this type.
- **No account and no credential state.** The type is transient: a comparison set and a selection are a
  browser session, not a person. A deployment that wanted a selection to follow a person would need an
  account, and that dependency belongs to a sign-in capability, not here. Saying so is the point - a
  session that identifies nobody must not be presented as one that does.
- The owner's identity is the one privileged fact in the type, and it is enforced on the **request**:
  `GET /catalogue` and `POST /cards/:slug/retire` check the role, and hiding the links is not the check.
- Card names and attribute values are rendered as **text**, never as markup, and a test must assert it.

## Journey

Prospect, quick path, in one pass:

1. Open the catalogue with no cookie. Every card is published and comparable; there is no owner control
   and no retired card.
2. Filter by category and search for a value that appears in one card's attributes.
3. Select that card directly from its card.
4. The next step names the chosen card and its attributes, and offers to change the selection.
5. Change the selection to another card: the carried selection is the second one, not both.

Comparison shopper, in one pass:

6. Tick Compare on two cards, then on a third. A fourth is refused with a reason, and the set stays at
   three.
7. Open the comparison. Rows are the catalogue's attribute keys in their fixed order; each column is a
   card; the rows where the cards differ are marked; a card that did not declare a key shows *not
   declared*.
8. Select from one column. The selection is carried, and the comparison set is still there - the type
   keeps the work that produced the decision until it is cleared.

Catalogue owner, in one pass:

9. Open the owner's list as a consumer first: the request is refused with a stated reason, so the role
   boundary is proved by a request rather than by the absence of a link.
10. Retire the card a prospect had already selected.
11. As that prospect, open the next step: the selection is **refused** with the reason that the card is
    no longer available, and the catalogue no longer lists it. This is the assertion that separates this
    type from a gallery with a button.

## Validation and states

- A fourth card in the comparison is refused with a reason, and the set is unchanged.
- Fewer than two cards is the empty comparison state, which names the action that fills it; it is
  distinct from a comparison whose rows are all equal, and both are distinct from a catalogue with no
  matches.
- A card that does not declare an attribute shows *not declared* in that row.
- Selecting a retired card, or one that was retired after it was chosen, is refused with a stated reason
  and leaves the previous selection intact rather than half-applied.
- An unknown card slug, or an unknown `?category=`, is handled as declared above: 404 for a card, an
  empty result for a category.
- A consumer requesting the owner's list, or retiring a card, is refused with a stated reason - and the
  assertion uses the consumer's **own valid session**, so the refusal cannot be the session check in
  disguise.
- Prices render from integer minor units with the currency's own formatting; no float appears in a
  rendered value.
- Comparison differences are marked with **text or a symbol with a text alternative**, never by colour
  alone.
- A transient comparison never claims to be saved: the page says a new session starts with none.

## Acceptance criteria

1. `GET /` lists every published card and no retired one; `GET /?include=retired` for a consumer does not change that.
2. `GET /?q=<a value that appears in one card's attributes>` returns that card, and `GET /?q=<nonsense>` returns the no-matches state quoting the query.
3. `POST /compare` twice, then `GET /compare`, returns a table whose row labels are the catalogue's attribute keys in their declared order and whose columns are the two cards.
4. `POST /compare` with a fourth card is refused with a reason and leaves the set at three.
5. `GET /compare` with fewer than two cards returns the empty comparison state, not an empty table, and that state names its action.
6. Two cards that differ in one attribute produce a marked row, and a card missing a key shows *not declared* in that row.
7. `POST /select` with a published card makes `GET /selection` name that card and its attributes.
8. `POST /select` with a retired card is refused, names the card, and leaves the selection unchanged.
9. A card selected while published and retired before the next step is **refused** at `GET /selection` with the reason, and no other card is silently substituted.
10. `POST /cards/:slug/retire` as a consumer is refused with a stated reason using that consumer's own session; as the owner it removes the card from `GET /`.
11. Names and attribute values containing markup render as text.
12. A second session with no cookie has an empty comparison and no selection.
13. Every rendered price is formatted from integer minor units and equals the stored value.

## Implementation status

**Not implemented. Nothing drives these routes today, and the four boards are the only artefact of this
type that exists.** Being precise about what does exist, because "the engine already renders a list of
cards" is exactly the half-truth this axis was written to stop:

- The shared engine (`pilot/frameworks.mjs`) can render a list and a detail page, and the training
  families use those for record lists. That is *capability*, not implementation: no family has an
  attribute vocabulary shared across records, no route holds a set in session state, and no selection is
  re-checked against a catalogue after it is made.
- There is no specification for this type under `docs/eval/specs/` (that directory is the sealed A6
  evaluation set) and no family row in `docs/train/briefs/manifest.jsonl`. This type is A1 planning
  material; it is not a training pair and not an evaluation target.
- The four reference boards are generated, vision-reviewed and digest-pinned
  ([register](../../../provenance/assets/design-reference-product-card-comparison.md)); they are pictures of
  the intended states - the catalogue, the comparison, the carried selection and the empty comparison -
  and they demonstrate no behaviour whatsoever.
- What is required before this type could be called implemented, in the order it becomes true, is
  recorded on bead `mwg-train-efg`: a declared attribute vocabulary with an order, a session-held set and
  selection with a retirement re-check, an owner role enforced on the request, and a driven journey
  asserting the thirteen criteria above.

## Provenance

- Type axis and the coverage table this type comes from: [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md).
- Reference boards, prompts and their digests: [`docs/design/archetypes/product-card-comparison/README.md`](README.md)
  and [`docs/provenance/assets/design-reference-product-card-comparison.md`](../../../provenance/assets/design-reference-product-card-comparison.md).
  Those boards are `excluded_from_training` and not approved for training; they are planning
  references, and their depicted content (catalogue name, product names, prices, scores, attribute
  values) is invented.
- Aesthetic system for the same type: [`design.md`](design.md) beside this file.
- Expansion naming this archetype (`product-card-comparison`) with the roles `prospect` and
  `comparison-shopper`, and the observable it must produce: [`docs/train/briefs/expansion-matrix.json`](../../../train/briefs/expansion-matrix.json).
  The reconciliation with the axis's chooser/owner pair is in *Use case* above, and is recorded on the
  work bead rather than left implicit.
- Where this type's claims stand in the coverage table: **missing** today - no family has a card surface
  with comparable attributes, and none carries a selection into a following step.
- Work: bead `mwg-train-efg`.
