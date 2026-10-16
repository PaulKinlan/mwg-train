---
family: tr-36
brief: docs/train/briefs/manifest.jsonl
brief_id: tr-36-v1
---

# `tr-36` functional specification — Resonance Lab — WebAudio Synth & Shader Patch Studio

The behaviour of the `tr-36` training family, bound to its canonical brief row
[`tr-36-v1`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by `npm run check:train-design`. The `-v2` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [`design.md`](design.md) beside this file.

## Use case

The brief's scenario is Resonance Lab WebAudio synth and shader patch playground, in the `developer-media-playground` archetype. The brief asks for:

> Resonance Lab is an interactive WebAudio synthesizer and shader tutorial playground where developers experiment with filter envelopes and export shareable patches. Build the split-pane playground and patch export form so creators can save their patch title, synth engine, cutoff frequency, and DSP expression to the server and reload the saved patch permalink.

The form the journey drives carries 5 fields: `patch_name`, `author`, `synth_engine`, `cutoff_hz`, `patch_source`.

The brief's own user journeys, which the harness flow below is derived from:

- Explore the Resonance Lab split-pane WebAudio synth editor, harmonic visualiser, and tutorial transcript cues
- Enter a patch title, creator handle, synth engine, filter cutoff frequency, and DSP patch expression
- Save the patch to the server and reload the patch permalink page to verify the code and parameters persist

Out of scope, by the brief's own non-goals: server-side C++ audio compilation; cloud DAW multi-track stem hosting.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

| Path | Role |
| --- | --- |
| `/` | form page; the driven journey starts here |
| `/patches` | write route the form submits to |
| `/patches/:id` | read-back of one stored record by its reference |

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

- "exported WebAudio synth patches, parameter presets, and DSP expressions are stored on the server"

The family's declared framework arm is `react` and its locale is `en-US`; both are
invariant across the two wording variants. Across the seven target framework directories
(`pilot/projects/tr-36-hono`, `pilot/projects/tr-36-raw`,
`pilot/projects/tr-36-react`, `pilot/projects/tr-36-preact`,
`pilot/projects/tr-36-vue`, `pilot/projects/tr-36-svelte`, and
`pilot/projects/tr-36-webcomponents`), client-side interactive UI/UX states and server-side route
handlers keep records synchronised for the life of the process: the brief's persistence requirement is
server-side storage with read-back, search filtering, and mutation across reloads, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

1. Before the form page, visit `/intake`, then choose "FM Bell Operator" in `select[name=synth_engine]`, then submit the form.
2. Before the form page, visit `/intake/confirm`, then see "FM Bell Operator".
3. On `/`, fill form#resonance-patch-form: `input[name=patch_name]` with "Warm Analog Filter Sweep", `input[name=author]` with "Devon Kestrel", `input[name=cutoff_hz]` with "680", `textarea[name=patch_source]` with "filter.frequency.setValueAtTime(680, ctx.currentTime);"; choose "FM Bell Operator" in `select[name=synth_engine]`.
4. Submit; the read page shows "Warm Analog Filter Sweep", the value typed into the echoed field.

Separately, the brief declares a search flow: `/search` with query parameter `q`="Warm" lists "Warm Analog Filter Sweep" inside `#search-results` and does not list "zzz-decoy".

And an update flow: the stored record's `patch_name` field can be changed to "Warm Analog Filter Sweep (updated)" and read back afterwards.

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission. Alongside this server-driven route flow, the multi-step Light and
Dark UI/UX state boards in the parent [`developer-media-playground` plan](../../../design/archetypes/developer-media-playground/plan.md)
and [`developer-media-playground` design](../../../design/archetypes/developer-media-playground/design.md), together with this
family's [`reference.jpg`](../../../design/training/tr-36/reference.jpg), are supplied in the
generation prompt to aim for and used to validate visual and interactive parity across all seven frameworks.

## Validation and states

- **Required fields:** `patch_name`, `author`, `synth_engine`, `cutoff_hz`, `patch_source` - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** `accessibility/accessibility`, `forms/forms`, drawn from the
  applicable set `accessibility/accessibility`, `forms/forms`, `forms/required-field-feedback`, `css/responsive-design`, `ui-atoms/responsive-table` and pinned to
  [`docs/eval/rules.json`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

- POST /patches stores the exported synth patch on the server and redirects to /patches/:id
- GET /patches/:id displays the patch title, synth engine, cutoff frequency, and DSP source after reload
- transport controls and patch form inputs provide programmatic labels and keyboard focus states

## Implementation status

Task: `generate`. The brief is authored and schema-validated (`npm run check:brief-schema`), and the
family's seven framework trees are deterministic scaffold output recorded in `pilot/TRAINING_CORPUS.json` -
authored templates, not model output. The corpus caveats in [`docs/train/corpus/README.md`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[`YIELD.md`](../../corpus/YIELD.md) and [`SERVED.md`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([`SCHEMA.md`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[`docs/train/targets/tr-36/index.html`](../../targets/tr-36/index.html), a
project-owned CC0 board whose rights record is
[`training-targets.md`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
