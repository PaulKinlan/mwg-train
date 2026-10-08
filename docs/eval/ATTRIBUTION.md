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
`bc041692…` was **found by measurement rather than assumed**: recomputing thirteen plausible
constructions over the 178 ids in `docs/eval/rules.json` - bare versus `category/guide`, sorted versus
as-found, joined by newline, comma, space or nothing, raw or JSON - produced exactly one match,
`sorted bare ids joined by newline`. web-uplift's own description in the journal - "recursive key sort
+ compact JSON, UTF-8, and a SEPARATE set-identity hash over the sorted id list" - agrees with it
independently.

**What that does and does not prove.** A single match is strong conditional evidence, and it is worth
being exact about the conditions:

- A match is strong evidence that the byte string hashed here *is* the string web-uplift hashed, which
  makes the construction exact for **this** input. The argument rests on collision and second-preimage
  resistance - finding a *different* input with the same digest is infeasible - not on preimage
  resistance, which concerns inverting a digest rather than two inputs agreeing. An algorithm we did not
  try cannot produce these bytes unless it consumes the same input, in which case it is the same
  construction on this input.
- That the input decomposes into *our* ids follows from two conditions, both of which hold: canonical
  ids are slugs containing no newline, so a newline-joined string of 178 ids decomposes in only one
  way; and our count (178) is the canonical count the pin states.
- What is **not** established is how web-uplift canonicalises a *different* input. We cannot predict
  the hash of a 200-guide catalog, and this document does not claim to. A reviewer was right to press
  on this, and the honest form is "exact for the input we can see, with the conditions named", not "we
  know the algorithm".
- If the catalog ever appears on this machine the check verifies its **file** sha256 directly, which
  supersedes the inference about the file. It does not parse ids out of the catalog, so the id comparison
  remains ours against the pinned constant: the two hashes are checked from different sources, and it is
  worth knowing which is which.

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
| `docs/eval/conformance/<family>.md` | the attribution line under the title |
| `docs/eval/conformance/<family>-identity.md` | the attribution line under the title |
| `docs/pilot/YIELD.md`, `docs/train/corpus/YIELD.md` | the attribution line under the title |
| `docs/train/corpus/records.json`, `pilot/CORPUS.json` | a top-level `baseline_label` / `baseline_tool` |
| `docs/pilot/yield.json`, `docs/pilot/records.json` | the same fields on the measurement record |
| `docs/eval/conformance/<family>.json` and `<family>-identity.json` | the same fields, so the numbers attribute themselves and not only the summary rendered from them |
| `docs/pilot/README.md`, `docs/eval/conformance/README.md` | the attribution line above the result summaries |
| `docs/train/corpus/tokens.json` | the same fields: it accounts for corpus size by variant, including the uplifted variant |
| the corpus viewer | the floor panel and the roles line |

The first pass of this work registered six reports. Review then found two more that state a floor -
`docs/eval/conformance/booking.md` (visual conformance deltas) and `docs/pilot/YIELD.md` (pilot
acceptance yield) - and, separately, that the label reached the per-project decisions but not the
committed summary records. Both are now labelled and registered, taking the check from six artifacts to
ten. The lesson worth keeping: a registry is only as good as the review that extends it, and a
projection (`decision` in `records.json`) silently drops whatever it does not explicitly name.

```bash
npm run check:baseline-label   # registry + a scan of every tracked document (23 registered, 190 scanned)
npm run label:baseline -- --check   # the same assertion for the measurement JSON, without writing
npm run label:baseline              # add the label to a document that predates it
```

Twenty-three artifacts are registered, and that count is the honest measure of this contract rather
than a detail: the first pass covered six, and review then extended it three times - two more reports,
then the measurement JSON and two static summaries, then two further result summaries - while my own
sweep found one more (`tokens.json`). Every round was a list I had believed complete. The
documents that predate the label are relabelled by `scripts/label-baseline.mjs`, which is
**safe by construction** - it strips exactly the keys it added, deep-compares against what it read, and
refuses to write if anything else moved. `--check` runs that comparison without writing.

