---
archetype: realtime-telemetry-dashboard
type: operations-dashboard
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/realtime-telemetry-dashboard/
register: docs/design/archetypes/realtime-telemetry-dashboard/PROVENANCE.md
---

# `realtime-telemetry-dashboard` — functional contract

**NorthSea Grid**, a fictional offshore wind-array and Megapack storage telemetry console for **Dogger Bank Sector B**. This is an offline concept with invented readings, not live operational telemetry, a validated energy forecast, physical control software, a safety certificate, or a route to any SCADA system. The eight headings follow [`PLAN_SECTIONS`](../../../../src/design/contract.mjs); [`design.md`](design.md) defines the visual system. Never copy the illustrative turbine temperatures, revenues or alert status into a real incident record.

## Use case

An operator views a bounded and timestamped set of turbine, grid-frequency and storage readings, inspects a B-07 gearbox-temperature excursion, explores an isolated what-if energy dispatch, and sees why contradictory alert thresholds cannot be saved. A dashboard is useful only if freshness/source, units, time zones, accessible chart data, safe refusal and audit semantics survive beyond four stills. In this concept a separate, positively authorised incident workflow would acknowledge a warning and **request** derating. The still “Acknowledge & Derate to 80%” is only a proposed form label: no real actuator action, reservation, remote safety interlock or live command exists.

Every KPI shown in the requested boards is a **storyboard fixture**, not measured Dogger Bank equipment, revenue, safety margin or real turbine availability. No image, dry-run inventory or prompt SHA attests those values.

## Routes and effects

| Future route / action | Viewer | Intended effect, if implemented |
| --- | --- | --- |
| `GET /sectors/b?range=1h` | authorised reader | Show measured-source readings only if a trusted ingest exists; display UTC range, observation timestamp and freshness/quality flag. Without ingest, label seeded fixtures “Simulation — not live”. |
| `GET /sectors/b/turbines/B-07?start=...&end=...` | authorised reader | Focus B-07 for a bounded 14:00–15:30 UTC anomaly, show correlated oil temperature, rotor speed, pitch and a same-window accessible table. Invalid/out-of-retention ranges fail explicitly. |
| `GET /sectors/b/scenarios?...` | reader/analyst | URL-synchronised **local, deterministic what-if** result for wind-speed delta, tariff and discharge floor; baseline and scenario remain labelled, no write to an operational dispatch plan. |
| `POST /incidents/:id/acknowledge` | separately authorised operator | In a future approved control system, record an explicit acknowledgement with identity, reason, timestamp, incident revision and audit event; reject duplicate/stale/forbidden requests. No physical action is implied by acknowledgement. |
| `POST /control/derate-requests` | dual-authorised controller | **Design placeholder only.** Queue a validated request to a physically isolated review/safety process; never route this concept site to SCADA or automatically set turbine power to 80%. Require dual confirmation, interlocks, expiry, revocation and operational review before any implementation. |
| `POST /alert-rules` | authorised rule owner | Refuse Warning 90°C / Critical 85°C (`warning < critical` required); preserve both inputs, show field-specific error, do not write the invalid rule or forge an incident entry. |

These are proposed contracts, not existing HTTP routes. A dashboard with only animated gauges and no source-quality metadata must never be called real-time monitoring.

## Data and state

- `Reading`: series ID, unit, UTC observation timestamp, ingestion time, source identity, provenance and quality flag. Distinguish delayed, missing, estimated and invalid samples; show an explicit “last received” indicator and a stale/offline state. In a fixture-only demo use synthetic deterministic values marked Simulation — not live.
- KPI examples are **fictional frame labels**: Net Generation 412.8 MW, Grid Frequency 50.02 Hz, Battery Reserve 78.4%, Active Warnings 1. Values must never be silently recast as measured reports. In a functional demo use explicit seeded input and reproduce these values by tests or label discrepancies; never fabricate a live measurement to match a board.
- Sector selector, `1h` / `6h` / `24h` / `7d` range and accessible Data Table toggle are URL-addressable read state. Sampling, aggregation and units remain consistent across KPI strip, chart, table and B-07 matrix. Brush UTC boundaries are inclusive/exclusive and displayed precisely, including any daylight-saving transition.
- A 16-turbine status matrix names each turbine and a text state. B-07 has an amber **illustrative** anomaly; do not interpret amber as proven fault or derating already applied. A brushed 14:00–15:30 UTC sample shows Oil Temp 84.2°C, Rotor RPM and Blade Pitch; supply units for each and table points for the same time window.
- What-if inputs: Wind Speed Delta −15%, Evening Peak Tariff £145/MWh, Battery Discharge Floor 20%. A pure fixture model returns a labelled 24-hour baseline/scenario storage state-of-charge series plus sample projected dispatch −38.4 MWh, revenue delta +£12,400 and “Reserve Margin: PASS”. These are **illustrative figures**, not a grid-operator dispatch, calculated output of a shipped model or a safety assurance. For a real implementation specify and validate tariff curve, battery constraints, efficiency, timestep, assumptions, tolerances and off-nominal cases before making projections.
- `AlertRule` has a warning threshold, critical threshold, unit, author/revision and history. Critical must be strictly greater than warning; 90°C/85°C is invalid. Audit events derive only from completed authorised actions, not from painted screenshots or a failed alert form.

