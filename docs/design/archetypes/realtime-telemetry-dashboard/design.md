---
archetype: realtime-telemetry-dashboard
type: operations-dashboard
boards: docs/design/archetypes/realtime-telemetry-dashboard/
register: docs/design/archetypes/realtime-telemetry-dashboard/PROVENANCE.md
---

# `realtime-telemetry-dashboard` — authored visual system

**Design before images.** NorthSea Grid, Sector B, B-07, the observations and economic predictions are **fictional storyboard values**. No telemetry, browser runtime, simulation result, safety validation or JPEG has been inspected. The [functional plan](plan.md) requires prominent “Simulation — not live” identity; no control in this concept can actuate a turbine.

## Direction contract

**THESIS:** A calm, legible observability surface where source freshness matters more than decorative live gauges.

**OWN-WORLD:** Night-shift offshore operations: precise UTC markers, sparse panel separators, restrained amber attention and explicit units.

**STORY:** Overview → narrow time window and B-07 readout → sandbox dispatch scenario → contradictory threshold refusal with distinct audit history.

**FIRST VIEWPORT:** Sector/time controls, four KPI cards, one primary chart and sixteen turbine states are readable as one web page at 1376 px.

**FORM:** Brief-pinned operations dashboard, not a product landing page. No Impeccable concept seed exists on this VM; no seed key is claimed.

**FINISH:** Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Visual thesis

Telemetry should be legible in context of *when and where* it was observed. The salient details are UTC time, measurement units, last-received state, B-07's oil-temperature anomaly and a chart/table pair that disagree only when there is a real error. A stable quiet frame helps operators notice one amber turbine without suggesting “critical” from colour alone. In the scenario step a visibly separate **Sandbox / What-if** header prevents a predicted revenue delta being mistaken for an invoice or live plant command. The threshold step differentiates a form rejection from the independent past incident row.

Every illustration is an edge-to-edge WEB PAGE, not a desktop screenshot. Stills can show content hierarchy and labels, not prove a real stream, chart brushing, zero layout shift, a tested simulation model, sensor calibration, acknowledged incident or power dispatch. Proposed controls are not connected to SCADA.

## Grammar and layout

- Use `#0b0f19` as a continuous ground, `#111827` panel surfaces, emerald `#10b981` for labelled nominal state, amber `#f59e0b` for warning and rose `#f43f5e` for labelled critical/refusal. Keep a consistent panel grid with minimal decoration; do not use glowing halos as severity evidence.
- Header groups sector selector, 1h/6h/24h/7d time pills, Accessible Data Table toggle, “Simulate Scenario” and always-visible **Simulation — not live** and UTC/freshness label. The time range and sector remain visible even inside a right B-07 drawer or simulator.
- KPI strip: four similarly sized cards, one stable value line and one unit/description line. Align inner rows with CSS `grid-template-rows: subgrid` where the actual grid structure permits. Reserve sufficient inline space and use `font-variant-numeric: tabular-nums`; these techniques help visual stability but **do not establish a measured zero-CLS outcome**.
- Primary plot: multi-series power MW and wind-speed m/s visualised with SVG or Canvas; distinct series labels, line patterns and readable UTC axis ticks. An accessible adjacent data table with caption, scoped headings, units, row/column associations and a complete selected time window is essential, not an optional alt caption replacing values. Keep a keyboard-editable start/end UTC field path equivalent to pointer brush zoom.
- Turbine matrix: sixteen labelled, individually addressable items, warning B-07 marked by a text status and symbol plus amber. Preserve matrix context while drawer shows Oil Temp 84.2°C, Rotor RPM and Blade Pitch as three correlated sparklines and a tabular window readout. A proposed “Acknowledge & Derate to 80%” form is visibly **disabled, demonstration only**; no unsafe implication that the paint controls equipment.
- Scenario: three labelled sliders with values and units above or beside the thumb (Wind Speed Delta −15%, Evening Peak Tariff £145/MWh, Battery Discharge Floor 20%). Display accessible `aria-valuetext` and named Reset; URL and output cards must refer to the same validated input snapshot. Baseline dashed / scenario solid state-of-charge curve needs both line styles, direct labels and a matching table; the projected dispatch −38.4 MWh, revenue +£12,400 and Reserve Margin PASS are **sample copy**, not a calculated model in these files.
- Alert editor: Warning 90°C and Critical 85°C are clearly inconsistent. An inline banner reads exactly “Warning threshold (90°C) must be strictly below Critical threshold (85°C)”, with field-level message and focus on repair. The prior acknowledged B-07 incident in the audit table is a separate **fictional sample entry**, not proof this form was accepted or an action occurred.
- Named `@container` queries respond to chart/panel inline size. A narrow view stacks panels and retains a semantic horizontally-scrollable data table with original `<thead>` semantics and a visible caption; don't merely hide table headers and inject inaccessible CSS text. Avoid horizontal scrolling for the full page when the individual chart/table can scroll at a contained boundary.

