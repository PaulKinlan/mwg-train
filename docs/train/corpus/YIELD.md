# Training-corpus acceptance yield (2026-10-08T15-11-39-434Z)

Generated 2026-10-08T15:21:05.450Z by `scripts/train-corpus-run.mjs`. 40 sampled pairs, 240 journeys driven, 212 passed.

Every number here comes from a record produced by driving the project in a real browser; the
per-project records, screenshots and traces are under the run output directory.

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
| 40 | 0 | 0.0% |

## Why pairs were rejected

| category | count |
| --- | --- |
| `original-not-runnable` | 14 |
| `no-warranted-change` | 26 |

## Failures and their reasons

| project | archetype | framework | task | category | reason |
| --- | --- | --- | --- | --- | --- |
| `tr-26-hono` | web-shop | hono | repair | `original-not-runnable` | the page shown after a reload does not contain "Priya Nair", so the record did not persist as served |
| `tr-26-raw` | web-shop | raw | repair | `original-not-runnable` | the page shown after a reload does not contain "Priya Nair", so the record did not persist as served |
| `tr-27-react` | booking | react | repair | `original-not-runnable` | the page shown after a reload does not contain "Amara Okafor", so the record did not persist as served |
| `tr-27-preact` | booking | preact | repair | `original-not-runnable` | the page shown after a reload does not contain "Amara Okafor", so the record did not persist as served |
| `tr-28-vue` | support-helpdesk | vue | repair | `original-not-runnable` | the page shown after a reload does not contain "Lee Carter", so the record did not persist as served |
| `tr-28-webcomponents` | support-helpdesk | webcomponents | repair | `original-not-runnable` | the page shown after a reload does not contain "Lee Carter", so the record did not persist as served |
| `tr-29-svelte` | expense-tracker | svelte | repair | `original-not-runnable` | the page shown after a reload does not contain "Casey Duval", so the record did not persist as served |
| `tr-29-hono` | expense-tracker | hono | repair | `original-not-runnable` | the page shown after a reload does not contain "Casey Duval", so the record did not persist as served |
| `tr-30-raw` | event-registration | raw | repair | `original-not-runnable` | the page shown after a reload does not contain "Dana Whitmore", so the record did not persist as served |
| `tr-30-react` | event-registration | react | repair | `original-not-runnable` | the page shown after a reload does not contain "Dana Whitmore", so the record did not persist as served |
| `tr-01-preact` | booking | preact | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-01-vue` | booking | vue | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-02-webcomponents` | web-shop | webcomponents | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-02-svelte` | web-shop | svelte | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-04-hono` | dashboard | hono | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-04-raw` | dashboard | raw | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-05-react` | onboarding-auth | react | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-05-preact` | onboarding-auth | preact | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-06-vue` | directory-listing | vue | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-06-webcomponents` | directory-listing | webcomponents | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-07-svelte` | event-registration | svelte | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-07-hono` | event-registration | hono | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-08-raw` | support-helpdesk | raw | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-08-react` | support-helpdesk | react | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-09-preact` | course-enrolment | preact | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-09-vue` | course-enrolment | vue | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-10-webcomponents` | survey-form | webcomponents | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-10-svelte` | survey-form | svelte | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-11-hono` | restaurant-ordering | hono | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-11-raw` | restaurant-ordering | raw | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-12-react` | job-board | react | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-12-preact` | job-board | preact | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-13-vue` | docs-site | vue | generate | `original-not-runnable` | the page shown after a reload does not contain "Avery Quinn", so the record did not persist as served |
| `tr-13-webcomponents` | docs-site | webcomponents | generate | `original-not-runnable` | the page shown after a reload does not contain "Avery Quinn", so the record did not persist as served |
| `tr-15-svelte` | expense-tracker | svelte | generate | `original-not-runnable` | the page shown after a reload does not contain "Casey Duval", so the record did not persist as served |
| `tr-15-hono` | expense-tracker | hono | generate | `original-not-runnable` | the page shown after a reload does not contain "Casey Duval", so the record did not persist as served |
| `tr-16-raw` | library-catalogue | raw | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-16-react` | library-catalogue | react | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-20-preact` | community-forum | preact | generate | `no-warranted-change` | the original already satisfied every measured property |
| `tr-20-vue` | community-forum | vue | generate | `no-warranted-change` | the original already satisfied every measured property |

