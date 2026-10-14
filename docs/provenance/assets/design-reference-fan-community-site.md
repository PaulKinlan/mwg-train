# Provenance: fan community archetype visual reference boards

- **Scope:** five illustrative JPEGs for `fan-community-site`, an archetype authored on the archetype
  type axis (bead `mwg-train-efg`) rather than one of the five evaluation archetypes or the thirty
  training families. They are a **planning reference** for the `fan-community` type's states: the canon
  collection, the contribution composer, the fan's own list with moderation status, the moderator's
  queue, and the visitor's view.
- **Generation:** 2026-10-11 UTC, by `scripts/generate-archetype-boards.mjs --write --only
  fan-community-site`. The script passes `model: gemini-nano-banana-2.1` explicitly and fails closed if
  the response does not attest that model. The endpoint takes no seed, so **the JPEGs are not
  reproducible from the prompts**: the committed bytes are the artefact, and the prompt digests prove
  only that the text transcribed in the README is the text that was sent.
- **Rights:** [Google consumer-account terms](../accounts/google-antigravity-consumer.md) prohibit using
  AI-generated service content to develop machine-learning models. These boards are therefore
  `excluded_from_training` and `approved_for_training: false`: they may be looked at, described and
  hashed, and they may not be training material. The corpus derives from its own approved material.
- **Visual truth:** the community name, canon artefact titles, contributor handles, contribution notes,
  tag names, bookmark counts, moderator reasons and timestamps are invented, unverified placeholders.
  The boards depict intended *states*; they demonstrate no behaviour and prove nothing about an
  implementation, which does not exist (see [`plan.md`](../../design/archetypes/fan-community-site/plan.md)).
- **Coverage:** five boards, chosen so the type's whole claim is pictured rather than only the fan's
  half: a contribution's journey across a moderation boundary cannot be shown by the contributor's
  screens alone. The moderation boundary appears as an *absence* in the visitor board and as a *verb* in
  the queue board, and the status words appear with the same names the contract uses.

## Independent vision review (Historical First-Wave Audit)

**Note (2026-10-11 UTC deframing):** The five boards were regenerated (bead `mwg-train-d0zi.1`) with explicit prompts to ban all floating macOS window frames and enforce a full-bleed web canvas. The independent vision review findings below describe the *original* first-wave generations. As such, historical references to simulated browser chrome (e.g., in `step2-contribution.jpg`), specific typo quirks (`Titie`), and old `step5` SHAs apply to those previous artifacts. The new boards are pending an independent post-regeneration vision review.

