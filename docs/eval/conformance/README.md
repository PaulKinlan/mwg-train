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

## Scoring a family

```
node scripts/score-conformance.mjs --family booking
```

generates the family's pilot projects, renders each twice (raw and MWG-uplifted), scores both against
the target, and writes `docs/eval/conformance/<family>.{json,md}`.

## Result

`docs/eval/conformance/booking.md` is the first family scored. The booking family means: raw 0.652,
arm 0.659, mean delta **+0.004** (preact -0.001, the rest +0.001 to +0.006). Read that as a finding,
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
