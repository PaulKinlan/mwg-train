# The archetype type axis

Paul asked for breadth of **archetypes**, not more subjects (2026-10-08): games, interactive
explainers, blogs, storefronts, checkout flows, wikis, fan sites, interactive demos, B2B SaaS signup and
sign-in, model and non-model cards, and pricing tiers across monthly/annual and lower/middle/upper. He
has twice been handed a count when he asked about breadth, so this document is the axis and a table, not
a number.

## What a "type" is, and what it is not

A **type** is a behavioural contract a user can exercise: the route kinds, the state transitions, the
client interactions, and the roles that take part. Two entries are the same type if and only if a user
does the same thing in them. A **subject** is what the app is about.

The distinction is not pedantic. `tr-01` (mobile bicycle repair) and `tr-27` (parish church concert
seats) are different subjects of one type: both are a single page with a form, a POST that writes one
record, a read-by-reference receipt, and a list page. Reclassifying a subject change as a type change is
exactly the mistake this axis exists to prevent.

## The axis

Thirteen types. Eleven are Paul's own words; the last two are what the existing corpus reveals and his
list omits.

| # | Type | What the user can do | Source |
|---|---|---|---|
| 1 | `game` | start, play with keyboard/pointer to a terminal state, restart; a score or state changes | Paul |
| 2 | `interactive-explainer` | change an input, watch a causally linked diagram or narrative update, reset | Paul |
| 3 | `blog` | read an index, open an article by deep link, share it | Paul |
| 4 | `storefront` | browse or filter a catalogue, choose a variant, put it in a cart | Paul |
| 5 | `checkout` | quantity and totals, shipping and tax, a simulated payment, a durable receipt | Paul |
| 6 | `wiki` | search a cross-linked corpus, follow citations, see history or version | Paul |
| 7 | `fan-community` | browse canon or media, contribute or bookmark, cross a moderation boundary | Paul |
| 8 | `interactive-demo` | configure an example, run it safely, inspect output or errors | Paul |
| 9 | `b2b-saas-signup` | pick a use case and plan, create a company or workspace, onboard; sign in and recover | Paul |
| 10 | `card` | inspect a model or non-model card, compare, select one | Paul |
| 11 | `pricing-tiers` | compare inclusions across monthly/annual and lower/middle/upper, select a tier | Paul |
| 12 | `record-form` | fill a form, submit it once, read the saved record back by reference, list all records | revealed |
| 13 | `survey-eligibility` | answer branching questions, review, submit, see a result derived from the answers | revealed |

Types 12 and 13 are revealed by the corpus rather than named by Paul: 30 families are type 12, and
`tr-10`/`tr-23` shape their journey as a branch-and-review. They are kept on the axis because they are
real types a model must handle, not because they are breadth.

## Coverage today

