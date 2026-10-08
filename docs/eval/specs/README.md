# Durable functional specifications

A specification here is the *behaviour* of one pilot family — what it stores, what a write does, what a
reload has to show, what has to be true for the pair to count — written so the project can be rebuilt
from it without the generation input.

The generation input is `pilot/archetypes.mjs` and `pilot/frameworks.mjs`. It is code, and it mixes the
task with the implementation: a reader of the archetype table cannot tell which parts are the flow the
pilot is measuring and which are the machinery that renders it. If that table were rewritten or lost,
what the projects *were* would go with it.

So each family has a file here. It is the durable copy.

## What one contains

| Field | What it states |
| --- | --- |
| `spec_version` | the format version, so a reader can tell what it is looking at |
| `family_id`, `title`, `story` | which flow this is, in a sentence |
| `durability` | when it was written and what it was transcribed from — provenance, not decoration |
| `state` | the tables the family uses, with their columns and what each is for |
| `persistence` | the write route, the read route, where the reference comes from, and the assertion a reload proves |
| `routes` | the server contract: method, path, kind, **what the route does**, and where a write redirects |
| `fields` | the form's fields, each explicitly required or not, with the autofill token where there is one |
| `validation` | the required set, what a missing field does, what a successful write does |
| `journey` | the driven journey: where it starts, the form, the values typed, the text a reload must show |
| `form`, `extra_form`, `write_journey`, `security_journey` | the second form and the other driven journeys, where the family has them |
| `echo` | the value shown back to the user, and where it comes from (a record reference, a query, a session) |
| `session`, `capacity`, `password_field` | the session-backed and capacity-bounded behaviours |
| `acceptance` | the properties that make a pair count, stated as behaviour rather than as a test id |

The `effect` of a route and the `acceptance` list are the point of the whole exercise: they are the
functional facts that server code carries implicitly and this file states explicitly.

## Durability rules

1. **Self-contained.** A specification may not require another file to be understood. It names its
   family, its routes, its fields and its storage itself.
2. **Behavioural, not incidental.** It states what must be true. It does not record which rule id is
   attached to which check, or which defect was seeded — those belong to the experiment, not the task.
3. **Required or not, stated.** A field is `required: true` or `required: false`, never implied by the
   absence of a key. A specification that leaves it implied is rejected (`validateSpec`).
4. **Fail closed.** An incomplete specification is refused, not rebuilt. A missing `state` or a write
   route with no redirect would otherwise interpolate `undefined` into generated code and produce a
   plausible project that no longer asserts what the specification says.

## Rebuilding from it

```
node scripts/rebuild-from-spec.mjs --family booking            # rebuild and compare the tree hash
node scripts/rebuild-from-spec.mjs --family booking --run      # also drive the journeys in a browser
node scripts/rebuild-from-spec.mjs --all                       # every family, every framework
```

`--all` rebuilds all 35 projects and compares each tree hash with the hash `pilot/CORPUS.json` recorded
when the pilot measured it. A match means the specification rebuilds **the measured artefact**, not
merely an equivalent one.

`--run` starts the rebuilt project and drives the same journeys the pilot drives, through the same
acceptance function.

## What is proven, and what is not

Proven, by `test/spec.test.mjs`:

- every family has a specification and it validates;
- a specification rebuilds the generator's project **byte for byte**, in every framework (the tree
  hash, including `spec.json` and `package.json`, is compared);
- the specification's functional claims match what the generator implements — the route contract, the
  required fields, and every state table and column the specification names;
- nothing on the rebuild path imports `pilot/archetypes.mjs`, asserted on the module sources so the
  claim cannot quietly stop being true;
- an incomplete specification is refused rather than rebuilt.

**Not** claimed: that the specifications were written before the code. They were transcribed from the
archetypes and hand-reviewed, and the drift tests are what keep the two in step from here. A change to
the generator that the specification does not describe fails the suite rather than silently making the
specification a description of something that no longer exists.
