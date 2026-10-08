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

1. **Self-describing.** A specification names its family, its routes, its fields and its storage itself,
   rather than pointing at another file to be understood. The one thing it references outside itself is a
   DOM selector in a journey, because a journey has to name the element it drives.
2. **Behavioural, not incidental.** It states what must be true. It does not record which rule id is
   attached to which check, or which defect was seeded — those belong to the experiment, not the task.
   Nor does it carry generator leftovers: an archetype may hold properties nothing reads, and a
   specification may not (`validateSpec` refuses a field property the format does not define, which is
   how an inert `pattern` was found and removed).
3. **Required or not, stated.** A field is `required: true` or `required: false`, never implied by the
   absence of a key. A specification that leaves it implied is rejected (`validateSpec`).
4. **One story, not two.** Where the specification states a fact twice — the required set, which is both
   prose (`validation.required_fields`) and a property of each field — the two must agree, or the
   specification is asserting two behaviours and is refused.
5. **Fail closed.** An incomplete specification is refused, not rebuilt. A missing `state` or a write
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

## What is machine-checked, and what is documentation

The specification is not uniformly executable, and it should not pretend to be.

- **Executable**: `routes` (method, path, kind, redirect template), `fields`, `journey`, `form`,
  `extra_form`, `write_journey`, `security_journey`, `echo`, `session`, `capacity`, `password_field`.
  These are what the templates consume, and the byte-for-byte rebuild test is what proves they are
  sufficient.
- **Checked against the executable part**: `validation.required_fields` (against the fields),
  every journey selector (against the declared fields), and the redirect template (against the kind of
  the read route it points at — a write that lands on a reference-addressed route must issue one, checked
  on the route kinds rather than on the prose, so a family with a second write route is covered too).
- **Checked against the built project**: every table and column named under `state` (against the
  generated server's schema).
- **Documentation, deliberately**: `story`, `effect`, `persistence` prose and `acceptance`. Nothing parses
  these, and they are the part most likely to drift, so they are written to be read — by a person
  deciding whether a rebuilt project still does the job, and by whoever picks this up next. The
  assertions that actually run are the journeys. Read `acceptance` as the reviewer's brief, not as a gate.

## What is proven, and what is not

Proven, by `test/spec.test.mjs`:

- every family has a specification and it validates;
- a specification rebuilds the generator's project **byte for byte**, in every framework (the tree
  hash, including `spec.json` and `package.json`, is compared);
- the specification's functional claims match what the generator implements — the route contract, the
  required fields, and every state table and column the specification names;
- nothing on the rebuild path reaches `pilot/archetypes.mjs` or the id lookup, asserted on the module
  sources in any import form, so the claim cannot quietly stop being true;
- an incomplete specification is refused rather than rebuilt: a missing state, a write route with no
  stated redirect, required-ness left implied, a required set that contradicts the fields, a journey
  that types into a field the family does not declare, a redirect that does not issue the reference the
  persistence promises, and a field property the format does not define.

**Not** claimed:

- **That the specifications were written first.** They were transcribed from the archetypes and
  hand-reviewed, and the drift tests are what keep the two in step from here. A change to the generator
  that the specification does not describe fails the suite rather than silently making the specification
  a description of something that no longer exists. So the byte-for-byte result proves that the
  specification is a *lossless, sufficient* description of each family — not that it was an independent
  one.
- **That the generator templates are not needed.** They are: this replaces the archetype *table*, which
  is the generation input that said what each project was. Rebuilding needs the specification and the
  templates.
- **That the prose fields are verified.** See above — they are documentation.