The honest headline, measured from `pilot/archetypes.mjs`, `pilot/training-archetypes.mjs` and
`docs/train/briefs/manifest.jsonl`: **all 30 families are type 12**, differentiated by subject. The
builder (`pilot/frameworks.mjs`) implements one behavioural engine - a page with a form, a POST that
writes one record, a read-by-reference receipt, and a list page - plus four capabilities that vary it:
a reflected GET query (`/search`), a server session (`/account`, `/profile`), a capacity quota
(`/register`), and one extra session form (`/cart` in the pilot's `catalogue`).

| Type | Status | Evidence | What is missing to satisfy it |
|---|---|---|---|
| `game` | **missing** | no family yet; the builder now has the `game` capability (mwg-train-ypr) - a client input loop, a state machine with a terminal state and a restart | a family that plays it: a route to the game, instructions a first-time player can read, and a journey that reaches a terminal state and restarts |
| `interactive-explainer` | **partial** | no family yet; the builder now has the `explainer` capability - one control whose value changes a figure computed from it, a path and a narrative bound to that figure with the month reached marked and the past-the-horizon case called out, and a reset that returns the figure to its initial value - tested in all seven arms and driven in a browser in two of them (mwg-train-5k4) | an explainer-shaped training family: a derivation worth changing the input to see |
| `blog` | **partial** | `docs-site` and `community-forum` have an index route and a `/record/:ref` detail route | long-form content, a stable deep link per article, and sharing - the detail page exists but holds a submitted record, not an article |
| `storefront` | **partial** | `web-shop` has a products list and a checkout write; the pilot's `catalogue` has search and a session cart; the builder now has the `cart` capability (mwg-train-11d) - variant selection and a cart accumulated across pages | a family whose cart is the point: a product page with a variant to choose, and a journey that builds a multi-line cart |
| `checkout` | **missing** | no family yet; the builder now has the `checkout` capability (mwg-train-le6) - arithmetic over cart lines, totals, shipping, tax and a simulated payment with a durable receipt | a family that pays: a cart to check out from, a priced line, and a journey that reads a durable receipt |
| `wiki` | **partial** | no family yet; the builder now has the `wiki` capability - search over a seeded corpus by title and body, cross-links that resolve including a link to a page nobody has written, and revision history with author and date - tested in all seven arms and driven in a browser (mwg-train-suu) | a wiki-shaped training family: a corpus of pages that link to each other, and a page with two revisions a reader can tell apart |
| `fan-community` | **partial** | `community-forum` has notes and a thread route | canon/media browsing, contribution editing, and a moderation boundary |
| `interactive-demo` | **partial** | no family yet; the builder now has the `demo` capability - a visible configuration surface with an expression and a rounding choice that materially changes the result, a run action whose output shows the value and the tokens it came from, and a failure path that reports a readable message with a position. Containment is the point of this type: a hand-written tokenizer and recursive-descent evaluator over a closed grammar, limits on characters, tokens and nesting depth, no `eval`, no `Function` and no callee resolved from input - tested in all seven arms with the containment assertion proven not to be vacuous, and driven in a browser in two of them (mwg-train-kyu) | a demo-shaped training family: something worth configuring and running, where the output or the error is the thing a reader came for |
| `b2b-saas-signup` | **partial** | `onboarding-auth` writes an account and reads the session; the pilot's `account-recovery` adds a reset; the builder now has the `workspace` capability (mwg-train-ksn) - credential verification, a second role, and an owner-only setting | a family whose second actor is a colleague: signing in, creating a company, choosing a plan, and an owner-only boundary the member meets |
| `card` | **missing** | none | a card surface with comparable attributes and a selection that survives the next step |
| `pricing-tiers` | **missing** | no family yet; the builder now has the `pricing_tiers` capability (mwg-train-4lk) - a period toggle, three tiers and the choice carried into a confirmation step | a family that chooses: three tiers that differ in more than price, and a journey where the choice changes what the next actor sees |
| `record-form` | **satisfied** | all 30 families; 7 of them `booking`, 3 `web-shop`, 2 each of `dashboard`, `directory-listing`, `event-registration`, `support-helpdesk`, `survey-form`, `docs-site`, `expense-tracker`, 1 each of 6 more | nothing - this is the one type the corpus covers |
| `survey-eligibility` | **partial** | `tr-10`, `tr-23` declare survey shapes; the builder now has the `survey` capability (mwg-train-s0q) - branching questions and a derived result | a family that branches: a question whose answer decides the next one, a review step, and a result derived from the answers rather than a saved record |

So: **1 of 13 types is satisfied, 8 partially, 4 missing entirely** - and the satisfied one is still the type
Paul did not ask about. The gap he has been reporting as "not enough archetypes" is closing from the other end,
though: `wiki`, `interactive-explainer` and `interactive-demo` are no longer missing, because the capabilities they
needed now exist. That is still a capability gap in
the builder rather than a content gap in the manifest, which is why the status column above counts corpus coverage
while the table below counts what the builder can express.

## What each missing type needs before it can be a training pair

The distinction that matters for planning: a type is **content-only** when the existing engine can
express it and only the brief, target and journey are missing; it is **capability-gated** when
`pilot/frameworks.mjs` must learn something new. Content-only types can be authored now. Capability-gated
types need the builder contract extended and tested first, and the expansion plan is explicit that
adding a route kind to satisfy a taxonomy is the wrong direction.

**As of `mwg-train-7bk` every type whose only obstacle was a missing builder capability now has one**: the cart,
pricing tiers, checkout, the survey, the game, the workspace, the wiki, the interactive explainer and the
interactive demo have all landed and are tested in every framework arm. Those rows now name the capability and say
that what is missing is the family.

**What is also true, and what I got wrong in the first version of this paragraph: three types still need the
builder to learn something, and their rows say what.** `blog` needs a stable slug identity for a written record,
which the engine does not have - writes are addressed by a random reference - and an article rendering path. `card`
needs a comparison vocabulary and a selection carried across steps, which today only the cart and pricing
capabilities do. `fan-community` needs a moderation state whose transitions the server enforces and a route that a
session's role decides, neither of which exists. They keep the `(near)` qualifier because the gap is small; it is
not zero, and claiming otherwise would mislead exactly the reader this table exists for.

| Type | Class | New capability the builder needs |
|---|---|---|
| `blog` | content-only (near) | a stable article route per record, and a share affordance; the index/detail shape exists |
| `fan-community` | content-only (near) | a contribution edit path, and a moderation state on the record |
| `b2b-saas-signup` | content-only | the `workspace` capability exists (mwg-train-ksn: credential verification, a second role, and an owner-only setting); what is missing is the family |
| `card` | content-only | a card surface in the markup and a selection carried into the form |
| `storefront` | content-only | the `cart` capability exists (mwg-train-11d: variant selection and a cart accumulated across pages); what is missing is the family |
| `checkout` | content-only | the `checkout` capability exists (mwg-train-le6: arithmetic over cart lines, totals, shipping, tax and a simulated payment with a durable receipt); what is missing is the family |
| `pricing-tiers` | content-only | the `pricing_tiers` capability exists (mwg-train-4lk: a period toggle, three tiers and the choice carried into a confirmation step); what is missing is the family |
| `game` | content-only | the `game` capability exists (mwg-train-ypr: a client input loop, a state machine with a terminal state and a restart); what is missing is the family |
| `survey-eligibility` | content-only | the `survey` capability exists (mwg-train-s0q: branching questions and a derived result); what is missing is the family |

## Worked examples the plan already carries

`docs/train/briefs/expansion-matrix.json` defines 21 proposed archetypes across 5 groups with roles,
`wording_roles` and required behaviours, and `EXPANSION-PLAN.md` labels their feasibility. This axis does
not replace that work: it is the *coarser* level Paul asked about, and the matrix is where a type is
expanded into concrete archetypes with actor pairs. Two examples from it, which are the acceptance bar
this axis inherits:

- `pricing-tiers`: a prospect toggles monthly/yearly, compares included seats, and chooses a tier; the
  workspace owner completes a sandbox signup and later sees the chosen plan. A static three-card render
  is a failure.
- `browser-game`: a player starts, uses keyboard controls to change game state, reaches a terminal state
  and restarts; a first-time player sees instructions while an experienced player can skip them. A
  decorative canvas is a failure.

## The role pairs for the initial three content-only archetypes

A type earns its place on this axis only if two actors have genuinely different goals or permissions in it.
These are the pairs for the three types this template writes first, using the expansion matrix's own
archetype ids (that file also carries the wording roles and required behaviours, for these and for the
gated types). They are the three that need no engine change at all, which is why they come first - not the
only three the table calls content-only, since several other types have had their capability built since.

| Type | Archetype id | Primary actor | Second actor | What changes for the second actor |
| --- | --- | --- | --- | --- |
| blog | `editorial-blog` | an author writes and publishes one article | a reader with no account reads it and sends it on | publishing makes the article reachable at an address a reader can open |
| fan-community | `fan-community-site` | a member contributes and bookmarks | a moderator decides whether a contribution is visible, and a visitor sees only the canon | a contribution is invisible to the visitor until the moderator crosses it |
| card | `product-card-comparison` | a chooser compares cards and selects one | the catalogue owner publishes and retires the options | a selection is refused, with a reason, once the option is withdrawn |

None of the three may be authored with a single actor. If the second actor's journey does not change the
state the first actor sees, the family is the record-form type in different words - the failure this axis
exists to catch.

## The rule this axis adds to authoring

Every family must name a **primary actor and at least one distinct actor** whose goal or permission
differs, and the type's journey must change state for both. A type whose only role is "a visitor fills a
form" is type 12 wearing a different noun, which is what produced 30 families of one shape.

## Status

Analysis for bead `mwg-train-efg`. The A6 sealed evaluation targets are preregistered and untouched by
anything here; the A1 corpus is what this describes and what the follow-up work changes.
