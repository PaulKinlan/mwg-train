# Archetype asset sets

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

One asset set per archetype: the brand, palette, typography, copy and state imagery that every
framework build for that archetype draws from. They exist so that "build the booking archetype" means
one thing to every model that is asked to build it — a build that invents its own imagery or omits an
asset the target has looks like a weak model when it is a missing input.

Each set is an EXTRACTION from its accepted target under `docs/design/archetypes/<archetype>/`, written
by `scripts/build-archetype-assets.mjs`. The register is written from the committed bytes, so it cannot
drift from them: `npm run check:archetype-assets` re-derives every value from the target and fails if the
store, the register or the target have moved apart.

| Set | Brand | Palette colours | Copy documents | State boards | Brand adjudicated |
| --- | --- | ---: | ---: | ---: | --- |
| `account-recovery/set.json` | _deliberately unbranded_ | 10 | 2 | 3 | yes (deliberately unbranded) |
| `booking/set.json` | `Evening Class Studio` | 25 | 4 | 5 | **yes** (see decisions.json) |
| `catalogue/set.json` | `Kiln & Copper` | 29 | 4 | 3 | no |
| `contact-lead/set.json` | `ARKHITECTS Studio` | 22 | 3 | 3 | no |
| `event-registration/set.json` | `Future Web 2026` | 10 | 2 | 3 | **yes** (see decisions.json) |

## Where the values come from, per set

### account-recovery

- Target: `docs/design/archetypes/account-recovery`
- Readme: `docs/design/archetypes/account-recovery/README.md` (sha256 `59af979f1db71531dc3a7d5185223b7878d006350b29b5b63dd2f5e67c24db5e`)
- Stylesheet: `docs/design/archetypes/account-recovery/demo/styles.css` (sha256 `b71411c5b9dfca99ac84ef191eb022140c1fd04ac87d0c56941c52df94fa1b6a`)
- Documents: `docs/design/archetypes/account-recovery/demo/compare.html`, `docs/design/archetypes/account-recovery/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/account-recovery/README.md:5`
- Brand: **unresolved** (adjudicated: The accepted target depicts an unbranded journey: its demo carries no brand element, its own heading is 'Reset Your Password', and its README names no site. The store records the absence rather than inventing a brand the design never had - a framework build for this archetype should look like the target, and the target has no site name to render. — 2026-10-11)
- Boards: `step1-request.jpg` sha256 `1a6989fb1979ebd0c7a1b8691f4df0f0843fdec994a8328ad54fc1756d187da2`; `step2-sent.jpg` sha256 `c0a1d752ae068d34fcfb146c4ded4629192ca45a4d46b33ca9113f90984aaa4d`; `step3-refusal.jpg` sha256 `a51fb224518f52a8519d0c73bb0ffbc3e815fd124e935910fe906d7a2c6b1f00`

### booking

