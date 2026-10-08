# mwg-train

Experiment: does training on Modern Web Guidance-applied sites make a model default to modern web practice? Corpus, uplift pairing, adapter training and a preregistered evaluation.

## Where things live

| what | where |
| --- | --- |
| What will be claimed, and how it will be decided | [`docs/eval/PREREGISTRATION.md`](docs/eval/PREREGISTRATION.md) — arms, primary endpoint, decision rules, splits, seal |
| The held-out briefs | [`docs/eval/briefs/manifest.jsonl`](docs/eval/briefs/manifest.jsonl) + [`SCHEMA.md`](docs/eval/briefs/SCHEMA.md) |
| Rules the briefs are validated against | [`docs/eval/rules.json`](docs/eval/rules.json), extracted from a pinned Modern Web Guidance snapshot |
| What compute costs, and how it was priced | [`docs/eval/pricing.md`](docs/eval/pricing.md) and the generated [`pricing.sheets.md`](docs/eval/pricing.sheets.md) |
| Which providers could be priced at all | [`docs/eval/quotes.jsonl`](docs/eval/quotes.jsonl) (verified) and [`quotes.unverified.jsonl`](docs/eval/quotes.unverified.jsonl) (with reasons) |
| The durable functional specification of each pilot family | [`docs/eval/specs/`](docs/eval/specs/) — state, persistence, journeys and acceptance, rebuildable without the generator |
| The target designs and the conformance axis | [`docs/eval/conformance/`](docs/eval/conformance/) — target provenance, the axis, per-family identity |
| Provenance, rights and retention for every asset | [`docs/provenance/`](docs/provenance/) — manifest, arms, retained refs |

## Checks

```bash
npm test                    # unit tests, including the corpus and pricing invariants
npm run check:briefs        # validate + seal the brief manifest
npm run quotes:verify       # every priced row must re-derive from the page it came from
npm run quotes:fetch        # re-fetch those pages and report whether they still hash the same
npm run price:sheets        # regenerate docs/eval/pricing.sheets.md
npm run check:train-evidence # reachability records complete, each row backed by its quote
npm run check:specs          # rebuild every family from its specification and compare tree hashes
npm run lint:provenance     # provenance manifest rules
```

Design decisions and their reasons are recorded in the bead for each change and in the documents
above; a number in the docs is only as good as the check that recomputes it.
