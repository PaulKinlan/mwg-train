# Fan community — illustrative multi-step visual references

- **Archetype:** `fan-community-site`; a collection a fan browses and bookmarks, a contribution the fan
  submits for review, the fan's own contributions with their moderation status, the moderator's queue
  where visibility is decided, and the visitor's view of what survived that decision. This is the
  `fan-community` type on the archetype type axis, authored for bead `mwg-train-efg` rather than one of
  the five evaluation archetypes or the thirty training families.
- **Generation:** 2026-10-11 UTC by `scripts/generate-archetype-boards.mjs --write --only
  fan-community-site`, which passes `model: gemini-nano-banana-2.1` explicitly and fails closed if the
  response is not that model. The JPEGs are **not reproducible**: the endpoint takes no seed, so the
  committed bytes are the artefact and the prompts below are what was sent, not a recipe that returns
  the same picture.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning
  references, neither generated-site captures nor sealed evaluation targets, and nothing in the corpus
  derives from them.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md)
  records the evaluation archetypes' boards by the same generator; this family keeps its own register at
  [design-reference-fan-community-site.md](../../../provenance/assets/design-reference-fan-community-site.md),
  which carries the digests, the prompt hashes and the vision review.
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md)
  prohibit using AI-generated service content to develop machine-learning models. That is why these are
  `excluded_from_training`: they may be looked at, described and hashed, and they may not be training
  material.
- **Depicted content:** the community name, the canon titles, contributor handles, contribution text,
  tag names, bookmark counts, moderator reasons and timestamps are invented, unverified placeholders.
  The boards depict intended states; they demonstrate no behaviour and prove nothing about an
  implementation, which does not exist yet (see [`plan.md`](plan.md)).