Commissioned from a vision-capable model of a different family from the authoring lane (Gemini 3.8 Flash,
high thinking, through the fleet's reviewer role), 2026-10-11 UTC. It was asked to read each raster and
report what it saw rather than what the prompt asked for, and to say whether the visitor board depicts the
same collection as the collection board - the type's central claim. Its findings are recorded below
without being tidied up, including the two attempts it rejected.

### Observed artefacts and accepted notes, per board

- `step1-collection.jpg`: **clean**. Masthead `Lantern Works Fan Registry`, nav
  `Collection`/`Contributions`/`Moderators`, the signed-in chip `@brasslamp · Fan`, a sidebar headed
  `CANON COLLECTION` with `Characters` active and `Sets and Props`, `Ephemera`, `Interviews` below it, a
  search field, the sort control `Newest first`, the count `128 artefacts`, six cards with media-type
  chips, and two cards in the filled `Bookmarked` state with the rest outline `Bookmark`. Accepted as
  generated.
- `step2-contribution.jpg`: **accepted with notes.** The moderation notice is present and correct
  (`This goes to a moderator before it is public`), the labelled fields and the sticky action bar
  (`Submit for review`, `Save draft`) are present, and the review found one defect and two differences
  worth recording: the primary field label is misspelled **`Titie`**; the board is drawn inside simulated
  browser chrome unlike the other four; and its section value reads `Set and Props` where the collection
  board's sidebar says `Sets and Props`.
  - **Decision (authoring lane, on the review's recommendation): accepted, not re-rolled.** The typo is
    in a *label*, on a board that is explicitly not a capture of running software; a build must render
    the label as `Title`, and this file is the record that the board does not. Re-rolling to fix one
    letter would have re-drawn the states the other four boards depend on looking like.
- `step3-my-contributions.jpg`: **clean**. The review could read all four status chips by their words
  (`In review` twice, `Published`, `Needs changes`), the quoted moderator reason under the returned
  contribution, the `Edit and resubmit` action, the tabs, and the bookmarks panel. Two differences are
  recorded rather than fixed: the sidebar in this board uses a different navigation set
  (`Browse`/`Registry`/`Community`/`Your Contributions`) from the masthead used on the other boards, and
  the bookmarks panel appears inline under the `Contributions` tab while a `Bookmarks` tab also exists.
  Neither affects the states the contract asserts; a build takes the masthead navigation and the tab
  from the contract, not from a generated raster.
- `step4-moderation.jpg`: **clean**. `7 awaiting a decision`, the filter chips
  `Pending`/`Held`/`Published`, three contribution cards with `Approve` and `Hold`, the expanded card's
  `Reason (shown to the contributor)` field with the typed reason and the `Record decision` button, and
  the `Today's Activity` rail all match the intended state. Accepted as generated.
- `step5-visitor.jpg`: **re-generated twice, then accepted.** This is the board the type rests on, so
  both rejections are recorded in full:
  - *Attempt 1* (sha256 `e8135059…`): the review found it depicted a **different collection** - four
    unrelated fantasy items (`Aether Lantern`, `Chronomancer's Relic`, `Shadow Ember`, `Vortex Core`)
    instead of the six canon artefacts, a different sidebar taxonomy
    (`All Artifacts`/`Popular`/`Lore`/`Art`/`Replicas`/`About`), no bookmark controls, and a corrupted
    chip reading `Pubiished`. Verdict: **re-roll** - it showed two different pages rather than one page
    at two permission levels, which is the claim.
  - *Attempt 2* (sha256 `6ca1279f…`): the content and taxonomy were restored and the browser chrome was
    gone, but the review found the grid **miscounted**: seven cards in four columns with column four
    empty, `The Clockwork Key` duplicated, and **two green `Published` chips on every card**. Verdict:
    **re-roll** - unusable as a reference because the duplication is visible.
  - *Attempt 3* (the accepted first-wave `step5-visitor.jpg`, sha256 `9e4f8eb2…`): **accepted.** The review read
    exactly three cards in one row - `The Lamplighter's Coat`, `Set 12 - Harbour Street`,
    `Aunt Martha's Teapot` - with exactly three `Published` chips (one per card), one `Bookmark` button
    per card, the `Sign in to bookmark` tooltip under the first, the four sidebar sections matching the
    collection board, the banner `Showing published contributions only` with its second line, the count
    `Showing 3 of 128 artefacts`, no signed-in chip, and **no moderation control, no amber `In review`
    chip and no red `Needs changes` chip anywhere**. It explicitly closed the first attempt's finding.
    Recorded differences, both cosmetic: it omits the `CANON COLLECTION` sidebar heading and the active
    pill that the collection board carries, and its thumbnails are square where the collection board's
    are 16:9.
  - **Decision (authoring lane): accepted as generated at the third attempt.** The two rejections were
    the right calls and are the useful part of this record: an image model asked for a dense, exactly
    counted grid will miscount it, and the fix that worked was to *lower the required count* (three
    cards in one row) rather than to describe the same six cards more emphatically.
- **Cross-board:** the community name is consistent across all five boards
  (`Lantern Works Fan Registry`; `Lantern Works` on two lines as a sidebar lockup on one). Status words
  are consistent with the contract's names. No board contains a rendered credential or personal data.

| Archetype | Ordered image | SHA-256 (JPEG bytes) | Bytes | SHA-256 (exact UTF-8 prompt) |
| --- | --- | --- | ---: | --- |
| [`fan-community-site`](../../design/archetypes/fan-community-site/README.md) | [`step1-collection.jpg`](../../design/archetypes/fan-community-site/step1-collection.jpg) | `bdb30256c1e4259d0efb54c6d8cf6619f67a27d2b150d78d2507f55dea346bb8` | 562989 | `85edd73a43f2a6a84c17dcd2a0da9054658d7a8d4df9568d17b15c62985961f5` |
| [`fan-community-site`](../../design/archetypes/fan-community-site/README.md) | [`step2-contribution.jpg`](../../design/archetypes/fan-community-site/step2-contribution.jpg) | `cca66af696b40ba65bba49fc8a92625665b54d5fafe755a50d909f5e52a237cf` | 422384 | `2756e9208a939515c8a41fa67e26cacdb4567491ac4c832520ff10c195e7d8c9` |
| [`fan-community-site`](../../design/archetypes/fan-community-site/README.md) | [`step3-my-contributions.jpg`](../../design/archetypes/fan-community-site/step3-my-contributions.jpg) | `57552bd442f70daabf3e5f7554a07474d9431cea5d10c501d353d58aaa3633f6` | 471708 | `f7b1eb2c7c965b3689b3bae5719558ccffd6f2863d2c71cce8db36227b93920c` |
| [`fan-community-site`](../../design/archetypes/fan-community-site/README.md) | [`step4-moderation.jpg`](../../design/archetypes/fan-community-site/step4-moderation.jpg) | `e1ad96b66b0405783b44fa7355c64ceef3b5bd8dc7ce055da78ea4d910ffcd3a` | 492287 | `8562c9256be6243689b3b45bba8465c7e04d13220e1063637b0b6b55b7030563` |
| [`fan-community-site`](../../design/archetypes/fan-community-site/README.md) | [`step5-visitor.jpg`](../../design/archetypes/fan-community-site/step5-visitor.jpg) | `527513c535bdbbe3d2f4d53a39b51804a978c939e7201ce0a50d9ba96c0747be` | 605505 | `42e56322ffb96b8e3874cd194d1b7ba5b161e6f36046625b655b0745cb3abde1` |

The JPEG digests prove only the handed-off files' integrity. Prompt digests prove the transcribed README
text is the text that was sent; they do **not** prove the model received it unaltered, nor that the
picture is what the prompt describes - only an independent reading of the raster can say that, which is
what the first-wave review above provided. Neither digest proves the boards' legal status, which is why the rights
boundary is stated separately.
