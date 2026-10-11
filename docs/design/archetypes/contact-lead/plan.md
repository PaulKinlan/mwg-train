---
archetype: contact-lead
type: record-form
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/contact-lead/
register: docs/provenance/assets/design-reference-wave2.md
spec: docs/eval/specs/contact-lead.json
---

# `contact-lead` — functional contract

A public-service enquiry form: a council service takes enquiries, validates them, and shows the enquirer their reference. This document is the contract for the `contact-lead` archetype - what an enquirer can do, what the server does about it, and what a journey can assert.

It is written in the section order that [`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a plan (`PLAN_SECTIONS`). What it describes is the accepted target at `docs/design/archetypes/contact-lead/`, **not** the sealed evaluation target under `docs/eval/targets/` and `data/A6_evaluation/`, which this document does not describe.

## Use case

A council service takes enquiries, validates them, and shows the enquirer their reference.

A **user** lands on the enquiry form, fills out three required fields (name, email, and message), and submits the form. The server stores the enquiry and redirects to a success page that displays the server-issued reference. The user can view the echoed message by reference. 

The spec declares `session: false`, no password field, and no authentication.

## Routes and effects

| Route | Kind | Effect |
|---|---|---|
| `GET /` | page | render the enquiry form |
| `POST /enquiry` | write | refuse the submission if a required field is missing; otherwise store the enquiry and redirect |
| `GET /enquiry/:ref` | read-by-reference | read the enquiry by reference and show the message back to the enquirer |
| `GET /inbox` | list | list the stored enquiries |

The spec defines nothing else.

## Data and state

- **Engine:** `sqlite`, in a file named on the command line - not a durable store.
- **Table:** `records`, with `ref` (TEXT, primary key), `created_at` (TEXT, not null) and `payload` (TEXT, not null).
- **Write route:** `/enquiry` stores the enquiry.
- **Read route:** `/enquiry/:ref` reads the enquiry by reference.
- **The reference:** server-issued reference, returned in the Location header of a 303.

## Journey

The declared journey, verbatim from the spec:

- it starts at `/`;
- it submits `form#enquiry-form` with three fills - `input[name=name]` `Grace Hopper`, `input[name=email]` `grace@example.test`, and `textarea[name=message]` `Please repair the street light`;
- and it expects to find `Grace Hopper` on what the submit returns.

## Validation and states

- **Required fields:** `name`, `email`, `message` - all three required.
- **On a missing field:** the server refuses the submission and re-renders the form; nothing is stored.
- **On success:** insert one row into records and answer 303 with Location: /enquiry/<ref>.

## Acceptance criteria

1. after a successful submit the browser lands on /enquiry/<ref> and the echoed message is present
2. reloading that URL still shows it
3. an empty submit is observed to be refused

## Implementation status

- **Five arms are generated from the spec** - `pilot/projects/contact-lead-{hono,preact,raw,react,vue}` - rebuilt by `node scripts/rebuild-from-spec.mjs --family contact-lead`.
- **The visual target is hand-written and static.** `demo/` holds a consultation form page and a success page. It answers from no server, holds no credential and stores nothing.

## Provenance

- **The boards** are registered in [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md).
- **The behaviour** is declared by [`docs/eval/specs/contact-lead.json`](../../../eval/specs/contact-lead.json).
