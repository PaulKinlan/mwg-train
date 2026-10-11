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
| `account-recovery/set.json` | _deliberately unbranded_ | 10 | 2 | 2 | yes (deliberately unbranded) |
| `booking/set.json` | `Evening Class Studio` | 25 | 4 | 5 | **yes** (see decisions.json) |
| `catalogue/set.json` | `Kiln & Copper` | 29 | 4 | 3 | no |
| `contact-lead/set.json` | `ARKHITECTS Studio` | 22 | 3 | 2 | no |
| `event-registration/set.json` | `Future Web 2026` | 10 | 2 | 2 | **yes** (see decisions.json) |

## Where the values come from, per set

### account-recovery

- Target: `docs/design/archetypes/account-recovery`
- Readme: `docs/design/archetypes/account-recovery/README.md` (sha256 `a6a0c3e1e879961867588acaf9717850852ebaef32aa8bbccdefe4c24ff00544`)
- Stylesheet: `docs/design/archetypes/account-recovery/demo/styles.css` (sha256 `b71411c5b9dfca99ac84ef191eb022140c1fd04ac87d0c56941c52df94fa1b6a`)
- Documents: `docs/design/archetypes/account-recovery/demo/compare.html`, `docs/design/archetypes/account-recovery/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/account-recovery/README.md:5`
- Brand: **unresolved** (adjudicated: The accepted target depicts an unbranded journey: its demo carries no brand element, its own heading is 'Reset Your Password', and its README names no site. The store records the absence rather than inventing a brand the design never had - a framework build for this archetype should look like the target, and the target has no site name to render. — 2026-10-11)
- Boards: `step1-request.jpg` sha256 `4426e0ca71c31013499a820fb8a21aa866b097ddcde61a1b8da302e194b447e2`; `step2-sent.jpg` sha256 `331771485fc540ef064ab9118e627fa860fb304815d62ab1090e4dbcd7bd57e4`

### booking

