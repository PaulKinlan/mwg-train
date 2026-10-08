# Pilot acceptance yield (2026-10-08T10-25-34-975Z)

Generated 2026-10-08T10:28:02.840Z by `scripts/pilot.mjs`. 25 pairs attempted, 24 accepted: **96.0%**.

Every number here comes from a record produced by driving the project in a real browser; the
per-project records and their screenshots and traces are next to this file.

## Why pairs were rejected

| category | count | what it means |
| --- | --- | --- |
| `accepted` | 24 | the uplifted version preserved the task and improved at least one measured MWG property |
| `no-warranted-change` | 1 | the original was already clean, so there was nothing to fix (a valid control, not a positive pair) |

## Yield by framework arm

| framework | accepted | attempted | yield |
| --- | --- | --- | --- |
| hono | 5 | 5 | 100.0% |
| preact | 5 | 5 | 100.0% |
| raw | 5 | 5 | 100.0% |
| react | 5 | 5 | 100.0% |
| vue | 4 | 5 | 80.0% |

## Yield by archetype

| archetype | accepted | attempted | yield |
| --- | --- | --- | --- |
| account-recovery | 5 | 5 | 100.0% |
| booking | 5 | 5 | 100.0% |
| catalogue | 4 | 5 | 80.0% |
| contact-lead | 5 | 5 | 100.0% |
| event-registration | 5 | 5 | 100.0% |

## Which rules the tool actually improved

| rule | pairs improved |
| --- | --- |
| `forms/required-field-feedback` | 21 |
| `accessibility/accessible-error-announcement` | 19 |
| `security/sanitize-untrusted-html` | 16 |
| `forms/validate-input-after-interaction` | 15 |
| `forms/autofill-address-form` | 5 |
| `forms/autofill-sign-up-form` | 4 |

## Every pair

| project | archetype | framework | defects seeded | rules improved | outcome |
| --- | --- | --- | --- | --- | --- |
| `account-recovery-hono` | account-recovery | hono | 4 | 5 | **accepted** |
| `account-recovery-preact` | account-recovery | preact | 2 | 3 | **accepted** |
| `account-recovery-raw` | account-recovery | raw | 4 | 4 | **accepted** |
| `account-recovery-react` | account-recovery | react | 2 | 2 | **accepted** |
| `account-recovery-vue` | account-recovery | vue | 2 | 3 | **accepted** |
| `booking-hono` | booking | hono | 5 | 5 | **accepted** |
| `booking-preact` | booking | preact | 3 | 4 | **accepted** |
| `booking-raw` | booking | raw | 5 | 5 | **accepted** |
| `booking-react` | booking | react | 5 | 5 | **accepted** |
| `booking-vue` | booking | vue | 2 | 3 | **accepted** |
| `catalogue-hono` | catalogue | hono | 2 | 3 | **accepted** |
| `catalogue-preact` | catalogue | preact | 1 | 2 | **accepted** |
| `catalogue-raw` | catalogue | raw | 1 | 1 | **accepted** |
| `catalogue-react` | catalogue | react | 2 | 3 | **accepted** |
| `catalogue-vue` | catalogue | vue | 0 | 0 | `no-warranted-change` |
| `contact-lead-hono` | contact-lead | hono | 3 | 4 | **accepted** |
| `contact-lead-preact` | contact-lead | preact | 2 | 2 | **accepted** |
| `contact-lead-raw` | contact-lead | raw | 4 | 4 | **accepted** |
| `contact-lead-react` | contact-lead | react | 2 | 3 | **accepted** |
| `contact-lead-vue` | contact-lead | vue | 3 | 4 | **accepted** |
| `event-registration-hono` | event-registration | hono | 3 | 3 | **accepted** |
| `event-registration-preact` | event-registration | preact | 2 | 3 | **accepted** |
| `event-registration-raw` | event-registration | raw | 3 | 4 | **accepted** |
| `event-registration-react` | event-registration | react | 2 | 2 | **accepted** |
| `event-registration-vue` | event-registration | vue | 3 | 3 | **accepted** |

