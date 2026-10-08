# Variant identity: catalogue

Shared target: `data/A6_evaluation/targets/catalogue/signature.json` (sha256 `bc1fc64b8ebb11081e403193edbc7c0f00fea16bf3e7392ed2117034df3fb6c6`)

## Delta from raw baseline to the shared target

| framework | raw baseline | target conformance | delta |
| --- | --- | --- | --- |
| raw | 0.487 | 0.487 | +0.000 |
| react | 0.483 | 0.487 | +0.004 |
| preact | 0.488 | 0.487 | -0.001 |
| vue | 0.487 | 0.487 | +0.000 |
| hono | 0.483 | 0.487 | +0.004 |

## Cross-variant identity (raw variants, pairwise)

| axis | agreement | variance | budget |
| --- | --- | --- | --- |
| structural | 0.891 | 0.0079 | >= 0.75 |
| geometry | 0.989 | 0.0002 | >= 0.9 |
| controls | 1.000 | 0.0000 | >= 0.95 |
| overall | 0.953 | 0.0012 | >= 0.8 |

Weakest pair: react/preact at 0.918.

**All axes within budget.**
