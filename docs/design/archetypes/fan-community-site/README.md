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
| [`step1-collection.jpg`](step1-collection.jpg) | Canon collection with filters and a bookmark affordance | `bdb30256c1e4259d0efb54c6d8cf6619f67a27d2b150d78d2507f55dea346bb8` | 562989 |
| [`step2-contribution.jpg`](step2-contribution.jpg) | Contribution composer with the review step stated before submission | `cca66af696b40ba65bba49fc8a92625665b54d5fafe755a50d909f5e52a237cf` | 422384 |
| [`step3-my-contributions.jpg`](step3-my-contributions.jpg) | The fan's own contributions with moderation status chips | `57552bd442f70daabf3e5f7554a07474d9431cea5d10c501d353d58aaa3633f6` | 471708 |
| [`step4-moderation.jpg`](step4-moderation.jpg) | Moderator queue with approve and hold decisions and a stated reason | `e1ad96b66b0405783b44fa7355c64ceef3b5bd8dc7ce055da78ea4d910ffcd3a` | 492287 |
| [`step5-visitor.jpg`](step5-visitor.jpg) | Visitor's collection view: published contributions only, no moderator controls | `527513c535bdbbe3d2f4d53a39b51804a978c939e7201ce0a50d9ba96c0747be` | 605505 |

The digests pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or
legal status. The corpus must derive from its own approved material, never from these. Per-board
inspection findings and the exact prompt bytes' hashes are in the
[register](../../../provenance/assets/design-reference-fan-community-site.md).

## Exact generation prompts

### `step1-collection.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for a stop-motion animation craft archive, "Lantern Works Fan Registry", Step 1: Canon Collection Browse in WARM VELVET & BRASS SCREENING ROOM DARK MODE (#18131a warm aubergine-charcoal page ground reaching all four edges, #261f29 tactile archive card surfaces with #3d3142 borders, warm lantern-brass #d97706 primary accent for actionable controls, #faf5ff warm cream text, #c4b5fd muted metadata). Top masthead with lantern emblem, "Lantern Works Fan Registry", nav links Collection, Contributions, Moderators, and signed-in chip "@brasslamp · Fan". Left sidebar lists CANON COLLECTION sections: Characters, Sets and Props, Ephemera, Interviews. Above the grid: search input, sort select "Newest first", and count "128 artefacts". Main area shows a 3×2 grid of six stop-motion puppet and miniature set cards ("The Lamplighter's Coat", "Set 12 - Harbour Street", "Aunt Martha's Teapot", etc.) with warm miniature stage photography thumbnails, media-type chips, contributor handles, and brass Bookmark buttons (two filled "Bookmarked", four outline "Bookmark").
```

### `step2-contribution.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for "Lantern Works Fan Registry", Step 2: Contribution Composer in WARM VELVET & BRASS SCREENING ROOM DARK MODE (#18131a warm aubergine-charcoal ground reaching all four edges, #261f29 form card surface, #3d3142 borders, lantern-brass #d97706 primary button, #faf5ff warm cream text). Single centered column form headed "Contribute to the registry" with labelled fields: Title ("Harbour Street lighting rig"), Section select ("Sets and Props"), Media link, Notes textarea, and Tags chip input ("Character", "Behind the scenes"). Below the fields, an inline notice panel with a brass left border reads "This goes to a moderator before it is public". Sticky bottom action bar holds a lantern-brass button "Submit for review", secondary "Save draft", and status "Draft saved 2 minutes ago".
```

### `step3-my-contributions.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for "Lantern Works Fan Registry", Step 3: Contributor's Own Contributions and Bookmarks in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper background reaching all four edges, #ffffff bordered contribution rows with #e7e5e4 stone rules, #261f29 deep aubergine-ink typography, #b45309 lantern-brass links and active tab indicator). Page heading "Your contributions" with tab row: Contributions (selected) and Bookmarks. Vertical list of four contribution rows showing title, section chip, submitted date, and moderation status chip on the right: two amber chips "In review", one green chip "Published", and one crimson chip "Needs changes" with a quoted moderator note underneath ("The lighting rig photo is from the reboot, not the original run") and an "Edit and resubmit" link. Below, a "Bookmarked in the collection" card lists three saved artefacts with Remove buttons.
```

### `step4-moderation.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for "Lantern Works Fan Registry", Step 4: Moderator Queue in WARM VELVET & BRASS SCREENING ROOM DARK MODE (#18131a warm aubergine-charcoal page ground reaching all four edges, #261f29 queue cards with #3d3142 borders, #d97706 lantern-brass primary button, #faf5ff cream text). Heading "Moderation queue" with badge "7 awaiting a decision" and filter chips Pending (selected), Held, Published. Main column shows three pending stop-motion artefact contributions with thumbnail, title, handle, timestamp, notes, and action buttons: green outlined "Approve", amber outlined "Hold", and "Open full contribution". The middle card is expanded with a "Reason (shown to the contributor)" input containing "Needs a source for the date claim" and a lantern-brass primary button "Record decision". Right rail summarises "Today's activity: 4 approved, 2 held, 1 needs changes".
```

### `step5-visitor.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity modern web application UI for "Lantern Works Fan Registry", Step 5: Signed-Out Visitor's View of the Collection in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper ground reaching all four edges, #ffffff artefact cards with #e7e5e4 borders, #261f29 deep ink, #b45309 brass accents). Top masthead shows "Lantern Works Fan Registry", nav links Collection, Contributions, Moderators, and a plain "Sign in" link at far right. Slim notice banner reads "Showing published contributions only" with subtitle "Contributions awaiting moderation are not shown here". Controls row with search input, sort "Newest first", and count "Showing 3 of 128 artefacts". Left sidebar lists Characters, Sets and Props, Ephemera, Interviews. Beside it, one symmetrical row of exactly THREE artefact cards ("The Lamplighter's Coat", "Set 12 - Harbour Street", "Aunt Martha's Teapot"), each with one green "Published" chip and one outline "Bookmark" button (first card showing tooltip "Sign in to bookmark"). No moderator controls anywhere.
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
