# Candidate interface block for tr-01 (v1; NOT RATIFIED)

This is a proposed, arm-independent addition to the model prompt. It is **not** a change to the sealed brief, a permission to call a model, or a claim that this is the evaluator's adopted contract. The owner must ratify the exact bytes and decode request in PREREGISTRATION.md §14 before any billable run. The same bytes must later be used for default/C1/C2/C3/T and the prompt half of training pairs; no arm-specific route hints.

## Proposed block (append verbatim after every arm's plan and visual design)

BEGIN TR-01 EVALUATOR INTERFACE V1
Build a runnable Node website whose server entry point is `server.mjs`; accept `--port` and `--db` arguments and serve `GET /__health` with HTTP 200. Keep booking records on the server across page reloads for the lifetime of the process. Do not use browser-only storage as the source of truth. Do not run generated code during generation.

Use these browser paths and form controls for the mobile bicycle mechanic booking journey:
- `GET /` serves a booking form `form#service-booking-form` with labelled controls named `customer`, `phone`, `address`, `package`, `slot`, and `notes`. Required fields are customer, phone, address, package, and slot. Empty required phone produces an inline labelled error, announces it accessibly, and stores no record. The package options include `Full service`; the slot options include `Afternoon (12-5)`.
- `GET /intake` presents a `select[name=package]` with `Full service` and a form leading to `GET /intake/confirm`, which visibly shows that selection. This is a carried-step UI state, not a new booking.
- `POST /book` accepts the named booking fields, validates on the server, stores one booking record, and redirects with a reference to `GET /bookings/:id`. The read-back page visibly renders the reference and persisted customer, address, package and other submitted details; reloading that page retrieves the same server record.
- `GET /search?q=<term>` renders matches within `#search-results`, shows the matching customer name for `Ada`, and excludes nonmatching records such as a separately created `zzz-decoy` booking. The unfiltered server list MUST include every stored booking, including the decoy.

Expose these read APIs in the SAME server for the fixed update/search oracle:
- `GET /api/records` returns HTTP 200 and a JSON array of all booking records (or `{ "records": [...] }`), each with a stable `ref`, `customer`, `phone`, `address`, `package`, `slot`, and `notes`. Do not fabricate results from localStorage. This unfiltered list is the row-count and decoy-search control.
- `GET /api/record/{ref}` returns HTTP 200 and the JSON record for the exact reference, including the current `customer` value. Use the same reference as `/bookings/:id`.
- `GET /api/me` returns HTTP 200 JSON `{ "ref": "<most recent booking reference>" }` when a record exists, so the update driver can recover the reference if the redirect URL did not provide one.

On `GET /bookings/:id`, include one unambiguous labelled edit form with a control `name="customer"` and an action button whose accessible name contains `Save`, `Update`, `Edit`, or `Change`. Its wrapper ID is not prescribed; the driver finds one form by this field and named action and fails on ambiguity. Submitting that form MUST update the SAME stored record in place, not append a second row. After submitting and reloading `/bookings/:id`, render the updated customer name in visible page text (`document.body.innerText`), not only in a form input's `.value`. `GET /api/record/{ref}` must then return the new `customer` value with HTTP 200, the old value gone, and `GET /api/records` must have an unchanged row count. All arms get exactly this contract; an interface failure is a functional failure, not an invitation to change the evaluator after observing output.
END TR-01 EVALUATOR INTERFACE V1
