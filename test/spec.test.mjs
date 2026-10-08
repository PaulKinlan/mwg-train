/**
 * Durable functional specifications.
 *
 * The claim under test is narrow and checkable: a specification is sufficient to rebuild the project.
 * So the central test does not inspect the specification's prose - it rebuilds every family in every
 * framework from the specification alone and requires the resulting tree to be byte-identical to the
 * one the generator produces. A specification that quietly lost a route, a field or an optional marker
 * would rebuild a different project and fail here.
 *
 * The drift tests cover the other direction: the generator may not change in a way the specification
 * does not describe, or the two would disagree while both still "passed".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildProject } from '../pilot/projects.mjs';
import { ARCHETYPES, ARCHETYPE_IDS } from '../pilot/archetypes.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { hashTree } from '../src/corpus/harness.mjs';
import { archetypeFromSpec, buildProjectFromSpec, FIELD_KEYS, requiredFieldNames, specForFamily, SPECS_DIR, validateSpec } from '../src/eval/spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (familyId) => specForFamily(familyId, ROOT);

test('every archetype has a durable specification, and every one validates', () => {
  for (const familyId of ARCHETYPE_IDS) {
    const spec = read(familyId);
    assert.deepEqual(validateSpec(spec), [], `${familyId}: the specification does not validate`);
    assert.equal(spec.family_id, familyId);
    assert.ok(spec.acceptance.length > 0, `${familyId}: a specification must state what has to be true`);
    assert.ok(spec.persistence.reload_assertion.length > 0, `${familyId}: must state what a reload proves`);
    assert.ok(spec.state.tables.length > 0, `${familyId}: must state the state it keeps`);
  }
  // And no specification exists for a family that is not in the archetype table: a spec with no family
  // would never be compared against anything by the drift tests.
  const onDisk = readdirSync(join(ROOT, SPECS_DIR)).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')).sort();
  assert.deepEqual(onDisk, [...ARCHETYPE_IDS].sort(), 'the specifications on disk are exactly the archetypes');
});

test('a specification rebuilds the generator project byte for byte, in every framework', () => {
  const families = ARCHETYPE_IDS;
  const frameworks = Object.keys(FRAMEWORKS);
  let compared = 0;
  for (const familyId of families) {
    const spec = read(familyId);
    for (const frameworkName of frameworks) {
      const defects = ['no-required', 'eager-invalid'];
      const generated = buildProject({ archetypeId: familyId, frameworkName, defects });
      const rebuilt = buildProjectFromSpec({ spec, frameworkName, defects });

      assert.equal(rebuilt.projectId, generated.projectId, `${familyId}/${frameworkName}: different project`);
      assert.deepEqual(
        Object.keys(rebuilt.files).sort(),
        Object.keys(generated.files).sort(),
        `${familyId}/${frameworkName}: the rebuild writes a different set of files`,
      );
      for (const path of Object.keys(generated.files)) {
        assert.equal(
          rebuilt.files[path],
          generated.files[path],
          `${familyId}/${frameworkName}: ${path} differs, so the specification is not sufficient for it`,
        );
      }
      // And on disk, including the files writeProject adds (spec.json, package.json) - a tree hash is
      // the artefact the corpus records, so it is the thing that has to match.
      const a = mkdtempSync(join(tmpdir(), 'spec-gen-'));
      const b = mkdtempSync(join(tmpdir(), 'spec-rebuilt-'));
      try {
        writeProject(a, generated);
        writeProject(b, rebuilt);
        assert.equal(hashTree(b), hashTree(a), `${familyId}/${frameworkName}: rebuilt tree hash differs`);
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
      compared += 1;
    }
  }
  assert.equal(compared, families.length * frameworks.length, 'every family was rebuilt in every framework');
});

test('the specification states the functional facts the generator implements', () => {
  // The drift tests. Each of these fails if the generator changes something the specification still
  // describes the old way - which is the only thing keeping a transcribed specification honest.
  for (const familyId of ARCHETYPE_IDS) {
    const spec = read(familyId);
    const archetype = ARCHETYPES[familyId];

    assert.equal(spec.title, archetype.title, `${familyId}: title drifted`);
    assert.equal(spec.story, archetype.story, `${familyId}: story drifted`);

    // The server contract, route for route.
    assert.deepEqual(
      spec.routes.map((route) => `${route.method} ${route.path} (${route.kind})`),
      archetype.routes.map((route) => `${route.method} ${route.path} (${route.kind})`),
      `${familyId}: the stated server contract differs from the implemented one`,
    );

    // Required fields: the specification states them, the server computes them, and they must agree.
    const implemented = archetype.fields.filter((field) => field.type !== 'select' && !field.optional).map((field) => field.name);
    assert.deepEqual(requiredFieldNames(spec), implemented, `${familyId}: the required fields drifted`);

    // Every table the specification names has to exist in the generated server.
    const server = buildProject({ archetypeId: familyId, frameworkName: 'raw', defects: [] }).files['server.mjs'];
    for (const table of spec.state.tables) {
      assert.match(server, new RegExp(`CREATE TABLE IF NOT EXISTS ${table.name}\\b`), `${familyId}: ${table.name} is stated but not created`);
      for (const column of table.columns) {
        assert.match(server, new RegExp(`CREATE TABLE IF NOT EXISTS ${table.name}[\\s\\S]{0,200}?\\b${column.name}\\b`), `${familyId}: ${table.name}.${column.name} is stated but not created`);
      }
    }

    // The reduced archetype has to be the archetype: this is what the rebuild path actually consumes.
    const reduced = archetypeFromSpec(spec);
    assert.equal(reduced.id, archetype.id);
    assert.deepEqual(
      reduced.routes.map((route) => `${route.method} ${route.path} (${route.kind})`),
      archetype.routes.map((route) => `${route.method} ${route.path} (${route.kind})`),
    );
    // Compared on the properties the format defines rather than on the archetype's whole shape, because
    // the archetype table carries keys nothing reads (see below) and a specification must not.
    const defined = (field) => Object.fromEntries(Object.entries(field).filter(([key]) => FIELD_KEYS.has(key)));
    assert.deepEqual(reduced.fields.map(defined), archetype.fields.map(defined), `${familyId}: the fields the rebuild consumes differ`);
    // The specification states required-ness explicitly; the generator's field shape spells it as
    // `optional`. Comparing the optional marker rather than a `required` key, because the rebuild must
    // hand the templates the shape they expect - a stray `required` there would be a second, unused copy.
    assert.deepEqual(
      reduced.fields.map((field) => field.optional === true),
      archetype.fields.map((field) => field.optional === true),
      `${familyId}: required-ness drifted`,
    );
    assert.ok(reduced.fields.every((field) => !('required' in field)), `${familyId}: the reduced field still carries the specification's spelling`);

    // The archetype table carries `pattern` on some fields and nothing reads it: the generator computes
    // its element patterns from the field's type and name, and `pattern` never reaches the built project.
    // The byte-for-byte test above is what proves it is inert; this is what stops it being transcribed
    // back into a specification, which is how it got in the first time.
    const INERT_FIELD_KEYS = ['pattern'];
    for (const field of archetype.fields) {
      for (const key of Object.keys(field)) {
        assert.ok(FIELD_KEYS.has(key) || INERT_FIELD_KEYS.includes(key), `${familyId}: field key ${key} is neither in the format nor known to be inert`);
      }
    }
    for (const field of reduced.fields) {
      for (const key of INERT_FIELD_KEYS) assert.ok(!(key in field), `${familyId}: the specification carries the inert ${key} property`);
    }
    assert.deepEqual(reduced.echo, archetype.echo);
    assert.deepEqual(reduced.journey, archetype.journey);
    assert.deepEqual(reduced.writeJourney ?? null, archetype.writeJourney ?? null);
    if (archetype.writeJourney) {
      // A redirect template that is not a redirect function would make the rebuild a different app.
      const route = reduced.routes.find((candidate) => candidate.kind.startsWith('write'));
      assert.equal(typeof route.redirect, 'function', `${familyId}: the rebuild did not turn the redirect template into a redirect`);
      assert.equal(route.redirect('REF'), archetype.routes.find((candidate) => candidate.kind.startsWith('write')).redirect('REF'));
    }
  }
});

test('the rebuild path does not reach the archetype table', () => {
  // The durability claim is that a specification rebuilds a project on a machine where the archetype
  // table is gone. That is only true if nothing the rebuild path imports reads it, so it is asserted on
  // the module sources rather than asserted in prose: a future import would fail here, not silently
  // make `scripts/rebuild-from-spec.mjs` depend on the very file the specification is meant to outlive.
  //
  // The pattern matches a static import in any quote style, a re-export, a dynamic `import()` and a
  // `require()`, so it cannot be slipped past by writing the import differently. It is still a source
  // check rather than a graph walk, so `pilot/projects.mjs` - which legitimately imports the table and
  // is the file a rebuild must not reach - is checked by absence from the list instead.
  const reachesArchetypes = /(?:import|export)[\s\S]{0,200}?from\s*['"`][^'"`]*archetypes\.mjs['"`]|(?:import|require)\s*\(\s*['"`][^'"`]*archetypes\.mjs['"`]/;
  for (const file of ['src/eval/spec.mjs', 'pilot/frameworks.mjs', 'scripts/rebuild-from-spec.mjs']) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, reachesArchetypes, `${file} reaches the archetype table`);
  }
  // ...and the rebuild must go through `buildProjectFor`, the archetype-object seam, not the id lookup.
  const specSource = readFileSync(join(ROOT, 'src/eval/spec.mjs'), 'utf8');
  assert.match(specSource, /buildProjectFor/);
  assert.doesNotMatch(specSource, /buildProject\b(?!For)/);
  assert.doesNotMatch(readFileSync(join(ROOT, 'scripts/rebuild-from-spec.mjs'), 'utf8'), /projects\.mjs/, 'the rebuild must not reach the id lookup either');
});

test('a specification that is missing a functional fact is refused, not rebuilt', () => {
  const good = read('booking');
  const clone = () => structuredClone(good);

  assert.deepEqual(validateSpec(good), [], 'the fixture has to start valid');

  const noState = clone();
  delete noState.state;
  assert.ok(validateSpec(noState).some((problem) => problem.startsWith('state')), 'state is required');

  const noTableColumns = clone();
  noTableColumns.state.tables[0].columns = [];
  assert.ok(validateSpec(noTableColumns).some((problem) => problem.includes('columns')), 'a table with no columns is not a state');

  const noRedirect = clone();
  noRedirect.routes.find((route) => route.kind === 'write').redirect = undefined;
  assert.ok(validateSpec(noRedirect).some((problem) => problem.includes('redirect')), 'a write route must say where it redirects');

  const noAcceptance = clone();
  noAcceptance.acceptance = [];
  assert.ok(validateSpec(noAcceptance).some((problem) => problem.startsWith('acceptance')), 'a specification must state what has to be true');

  const noReload = clone();
  delete noReload.persistence.reload_assertion;
  assert.ok(validateSpec(noReload).some((problem) => problem.includes('reload_assertion')), 'persistence must say what a reload proves');

  const impliedRequired = clone();
  impliedRequired.fields[0] = { ...impliedRequired.fields[0], required: false };
  delete impliedRequired.fields[0].optional;
  assert.ok(
    validateSpec(impliedRequired).some((problem) => problem.includes('optional')),
    'a field is required or it is not; the specification may not leave it implied',
  );

  // Cross-field contradictions: a specification whose prose and whose fields say different things is
  // worse than one that is missing a key, because it looks complete while asserting two behaviours.
  const wrongRequired = clone();
  wrongRequired.validation.required_fields = wrongRequired.validation.required_fields.filter((name) => name !== 'notes');
  assert.ok(
    validateSpec(wrongRequired).some((problem) => problem.includes('omits notes')),
    'the stated required set must agree with the fields',
  );

  const undeclared = clone();
  undeclared.journey.fill['input[name=nickname]'] = 'Ada';
  assert.ok(
    validateSpec(undeclared).some((problem) => problem.includes('nickname')),
    'the journey may not type into a field the family does not declare',
  );

  const undirected = clone();
  Object.keys(undirected.journey.fill).forEach((selector) => {
    undirected.journey.fill[`#${selector.split('[')[0]}`] = undirected.journey.fill[selector];
    delete undirected.journey.fill[selector];
  });
  assert.ok(
    validateSpec(undirected).some((problem) => problem.includes('must name the field')),
    'a journey selector has to name the field it types into',
  );

  const noRef = clone();
  noRef.routes.find((route) => route.kind === 'write').redirect = '/thanks';
  assert.ok(
    validateSpec(noRef).some((problem) => problem.includes('server-issued reference')),
    'a write route must issue the reference the persistence promises',
  );

  const unknownKey = clone();
  unknownKey.fields[0].requireds = true;
  assert.ok(
    validateSpec(unknownKey).some((problem) => problem.includes('requireds')),
    'an undefined field property is refused rather than ignored',
  );

  const inertKey = clone();
  inertKey.fields[0].pattern = '<input[^>]*name="name"[^>]*>';
  assert.ok(
    validateSpec(inertKey).some((problem) => problem.includes('pattern')),
    'the inert generator leftover must not be transcribable into a specification',
  );

  // A specification that does not validate must not reach the builder.
  assert.throws(() => specForFamily('not-a-family', ROOT), /cannot read/);
  assert.equal(SPECS_DIR, 'docs/eval/specs');
  assert.ok(readFileSync(join(ROOT, SPECS_DIR, 'booking.json'), 'utf8').includes('reload_assertion'));
});
