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
import { cartSpec } from '../scripts/lib/cart-spec.mjs';
import { checkoutSpec } from '../scripts/lib/checkout-spec.mjs';
import { surveySpec } from '../scripts/lib/survey-spec.mjs';

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
    // `defined()` filters before comparing, so a property the reduction invented would be invisible to the
    // assertion above. Assert the reduced shape directly as well: every key it hands the templates has to
    // be one the format defines.
    for (const field of reduced.fields) {
      for (const key of Object.keys(field)) {
        assert.ok(FIELD_KEYS.has(key), `${familyId}: the reduction invented the field property ${key}`);
      }
    }

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
    // The password selector: inert while it was a hardcoded literal in the templates, so the check is on
    // the effective selector either side produces rather than on the property, which the archetypes leave
    // null. It fails if an archetype starts naming a different password input than the specification does.
    assert.equal(
      reduced.passwordField ?? '[name=password]',
      archetype.passwordField ?? '[name=password]',
      `${familyId}: the password selector drifted`,
    );
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

test('the declared password selector reaches the context the rules read, and matches the built input', () => {
  // `password_field` was inert while the templates hardcoded `[name=password]`: the specification could
  // say anything and nothing changed. It is now declared, forwarded and consumed, so this closes the loop
  // mechanically - the declared selector is the one the rule context carries, and it names an input the
  // built page actually renders. `rules.mjs` reads it as a selector, so a value that matched nothing would
  // silently measure no password field at all.
  assert.ok(
    ARCHETYPE_IDS.some((familyId) => read(familyId).password_field),
    'at least one family must declare a password field, or this test checks nothing',
  );
  for (const familyId of ARCHETYPE_IDS) {
    const spec = read(familyId);
    const built = buildProjectFromSpec({ spec, frameworkName: 'raw', defects: [] });
    const projectSpec = built.spec;
    assert.equal(
      projectSpec.check_context.passwordField,
      spec.password_field ?? '[name=password]',
      `${familyId}: the declared selector did not reach the rule context`,
    );
    if (spec.password_field === null || spec.password_field === undefined) {
      // A family with no password declares none, and the rule context carries the default that matches
      // nothing. Asserting it matched an input would be wrong - and is why the check below is scoped to
      // the families that do declare one.
      assert.equal(projectSpec.check_context.passwordField, '[name=password]', `${familyId}: wrong default`);
      continue;
    }
    const name = spec.password_field.match(/^\[name=([^\]]+)\]$/)?.[1];
    assert.ok(name, `${familyId}: the password selector must be a [name=...] selector, got ${spec.password_field}`);
    assert.match(built.files['app/page.mjs'], new RegExp(`name="${name}"`), `${familyId}: the declared selector matches no input in the built page`);
  }
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
  noRef.routes.find((route) => route.kind === 'write').redirect = '/booking';
  assert.ok(
    validateSpec(noRef).some((problem) => problem.includes('read by reference')),
    'a write route must issue the reference the read route it lands on takes',
  );

  const nowhere = clone();
  nowhere.routes.find((route) => route.kind === 'write').redirect = '/thanks';
  assert.ok(
    validateSpec(nowhere).some((problem) => problem.includes('does not serve as a GET')),
    'a write route must redirect to a route the specification actually serves',
  );

  // The second write route of a family whose persistence prose describes the first: the check has to be
  // structural, or this one is missed. `/signup` redirecting to a session-addressed `/account` must
  // still be accepted, and only the `:ref` one is required to carry a reference.
  const account = structuredClone(read('account-recovery'));
  assert.deepEqual(validateSpec(account), [], 'the session-addressed write route must not be flagged');
  account.routes.find((route) => route.path === '/reset').redirect = '/reset';
  assert.ok(
    validateSpec(account).some((problem) => problem.startsWith('routes(POST /reset).redirect')),
    'the second write route must be checked, not only the one the prose describes',
  );
  assert.ok(
    !validateSpec(account).some((problem) => problem.startsWith('routes(POST /signup).redirect')),
    'the session-addressed write route must not be flagged',
  );
  const sessionRef = structuredClone(read('account-recovery'));
  sessionRef.routes.find((route) => route.path === '/signup').redirect = '/account/:ref';
  assert.ok(
    validateSpec(sessionRef).some((problem) => problem.includes('not a reference-addressed read route')),
    'a reference issued for a route that is not read by reference is refused',
  );

  // The read side of the same rule: a route read by reference has to take the reference in its path. The
  // structural check strips `:ref` from both sides to match them, so without this it would match a
  // reference-less read route and pass while the write redirects to a path nothing serves.
  const reflessRead = structuredClone(read('booking'));
  reflessRead.routes.find((route) => route.kind === 'read-by-reference').path = '/booking';
  assert.ok(
    validateSpec(reflessRead).some((problem) => problem.includes('does not take the reference in its path')),
    'a route read by reference must take the reference in its path',
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

test('an echo naming a field the specification does not declare is refused, not deferred to the generator', () => {
  // The generator resolves echo.field to a declared field by slug and then reads that field's name, in the raw and
  // hono arms alike. Before this check a specification naming a field it never declared validated cleanly, and the
  // generator then died with a TypeError that named neither the echo block nor the field - reproduced, not assumed.
  // The point of the format is that an unreadable specification cannot rebuild a project that merely looks
  // plausible, so this must be a refusal.
  const base = read('booking');
  const declared = base.fields.map((field) => field.slug);
  assert.ok(declared.includes(base.echo.field), 'the corpus echoes a field it declares, so the rule cannot be refusing a correct specification');
  assert.deepEqual(validateSpec(base), [], 'the unaltered specification stays clean');

  const problems = validateSpec({ ...base, echo: { ...base.echo, field: 'no-such-field' } });
  assert.equal(problems.length, 1, `expected exactly one problem, got: ${problems.join(' | ')}`);
  assert.match(problems[0], /echo\.field/, 'the problem names the echo block');
  assert.match(problems[0], /no-such-field/, 'the problem names the field that was written');
  for (const slug of declared) {
    assert.ok(problems[0].includes(slug), `the problem names every declared slug, including ${slug}, so the next person is not sent into the same wall`);
  }

  // The earlier rules still answer first for their own inputs: a non-string field is not a slug problem.
  assert.match(validateSpec({ ...base, echo: { ...base.echo, field: 7 } })[0], /must name the echoed field/);
  // An absent echo object is still its own problem, not a crash.
  assert.match(validateSpec({ ...base, echo: undefined })[0], /shows a value back to the user/);

  // `at` records a problem and continues, so an empty fields list reaches the cross-check. It must report rather
  // than throw, and with nothing declared there is no list to name.
  const emptied = validateSpec({ ...base, fields: [] }).find((problem) => problem.includes('echo.field'));
  assert.ok(emptied, 'an empty fields list still gets an echo problem rather than a crash');
  assert.match(emptied, /no declared field has/);
});

// `fields` that is present but not an array is refused by the rule that runs first, and every later reader of the
// list must still answer rather than throw on the way there: `spec.fields ?? []` guards absence, not type, which is
// how a specification could reach `.filter` with a string and take the process down instead of reporting a problem.
//
// All three capability specs are exercised because they do not read the same sites: the cart alone reaches
// `:153/:279/:282`, checkout reaches `:302`, and the survey reaches `:467/:495`. A test using one fixture would have
// left two thirds of the fix unproven, which is how the original bug survived the file's other tests.
test('a non-array fields is refused, not thrown', () => {
  for (const [label, specFor] of [['cartSpec', cartSpec], ['checkoutSpec', checkoutSpec], ['surveySpec', surveySpec]]) {
    const base = specFor();
    assert.ok(Array.isArray(base.fields), `${label} declares fields as an array, so the fixture is meaningful`);
    for (const value of ['nope', 42, {}, true]) {
      const problems = validateSpec({ ...base, fields: value });
      assert.ok(Array.isArray(problems), `${label} fields: ${JSON.stringify(value)} must return problems`);
      assert.match(
        problems.join('\n'),
        /fields: must list the form fields/,
        `${label} fields: ${JSON.stringify(value)} must be refused by the fields rule`,
      );
    }
  }
});

// The same defect class as `fields`, at the two other list-valued properties, and the pairs of readers are not the
// same ones either: a non-array `routes` reached `.filter` and threw, and the `for...of` loops over it would have
// iterated characters silently if the throwers had not been reached first. All three fixtures are exercised because
// they guard different capabilities - the cart and checkout reach the route readers, the survey reaches the
// condition reader that maps a select field's options.
test('a non-array routes is refused, not thrown', () => {
  for (const [label, specFor] of [['cartSpec', cartSpec], ['checkoutSpec', checkoutSpec], ['surveySpec', surveySpec]]) {
    const base = specFor();
    assert.ok(Array.isArray(base.routes) && base.routes.length > 0, `${label} declares routes, so the fixture is meaningful`);
    for (const value of ['nope', 42, {}]) {
      const problems = validateSpec({ ...base, routes: value });
      assert.ok(Array.isArray(problems), `${label} routes: ${JSON.stringify(value)} must return problems`);
      assert.match(
        problems.join('\n'),
        /routes: must list the server contract/,
        `${label} routes: ${JSON.stringify(value)} must be refused by the routes rule`,
      );
    }
  }
});

// The edit journey's field is resolved by name into a selector and a label, and a name that is not declared used to
// fail nowhere: the validator said nothing, and the generator emitted a control that never populates next to a label
// pointing at an id that does not exist. It is the same defect as a fill selector naming the wrong field, so it is
// refused the same way - and the message names the declared fields, because being told only that a name is wrong
// sends the reader back into the document to find out what would be right.
test('an edit journey naming an undeclared field is refused, naming the declared ones', () => {
  const base = read(ARCHETYPE_IDS[0]);
  const problems = validateSpec({ ...base, journey: { ...base.journey, update: { field: 'no-such-field' } } });
  const refusal = problems.find((problem) => problem.includes('update.field'));
  assert.ok(refusal, 'an update journey naming an undeclared field must be refused');
  assert.match(refusal, /no-such-field/, 'the refusal names the field it could not find');
  for (const field of base.fields) assert.ok(refusal.includes(field.name), `the refusal names the declared field ${field.name}`);
  // The other direction on the same fixture: naming a field that IS declared is accepted, so the rule cannot refuse
  // a correct document while catching a wrong one.
  const good = { ...base, journey: { ...base.journey, update: { field: base.fields[0].name } } };
  assert.equal(validateSpec(good).filter((problem) => problem.includes('update.field')).length, 0);
});

// The hole the first review found: an update block that names no field is not a wrong name but a missing one, and it
// reached the generator, which read `undefined` and emitted `[name="undefined"]` beside a label pointing at
// `edit-undefined`. A block, once present, has to be complete.
test('an update block that names no field is refused', () => {
  const base = read(ARCHETYPE_IDS[0]);
  for (const update of [{}, { field: '' }, { field: 123 }, { field: null }, { ref: 'x' }]) {
    const problems = validateSpec({ ...base, journey: { ...base.journey, update } });
    const refusal = problems.find((problem) => problem.includes('update.field'));
    assert.ok(refusal, `an update block ${JSON.stringify(update)} must be refused`);
    assert.match(refusal, /must name the field/, 'the refusal says what is missing');
  }
});

// The positive branch against the generator itself, which is what a specification is for: a valid edit journey must
// produce a form control and a label that name the declared field. The corpus test below cannot check this, because
// no shipping archetype declares an update journey yet.
test('a valid edit journey generates a label and an input naming the declared field', () => {
  const base = read(ARCHETYPE_IDS[0]);
  const field = base.fields[0].name;
  const built = buildProjectFromSpec({
    spec: { ...base, journey: { ...base.journey, update: { field } } },
    frameworkName: 'raw',
  });
  const text = Object.values(built.files).join('\n');
  assert.ok(text.includes(`id="edit-${field}"`), `the generated edit input names ${field}`);
  assert.ok(text.includes(`for="edit-${field}"`), `the generated edit label points at ${field}`);
  assert.ok(!text.includes('edit-undefined'), 'an accepted journey must not generate an undefined control');
});

test('no family in the corpus is refused for its edit journey', () => {
  // A validator that starts refusing documents which ship is a worse bug than the one being fixed, so the corpus is
  // checked in the direction that matters - this rule's own verdict, so it stays true if a family has an unrelated
  // problem of its own.
  for (const family of ARCHETYPE_IDS) {
    const refused = validateSpec(read(family)).filter((problem) => problem.includes('update.field'));
    assert.equal(refused.length, 0, `${family} is refused for its edit journey: ${refused.join('; ')}`);
  }
});

// A select field's `options` is read by the survey's condition check, which maps it - the one reader that reached a
// non-array with nothing between it and the call. The cart fixture is deliberately not used here: it has a select
// field, but not the survey capability that reads its options, so it would pass either way and prove nothing.
test('a select field whose options is not an array is refused, not thrown', () => {
  const base = surveySpec();
  const selects = base.fields.filter((field) => field?.type === 'select');
  assert.ok(selects.length > 0, 'the survey fixture has a select field, so the fixture is meaningful');
  const problems = validateSpec({
    ...base,
    fields: base.fields.map((field) => (field?.type === 'select' ? { ...field, options: 'bad' } : field)),
  });
  assert.ok(Array.isArray(problems), 'a non-array options must return problems');
  assert.ok(problems.length > 0, 'a non-array options must be refused');
});

test('no family in the corpus is refused by the echo cross-check', () => {
  // The other direction, because a validator that starts refusing documents which ship is a worse bug than the one
  // being fixed. This asserts only this rule's own verdict, so it stays true even if some family has an unrelated
  // problem of its own.
  for (const family of ARCHETYPE_IDS) {
    const refused = validateSpec(read(family)).filter((problem) => problem.includes('echo.field') && problem.includes('no declared field has'));
    assert.deepEqual(refused, [], `${family}: the echo cross-check refuses a specification that ships`);
  }
});
