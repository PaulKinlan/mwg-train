# Ruleset pin and baseline attribution

Two separate contracts, both decided by coord on 2026-10-08 (bead `mwg-train-6ek`), and both enforced
by a check that can fail.

## 1. The ruleset is pinned to web-uplift's published catalog

The briefs and the C2 control are validated against `docs/eval/rules.json`, extracted from a pinned
Modern Web Guidance snapshot. Until now that snapshot was pinned **only to itself**: the brief
validator recomputes `rule_set_hash` from the vocabulary beside it, which catches a tampered file but
cannot tell whether the vocabulary is the ruleset anyone else would recognise. web-uplift publishes
that external reference.

| what | value |
| --- | --- |
| source | web-uplift, `knowledge/mwg-catalog.json` |
| guides | 178 |
| catalog file sha256 | `7931ac35543010450272fadebb5d3904ea041f91cd5a0d2695de5fac41da021f` |
| `guideIdsSha256` (set identity over the sorted id list) | `bc041692e3d9631a997427252ce2e54d8a5a0dd7e28387b4dcae6a4b9d3d5ab2` |
| our snapshot `rule_set_hash` | `sha256:f6301c020f138ed70287b663107033c757e11120fa87d947248ce5e4b4cdca19` |

### Why the pin is checkable without the catalog

Two hashes are in play and they must not be confused. Ours covers the sorted `category/guide` ids;
web-uplift's set-identity hash covers the sorted **bare** guide ids. The construction that reproduces
`bc041692…` was **identified by measurement, not assumed**: recomputing thirteen plausible
constructions over the 178 ids in `docs/eval/rules.json` - bare versus `category/guide`, sorted versus
as-found, joined by newline, comma, space or nothing, raw or JSON - produced exactly one match,
`sorted bare ids joined by newline`. A 256-bit agreement is not a coincidence, so that identifies the
recipe *and* establishes that our committed vocabulary is byte-for-byte the canonical guide id set.
web-uplift's own description in the journal - "recursive key sort + compact JSON, UTF-8, and a SEPARATE
set-identity hash over the sorted id list" - agrees with the result independently.

The catalog file itself is not vendored in this repository or present on the build VM, so the check
verifies its file hash **when the file is there** and otherwise says out loud that it did not. It does
not parse guide ids out of it: its shape has never been seen here, and guessing a shape would be the
kind of unmeasured assumption this repository keeps paying for. The id set is pinned by
`guideIdsSha256`, which needs no copy of the file.

```bash
npm run check:rules-pin                      # verifies the id set against the canonical pin
npm run check:rules-pin -- --require-catalog # additionally fails if the catalog file is absent
npm run check:rules-pin -- --skill-dir ~/.agents/skills/modern-web-guidance
                                             # also re-extracts the installed skill and compares
```

The check fails on: a missing or unparsable `rules.json`, an empty vocabulary (sha256 of nothing is a
valid digest, so this must be a finding), a duplicated guide id, a guide added, removed or renamed,
counts that disagree with the lists, a file advertising the pinned `rule_set_hash` beside a different
vocabulary, and a catalog file whose bytes are not the pinned ones. Reordering guides **within** a
category is deliberately not drift: the pin is a set identity, not a file layout.

## 2. Our floor is labelled as ours

We consume web-uplift's published ruleset **as the ruleset**. The floor we measure - the deterministic
mechanical repair we build targets from - is our own output, computed by our own rule specifications
with no model and no teacher in the loop. It must never read as an official web-uplift result.

Every floor artifact and report therefore carries the exact label:

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an
> official `web-uplift` result.

The label is one exported constant (`src/eval/ruleset.mjs`), used by every writer, so the artifact
schema, the markdown reports and the viewer cannot drift apart:

| where | what carries it |
| --- | --- |
| floor decisions (`decision.json`) | `baseline_label`, `baseline_definition`, `baseline_tool`, added in `decidePair` so both writers get it |
| `docs/eval/conformance/<family>-identity.md` | the attribution line under the title |
| `docs/train/corpus/YIELD.md` | the attribution line under the title |
| the corpus viewer | the floor panel and the roles line |

```bash
npm run check:baseline-label   # every registered floor report must carry the label
```

The check is fail-closed in three ways: a report in its registry that is **missing** fails, a report
without the label fails, and a report claiming web-uplift's authorship fails even when it is labelled.
The registry is declared rather than globbed, because a glob silently expands when a report is added
and silently shrinks when one is renamed.

`docs/train/corpus/SERVED.md` is deliberately **not** registered: it reports which routes the generated
server serves - a measurement of the scaffold, not a floor value - and it has no committed generator to
carry the label, because it was rendered ad hoc. If it is promoted to a floor report it needs a
generator first.

### Relabelling a report must not mean re-measuring it

The floor reports are generated from committed JSON, and re-rendering them from that record is a
supported mode: `score-variant-identity.mjs --rerender` and `train-corpus-run.mjs --report-only`. This
matters for more than convenience. Regenerating the identity reports by re-scoring them would have
re-run a browser measurement and could have shifted committed evaluation numbers while claiming to
only add a line; re-rendering from the record cannot. The renderer used during a measurement run and
the one used to relabel are the same function, so the two cannot disagree.
