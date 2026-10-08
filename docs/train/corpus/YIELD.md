# Training-corpus acceptance yield (2026-10-08T20-22-15-623Z)

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Generated 2026-10-08T20:29:22.795Z by `scripts/train-corpus-run.mjs`. 40 sampled pairs, 384 journeys driven, 340 passed.

The SAMPLED projects' numbers come from records produced by driving the project in a real
browser; the per-project records, screenshots and traces are under the run output directory.
The unscored and total counts are scaffold records, not browser records - they say what was
built, not that it was driven. No project has been shown to build or serve beyond the sample.

## Selection rule

For every archetype pick its canonical GENERATE family (the generate-task family with the lowest
tr-id) plus every REPAIR family (tr-26..tr-30). Build the ordered slot list of `[repair x2]`
then `[canonical generate x2, ascending tr-id]`, and assign a framework to each slot by round-robin
over `hono, raw, react, preact, vue, webcomponents, svelte`. The resulting sample: 40 projects, every archetype at least
twice, every framework at least four times (6/6/6/6/6/5/5), all five repair families twice each.

## Coverage

| status | projects |
| --- | --- |
| scored (browser journey run) | 40 |
| `scaffolded / unverified journey` | 170 |
| **total** | **210** |

Reason: 40 projects were selected by the deterministic rule; 40 were driven in the browser. The remaining 170 are scaffolded and hash-recorded in pilot/TRAINING_CORPUS.json but their journeys were NOT run in this pass, so they carry the status "scaffolded / unverified journey".

## Acceptance

| attempted | accepted | yield |
| --- | --- | --- |
| 40 | 38 | 95.0% |

## Why pairs were rejected

| category | count |
| --- | --- |
| `accepted` | 38 |
| `original-not-runnable` | 2 |

## Failures and their reasons

| project | archetype | framework | task | category | reason |
| --- | --- | --- | --- | --- | --- |
| `tr-13-vue` | docs-site | vue | generate | `original-not-runnable` | search journey: the decoy cannot be built free of the query - 'Plot' survives in {"input[name=gardener]":"zzz-decoy-muzznncq-b8b0mw-gardener","input[name=plot]":"zzz-decoy-muzznncq-b8b0mw-plot","input[name=ph]":"1","input[name=organic]":"+44 7700 900001","textarea[name=notes]":"zzz-decoy-muzznncq-b8b0mw-notes"} |
| `tr-13-webcomponents` | docs-site | webcomponents | generate | `original-not-runnable` | search journey: the decoy cannot be built free of the query - 'Plot' survives in {"input[name=gardener]":"zzz-decoy-muzznqm7-nyidf7-gardener","input[name=plot]":"zzz-decoy-muzznqm7-nyidf7-plot","input[name=ph]":"1","input[name=organic]":"+44 7700 900001","textarea[name=notes]":"zzz-decoy-muzznqm7-nyidf7-notes"} |

## Yield by framework

| framework | accepted | attempted |
| --- | --- | --- |
| hono | 6 | 6 |
| raw | 6 | 6 |
| react | 6 | 6 |
| preact | 6 | 6 |
| vue | 5 | 6 |
| webcomponents | 4 | 5 |
| svelte | 5 | 5 |

## Yield by archetype

| archetype | accepted | attempted |
| --- | --- | --- |
| web-shop | 4 | 4 |
| booking | 4 | 4 |
| support-helpdesk | 4 | 4 |
| expense-tracker | 4 | 4 |
| event-registration | 4 | 4 |
| dashboard | 2 | 2 |
| onboarding-auth | 2 | 2 |
| directory-listing | 2 | 2 |
| course-enrolment | 2 | 2 |
| survey-form | 2 | 2 |
| restaurant-ordering | 2 | 2 |
| job-board | 2 | 2 |
| docs-site | 0 | 2 |
| library-catalogue | 2 | 2 |
| community-forum | 2 | 2 |

## Every sampled project

| project | family | archetype | framework | task | persistence (orig/uplift) | validation (orig/uplift) | outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tr-26-hono` | tr-26 | web-shop | hono | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-26-raw` | tr-26 | web-shop | raw | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-27-react` | tr-27 | booking | react | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-27-preact` | tr-27 | booking | preact | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-28-vue` | tr-28 | support-helpdesk | vue | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-28-webcomponents` | tr-28 | support-helpdesk | webcomponents | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-29-svelte` | tr-29 | expense-tracker | svelte | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-29-hono` | tr-29 | expense-tracker | hono | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-30-raw` | tr-30 | event-registration | raw | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-30-react` | tr-30 | event-registration | react | repair | true/true | refused-observed/refused-observed | **accepted** |
| `tr-01-preact` | tr-01 | booking | preact | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-01-vue` | tr-01 | booking | vue | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-02-webcomponents` | tr-02 | web-shop | webcomponents | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-02-svelte` | tr-02 | web-shop | svelte | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-04-hono` | tr-04 | dashboard | hono | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-04-raw` | tr-04 | dashboard | raw | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-05-react` | tr-05 | onboarding-auth | react | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-05-preact` | tr-05 | onboarding-auth | preact | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-06-vue` | tr-06 | directory-listing | vue | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-06-webcomponents` | tr-06 | directory-listing | webcomponents | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-07-svelte` | tr-07 | event-registration | svelte | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-07-hono` | tr-07 | event-registration | hono | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-08-raw` | tr-08 | support-helpdesk | raw | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-08-react` | tr-08 | support-helpdesk | react | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-09-preact` | tr-09 | course-enrolment | preact | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-09-vue` | tr-09 | course-enrolment | vue | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-10-webcomponents` | tr-10 | survey-form | webcomponents | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-10-svelte` | tr-10 | survey-form | svelte | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-11-hono` | tr-11 | restaurant-ordering | hono | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-11-raw` | tr-11 | restaurant-ordering | raw | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-12-react` | tr-12 | job-board | react | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-12-preact` | tr-12 | job-board | preact | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-13-vue` | tr-13 | docs-site | vue | generate | true/true | refused-observed/refused-observed | `original-not-runnable` |
| `tr-13-webcomponents` | tr-13 | docs-site | webcomponents | generate | true/true | refused-observed/refused-observed | `original-not-runnable` |
| `tr-15-svelte` | tr-15 | expense-tracker | svelte | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-15-hono` | tr-15 | expense-tracker | hono | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-16-raw` | tr-16 | library-catalogue | raw | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-16-react` | tr-16 | library-catalogue | react | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-20-preact` | tr-20 | community-forum | preact | generate | true/true | refused-observed/refused-observed | **accepted** |
| `tr-20-vue` | tr-20 | community-forum | vue | generate | true/true | refused-observed/refused-observed | **accepted** |