- Target: `docs/design/archetypes/booking`
- Readme: `docs/design/archetypes/booking/README.md` (sha256 `bb405da24ed11e693ae03b99c06f7b563918c643a9b48e7970d8be0989c751b1`)
- Stylesheet: `docs/design/archetypes/booking/demo/styles.css` (sha256 `b0fba0e3633d6b7c8d1098729c32c2431f07e4e672094d91753e3f38328b71a3`)
- Documents: `docs/design/archetypes/booking/demo/compare.html`, `docs/design/archetypes/booking/demo/confirmation.html`, `docs/design/archetypes/booking/demo/empty.html`, `docs/design/archetypes/booking/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/booking/README.md:7`
- Brand: `Evening Class Studio` (adjudicated: The accepted target's own heading and every one of its five board prompts name 'Evening Class Studio'; the demo page carries 'Learning Hub' instead. The demo's own README states it is an implementation of the visual language ESTABLISHED BY those boards, and it was authored 2026-10-09 while the boards were regenerated and accepted on 2026-10-11, so the boards are the source and 'Learning Hub' is the demo's drift. PROVISIONAL: this is a lane recommendation recorded with its evidence, not an owner decision - Paul should confirm which brand the archetype owns, or rename the demo. — 2026-10-11)
- Boards: `step1-browse.jpg` sha256 `807321bfa27cf76aa50e0c6003486e5b14de83a2ff84a019465d824fce24de0c`; `step2-form.jpg` sha256 `60831f850f2a3879aef5f309e4e82b6444731da8008cf2a4bf41db64fb7ac121`; `step3-confirmation.jpg` sha256 `20bb9ea80ec4b72b95cdddd4d3a94346e64ae6048425ba110348bdf6606fcd6b`; `step4-error.jpg` sha256 `c4e338cdc2efa296505151a8a3949879a0ac347bb574a3b2d30ff6cda0eece42`; `step5-empty.jpg` sha256 `e1b9a307a7d2939b47a139fa9f715ef2f6d6fe4c2ba6e9ab712e74fb0e1044c8`

### catalogue

- Target: `docs/design/archetypes/catalogue`
- Readme: `docs/design/archetypes/catalogue/README.md` (sha256 `68eb058c6e532480fbd93313050eabbe2d051b2af139e95cf8717c3a867e18dd`)
- Stylesheet: `docs/design/archetypes/catalogue/demo/styles.css` (sha256 `081e151f374766fffb78fedac1d57fe4d7d0a4f38257ac85ca67eda068bb5c64`)
- Documents: `docs/design/archetypes/catalogue/demo/cart.html`, `docs/design/archetypes/catalogue/demo/compare.html`, `docs/design/archetypes/catalogue/demo/empty.html`, `docs/design/archetypes/catalogue/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/catalogue/README.md:5`
- Brand: `Kiln & Copper`
- Boards: `step1-grid.jpg` sha256 `93f3b8c5056685e981e523b9c1550dd4d27f55a5a0ecd5fff82b0cf447c7f0cd`; `step2-cart.jpg` sha256 `36170d05468183ca262b46d2f187c60d6c41cb29a1081293d5f7f61a30acfae0`; `step3-empty.jpg` sha256 `31aff477070366b7cfdfaf076b1cdd1721f97926273d1773b6c206d7ee09203e`

### contact-lead

- Target: `docs/design/archetypes/contact-lead`
- Readme: `docs/design/archetypes/contact-lead/README.md` (sha256 `7bbb6b8680399974c351b22b1ce2537971e54e043e928ab6309ff5b9f4d4c14a`)
- Stylesheet: `docs/design/archetypes/contact-lead/demo/styles.css` (sha256 `bc6d1f9c3f67877a988ba703b669ff587c3ebb5a72ca29d44c7d9ca19d25d04c`)
- Documents: `docs/design/archetypes/contact-lead/demo/compare.html`, `docs/design/archetypes/contact-lead/demo/index.html`, `docs/design/archetypes/contact-lead/demo/success.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/contact-lead/README.md:5`
- Brand: `ARKHITECTS Studio`
- Boards: `step1-form.jpg` sha256 `d2e215fd7f8047606069818583c4160f0002a194dee58f22e50f570124d8e6ec`; `step2-success.jpg` sha256 `f1c840aa1527daec74837cdde69ae94d7b4b3cde3eb82af702f0797985dcd6c3`; `step3-refusal.jpg` sha256 `1c2e3377fef36e2a23a91b7f4e7c9bf1bd9a6b3be1ffcfe6f53527439cbf8925`

### event-registration

- Target: `docs/design/archetypes/event-registration`
- Readme: `docs/design/archetypes/event-registration/README.md` (sha256 `6806fb271c748d652bdf28490971f187bac75170ea8be8e4d5fa913309463b7c`)
- Stylesheet: `docs/design/archetypes/event-registration/demo/styles.css` (sha256 `3e3bdc2ddfdd70320fddcd613376c975c881cd0ebe779e2ccf72ccc5a6e5f68f`)
- Documents: `docs/design/archetypes/event-registration/demo/compare.html`, `docs/design/archetypes/event-registration/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/event-registration/README.md:5`
- Brand: `Future Web 2026` (adjudicated: The accepted target has no brand element. Its demo's own h1 names the event - 'Future Web 2026', with '24-25 October - Barbican Centre, London' - and for an event-registration site the event is the site's name. The candidate is weak (a heading can be a page title), which is exactly why the choice is recorded here with its evidence rather than extracted silently. — 2026-10-11)
- Boards: `step1-event.jpg` sha256 `d9553a3f1b6718f05530ca8eed77878246c84a229fb06f893f0e8de9bcf44e4e`; `step2-pass.jpg` sha256 `16e7dc0f62b9e3983366d78d4a5531a17e195d27971a69eca296f6f4cf44b3a0`; `step3-refusal.jpg` sha256 `26fe1717f72a4ce671aeb16b154d0ff81e65d8380c9c6ebfabb879af68f48ad8`

## What this register does not claim

It pins bytes and provenance. It does not claim the assets are legally cleared for training - they
inherit the target's own `excluded_from_training` boundary - and it does not claim the depicted flows
work. Nothing here is a functional claim about a route or a state.
