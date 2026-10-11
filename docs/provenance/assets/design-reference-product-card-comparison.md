# Provenance: product card comparison archetype visual reference boards

- **Scope:** four illustrative JPEGs for `product-card-comparison`, an archetype authored on the archetype
  type axis (bead `mwg-train-efg`) rather than one of the five evaluation archetypes or the thirty
  training families. They are a **planning reference** for the `card` type's states: the card catalogue,
  the side-by-side comparison, the selection carried into the next step, and the empty comparison state.
- **Generation:** 2026-10-11 UTC, by `scripts/generate-archetype-boards.mjs --write --only
  product-card-comparison`. The script passes `model: gemini-nano-banana-2.1` explicitly and fails closed
  if the response does not attest that model. The endpoint takes no seed, so **the JPEGs are not
  reproducible from the prompts**: the committed bytes are the artefact, and the prompt digests prove only
  that the text transcribed in the README is the text that was sent. One board - the empty comparison
  state - was generated twice and its first raster is not in the tree.
- **Rights:** [Google consumer-account terms](../accounts/google-antigravity-consumer.md) prohibit using
  AI-generated service content to develop machine-learning models. These boards are therefore
  `excluded_from_training` and `approved_for_training: false`: they may be looked at, described and
  hashed, and they may not be training material. The corpus derives from its own approved material.
- **Visual truth:** the catalogue name, product names, prices, scores, attribute values, availability
  states and inline notes are invented, unverified placeholders. The boards depict intended *states*; they
  demonstrate no behaviour and prove nothing about an implementation, which does not exist (see
  [`plan.md`](../../design/archetypes/product-card-comparison/plan.md)).
- **Coverage:** four boards, chosen so that the type's whole claim is pictured: a *picked* option, a
  *compared* set that lines attributes up by row, the selection carried into the next step, and the state
  before anything is chosen. The comparison board is the one that matters most, because a catalogue of
  cards with no aligned rows would be a gallery rather than this type.

## Independent vision review

