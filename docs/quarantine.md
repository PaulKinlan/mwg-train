# The quarantine store

**What:** the private companion repository `PaulKinlan/mwg-quarantine` — the mwg-train analogue of
`journal/journal-data`. Teacher-generated material (arm A3) and raw black-box captures (A5)
live here. Clean-room reproductions (A4) and held-out evaluation material (A6) are **public**
but never trainable: training exclusion and publication placement are separate axes
(`publication` in src/provenance/arms.mjs). Only A3 and A5 route here by default;
an explicit generated-output destination may still use a verified store.

**Why a separate repo:** a private branch in a public repo is not private (every branch is
fetchable), and `.gitignore` is a promise, not a boundary — it stops a commit, it cannot retract
one. Only a separate private repository is a boundary.

## The rules (Paul, 2026-10-08)

1. **Allow-list enforcement, not vigilance.** Corpus tooling writes quarantined-arm material to
   the quarantine tree **by default** (`src/provenance/store.mjs` routes by arm publication class).
   A4 and A6 route directly to the public tree; publishing quarantined A3/A5 material requires
   the explicit promote step (`scripts/promote.mjs`), which appends to
   `docs/provenance/promotions.jsonl`.
2. **The submodule is a pointer, never a working location.** The public repo pins the store's
   commit at `quarantine/` as a provenance record ("this public commit corresponds to that store
   state"). The pin is inert: this repo has no CI, no build, and no recursive-fetch path, and a
   plain clone does not fetch submodules. Working checkouts are SIBLINGS (`../mwg-quarantine` by
   default, or `$MWG_TRAIN_QUARANTINE`) — `src/provenance/store.mjs` refuses a store located
   inside the public tree, so initialising the submodule for work is rejected by construction.
3. **The public surface check:** `curl -i https://api.github.com/repos/PaulKinlan/mwg-quarantine`
   unauthenticated must return **404**. Anything else is a leak.
4. **Publication boundary, not a training-permission boundary.** The store decides *visibility*;
   `src/provenance/arms.mjs` decides *training*. Promoting bytes publishes them; it never makes
   them trainable.
5. Reached through the standard `gh-*` integration proxy, scoped to that repo.

## Setup

```bash
gh repo clone PaulKinlan/mwg-quarantine ../mwg-quarantine   # sibling of this checkout
```

Then writes to quarantined arms just work:

```js
import { assetStoragePath } from './src/provenance/store.mjs';
const path = assetStoragePath('A3_teacher_generated', 'sites/example/index.html');
// -> <quarantine store>/data/A3_teacher_generated/sites/example/index.html
```

A write to a quarantined arm without a verified store **refuses** (fail-closed): the store must
exist, be a git checkout, and have an origin that is not the public repo's.

## Promoting (publishing) material

```bash
node scripts/promote.mjs data/A3_teacher_generated/sites/example public-target-dir --acknowledge-boundary
```

Promotion is additive (existing targets are refused), recorded in the ledger with the quarantine
HEAD sha, and never changes the asset's arm or its `excluded_from_training` flag.
