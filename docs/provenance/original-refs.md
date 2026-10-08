# Retained originals

Owner requirement, Paul 2026-10-08:

<!-- quote-source: owner statement relayed on bead mwg-train-ljt, not a captured third-party page -->
> I want to make sure the original is always accessible and we can use that for a number of
> different tests to transform in the future.

The original is the stable control of the whole experiment. Every later change - new MWG rules, a
different teacher model, a new harness - is measured as a transform **of the original**, so a
corpus whose originals have been garbage-collected, or whose branches have been pruned, is usable
once and then only for the transform that happened to be current when it was built.

## Why the manifest is not enough

A commit that is named only in a manifest has no ref holding it alive:

- `git gc` may collect an unreferenced object;
- this fleet deletes remote branches whose patches already exist in the default branch, so whether
  any particular original survives a prune is not something a reader can determine by inspection;
- a commit whose only ref was a branch is lost when that branch is deleted.

Retrofitting retention after a corpus exists means regenerating originals, which destroys
comparability with everything already measured. So retention is applied when the original is
created, and it is a **gate**, not a note.

## The scheme

One annotated tag per original:

```
refs/tags/original/<project-id>
```

- It is a **tag**, not a branch: a branch prune cannot reach it, and tag deletion is a separate,
  deliberate operation.
- The tag is **annotated** and its message records the commit and tree it pins, so
  `git tag -n99 --list 'original/*'` is a readable inventory of the corpus.
- `refs/mwg-train/originals/<project-id>` is accepted as an alternative for a host that does not
  want tags. Any other namespace is rejected by the checker: `refs/heads/...` is exactly the
  failure mode this exists to prevent.
- The ref name is derived from the asset id, which is what lets a corpus-wide sweep pair refs with
  records without a lookup table.

The record carries the ref **and** the commit **and** the tree:

```json
{
  "original_ref": "refs/tags/original/example-proj-0001",
  "original_sha": "<40-hex commit>",
  "original_tree": "<40-hex tree>",
  "retention": {
    "repo": "/srv/mwg-train-originals",
    "url": "git@example:originals.git",
    "protections": ["annotated tag refs/tags/original/* ...", "server-side tag protection ..."]
  }
}
```

`retention.repo` is required, and `retention.protections` must name at least one thing that keeps
the ref alive: a record that the ref is protected is what a reader needs to trust the pin, and the
validator rejects a `retention` block that asserts nothing.

`kind: original`, `kind: reproduction` and `kind: evaluation` rows **must** carry a retained ref.
Briefs and plain assets are text artefacts with no commit and are not required to invent one.

## Creating an original

```bash
node scripts/retain-original.mjs --repo /srv/mwg-train-originals --project example-proj-0001 --push
```

It creates `refs/tags/original/example-proj-0001` at the given commit (default `HEAD`), pushes that
one ref, and prints the JSON fields for the manifest row. Rerunning it for the same commit is a
no-op. `--ref-namespace alt` rotates it in `refs/mwg-train/originals/` instead, for a host that does
not want tags; that namespace is a plain ref rather than an annotated tag, because annotations only
exist under `refs/tags/`. If a tag already exists at a **different** commit the command fails: a retained ref is
immutable, because repointing it silently changes what every earlier measurement was a transform
of. If the original itself was wrong, fix the corpus, record the correction in the provenance
record, and give the corrected original a new asset id - do not move the tag.

## Verifying

```bash
node scripts/validate-provenance.mjs docs/provenance/manifest.jsonl \
  && node scripts/verify-originals.mjs --manifest docs/provenance/manifest.jsonl \
       --repo /srv/mwg-train-originals --remote origin
```

The first command checks the record's shape (including that a retained ref is recorded). The second
is the retention gate and checks, for every row:

| check | finding when it fails |
| --- | --- |
| the ref is in a retained namespace | `REF_NOT_RETAINED` |
| the ref is named for the row's asset id | `REF_NOT_CANONICAL` |
| the ref resolves in the originals repository | `REF_UNRESOLVED` |
| it resolves to the recorded commit | `REF_SHA_MISMATCH` |
| the commit object is present | `OBJECT_MISSING` |
| the commit's tree matches, when recorded | `TREE_MISMATCH` |
| with `--remote`: the ref is pushed, at the same sha | `REF_NOT_ON_REMOTE`, `REF_MOVED_ON_REMOTE` |

It **fails closed**: any finding exits non-zero, so a corpus whose originals cannot be re-derived
does not pass an acceptance gate. `--remote` is what catches the common local-only case - a tag that
was never pushed dies with the machine that made it.

## Operational requirements (not verifiable from a clone)

The checker can prove a ref exists and is identical locally and on the remote, in either namespace
(tags and the alternative namespace are both looked up). Two things it cannot
see, and which therefore have to be settings on the originals repository itself:

1. `refs/tags/original/**` is excluded from any automated ref pruning, and tag deletion is denied
   (`receive.denyDeletes`, or the host's tag-protection rule).
2. The originals repository's history is **never rewritten**. A force-push that drops the pinned
   commits would leave the refs pointing at objects the remote no longer serves.

Each record declares these under `retention.protections` so that a reader can see they were
considered; the declaration is the honest maximum here, since a clone cannot read server config.

## Originals and uplifts

An A2 uplift row is **not** required to carry a retained ref: it reaches the control through
`parents`, and the lift is deterministic, so it can be regenerated from the retained original. If a
lift turns out not to be byte-reproducible, pin it like anything else by retaining the ref named for
its own asset id (`refs/tags/original/<uplift-asset-id>`) and recording it on the uplift row.

## Status

No corpus exists yet, so no real original has been retained: the tooling, the schema and the gate
are in place and are exercised end-to-end against a real temporary repository in
`test/originals.test.mjs` (creation, rerun, detected ref move, deleted ref, local-only ref). The
first generated site must be retained **before** any uplift is taken from it - clause 5 of the
design brief ("save a reproducible original commit before any uplift").
