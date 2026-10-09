# Per-demo design contracts

One `design.md` per generated demo, at `docs/eval/design/<archetype>/<framework>.md`.

Every demo in the pilot and the evaluation corpus is a project this repository generates, and each
one is supposed to carry its own design: what it looks like, which tokens it uses, how its components
are arranged, which states it implements and why. [`docs/design.md`](../../design.md) is the
cross-family grammar; its final section already lists what a family author must supply. This
directory is that checklist, instantiated once per demo, and
[`docs/eval/specs/README.md`](../specs/README.md) is the same idea for functional behaviour.

## Why these files sit outside the generated trees

`pilot/CORPUS.json` records a tree hash for every generated project, and `npm run check:pilot-corpus`
regenerates the corpus and compares. `hashTree` hashes **every file name and every byte** in a
project, so a `design.md` written into a generated project would change that project's recorded hash
and fail the gate. Re-recording the corpus to accommodate the file would destroy the evidence the gate
exists to protect, because the recorded hash would then be derived from the generator it is meant to
constrain. So the contract lives beside the demo, not inside it, exactly as the family target designs
live in `docs/eval/targets/<family>/` rather than in the projects they describe.

## A design contract is checked, not trusted

`npm run check:design-schema` generates each documented demo into a temporary directory and reads the
artefacts the generator actually produces - `app/styles.css`, `spec.json` and the project's file set -
then compares them with what the document claims. A design document that describes tokens, routes or
files the demo does not have is a **finding**, not a style disagreement. This matters because the
repository currently carries three different token vocabularies: generated demos emit `--fg`, `--bg`
and `--accent` with literal values, the evaluation target stylesheet uses `--ink`, `--muted`, `--line`,
`--paper`, `--wash`, `--accent`, `--accent-ink`, `--radius` and `--gap`, and `docs/design.md` proposes
a richer vocabulary that **no generator consumes**. A per-demo contract must name the tokens that
demo emits.

## Required sections

Every per-demo file carries these level-2 headings, in this order.

| Section | What it must state |
| --- | --- |
| `## Visual thesis` | One sentence: subject, audience, scene and task, then what makes this demo recognisable. |
| `## Grammar and layout` | Which composition grammar from `docs/design.md` applies, the layout structure, the route map, and the desktop/mobile behaviour. |
| `## Typography` | The type stack and the heading/body scale the demo ships, with the values it actually uses. |
| `## Token vocabulary` | A table of the custom properties the demo emits, with their values, and a line naming any literal colour, radius or spacing value that is **not** a custom property. |
| `## Spacing rhythm` | The spacing steps the demo uses and what each step is for. |
| `## Component hierarchy` | The semantic structure the demo builds, top to bottom, per route. |
| `## States` | Which states the demo implements, and which are declared only. |
| `## Implementation status` | The anti-fiction section: what exists, what is declared but not implemented, and what is deliberately absent. |
| `## Rationale` | Why these choices, and which ones are constraints rather than preferences. |
| `## Provenance` | Rights boundary and which source files this contract describes. |

The section list is closed. `check:design-schema` fails when a required section is missing, when a
token in the vocabulary table is not emitted by the demo's stylesheet, when a route in the layout
section is not one of the demo's own routes, or when the framework in the title does not match the
directory it lives in.

## Scope

The pilot has five archetypes and seven framework arms, so the complete set is thirty-five files.
`booking` is the first family to carry them; the contract and the checker were written and verified
against it before scaling. A per-demo contract is only useful if it stays true, so adding one is a
change to the documented surface and belongs with the demo it describes.

## Rights boundary

These are authoring documents, not evidence. They describe synthetic demos built from invented
organisations and data; they contain no third-party copy, imagery, fonts or credentials, and they are
not training inputs. [`training-targets.md`](../../provenance/assets/training-targets.md) and
[`eval-targets.md`](../../provenance/assets/eval-targets.md) govern conformance imagery.
