# Variant identity: event-registration

Shared target: `data/A6_evaluation/targets/event-registration/signature.json` (sha256 `dec91020e53544fd97331f8c964409f02248201c7bd9a0dbdb8cfca0143c8ce1`)

## Delta from raw baseline to the shared target

| framework | raw baseline | target conformance | delta |
| --- | --- | --- | --- |
| raw | 0.588 | 0.592 | +0.004 |
| react | 0.583 | 0.588 | +0.005 |
| preact | 0.588 | 0.592 | +0.004 |
| vue | 0.583 | 0.592 | +0.009 |
| hono | 0.585 | 0.588 | +0.003 |
| webcomponents | 0.586 | 0.590 | +0.004 |
| svelte | 0.588 | 0.592 | +0.004 |

## Cross-variant identity (raw variants, pairwise)

| axis | agreement | variance | budget |
| --- | --- | --- | --- |
| structural | 0.856 | 0.0131 | >= 0.75 |
| geometry | 0.986 | 0.0002 | >= 0.9 |
| controls | 1.000 | 0.0000 | >= 0.95 |
| overall | 0.937 | 0.0023 | >= 0.8 |

Weakest pair: hono/webcomponents at 0.880.

**All axes within budget.**
