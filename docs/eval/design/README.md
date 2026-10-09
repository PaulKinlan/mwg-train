# Design contracts and plan contracts

Every pilot family has two documents, because the aesthetic system and the functional specification have
different sources of truth and different lifetimes.

| Artefact | Scope | States | Checked against |
| --- | --- | --- | --- |
| `docs/eval/design/<archetype>/<framework>.md` | one generated demo | the aesthetic system: layout, typography, tokens, spacing, hierarchy, anti-patterns | the stylesheet and file set that the demo actually generates |
| `docs/eval/design/<archetype>/plan.md` | one archetype | the functional specification: use case, routes and effects, state, journey, validation, acceptance criteria | `docs/eval/specs/<archetype>.json` |

## Why the split is where it is

`design.md` is per **demo** because tokens are read from the stylesheet the generator writes, and the check is
only meaningful against a specific generated tree. It is worth knowing what that measurement showed: the
stylesheet *body* is byte-identical across all seven arms - only the first-line comment differs - so the arms
share every token value, and a dialect section describes **how the markup is produced** (server-rendered string,
SSR library, shadow DOM, one compile step) rather than differing tokens.

`plan.md` is per **archetype** because routes, the journey and the acceptance criteria are properties of the
archetype, not of an arm, and because the archetype already has a durable spec that
`node scripts/rebuild-from-spec.mjs` rebuilds byte-for-byte without reading the generator. Prose that restates
that spec by hand would drift from it; prose that is checked against it cannot.

## `design.md`: frontmatter is the single source of truth for tokens

```yaml
---
archetype: booking
framework: raw
tokens:
  --fg: "#16181d"
  --bg: "#ffffff"
  --accent: "#1b4fd8"
literals:
  control-border: 1px solid #8a8f98
  control-radius: 0.4rem
  focus-outline: 3px
antiPatterns:
  - a second accent competing with the primary action
---
```

- `tokens` maps a custom property to its value. Each entry must be a declaration the demo's stylesheet makes,
  with that exact value. **The body must not repeat a token value**: it is the second copy that lets a document
  and its stylesheet drift apart.
- `literals` records the values the stylesheet uses that are *not* custom properties, so they cannot be themed
  per demo. Each value must appear in the stylesheet. Radius is a literal here: the generated demos emit no
  radius custom property, so claiming a `--radius` token would be a claim about a stylesheet that does not exist.
- `antiPatterns` is a non-empty list, and it is the one place the document states what the design must not do.

Required sections, in this order:

1. `## Visual thesis`
2. `## Grammar and layout` - composition and layout only; route claims belong in `plan.md`
3. `## Typography`
4. `## Token usage` - what each token is for, never what it holds
5. `## Spacing rhythm`
6. `## Component hierarchy`
7. `## Anti-patterns`
8. `## Rationale`
9. `## Provenance`

## `plan.md`: bound to the archetype's spec

```yaml
---
archetype: booking
spec: docs/eval/specs/booking.json
---
```

Required sections, in this order:

1. `## Use case` - names every field the spec defines
2. `## Routes and effects` - every route the spec defines, with its effect stated, and no route it does not
3. `## Data and state` - the storage engine and the routes that read and write it
4. `## Journey` - the driven flow: start path, form selector, the fields that are filled, the text asserted on
5. `## Validation and states` - required fields, and what happens on each outcome
6. `## Acceptance criteria` - **verbatim** from the spec, because these are the claims the eval asserts
7. `## Implementation status` - what exists, what is declared only, and what is absent
8. `## Provenance`

## The token vocabularies, kept apart on purpose

Three vocabularies exist in this repository and they are not interchangeable:

1. the **generated demo** (`app/styles.css`) emits `--fg`, `--bg`, `--accent`, plus a set of literals;
2. the **eval target** (`targets/base.css`) uses its own names - `--ink`, `--muted`, `--line`, `--paper`,
   `--wash`, `--accent`, `--accent-ink`, `--radius`, `--gap`;
3. `docs/design.md` proposes names that no generator consumes.

A contract here always describes vocabulary 1, for the demo it names, because that is what the checker can read.
Nothing in this directory is generated or byte-frozen: these documents live outside every generated tree on
purpose, so a contract can be held to the generator without changing what the generator produces.

## How the two documents are checked

`npm run check:design-schema` generates each documented demo into a temporary directory and compares the
document against it, then loads each archetype's spec and compares `plan.md` against that. It is deliberately
fail-closed and mostly negative in its tests: a token the demo does not emit, a literal not in its stylesheet, a
token value restated in the body, a route claim in a design document, a missing section, a stray section,
sections out of order, an empty section, a claimed file the demo does not generate, an off-contract path, a
relative link that resolves nowhere or that leaves the repository, and - for a plan - a route, effect, engine,
field, journey step or acceptance criterion that disagrees with the spec in either direction.