- **Why these five states:** the type's contract is that a fan contributes and a moderator decides
  whether anyone else can see it, so a set that showed only the fan's side would leave the moderation
  boundary - the thing that makes this a type - unpictured. The five are the collection, the
  contribution composer, the fan's own list with status, the moderator's queue, and the visitor's view
  after a decision.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-collection.jpg`](step1-collection.jpg) | Canon collection with filters and a bookmark affordance | `69badd4dad7c2fffb79cc282377440f6d12e5886d2cbedc9c0a553b98de87e8c` | 586435 |
| [`step2-contribution.jpg`](step2-contribution.jpg) | Contribution composer with the review step stated before submission | `f3ae7b333e8e141e1bb8c63392e440124f7d171f08498a67cb2091183d01c1ca` | 404849 |
| [`step3-my-contributions.jpg`](step3-my-contributions.jpg) | The fan's own contributions with moderation status chips | `2532770ea9db4c52bad8d068774b3402ee63cd8cb9c0da5c948e3a7b312d9f8a` | 473425 |
| [`step4-moderation.jpg`](step4-moderation.jpg) | Moderator queue with approve and hold decisions and a stated reason | `350cf4f1530a976286ff1ca4fabce8b5620006934406cb4d37f009f77ca542ad` | 539828 |
| [`step5-visitor.jpg`](step5-visitor.jpg) | Visitor's collection view: published contributions only, no moderator controls | `9e4f8eb29ee0446b3fc40cd31170922dd0261d223026616f1bf881ae6eb7116d` | 556088 |

The digests pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or
legal status. The corpus must derive from its own approved material, never from these. Per-board
inspection findings and the exact prompt bytes' hashes are in the
[register](../../../provenance/assets/design-reference-fan-community-site.md).

## Exact generation prompts

### `step1-collection.jpg`

```text
Modern web application UI for a fan community site about a fictional stop-motion animation studio, "Lantern Works Fan Registry". Step 1: Canon Collection Browse. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #8b5cf6 violet accent for every actionable control, #f8fafc primary text, #94a3b8 muted metadata). A left sidebar lists collection sections: Characters, Sets and Props, Ephemera, Interviews. The main area is a responsive grid of six collection cards, each with a square thumbnail illustration, a title such as "The Lamplighter's Coat" or "Set 12 - Harbour Street", a media-type chip reading Character, Set or Ephemera, a contributor handle such as @brasslamp, and a bookmark button. Two cards show a filled bookmark state with the label Bookmarked and the rest show an outline bookmark labelled Bookmark. Above the grid: a search field with a magnifier icon, a sort control reading Newest first, and a result count "128 artefacts". Top masthead with the community name, a nav of Collection, Contributions and Moderators, and a signed-in user chip "@brasslamp · Fan". Do not draw charts, code, or any form on this screen.
```

### `step2-contribution.jpg`

```text
Modern web application UI for a fan community site, "Lantern Works Fan Registry". Step 2: Contribution Composer. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #8b5cf6 violet accent, #f8fafc primary text, #94a3b8 muted metadata). A single centred column form headed "Contribute to the registry". Labelled fields: Title (text input containing "Harbour Street lighting rig"), Section (select showing Set and Props), Media link (url input containing a placeholder https address), Notes (a five-row textarea with two sentences of body copy), and Tags (a chip input holding Character and Behind the scenes). Under the fields, an inline notice panel with a violet left border and a small info icon, headed "This goes to a moderator before it is public", explaining in one sentence that a moderator decides whether the contribution appears in the collection. A sticky action bar at the bottom holds a primary violet button labelled Submit for review and a secondary text button labelled Save draft. A small status line above the buttons reads "Draft saved 2 minutes ago". Do not draw charts or code.
```

### `step3-my-contributions.jpg`

```text
Modern web application UI for a fan community site, "Lantern Works Fan Registry". Step 3: The Contributor's Own Contributions and Bookmarks. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #8b5cf6 violet accent, #f8fafc primary text, #94a3b8 muted metadata). Page heading "Your contributions" with a tab row: Contributions (selected) and Bookmarks. A vertical list of four contribution rows, each with a title, the section chip, a submitted date, and a moderation status chip on the right: two amber chips labelled In review, one green chip labelled Published, and one red chip labelled Needs changes. The row carrying Needs changes shows, underneath, a quoted moderator reason in a bordered panel - "The lighting rig photo is from the reboot, not the original run" - and a small Edit and resubmit link. Below the list, a compact bookmarks panel headed "Bookmarked in the collection" listing three artefact titles with a small filled bookmark icon and a Remove action. Do not draw charts or code.
```

### `step4-moderation.jpg`

```text
Modern web application UI for a fan community site, "Lantern Works Fan Registry". Step 4: Moderator Queue. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #8b5cf6 violet accent, #f8fafc primary text, #94a3b8 muted metadata). A moderator's workspace headed "Moderation queue" with a count "7 awaiting a decision" and a filter row of chips: Pending (selected), Held, Published. The main column shows three pending contributions, each as a bordered card with a small thumbnail, the contribution title, the contributing handle, a submitted timestamp, the submitted notes in two lines, and a set of decisions: a green outlined button Approve, an amber outlined button Hold, and a text link Open full contribution. The middle card is expanded further with a reason field labelled "Reason (shown to the contributor)" containing the text "Needs a source for the date claim" and a violet primary button labelled Record decision. A right rail summarises today's activity: "4 approved, 2 held, 1 needs changes", plus a link "Moderation policy". Do not draw charts or code.
```

### `step5-visitor.jpg`

```text
Modern web application UI for a fan community site, "Lantern Works Fan Registry". Step 5: Visitor's View of the Same Collection, signed out. This must be recognisably the same page as the collection board with different permissions. Dark slate theme (#0f172a page ground, #1e293b card surfaces, #334155 borders, #8b5cf6 violet accent, #f8fafc primary text, #94a3b8 muted metadata). Layout, top to bottom: the same masthead with the community name "Lantern Works Fan Registry", the nav links Collection, Contributions and Moderators, and a plain Sign in link at the far right with no user chip or avatar; a slim notice banner whose heading reads exactly "Showing published contributions only" with a muted second line reading exactly "Contributions awaiting moderation are not shown here"; one controls row with a search field, a select reading Newest first and a count reading exactly "Showing 3 of 128 artefacts"; a left sidebar listing the four sections Characters, Sets and Props, Ephemera and Interviews; and beside it exactly THREE artefact cards side by side in a single row, evenly spaced and symmetrical. The three cards carry the titles "The Lamplighter's Coat", "Set 12 - Harbour Street" and "Aunt Martha's Teapot", each with a square thumbnail, the contributor handle, and exactly ONE green chip reading exactly "Published" placed once at the top right of the card, plus exactly one outline button reading exactly "Bookmark". The first card has a small dark tooltip under its button reading exactly "Sign in to bookmark". There are NO moderation controls anywhere: no Approve, no Hold, no Record decision, no reason field, no queue link, and no amber In review chip and no red Needs changes chip. Keep it simple and symmetrical: exactly three cards, one status chip per card, no duplicated elements, no empty card slots. Flat application UI only: do NOT draw a browser window, tab bar, URL bar or window controls. Do not draw charts or code.
```

The visitor board is the assertion that the moderation boundary is real: if a pending contribution were
visible here, the fan's contribution and the moderator's decision would be decoration rather than state.
The first attempt at it failed that test in a way worth recording: an independent vision review found it
depicted a *different* collection - four unrelated fantasy items instead of the six artefacts on the
collection board, a different sidebar taxonomy, no bookmark controls and a corrupted `Pubiished` chip -
so it showed two pages rather than one page with two permission levels. The second attempt restored the
artefacts and the taxonomy but miscounted the grid - seven cards in four columns, one card duplicated and
two status chips per card - so the prompt was rewritten a third time to ask for a simpler, symmetric
three-card row, and the review's per-board findings for all three attempts are in the
[register](../../../provenance/assets/design-reference-fan-community-site.md).