## Journey

1. Open Sector B with the `1h` pill selected. See clearly marked synthetic/demo status until trustworthy ingest exists, four stable-width KPI cards, a labelled multi-series power/wind-speed chart and its inspectable Data Table, and a 16-turbine matrix with B-07 amber. A paused/stale feed clearly reports the last real/fixture observation rather than ticking a fake “live” clock.
2. Brush 14:00–15:30 UTC with pointer or use keyboard-operable start/end fields to enter the **same** window. Zoom chart, show exact UTC boundaries and update table together; open B-07 drill-down drawer with Oil Temp, Rotor RPM, Blade Pitch sparklines and the table readout. A sample oil temperature of 84.2°C is a storyboard fixture, not a real alarm. The “Acknowledge & Derate to 80%” action form can show required actor/reason/confirmation fields but is **disabled in the concept**. In any future real system, acknowledge and physical derate remain separate audit events and dual-authorised paths.
3. Open Scenario Simulator as an isolated sandbox, with three named native `<input type="range">` controls and nearby numeric text. Change wind delta, tariff and floor; URL/query encodes a validated, bounded scenario. Recompute from the same synthetic baseline deterministically, compare two distinguishable solid/dashed state-of-charge curves and provide matching table values. Announce a concise final result on committed change, not every pointer tick. Nothing in this view dispatches energy or updates a turbine.
4. In Alert Rule Editor set Warning 90°C, Critical 85°C and submit. A field-level/summary error explains “Warning threshold (90°C) must be strictly below Critical threshold (85°C)”; keep inputs editable, preserve previously acknowledged **fixture** B-07 incident row as separate history, and save no invalid rule. Fix warning to a value below critical and show a successful persisted rule only if a real authorisation/tested storage layer is later implemented.

## Validation and states

- Treat source quality as first-class: “Simulation — not live”, loading, delayed sample, transport failure, sensor failure, no readings, and unavailable actuator controls have different visible messages. Never show a green nominal badge when observation is stale or missing; actual safety operations occur outside this proposed viewer.
- Chart and table share one immutable window. Use `<figure>`/`figcaption` or named chart description, semantic `<table>` with `<caption>` and `<th scope>`, UTC time plus units; provide keyboard-operable window inputs rather than a mouse-only brush. Turbine matrix status has text as well as colour and focus indicator. Do not spam a live region at sampling frequency; announce changes in alert status or committed user action through one deliberate region.
- Four KPI cards use stable reserved dimensions, `font-variant-numeric: tabular-nums`, and CSS subgrid row alignment. Those are **layout intents**, not a zero-CLS measurement; browser tests must measure shifts. Named `@container` queries adapt chart and KPI controls to pane width; Data Table must stay usable on narrow devices (semantic headers and horizontal scrolling, no inaccessible collapsed labels).
- Range controls each have explicit `<label>` and `aria-valuetext` with unit; keyboard increments and a reset-to-baseline button. Clamp wind delta/tariff/floor and reject NaN, invalid URL values and impossible combinations. Commit one coherent scenario state per input, not independent stale card calculations; use cancellable, bounded background work for expensive simulation.
- Alert editor rejects `warning >= critical` using numeric degrees Celsius, not lexicographic string comparison. Error summary and both field descriptions show the exact values, focus invalid input after submit, maintain `aria-invalid` only while invalid, preserve unsaved input. A failed save leaves audit unchanged.
- Any acknowledgement requires authenticated and separately authorised action and records actor/time/reason. A derate request cannot be silently bundled with it: it needs human confirmation, approved operations integration, independent safety checks, durable audit and refusal paths; **not implemented here**.

