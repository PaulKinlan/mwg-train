# Evaluation control fixtures

The projects a run is handed *before* it does anything. Two sets, matching the two brief kinds that
are meaningless without one:

- `already-modern/<brief_id>/` — the existing site each of the eight already-modern briefs is written
  against. The brief asks for one small change and says to leave everything else exactly as it is, so
  the project is the "before" in a before/after diff.
- `repair/<family_id>/` — the defective starter each sealed repair family is written against. The
  starter contains exactly the defects the family names, and nothing else.

A brief references its project through the `existing_site` field (see
[`../briefs/SCHEMA.md`](../briefs/SCHEMA.md)); the projects never reference the briefs, so the sealed
manifest stays the authority on what was promised.

## The fixtures are data, and they are immutable

Every project is generated from `fixtures.mjs` by `scripts/scaffold-eval-projects.mjs`. Each project
carries two committed hashes so a silent edit is visible:

- `tree.json` — a sha256 per file and a tree hash over the sorted set (`src/eval/baseline.mjs`).
- `snapshot.json` — the rendered content of every route, split into `<main>` and navigation.

```
node scripts/scaffold-eval-projects.mjs          # regenerate the projects and their hashes
node scripts/scaffold-eval-projects.mjs --check  # the gate: fail on any drift
```

`--check` re-derives every file, every tree hash and every page snapshot and compares them with what
is committed, so a fixture cannot change between the moment it is promised and the moment it is run
against. `npm run check:eval-projects` is the same command.

## The oracles

`src/eval/baseline.mjs` is the before/after diff oracle for the already-modern briefs:

- `treeSnapshot` / `diffTrees` — which project files were added, removed or modified.
- `pageModel` / `snapshotPages` / `diffPages` — which **routes' content** changed. `<main>` and the
  navigation are hashed separately, because adding a page legitimately updates the nav on every route;
  counting that as "every page changed" would be the opposite of the measurement.
- `assessDiff` — apply a per-brief allowlist and report every change it cannot account for.

`src/eval/defects.mjs` is the repair audit. It drives a starter (renders the pages, submits the form)
and decides each defect from what the starter does, not from the flags it declares. The catalog is the
whole vocabulary a repair starter may draw on; `test/baseline.test.mjs` asserts that the audited set
equals the family's sealed `seeded_defects` exactly. "The defects are present" and "they are the only
ones" are therefore one assertion.

## Residual caveats

- The per-brief allowlist passed to `assessDiff` is supplied by the harness, which must render the
  candidate's routes. Without it the oracle reports changes rather than judging them.
- `fam-r01` is a `dev` family and intentionally ships no starter, so the defect audit covers the two
  sealed repair families only.
- The defect vocabulary is the fixed catalog in `src/eval/defects.mjs`; a new kind of seeded defect
  needs a new probe before it can be audited.
