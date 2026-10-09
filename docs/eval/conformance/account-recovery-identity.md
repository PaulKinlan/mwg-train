# Variant identity: account-recovery

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Shared target: `data/A6_evaluation/targets/account-recovery/signature.json` (sha256 `56be640e0b4ea36550647af277d15c8234d33d3aecd8b3dbacad884564078058`)

## Delta from raw baseline to the shared target

| framework | raw baseline | target conformance | delta |
| --- | --- | --- | --- |
| raw | 0.539 | 0.554 | +0.015 |
| react | 0.554 | 0.554 | +0.000 |
| preact | 0.554 | 0.554 | +0.000 |
| vue | 0.558 | 0.554 | -0.003 |
| hono | 0.554 | 0.554 | +0.000 |
| webcomponents | 0.537 | 0.552 | +0.015 |
| svelte | 0.539 | 0.554 | +0.015 |

## Cross-variant identity (raw variants, pairwise)

| axis | agreement | variance | budget |
| --- | --- | --- | --- |
| structural | 0.830 | 0.0168 | >= 0.75 |
| geometry | 0.981 | 0.0004 | >= 0.9 |
| controls | 1.000 | 0.0000 | >= 0.95 |
| overall | 0.925 | 0.0031 | >= 0.8 |

Weakest pair: vue/webcomponents at 0.848.

**Below budget:** structural (0.67, react/webcomponents)
