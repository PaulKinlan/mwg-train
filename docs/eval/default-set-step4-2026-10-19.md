# Untouched default set — Step 4, first Hono tranche (2026-10-19)

**Attribution: mwg-train deterministic baseline.** This is an **evaluation of the generated default arm**, not a training result. The required baseline metadata names the separate, deterministically uplifted ideal comparator; it does **not** mean the default generation or this evaluation used that uplift. The [sanitized per-family and per-rule record](default-set-step4-hono-2026-10-19.json) names deciding booleans, statuses, SHA-256 evidence anchors and the exact preregistration row. The [generation register](default-set-hono-tranche-2026-10-19.json) has all 30 paid identities. Full responses, projects, browser screenshots and visual-review prose remain in owner-only `~/.fleet/` storage, outside the public repository and excluded from training. No paid identity was retried.

## Result and headroom action

- **Generation:** 22 runnable successes; five model `finish_reason=length` failures without projects; three transport-unevaluable cells (`tr-03`, `tr-08`, `tr-27`). Transport is not a model failure. Failed cells were not browser-scored.
- **Required MWG rules:** **0 PASS / 0 FAIL / 44 NOT_CHECKABLE** across the 22 runnable families. The briefs' required IDs are umbrella rules without an exact implemented checker. Consequently the per-family headroom rates below count **only observable structured journey components**, not broad MWG conformance or every prose assertion.
- **Driven journey components:** 100 PASS / 4 FAIL / 5 NOT_CHECKABLE. Two carry failures (`tr-06`, `tr-10`); `tr-26` accepted an empty form and search failed after the matching/decoy control was established. Three search controls and two update witnesses were not established, and were **not** called model failures.
- **Headroom:** **19 of 22 runnable families meet the owner-ratified ≥90% per-family CEILING rule** in [preregistration §14](PREREGISTRATION.md#14-deviations-log). Exclude those families from any claimed training improvement and **pause their promotion**. Establish further headroom only on a separately preregistered expanded held-out endpoint. `tr-06` and `tr-10` are 4/5 (80%); `tr-26` is 2/4 (50%). A 4/4 ceiling with an uncheckable journey is *not* a claim of full coverage.
- **Applicable-rule diagnostics (not the preregistered required-rule endpoint):** 1 PASS / 27 FAIL / 77 NOT_CHECKABLE over 105 declared pairs. These failures identify candidates for improvement but **do not lower or raise** the headroom rate. Per-rule diagnostic counts and safe deciding reason codes are in the JSON record.
- **Visual bridge:** evaluation-only vision comparison of each runnable site's **1376×768 desktop** and **390×844 mobile** viewport-only screenshot with its authored `reference.jpg`: 18 **partially similar**, four **dissimilar**, zero reported as similar. No numeric visual score was invented. The reference image was **not supplied during generation**; no authored mobile reference exists. Missing photographs, reorganized layout and above-the-fold displacement were recurring qualitative divergences. A viewport crop cannot prove that below-fold content is absent.

| Family | Checkable journeys | Required NOT_CHECKABLE | Headroom | Visual | Deciding exception |
| --- | ---: | ---: | --- | --- | --- |
| tr-01 | 5/5 | 2 | CEILING | partial | — |
| tr-02 | 5/5 | 2 | CEILING | partial | — |
| tr-03 | — | — | transport-unevaluable | — | no project; no retry |
| tr-04 | 5/5 | 2 | CEILING | dissimilar | — |
| tr-05 | 4/4 | 2 | CEILING | partial | supersedes an instrument-invalid 2/3 below-ceiling v1 and 4/4 intermediate v2; all receipts retained, no update declared |
| tr-06 | 4/5 | 2 | below | dissimilar | declared carry FAIL |
| tr-07 | 5/5 | 2 | CEILING | partial | supersedes a 4/4 receipt with search NOT_CHECKABLE; decoy corrected in local evaluation, original retained |
| tr-08 | — | — | transport-unevaluable | — | no project; no retry |
| tr-09 | 5/5 | 2 | CEILING | partial | — |
| tr-10 | 4/5 | 2 | below | partial | declared carry FAIL |
| tr-11 | 5/5 | 2 | CEILING | partial | — |
| tr-12 | 5/5 | 2 | CEILING | dissimilar | — |
| tr-13 | 5/5 | 2 | CEILING | partial | — |
| tr-14 | — | — | model-length failure | — | no project; no retry |
| tr-15 | 4/4 | 2 | CEILING | partial | search control NOT_CHECKABLE |
| tr-16 | — | — | model-length failure | — | no project; no retry |
| tr-17 | 5/5 | 2 | CEILING | partial | — |
| tr-18 | 5/5 | 2 | CEILING | partial | — |
| tr-19 | 5/5 | 2 | CEILING | partial | — |
| tr-20 | 5/5 | 2 | CEILING | partial | — |
| tr-21 | — | — | model-length failure | — | no project; no retry |
| tr-22 | 4/4 | 2 | CEILING | dissimilar | search control NOT_CHECKABLE |
| tr-23 | — | — | model-length failure | — | no project; no retry |
| tr-24 | 4/4 | 2 | CEILING | partial | search control NOT_CHECKABLE |
| tr-25 | 4/4 | 2 | CEILING | partial | update edit witness NOT_CHECKABLE; earlier preempted attempt preserved |
| tr-26 | 2/4 | 2 | below | partial | empty validation FAIL; search FAIL; update NOT_CHECKABLE |
| tr-27 | — | — | transport-unevaluable | — | no project; no retry |
| tr-28 | — | — | model-length failure | — | no project; no retry |
| tr-29 | 5/5 | 2 | CEILING | partial | — |
| tr-30 | 5/5 | 2 | CEILING | partial | — |

**Method and limits.** Linux is the canonical run: generated servers ran through the bubblewrap corpus path; generated client JavaScript ran in ephemeral, egress-blocked Chrome. Current private screenshot and functional receipts include sandbox mechanisms, hash-pinned archive/brief/journey identities and preregistration digest. Historical Step 4 receipts predate the first committed scorer and do not identify their actual source bytes: the precise instrument revision is `UNRECORDED_AT_RUN`, not the later commit. Superseded receipt SHA-256 values in the public JSON were recomputed from retained private bytes; the originals were not rewritten. Future receipts pin the transitive local module source bytes of the Step 4 scorer and smoke entry points by a digest captured and rechecked within each run; this is not a Node runtime or OS-image digest. A priority-merger preemption restarted one batch, so duplicate destinations refused overwrite; existing receipts were retained and only the missing `tr-25` *local evaluation* was completed in a fresh evidence root. The source archive is locally read-only and SHA-256 checked, **not** WORM or off-VM immutable. The serving checkpoint remains `UNVERIFIED`; a macOS sample is approved as **post-evaluation** work and has not been reproduced. Do not present this as an exact-checkpoint, immutable-comparator, cross-platform floor. The full suite belongs to the merger's union tree, not this implementer branch.