Commissioned from a vision-capable model of a different family from the authoring lane (Gemini 3.8 Flash,
high thinking, through the fleet's reviewer role), 2026-10-11 UTC, in three passes: the catalogue board,
then the remaining three, then the re-generated empty state. It was asked to read each raster and report
what it saw rather than what the prompt asked for, to count cards and duplicates specifically, and to say
whether the empty state agreed with the catalogue. Its findings are recorded below without being tidied
up, including the board it rejected.

### Observed artefacts and accepted notes, per board

- `step1-cards.jpg`: **accepted with notes.** The review confirmed the controls row (search, `Category:
  Graphics cards`, `Sort by: Price low to high`, `24 cards`), exactly three cards side by side, each with
  a rectangular image, a name (`Vector VX-4070`, `Northwind Arc A770`, `Halcyon RX-7800`), the three
  attribute rows (`Memory`, `Power draw`, `Warranty`), a large price, a filled `Select` and an outline
  `Compare` with the first card checked and outlined in cyan, and - the point of the type - the attribute
  rows **aligned across all three cards**.
  - **Recorded difference, not a re-roll:** the board's own sort control reads `Price low to high` while
    the displayed prices descend (`£549`, `£629`, `£479`). A generated picture is not evidence that a page
    sorts; a build must sort, and the board states the control it must sort *from*.
  - **Recorded difference:** cards two and three declare their own realistic memory and power values
    rather than the single set the prompt named. Harmless for a reference board - the alignment and the
    vocabulary are what the type needs - and the contract does not fix values.
- `step2-compare.jpg`: **accepted with notes.** The review confirmed the alignment this type exists for:
  eight attribute rows (`Price`, `Chipset`, `Memory`, `Power draw`, `Length`, `Warranty`, `Score`,
  `Availability`) against three product columns, best and weakest values marked per row, two inline notes,
  a `Select this card` action at the foot of every column, and the summary bar. It is the strongest board
  of the set and is the reference for the comparison screen.
  - **Build correction, not a board fix (P2):** the `Out of Stock` column still carries an enabled
    `Select this card`. The contract refuses a retired or unavailable option, so a build must disable or
    replace that action; the board shows the state that must be refused rather than a design to copy.
  - **Build correction (P2):** this board prices in `$` where the catalogue and selection boards use `£`.
    Prices are integer minor units plus a declared currency in the contract, and a build standardises;
    the mixture is recorded rather than regenerated.
  - **Build correction (P3):** the note `3 slots needed` sits under `Length` rather than a slot-width
    attribute. It belongs to whatever attribute actually carries that constraint.
- `step3-selected.jpg`: **accepted with notes.** The review confirmed the carried selection - the chosen
  card's name, its four attribute values, the price, the score, the green `Selected card carried into your
  build` line, the `Change selection` link, the `Continue with this card` action, and the retained
  comparison panel with its `Remove` actions and the note that the comparison is kept until cleared.
  - **Build correction (P2):** the retained-comparison panel names two cards (`Aero RTX 4070 Ti`,
    `Storm RX 7800 XT`) that were not the cards compared on the previous board. A build must carry the
    actual compared cards forward; the drift is a property of a generated picture, not of the design.
- `step4-empty.jpg`: **generated twice; the first attempt was rejected and is not in the tree.**
  - *Attempt 1* (sha256 `da6a8a3a…`): the review found it drew **twelve or more generic cards** (`GPU 1`
    … `GPU 6` plus a second row) against its own counter reading `0 of 4 selected to compare`, two
    corrupted strings (`Memory: 2 G8`, `1900 MI-Iz`), and a **left sidebar plus account chrome** (avatar,
    notification bell, header search) which contradicts the type's own [`design.md`](../../design/archetypes/product-card-comparison/design.md)
    rule that there is no sidebar because a sidebar would suggest a taxonomy the type does not claim.
    Verdict: **re-roll.**
  - *Attempt 2* (the committed `step4-empty.jpg`, sha256 `45784693…`): **accepted.** The review read the
    plain header with the three links, the `Comparing cards` heading, one centred empty-state panel with
    its illustration, the heading `Choose two cards to compare`, the sentence about attributes lining up
    row by row, the `Back to the catalogue` link, the greyed-out `Compare selected` button with `Select
    two cards first` beside it, the counter `0 of 3 selected to compare`, and **exactly three** catalogue
    cards in one row with unchecked `Compare` toggles - no sidebar, no avatar, no bell, no header search,
    and no corrupted text. It explicitly closed all three of the first attempt's findings.
  - **Recorded note:** prices on this board are in `$` again; the currency standardisation above is a
    build correction.
  - **Decision (authoring lane): the third generation pass is the accepted one.** The lesson recorded from
    this set is worth more than the board: an image model asked to depict a large counted grid will
    miscount it and invent extra entities around it, and the fix that worked here - as on the fan
    community visitor board - was to *lower the required count* and forbid extra chrome explicitly rather
    than to describe the same thing more emphatically.
- **Cross-board, recorded rather than fixed:** the sort control's state and the displayed order disagree
  on `step1-cards.jpg`; currency is mixed between the boards; and product identities drift between the
  comparison and the selection boards. Each is a correction a build must make, and each is a case where a
  generated picture is not evidence of behaviour. No board contains a rendered credential or personal
  data.

| Archetype | Ordered image | SHA-256 (JPEG bytes) | Bytes | SHA-256 (exact UTF-8 prompt) |
| --- | --- | --- | ---: | --- |
| [`product-card-comparison`](../../design/archetypes/product-card-comparison/README.md) | [`step1-cards.jpg`](../../design/archetypes/product-card-comparison/step1-cards.jpg) | `d9cec63488329028c1cb4ecf1f5847dae71fbd7eca9afc2769aafdd0a2850591` | 520168 | `d7daf0a05a1d5758d53269351ca4a7e35c1f77aefad8769986f497e7a2d78e84` |
| [`product-card-comparison`](../../design/archetypes/product-card-comparison/README.md) | [`step2-compare.jpg`](../../design/archetypes/product-card-comparison/step2-compare.jpg) | `2437d0014c66a29abc0ad3b13ce04440a91462cc013f6bec5e53dba9de2eb057` | 497736 | `a38c3e87ef390ffc91a3657c24fbc040a35b1d88555c7c8c16d03d3e625a7850` |
| [`product-card-comparison`](../../design/archetypes/product-card-comparison/README.md) | [`step3-selected.jpg`](../../design/archetypes/product-card-comparison/step3-selected.jpg) | `7dd0853568106a66f325bf0b71b9dbce3cff44e921211f857fdb0d64f49320ae` | 466135 | `74e3b5f1bac713e0d8f1a03da98cc48cf1ff3ba8034be43bced2f0a8082fcfbe` |
| [`product-card-comparison`](../../design/archetypes/product-card-comparison/README.md) | [`step4-empty.jpg`](../../design/archetypes/product-card-comparison/step4-empty.jpg) | `45784693f257733ece8185bf63ec6c50a741c7e903dd1735af22b691dfdc8173` | 387224 | `c816b696e3cdcd486cb39466a85cd14a9d6665f73d7b6a6def018b904efd0345` |

The JPEG digests prove only the handed-off files' integrity. Prompt digests prove the transcribed README
text is the text that was sent; they do **not** prove the model received it unaltered, nor that the
picture is what the prompt describes - only an independent reading of the raster can say that, which is
what the review above is for. Neither digest proves the boards' legal status, which is why the rights
boundary is stated separately.
