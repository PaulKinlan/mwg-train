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
| `booking/set.json` | `Evening Class Studio` (variants: `Learning Hub`) | 25 | 4 | 5 | **yes** (see decisions.json) |
| `catalogue/set.json` | `Kiln & Copper` | 29 | 4 | 3 | no |
| `contact-lead/set.json` | `ARKHITECTS Studio` | 22 | 3 | 3 | no |
| `event-registration/set.json` | `Future Web 2026` | 10 | 2 | 3 | **yes** (see decisions.json) |

## Where the values come from, per set

### account-recovery

- Target: `docs/design/archetypes/account-recovery`
- Readme: `docs/design/archetypes/account-recovery/README.md` (sha256 `67fc5690d8f74a5867eee6d1fbaeca37b6533663b3f4aeef12764962db592c61`)
- Stylesheet: `docs/design/archetypes/account-recovery/demo/styles.css` (sha256 `b71411c5b9dfca99ac84ef191eb022140c1fd04ac87d0c56941c52df94fa1b6a`)
- Documents: `docs/design/archetypes/account-recovery/demo/compare.html`, `docs/design/archetypes/account-recovery/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/account-recovery/README.md:5`
- Brand: **unresolved** (adjudicated: The accepted target depicts an unbranded journey: its demo carries no brand element, its own heading is 'Reset Your Password', and its README names no site. The store records the absence rather than inventing a brand the design never had - a framework build for this archetype should look like the target, and the target has no site name to render. — 2026-10-11)
- Boards: `step1-request.jpg` sha256 `1a6989fb1979ebd0c7a1b8691f4df0f0843fdec994a8328ad54fc1756d187da2`; `step2-sent.jpg` sha256 `2ebfcab74be289c17db8b585e786cdc6757bd0c88cb81900dd7256cffbbb0eeb`; `step3-refusal.jpg` sha256 `4d937b3ab1031b82ced3d36d181e2419501f7da22b3eeb6a9460f19515a82b38`

### booking

- Target: `docs/design/archetypes/booking`
- Readme: `docs/design/archetypes/booking/README.md` (sha256 `3387e345eca1d6a83e7fdf617e368046063670f34db556a455ac29196cacdb44`)
- Stylesheet: `docs/design/archetypes/booking/demo/styles.css` (sha256 `b0fba0e3633d6b7c8d1098729c32c2431f07e4e672094d91753e3f38328b71a3`)
- Documents: `docs/design/archetypes/booking/demo/compare.html`, `docs/design/archetypes/booking/demo/confirmation.html`, `docs/design/archetypes/booking/demo/empty.html`, `docs/design/archetypes/booking/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/booking/README.md:7`
- Brand: `Evening Class Studio` with supported variants `Learning Hub` (adjudicated: Owner decision (Paul Kinlan, 2026-10-13): 'we probably need both'. The booking archetype keeps both brands rather than resolving to one: 'Evening Class Studio' is the primary brand, the name in this archetype's own heading and on all five reference boards, and 'Learning Hub' is a supported variant of the same archetype - the brand the interactive demo's product pages state in their own titles. A build renders the primary brand unless it is deliberately building the Learning Hub variant, and the demo is not drift to be renamed. — 2026-10-13)
- Boards: `step1-browse.jpg` sha256 `807321bfa27cf76aa50e0c6003486e5b14de83a2ff84a019465d824fce24de0c`; `step2-form.jpg` sha256 `0b6e5cefb03cd40201a0fc5ae1a7b22c8b7627231d14d8669aef3837b431f6df`; `step3-confirmation.jpg` sha256 `c7fb544c6d12593de72dffad6ddb974c71a19c9a1f64f39a4f47765bc6eeae8d`; `step4-error.jpg` sha256 `94ba77e82cb82c54fe13ad1bd3a0eb47fc13eda81213e79f323a2a176a3e541c`; `step5-empty.jpg` sha256 `f3ccd1a115af983f0a9903f14725c7747d9d77a0f193eaaa61bc2923bc5ecc56`

### catalogue