## Yield by framework

| framework | accepted | attempted |
| --- | --- | --- |
| hono | 0 | 6 |
| raw | 0 | 6 |
| react | 0 | 6 |
| preact | 0 | 6 |
| vue | 0 | 6 |
| webcomponents | 0 | 5 |
| svelte | 0 | 5 |

## Yield by archetype

| archetype | accepted | attempted |
| --- | --- | --- |
| web-shop | 0 | 4 |
| booking | 0 | 4 |
| support-helpdesk | 0 | 4 |
| expense-tracker | 0 | 4 |
| event-registration | 0 | 4 |
| dashboard | 0 | 2 |
| onboarding-auth | 0 | 2 |
| directory-listing | 0 | 2 |
| course-enrolment | 0 | 2 |
| survey-form | 0 | 2 |
| restaurant-ordering | 0 | 2 |
| job-board | 0 | 2 |
| docs-site | 0 | 2 |
| library-catalogue | 0 | 2 |
| community-forum | 0 | 2 |

## Every sampled project

| project | family | archetype | framework | task | persistence (orig/uplift) | validation (orig/uplift) | outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tr-26-hono` | tr-26 | web-shop | hono | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-26-raw` | tr-26 | web-shop | raw | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-27-react` | tr-27 | booking | react | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-27-preact` | tr-27 | booking | preact | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-28-vue` | tr-28 | support-helpdesk | vue | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-28-webcomponents` | tr-28 | support-helpdesk | webcomponents | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-29-svelte` | tr-29 | expense-tracker | svelte | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-29-hono` | tr-29 | expense-tracker | hono | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-30-raw` | tr-30 | event-registration | raw | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-30-react` | tr-30 | event-registration | react | repair | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-01-preact` | tr-01 | booking | preact | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-01-vue` | tr-01 | booking | vue | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-02-webcomponents` | tr-02 | web-shop | webcomponents | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-02-svelte` | tr-02 | web-shop | svelte | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-04-hono` | tr-04 | dashboard | hono | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-04-raw` | tr-04 | dashboard | raw | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-05-react` | tr-05 | onboarding-auth | react | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-05-preact` | tr-05 | onboarding-auth | preact | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-06-vue` | tr-06 | directory-listing | vue | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-06-webcomponents` | tr-06 | directory-listing | webcomponents | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-07-svelte` | tr-07 | event-registration | svelte | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-07-hono` | tr-07 | event-registration | hono | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-08-raw` | tr-08 | support-helpdesk | raw | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-08-react` | tr-08 | support-helpdesk | react | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-09-preact` | tr-09 | course-enrolment | preact | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-09-vue` | tr-09 | course-enrolment | vue | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-10-webcomponents` | tr-10 | survey-form | webcomponents | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-10-svelte` | tr-10 | survey-form | svelte | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-11-hono` | tr-11 | restaurant-ordering | hono | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-11-raw` | tr-11 | restaurant-ordering | raw | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-12-react` | tr-12 | job-board | react | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-12-preact` | tr-12 | job-board | preact | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-13-vue` | tr-13 | docs-site | vue | generate | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-13-webcomponents` | tr-13 | docs-site | webcomponents | generate | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-15-svelte` | tr-15 | expense-tracker | svelte | generate | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-15-hono` | tr-15 | expense-tracker | hono | generate | false/false | refused-observed/refused-observed | `original-not-runnable` |
| `tr-16-raw` | tr-16 | library-catalogue | raw | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-16-react` | tr-16 | library-catalogue | react | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-20-preact` | tr-20 | community-forum | preact | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |
| `tr-20-vue` | tr-20 | community-forum | vue | generate | true/true | refused-observed/refused-observed | `no-warranted-change` |