## Typography

Choose a licensed or system UI sans with highly distinguishable numerals, decimal marks and units. `font-variant-numeric: tabular-nums` keeps metric digit widths steady during fixture updates, but actual width reservation must account for sign, extra digit and unit length. Monospace is useful for UTC labels, turbine IDs and temperatures, not for every dashboard label. A chart tick should remain readable at 200% zoom; test overflow and focus. Colour words—Nominal, Warning, Critical, Stale—must remain in DOM text.

## Token usage

| Token | Design intent | Role |
| --- | --- | --- |
| `--ground` | `#0b0f19` | Continuous console canvas |
| `--surface` | `#111827` | Panels, drawer and audit table |
| `--nominal` | `#10b981` | Nominal accent, *paired with state text* |
| `--warning` | `#f59e0b` | B-07 attention and warning label |
| `--critical` | `#f43f5e` | Critical/invalid accent, *paired with explicit message* |
| `--ink` | `#f8fafc` | Primary numbers/actions |
| `--ink-muted` | `#cbd5e1` | UTC/source/unit metadata |
| `--line` | `#475569` | Restrained panel/chart guides |

These are brief-specified tokens, not colours measured from nonexistent assets or independently tested contrast pairs. Test legibility in an actual browser before implementation ships, including high-contrast mode.

## Spacing rhythm

Prioritise the source/status band, then one compact KPI row, then one spacious chart+matrix region. The fourth state is intentionally not four alert cards: error banner and editable fields need vertical room, with the audit table below rather than under a modal. Plot and data table require enough area for a clearly delimited UTC window and units, not a narrow sparkline pretending to replace time-series access. On smaller screens allow the controls to wrap, chart/table to sit in ordered blocks, and drawer to take the available region without shrinking temperatures to tiny print.

## Component hierarchy

1. **Sector/freshness header:** sector, time range, table toggle, scenario action, explicit simulation source.
2. **Four KPI cards:** generation MW, grid frequency Hz, battery reserve %, warning count; fixed geometry and labelled qualities.
3. **Chart + table pair:** UTC power/wind plot with legend and equivalent semantic, keyboard-operable data readout.
4. **Turbine status grid:** 16 named, text-labelled items with B-07 warning and drill-down action.
5. **B-07 drawer:** same brushed interval, Oil Temp/RPM/Blade Pitch plus tabular data and disabled control form.
6. **What-if simulator:** three inputs with accessible values, baseline/scenario graph and a separate sample delta summary.
7. **Alert rule editor and audit:** contradictory threshold repair with past fixture incident distinctly separated.

## Anti-patterns

- Calling a synthetic 50.02 Hz or reserve-margin PASS value a measured safety result, or showing it with a green “LIVE” badge when no source exists.
- Drawing a gauge or Canvas with no chart description, data table, equivalent keyboard range selection or accessible status words.
- Broadcasting every metric tick through `aria-live`; page-wide assertive alerts for a benign synthetic change; colour as the only B-07 warning.
- A revenue number generated by unvalidated independent sliders with no documented assumptions or consistent URL state, presented as a deployable energy plan.
- Combining acknowledgement and physical derating in one real API, skipping human/dual approval, or treating an image of a button as permission to command equipment.
- Hiding semantic table headers at a narrow width, clipping units, using a false “zero CLS” guarantee inferred from tabular numerals and subgrid, or silently dropping stale/invalid data.
- Browser chrome, macOS traffic lights, tab bar, address bar, OS window border and desktop drop shadow baked into reference JPEGs.

## Rationale

The same visual signals can be useful in an actual operations console only if freshness, quality, provenance and units are durable. This concept begins with those claims explicitly absent. The alternate data table and keyboard time-window fields give a route to inspect readings independent of visual chart manipulation. Subgrid, container queries and tabular numerals provide layout tactics, not runtime metrics. A single deliberate alert announcement protects screen-reader users from frequent feed noise. Separating simulation from incident acknowledgement and from any physical control request prevents a highly polished illustration being mistaken for an authorised dispatch tool.

## Provenance

- Routes, safety isolation and acceptance: [`plan.md`](plan.md). Four exact offline prompts: [`README.md`](README.md). [Local pending provenance](PROVENANCE.md) stores prompt hashes and absent JPEG/model evidence.
- Modern Web Guidance informed semantic charts plus data tables, named/scoped table headers, container-adaptive panels and restrained live announcements. No claim that an implementation or browser accessibility test has passed is made here.
- Any future JPEG remains `excluded_from_training: true` and `approved_for_training: false` pending separate rights approval. The scenario and turbine readings are fictional, unrelated to A1/A6 measurements.