The check is fail-closed in three ways: a report in its registry that is **missing** fails, a report
without the label fails, and a report claiming web-uplift's authorship fails even when it is labelled.
The registry is declared rather than globbed, because a glob silently expands when a report is added
and silently shrinks when one is renamed.

Deliberately **not** registered, with the reason rather than a silent omission:

| artifact | why it is not a floor report |
| --- | --- |
| `docs/train/corpus/SERVED.md` and `served-routes-baseline.json` | report which routes the generated server serves - a property of the scaffold, not a floor value; the markdown also has no committed generator, since it was rendered ad hoc |
| `docs/eval/quotes.jsonl` | a provider pricing table, not a measurement of any corpus |
| `pilot/TRAINING_CORPUS.json` | records corpus composition and tree hashes and states no floor result; its only mention of uplift is a round-trip comment about disjointness |
| `pilot/plan.json`, `data/A6_evaluation/targets/manifest.jsonl` | inputs (a plan, and the eval target set), not measurements of our floor |

That table exists because the registry was wrong four times: six artifacts, then ten, then twenty-one,
then twenty-three, and a fifth round found five more documents plus the two root-level summaries. Each
round was a list I believed complete, and each was extended by a reviewer reading the tree rather than by
me re-reading my own reasoning. The lesson is in the count, not in the ritual: "every X" is a claim about
a list, so the list has to be checked against the tree.

### The registry is no longer the only guard

A list can only cover what its author thought of, and five rounds is enough evidence that mine cannot.
So the check now also SCANS: every tracked `.md` and `.json` is read, and any document containing
floor-evidence phrasing - uplift hashes, accepted-pair counts, projects driven or passed, journey
counts, token estimates, "N of M" results - must carry the label unless it is named in `EXCLUSIONS`
with a reason. Nine documents are excluded by name, including the pre-registration (which states the
registered design rather than a measurement, and is the one document that should not be retro-edited)
and the provenance README (which defines what the arms are, for rights purposes).

That inverts the failure mode. Before, a document I forgot was silently uncovered; now a document that
states a floor result without a label fails the check, and adding a new report means either labelling it
or writing down why it is not one. The scan currently reads 190 files and finds 28 that state floor
evidence, all of them labelled.

### Relabelling a report must not mean re-measuring it

The floor reports are generated from committed JSON, and re-rendering them from that record is a
supported mode: `score-variant-identity.mjs --rerender`, `score-conformance.mjs --rerender`,
`pilot.mjs --report-only --yield <yield.json> --docs <YIELD.md>` and `train-corpus-run.mjs
--report-only`. This
matters for more than convenience. Regenerating the identity reports by re-scoring them would have
re-run a browser measurement and could have shifted committed evaluation numbers while claiming to
only add a line; re-rendering from the record cannot. The renderer used during a measurement run and
the one used to relabel are the same function, so the two cannot disagree.

Together the four re-renders added exactly the attribution to ten committed artifacts and no other
change: each `*-identity.md` and `<family>.md` diff is two added lines with its sibling JSON
byte-identical, and each YIELD report differs by the label plus one corrected timestamp (both pilot and
training runs called `new Date()` twice, so their committed reports disagreed with the records they
were generated from - by 2ms and 1ms). Those timestamp discrepancies were pre-existing and are fixed at
the cause: one timestamp now feeds both the record and its report.

The two committed records predate the label, so they were relabelled by an explicit mode rather than by
hand - `train-corpus-run.mjs --relabel-record` - which adds the label from the constant and copies every
measured field through untouched. That is verifiable rather than asserted: stripping the added keys from
the result reproduces the previous file exactly, and `npm run check:pilot-corpus` still re-derives all
35 pilot projects from their plan. A relabel that changed a number would have been falsification, so the
strip-and-compare is the evidence, not the commit message.