## Acceptance criteria

- Frame fixtures are visibly identified as simulated and timestamps/units align between KPIs, SVG/Canvas chart, data table and 16 named turbine statuses; missing/stale sensor data never appears as a nominal live measurement.
- A user can select the exact 14:00–15:30 UTC interval via mouse **or** keyboard fields and sees the same data subset in chart, B-07 sparklines and semantic table, with Oil Temp 84.2°C labelled fixture if represented.
- Data Table view is reachable by keyboard with scoped column/row headings and status words, retains the selected range, and remains navigable without a mouse or colour cues.
- Three labelled range sliders expose values and units via `aria-valuetext`; editing any one updates the **same** deterministic scenario in URL, graph/table and dispatch/revenue summary, while Reset restores baseline. No scenario write can reach live control.
- An invalid Warning 90°C / Critical 85°C save makes no rule or incident change, announces the exact contradictory-threshold message and lets the operator correct the inputs. An unrelated previously acknowledged fixture entry persists.
- The illustrated “Acknowledge & Derate to 80%” is not connected to an actuator. A future isolated control implementation requires separate authentication, dual-authorised request, safety review, confirmation and audit tests before it can be claimed safe.
- Four reference JPEGs, if separately approved and generated, contain full-bleed page content with no browser or OS window UI. Image digests/model attestations and full-resolution vision verdicts can be recorded only from real responses.

## Site Generation Prompt

Build a **fictional, explicitly labelled simulation** of the **NorthSea Grid** Dogger Bank Sector B offshore-wind and Megapack storage telemetry dashboard. It is NOT a live control or safety-critical operator tool. Render a genuine responsive web application, not a screenshot: full-page #0b0f19 dark ground with #111827 panels, emerald #10b981 nominal, amber #f59e0b warning, rose #f43f5e critical, unit-labelled tabular-nums metrics and real HTML controls; no browser chrome, traffic lights, OS window frame, address bar or exterior desktop shadow. Top toolbar: sector selector, 1h/6h/24h/7d range pills, Accessible Data Table toggle and Simulate Scenario. First view: four subgrid-aligned sample KPIs (412.8 MW, 50.02 Hz, 78.4%, 1 warning) visibly flagged Simulation — not live; multi-series power/wind SVG or Canvas with figure label; 16 named turbine statuses including amber B-07. A keyboard-editable UTC time interval is equivalent to chart brushing; B-07 drawer presents the same table window and units. The proposed “Acknowledge & Derate to 80%” form is **disabled and never connected to real equipment**; distinguish incident acknowledgement from a separately authorised future physical-control request.

Add a local three-slider what-if simulator with wind delta −15%, tariff £145/MWh and discharge floor 20% sample defaults, accessible values/units, validated URL state and deterministically coupled baseline/scenario storage curves and accessible tables. Treat projected dispatch −38.4 MWh, revenue +£12,400 and reserve margin PASS as storyboard samples only, not verified model outputs. The Alert Rule Editor rejects Warning 90°C / Critical 85°C with the exact inline explanation and leaves the previous fictional B-07 audit entry untouched. Support reduced-motion and keyboard controls, responsive container queries, stable KPI geometry and a single appropriately throttled alert announcer. Tests must drive source freshness, chart/table equivalence, scenario math under stated assumptions, error refusal and permissions; four static image references prove none of those behaviours.

## Implementation status

**Planning only.** No live telemetry source, simulator, scenario computation, real incident, operational actuator, four JPEGs, browser journey or validated safety workflow exists here. The four [`README.md`](README.md) prompts are offline text and no paid image gateway call has occurred. A separately approved image task must add original assets, true provenance and viewer/taxonomy wiring without claiming that four still frames validate a grid or a model. The sealed A6 corpus and A1 training assets remain unchanged.

## Provenance

- Layout and state rationale: [`design.md`](design.md). Exact pending page-only image prompts: [`README.md`](README.md). [Local pending provenance](PROVENANCE.md) records actual prompt digests and absent model/JPEG evidence.
- Existing type context: [`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md); no shared type-axis updates in this offline change.
- Rights: future image assets are `excluded_from_training: true`, `approved_for_training: false` unless separately cleared. Every sample reading in this document is fictional and not an operational measurement.
- Work item `mwg-train-07ka.4` covers offline planning only; generation, full-resolution review, global asset register and /concepts wiring are separate after authorisation.
