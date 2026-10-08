# Variant identity: booking

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Shared target: `data/A6_evaluation/targets/booking/signature.json` (sha256 `c70494945de969b360a1a6ec57278d0aa5e1124e78ee6f3e8f9d060193255759`)

## Delta from raw baseline to the shared target

| framework | raw baseline | target conformance | delta |
| --- | --- | --- | --- |
| raw | 0.652 | 0.659 | +0.006 |
| react | 0.652 | 0.659 | +0.006 |
| preact | 0.655 | 0.654 | -0.001 |
| vue | 0.658 | 0.659 | +0.001 |
| hono | 0.652 | 0.659 | +0.006 |
| webcomponents | 0.650 | 0.656 | +0.007 |
| svelte | 0.652 | 0.659 | +0.006 |

## Cross-variant identity (raw variants, pairwise)

| axis | agreement | variance | budget |
| --- | --- | --- | --- |
| structural | 0.878 | 0.0209 | >= 0.75 |
| geometry | 0.982 | 0.0005 | >= 0.9 |
| controls | 1.000 | 0.0000 | >= 0.95 |
| overall | 0.945 | 0.0043 | >= 0.8 |

Weakest pair: preact/webcomponents at 0.840.

**All axes within budget.**
