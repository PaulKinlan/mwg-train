# Visual conformance

How close does a build come to the design it was aiming at? The endpoint already reports whether a
brief *works* (the functional and rule checks in `src/eval/endpoint.mjs`). This axis reports how close
the built page is to the family's target design, so "it works" and "it looks like the target" are
separate, reportable facts.

## The three numbers per arm

For each arm the scorer reports:

| number | meaning |
| --- | --- |
| `raw` | the raw build's conformance to the target - the baseline |
| `target` | the arm's output conformance to the target |
| `delta` | `target - raw` |

Framework comparisons use the **delta**, not the raw absolute: how hard a family is cancels out, so a
booking form that is intrinsically more complex than a contact form does not make its framework look
worse.

## The axes

`src/eval/conformance.mjs` scores three cheap, explainable things from a browser signature:

- **structural** (weight 0.40) - the element tags in document order: 0.6 × longest-common-subsequence
  order + 0.4 × multiset composition. Depth is deliberately not in the token: one wrapper
  `<div id="root">` - which every React and Vue page has - would otherwise shift every child a level
  and make an identical page score 0.
- **geometry** (weight 0.35) - boxes matched within each tag class by nearest position, scored half on
  centre distance and half on size agreement, with unmatched boxes counting as zero. IoU was tried and
  rejected: it is translation-sensitive, so a page that renders the same form 80px lower because it
  has a header scored 0 on every field. This is the honest version of "pixel similarity": no image
  decoder, and no punishing a framework for anti-aliasing.
- **controls** (weight 0.25) - the same form controls, and how many of the candidate's carry a label.

The signature is captured in the browser by `SIGNATURE_SCRIPT`; the metrics are pure functions of two
signatures, so they are unit-tested without a browser.

## Targets

A target is the *achievable ideal* for a family: hand-authored HTML/CSS under
`docs/eval/targets/<family>/`, rendered to a PNG and a signature by `scripts/render-targets.mjs`. The
images are ours - no third-party screenshot, logo, font or copy enters a target
(`docs/provenance/assets/eval-targets.md`). They live in the `A6_evaluation` arm
(`data/A6_evaluation/targets/`), are never trainable, and every byte is pinned by sha256 in
`data/A6_evaluation/targets/manifest.jsonl`.

```
npm run render:targets     # re-render the targets (needs Chrome)
npm run check:targets      # verify the committed bytes against the manifest + provenance
```

## Variant identity within a family (R2)

A family's variants must be comparable: if a framework's own layout conventions change the design,
then a framework effect has been confounded with an aesthetic choice. The shared-target invariant is
enforced by the manifest - one target per family, never one per framework - and the divergence is
measured:

```
node scripts/score-variant-identity.mjs --all
```

writes `docs/eval/conformance/<family>-identity.{json,md}` with both halves of the question:

- the **delta from raw baseline to the shared target** for every framework variant, and
- the **cross-variant identity**: pairwise agreement between the raw variants, per axis, with the
  weakest pair named and the per-axis variance reported rather than averaged away.

`IDENTITY_BUDGET` in `src/eval/targets.mjs` is the declared tolerance per axis: the measured family MEAN
across the families less a deliberate margin (`structural` mean 0.830 -> floor 0.75, `geometry`
0.977 -> 0.90, `controls` 1.000 -> 0.95, `overall` 0.925 -> 0.80). `controls` is tightest because a
form is a form in every framework; `structural` allows the most, because that is where a framework's own
wrapper and template scaffolding live. The floors are deliberately close to the measurement - a
budget far below it (0.6 everywhere) leaves a third of the range free and would rubber-stamp a real
regression. The floors were first set from the five-arm matrix (structural mean minimum 0.805) and the
MEANS still hold unchanged when the two R3 arms are added (0.830), which is the check that matters for
whether the budget was moved to admit the new arms: it was not.

The budget is judged TWICE on each axis, and the two judgements did NOT come out the same way. Every
family means still sits above every floor. **Four of the five families record a structural PAIR below
the 0.75 floor while their mean sits above it** - booking `preact/vue` 0.6464, contact-lead and
account-recovery `react/webcomponents` 0.67, event-registration `react/webcomponents` 0.7269 - and
`catalogue` is the only family with no such pair (its weakest is `react/webcomponents` at 0.7826). The
lowest recorded structural mean is 0.8301; the lowest recorded structural pair is 0.6464. That gap is
the whole reason the verdict is taken twice: a family where six variants agree and one has diverged has
a mean that hides it, which is what `variantIdentity` computes `weakest_by_axis` for and what
mwg-train-bmu showed was not being acted on. These four findings are `IDENTITY_PAIR_BELOW_BUDGET`, and
they say the pair is below the floor - they do not say the budget is wrong, and the budget has not been
moved to silence them. The finding names the pair that
is weakest *on that axis*, not the overall-worst pair. `variantIdentity` also marks a
family whose variants measure nothing as `degenerate` and raises a finding, because two blank pages
otherwise agree perfectly.

