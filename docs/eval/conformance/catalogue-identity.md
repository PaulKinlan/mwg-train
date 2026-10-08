# Variant identity: catalogue

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Shared target: `data/A6_evaluation/targets/catalogue/signature.json` (sha256 `bc1fc64b8ebb11081e403193edbc7c0f00fea16bf3e7392ed2117034df3fb6c6`)

## Delta from raw baseline to the shared target

| framework | raw baseline | target conformance | delta |
| --- | --- | --- | --- |
| raw | 0.487 | 0.487 | +0.000 |
| react | 0.483 | 0.487 | +0.004 |
| preact | 0.488 | 0.487 | -0.001 |
| vue | 0.487 | 0.487 | +0.000 |
| hono | 0.483 | 0.487 | +0.004 |
| webcomponents | 0.485 | 0.485 | +0.000 |
| svelte | 0.487 | 0.487 | +0.000 |

## Cross-variant identity (raw variants, pairwise)

| axis | agreement | variance | budget |
| --- | --- | --- | --- |
| structural | 0.902 | 0.0078 | >= 0.75 |
| geometry | 0.992 | 0.0002 | >= 0.9 |
| controls | 1.000 | 0.0000 | >= 0.95 |
| overall | 0.958 | 0.0012 | >= 0.8 |

Weakest pair: react/webcomponents at 0.913.

**All axes within budget.**