- Target: `docs/design/archetypes/catalogue`
- Readme: `docs/design/archetypes/catalogue/README.md` (sha256 `788c4fe548228d3a7ea2630310a08c141bc3a08bfba5f82457f5a50cce2d17dc`)
- Stylesheet: `docs/design/archetypes/catalogue/demo/styles.css` (sha256 `081e151f374766fffb78fedac1d57fe4d7d0a4f38257ac85ca67eda068bb5c64`)
- Documents: `docs/design/archetypes/catalogue/demo/cart.html`, `docs/design/archetypes/catalogue/demo/compare.html`, `docs/design/archetypes/catalogue/demo/empty.html`, `docs/design/archetypes/catalogue/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/catalogue/README.md:5`
- Brand: `Kiln & Copper`
- Boards: `step1-grid.jpg` sha256 `93f3b8c5056685e981e523b9c1550dd4d27f55a5a0ecd5fff82b0cf447c7f0cd`; `step2-cart.jpg` sha256 `864a10b7c056667af9c1972d399d1bff739d780cd673cd3bcc013e1cc6996adc`; `step3-empty.jpg` sha256 `9b8a4e58550892fef25ebab0a15c6078d0a40d8781292bfb2ba1be0ec384e9c0`

### contact-lead

- Target: `docs/design/archetypes/contact-lead`
- Readme: `docs/design/archetypes/contact-lead/README.md` (sha256 `42e552dfbc95b9547e45e692cfced5380572c1118125e8e9437355729bd4fea5`)
- Stylesheet: `docs/design/archetypes/contact-lead/demo/styles.css` (sha256 `bc6d1f9c3f67877a988ba703b669ff587c3ebb5a72ca29d44c7d9ca19d25d04c`)
- Documents: `docs/design/archetypes/contact-lead/demo/compare.html`, `docs/design/archetypes/contact-lead/demo/index.html`, `docs/design/archetypes/contact-lead/demo/success.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/contact-lead/README.md:5`
- Brand: `ARKHITECTS Studio`
- Boards: `step1-form.jpg` sha256 `e3ed49ff25a2f65ca0a79dec64e0d24b0b4626aafffa5b044860f2a6db196ac1`; `step2-success.jpg` sha256 `ec268f5ce58804555bf1d51d59cc1cf7ad143779a17e0f2c33b3a32dc700011f`; `step3-refusal.jpg` sha256 `1f27699e3fb408ef7c70553b4ce189d20e4ba8c4cb520d177144e52354a64592`

### event-registration

- Target: `docs/design/archetypes/event-registration`
- Readme: `docs/design/archetypes/event-registration/README.md` (sha256 `92765df226e361bb1fe0746e001f5556fc43b19c3d58e6fd909718fc2e51e378`)
- Stylesheet: `docs/design/archetypes/event-registration/demo/styles.css` (sha256 `3e3bdc2ddfdd70320fddcd613376c975c881cd0ebe779e2ccf72ccc5a6e5f68f`)
- Documents: `docs/design/archetypes/event-registration/demo/compare.html`, `docs/design/archetypes/event-registration/demo/index.html`
- Rights: `excluded_from_training: true`, `approved_for_training: false` from `docs/design/archetypes/event-registration/README.md:5`
- Brand: `Future Web 2026` (adjudicated: The accepted target has no brand element. Its demo's own h1 names the event - 'Future Web 2026', with '24-25 October - Barbican Centre, London' - and for an event-registration site the event is the site's name. The candidate is weak (a heading can be a page title), which is exactly why the choice is recorded here with its evidence rather than extracted silently. — 2026-10-11)
- Boards: `step1-event.jpg` sha256 `e55cc58b71b4ac39242682e90e4554897cc0fbb1f3911174251d8a2da0ba3046`; `step2-pass.jpg` sha256 `0315a4fdc6386db4182a5bc119126892ee66d422a0708acb5d474da7d5f68a3a`; `step3-refusal.jpg` sha256 `4ae22312d61d4ed5e284e81e450fb93e498eb39b83042c66c2979c0736966717`

## What this register does not claim

It pins bytes and provenance. It does not claim the assets are legally cleared for training - they
inherit the target's own `excluded_from_training` boundary - and it does not claim the depicted flows
work. Nothing here is a functional claim about a route or a state.