The identity axis is a statement about *how different the frameworks are allowed to be*, not an
assertion that they are identical: distinct frameworks legitimately emit different markup, and the
budget says how much of that difference still counts as the same design.

### Framework set

The pilot builds each archetype in seven frameworks: `raw` (the web platform), `react`, `preact`,
`vue`, `hono`, `webcomponents` (custom elements + shadow DOM, no build and no dependency) and `svelte`
(Svelte 5, server-rendered — the one arm with a compile step, whose boundary is named in
`src/corpus/svelte.mjs` and crossed by the scaffolder and by the uplift tool, never by the server).

Six of the seven keep the property the identity axis relies on: the markup a browser receives is the
markup in the file, so the deterministic uplift tool can edit it. The Svelte arm keeps the same property
*observably* — its template is recompiled after the tool edits it, and the uplifted page is what gets
measured — rather than by having no build step at all.

### Measured identity (seven pilot families' arms)

The `identity`, `structural`, `geometry` and `controls` columns are family MEANS over the pairs. The two
pair columns are the weakest single pair, and they are on different axes: `weakest pair (overall)` is the
weakest overall score, while `weakest structural pair` is the pair the structural budget is judged on and
is the one four families now fall below.

| family | identity | structural | geometry | controls | weakest pair (overall) | weakest structural pair |
| --- | --- | --- | --- | --- | --- | --- |
| catalogue | 0.958 | 0.902 | 0.992 | 1.000 | react/webcomponents 0.913 | react/webcomponents 0.7826 |
| booking | 0.945 | 0.878 | 0.982 | 1.000 | preact/webcomponents 0.840 | preact/vue 0.6464 |
| event-registration | 0.937 | 0.856 | 0.986 | 1.000 | hono/webcomponents 0.880 | react/webcomponents 0.7269 |
| account-recovery | 0.925 | 0.830 | 0.981 | 1.000 | vue/webcomponents 0.848 | react/webcomponents 0.67 |
| contact-lead | 0.925 | 0.833 | 0.977 | 1.000 | react/webcomponents 0.850 | react/webcomponents 0.67 |

The reading is the point of the axis. **Geometry 0.98-0.99** and **controls 1.000**: the frameworks
build the same set of controls in the same places, so framework choice is not moving the layout or the
form. The only real divergence is **structural** (0.83-0.90) - each framework's own wrapper and template
scaffolding. With the R3 arms in place that is visible rather than argued away: the weakest pair in
all five families is `webcomponents`, and it is weakest precisely because its custom element *is* one
extra element in the tree, while `svelte` scores structurally identical to `raw` (0.535 against the
booking target, the same as raw) because its SSR emits the same markup. That is the distinction R2
needed, and R3 tests it: a variant may differ in markup, and the budget says how much of that difference
is still the same design.

Controls identity is 1.000 *by construction of the pilot*: `pilot/frameworks.mjs` injects the same
`formMarkup(...)` string into every framework template, so no framework can move the form. Read it as
a sanity check that the shared-spec premise holds - it is not evidence that the frameworks are
independently good, and a variant that dropped its labels would show up here only because
`controlSimilarity` takes the worse of the two sides.

Per-variant deltas from the raw baseline to the shared target are in each
`<family>-identity.md`. In four of the five families the mean delta is within +/-0.005; account-recovery is
not - its mean delta is **+0.0102** across its six non-raw arms (+0.0151, +0.0151, +0.0185, +0.0151,
-0.0024, 0.0000), so the deterministic a11y uplift moves that build *towards* its target design rather
than leaving it where it was. The claim here used to be that all five were within +/-0.005, which was
false for account-recovery and true for the other four (booking +0.001, catalogue -0.0015, contact-lead
+0.0015, event-registration -0.0026).

## Scoring a family

```
node scripts/score-conformance.mjs --family booking
```

generates the family's pilot projects, renders each twice (raw and MWG-uplifted), scores both against
the target, and writes `docs/eval/conformance/<family>.{json,md}`.

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

## Result

`docs/eval/conformance/booking.md` is the first family scored. Its table's two score columns are the
variant and the shared target, not two variants: the **raw** variant scores 0.652 against the shared
target's 0.659. The mean delta is **+0.005** across the seven arms (preact -0.001, the rest +0.001 to
+0.007). Read
that as a finding,
not a sales figure: the deterministic accessibility uplift is roughly neutral for *visual*
conformance, within noise. That is exactly what the axis is for - it makes visible that a11y uplift
and visual conformance are different objectives, so an arm cannot claim "conforms to the design" on
the strength of a rule bundle. The raw absolute of ~0.65 is expected: a bare pilot project has a
plain stacked form, not the target's header, nav and aside.

## Adding a family

1. Author `docs/eval/targets/<family>/index.html` (link `../base.css`).
2. Add the family to `src/eval/targets.mjs`.
3. `npm run render:targets`.
4. `node scripts/score-conformance.mjs --family <family>` once the pilot has that archetype.
