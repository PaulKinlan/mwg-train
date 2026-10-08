# Pilot acceptance yield (2026-10-08T12-33-43-622Z)

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Generated 2026-10-08T12:40:17.613Z by `scripts/pilot.mjs`. 35 pairs attempted, 34 accepted: **97.1%**.

Every number here comes from a record produced by driving the project in a real browser; the
per-project records and their screenshots and traces are next to this file.

## Empty-submission observation (not a gate)

33 of 35 originals showed an observed refusal of an empty submission; 2 accepted it; 0 left the page with neither an observed refusal nor an error.

The originals that accepted it are the ones seeded without client-side requirements. That is the
defect two rules measure on both versions, so it is reported here and judged there, never used
to exclude the pair.

## Why pairs were rejected

| category | count | what it means |
| --- | --- | --- |
| `accepted` | 34 | the uplifted version preserved the task and improved at least one measured MWG property |
| `no-warranted-change` | 1 | the original was already clean, so there was nothing to fix (a valid control, not a positive pair) |

## Yield by framework arm

| framework | accepted | attempted | yield |
| --- | --- | --- | --- |
| hono | 5 | 5 | 100.0% |
| preact | 5 | 5 | 100.0% |
| raw | 5 | 5 | 100.0% |
| react | 5 | 5 | 100.0% |
| svelte | 5 | 5 | 100.0% |
| vue | 4 | 5 | 80.0% |
| webcomponents | 5 | 5 | 100.0% |

## Yield by archetype

| archetype | accepted | attempted | yield |
| --- | --- | --- | --- |
| account-recovery | 7 | 7 | 100.0% |
| booking | 7 | 7 | 100.0% |
| catalogue | 6 | 7 | 85.7% |
| contact-lead | 7 | 7 | 100.0% |
| event-registration | 7 | 7 | 100.0% |

## Which rules the tool actually improved

| rule | pairs improved |
| --- | --- |
| `accessibility/accessible-error-announcement` | 27 |
| `security/sanitize-untrusted-html` | 24 |
| `forms/required-field-feedback` | 23 |
| `forms/validate-input-after-interaction` | 23 |
| `forms/autofill-address-form` | 7 |
| `forms/autofill-sign-up-form` | 6 |

## Every pair

| project | archetype | framework | defects seeded | rules improved | outcome |
| --- | --- | --- | --- | --- | --- |
| `account-recovery-hono` | account-recovery | hono | 4 | 5 | **accepted** |
| `account-recovery-preact` | account-recovery | preact | 2 | 3 | **accepted** |
| `account-recovery-raw` | account-recovery | raw | 4 | 4 | **accepted** |
| `account-recovery-react` | account-recovery | react | 2 | 2 | **accepted** |
| `account-recovery-svelte` | account-recovery | svelte | 4 | 4 | **accepted** |
| `account-recovery-vue` | account-recovery | vue | 2 | 2 | **accepted** |
| `account-recovery-webcomponents` | account-recovery | webcomponents | 4 | 4 | **accepted** |
| `booking-hono` | booking | hono | 5 | 5 | **accepted** |
| `booking-preact` | booking | preact | 3 | 3 | **accepted** |
| `booking-raw` | booking | raw | 5 | 5 | **accepted** |
| `booking-react` | booking | react | 5 | 5 | **accepted** |
| `booking-svelte` | booking | svelte | 5 | 5 | **accepted** |
| `booking-vue` | booking | vue | 2 | 3 | **accepted** |
| `booking-webcomponents` | booking | webcomponents | 5 | 5 | **accepted** |
| `catalogue-hono` | catalogue | hono | 2 | 3 | **accepted** |
| `catalogue-preact` | catalogue | preact | 1 | 1 | **accepted** |
| `catalogue-raw` | catalogue | raw | 1 | 1 | **accepted** |
| `catalogue-react` | catalogue | react | 2 | 3 | **accepted** |
| `catalogue-svelte` | catalogue | svelte | 1 | 1 | **accepted** |
| `catalogue-vue` | catalogue | vue | 0 | 0 | `no-warranted-change` |
| `catalogue-webcomponents` | catalogue | webcomponents | 1 | 1 | **accepted** |
| `contact-lead-hono` | contact-lead | hono | 3 | 4 | **accepted** |
| `contact-lead-preact` | contact-lead | preact | 2 | 2 | **accepted** |
| `contact-lead-raw` | contact-lead | raw | 4 | 4 | **accepted** |
| `contact-lead-react` | contact-lead | react | 2 | 2 | **accepted** |
| `contact-lead-svelte` | contact-lead | svelte | 4 | 4 | **accepted** |
| `contact-lead-vue` | contact-lead | vue | 3 | 3 | **accepted** |
| `contact-lead-webcomponents` | contact-lead | webcomponents | 4 | 4 | **accepted** |
| `event-registration-hono` | event-registration | hono | 3 | 2 | **accepted** |
| `event-registration-preact` | event-registration | preact | 2 | 3 | **accepted** |
| `event-registration-raw` | event-registration | raw | 3 | 4 | **accepted** |
| `event-registration-react` | event-registration | react | 2 | 2 | **accepted** |
| `event-registration-svelte` | event-registration | svelte | 3 | 4 | **accepted** |
| `event-registration-vue` | event-registration | vue | 3 | 3 | **accepted** |
| `event-registration-webcomponents` | event-registration | webcomponents | 3 | 4 | **accepted** |