- Target: `docs/design/archetypes/booking`
- Readme: `docs/design/archetypes/booking/README.md` (sha256 `1fe83b017139aeb46b527f168af90e69f60aa8f2d1c42bb10c70c0bd3002096c`)
- Stylesheet: `docs/design/archetypes/booking/demo/styles.css` (sha256 `b0fba0e3633d6b7c8d1098729c32c2431f07e4e672094d91753e3f38328b71a3`)
- Documents: `docs/design/archetypes/booking/demo/compare.html`, `docs/design/archetypes/booking/demo/confirmation.html`, `docs/design/archetypes/booking/demo/empty.html`, `docs/design/archetypes/booking/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/booking/README.md:7`
- Brand: `Evening Class Studio` (adjudicated: The accepted target's own heading and every one of its five board prompts name 'Evening Class Studio'; the demo page carries 'Learning Hub' instead. The demo's own README states it is an implementation of the visual language ESTABLISHED BY those boards, and it was authored 2026-10-09 while the boards were regenerated and accepted on 2026-10-11, so the boards are the source and 'Learning Hub' is the demo's drift. PROVISIONAL: this is a lane recommendation recorded with its evidence, not an owner decision - Paul should confirm which brand the archetype owns, or rename the demo. — 2026-10-11)
- Boards: `step1-browse.jpg` sha256 `faadc0cccd460f59761d53c191963e6b31831061b494920e3c4eb695eeefdfa9`; `step2-form.jpg` sha256 `230848d3bd282e7c2cecadea52418cdfd794c0dad8b1e1499c8b360d1992e48e`; `step3-confirmation.jpg` sha256 `31e6ed730371b55a9414c00680c04ce64d43219ca36518dc37e10b2b3f4953d8`; `step4-error.jpg` sha256 `0b7e463903a1b7c0994ad92513a4087aec8aed5d05cf76b8bab75ad5e815fc72`; `step5-empty.jpg` sha256 `cf586e1d6f2c2faefa603d0be4fb8b4c7b2f73375e69b23ae44b41931f07170e`

### catalogue

- Target: `docs/design/archetypes/catalogue`
- Readme: `docs/design/archetypes/catalogue/README.md` (sha256 `a7dafec272c969d5cb0d0ed7665bc1e8f6ef4cdc2052f5fac574a4beb7a7a9c0`)
- Stylesheet: `docs/design/archetypes/catalogue/demo/styles.css` (sha256 `081e151f374766fffb78fedac1d57fe4d7d0a4f38257ac85ca67eda068bb5c64`)
- Documents: `docs/design/archetypes/catalogue/demo/cart.html`, `docs/design/archetypes/catalogue/demo/compare.html`, `docs/design/archetypes/catalogue/demo/empty.html`, `docs/design/archetypes/catalogue/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/catalogue/README.md:5`
- Brand: `Kiln & Copper`
- Boards: `step1-grid.jpg` sha256 `d67e02068c0ac84bf178f3a58b468be1f68b0fd45976177a7d1536078e21a383`; `step2-cart.jpg` sha256 `13a1e108161d5b35d94d3b70058293f94a0468d96e4097bc3e40e60413f42306`; `step3-empty.jpg` sha256 `ccb2f4aa1d33d139156b9c41370afca3c6fc89b6af60ac0a0e0fa886a5dc980b`

### contact-lead

- Target: `docs/design/archetypes/contact-lead`
- Readme: `docs/design/archetypes/contact-lead/README.md` (sha256 `e12415f4bcc5475a262ec38e4783bf8526a710d0659b41966eea043b47d886e9`)
- Stylesheet: `docs/design/archetypes/contact-lead/demo/styles.css` (sha256 `bc6d1f9c3f67877a988ba703b669ff587c3ebb5a72ca29d44c7d9ca19d25d04c`)
- Documents: `docs/design/archetypes/contact-lead/demo/compare.html`, `docs/design/archetypes/contact-lead/demo/index.html`, `docs/design/archetypes/contact-lead/demo/success.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/contact-lead/README.md:5`
- Brand: `ARKHITECTS Studio`
- Boards: `step1-form.jpg` sha256 `2f66292d8c0f8e8800f8ce737cb83acf303d97dda38c5fc20299807a676454cf`; `step2-success.jpg` sha256 `382dfbfe8865811372dd6ca32446fb711ae815232328d7b8f42b6f18c7cfed7f`

### event-registration

- Target: `docs/design/archetypes/event-registration`
- Readme: `docs/design/archetypes/event-registration/README.md` (sha256 `d0f4c3a5dc5bfbf3ad7d526f1430929bfe39ea8ed6baa2ec06386f884fc20bb3`)
- Stylesheet: `docs/design/archetypes/event-registration/demo/styles.css` (sha256 `3e3bdc2ddfdd70320fddcd613376c975c881cd0ebe779e2ccf72ccc5a6e5f68f`)
- Documents: `docs/design/archetypes/event-registration/demo/compare.html`, `docs/design/archetypes/event-registration/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/event-registration/README.md:5`
- Brand: `Future Web 2026` (adjudicated: The accepted target has no brand element. Its demo's own h1 names the event - 'Future Web 2026', with '24-25 October - Barbican Centre, London' - and for an event-registration site the event is the site's name. The candidate is weak (a heading can be a page title), which is exactly why the choice is recorded here with its evidence rather than extracted silently. — 2026-10-11)
- Boards: `step1-event.jpg` sha256 `f04fa714789fa5fe2a4e57c4282fa8c36f64f14558f5add246cd4644edc1a3ea`; `step2-pass.jpg` sha256 `4de701fe6ff9e96e88b8c6fbd985920db7b34153a6386842c7e305e4264529b7`

## What this register does not claim

It pins bytes and provenance. It does not claim the assets are legally cleared for training - they
inherit the target's own `excluded_from_training` boundary - and it does not claim the depicted flows
work. Nothing here is a functional claim about a route or a state.
