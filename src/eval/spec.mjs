/**
 * Durable functional specifications: the behaviour of a pilot family, restated so the project can be
 * rebuilt from the specification alone.
 *
 * The pilot's projects are produced by `pilot/archetypes.mjs` and `pilot/frameworks.mjs`. That is the
 * generation input, and it is code: the *functional* facts about a family - what it stores, what a
 * write does, what a reload must show, what has to be true for the pair to count - are spread across
 * the archetype table and the server template, and a reader cannot tell which parts are the task and
 * which are the implementation.
 *
 * A specification in `docs/eval/specs/<family>.json` is the durable copy of those facts. It is what
 * survives if the archetype table is rewritten or lost, and `scripts/rebuild-from-spec.mjs` rebuilds a
 * project from it without reading the archetype table at all. `test/spec.test.mjs` holds the two
 * together: it rebuilds every family in every framework from its specification and requires the tree
 * hash to equal the generator's, and it checks the specification's functional claims (table, required
 * fields, persistence route) against the generator, so a change to one that is not made to the other
 * fails.
 *
 * What this does NOT claim: that the specification was written first. It was transcribed from the
 * archetypes and hand-reviewed, and the drift test is what keeps it honest from here. The claim it does
 * make is checkable - the specification is sufficient to rebuild the project.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildProjectFor } from '../../pilot/frameworks.mjs';

export const SPEC_VERSION = 1;
export const SPECS_DIR = 'docs/eval/specs';

/** The routes the server implements, by kind. A kind is what the server must do, not how. */
export const ROUTE_KINDS = Object.freeze([
  'page',
  'write',
  'write-session',
  'write-account',
  'write-reset',
  'write-with-capacity',
  'read-by-reference',
  'read-session',
  'search',
  'list',
]);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string' && value !== '';
const isBoolean = (value) => typeof value === 'boolean';

/**
 * The properties a field may carry.
 *
 * Deliberately a closed set. The archetype table carries a `pattern` on some fields that nothing reads
 * - the generator computes its element patterns from the field's type and name - and transcribing that
 * into a specification made the specification describe machinery that does not exist. A closed set
 * means an inert key cannot come back, and a typo (`requireds`) is refused rather than ignored.
 */
const FIELD_KEYS = new Set(['slug', 'name', 'type', 'label', 'autocomplete', 'required', 'optional', 'echoed', 'options']);
export { FIELD_KEYS };

/** The field names a selector types into, from `[name=x]` / `[name="x"]` / `[name='x']`. */
function selectorFieldNames(selector) {
  return [...String(selector).matchAll(/\[name=["']?([^\]"']+)["']?\]/g)].map((match) => match[1]);
}

/**
 * Check a specification against the schema, returning every problem rather than the first.
 *
 * Fail closed: an unreadable specification must not be able to rebuild a project that looks plausible.
 * A missing field would otherwise be silently interpolated as `undefined` into generated code, which is
 * exactly how a rebuild would produce a project that no longer asserts what its specification says.
 */
export function validateSpec(spec) {
  const problems = [];
  const at = (path, message) => problems.push(`${path}: ${message}`);
  if (!isObject(spec)) return ['spec: not an object'];
  if (spec.spec_version !== SPEC_VERSION) at('spec_version', `expected ${SPEC_VERSION}`);

  for (const key of ['family_id', 'title', 'story']) if (!isString(spec[key])) at(key, 'must be a non-empty string');
  if (spec.family_id !== undefined && !/^[a-z0-9-]+$/.test(spec.family_id)) at('family_id', 'must be a kebab-case id');

  // State and persistence: the part of the task that server code alone does not state.
  if (!isObject(spec.state)) at('state', 'must be an object');
  else {
    if (spec.state.engine !== 'sqlite') at('state.engine', 'the pilot stores state in SQLite');
    if (!Array.isArray(spec.state.tables) || spec.state.tables.length === 0) at('state.tables', 'must list at least one table');
    else {
      for (const [index, table] of spec.state.tables.entries()) {
        if (!isString(table?.name)) at(`state.tables[${index}].name`, 'must be a table name');
        if (!Array.isArray(table?.columns) || table.columns.length === 0) at(`state.tables[${index}].columns`, 'must list columns');
        else {
          for (const [columnIndex, column] of table.columns.entries()) {
            if (!isString(column?.name)) at(`state.tables[${index}].columns[${columnIndex}].name`, 'must be a column name');
            if (!isString(column?.type)) at(`state.tables[${index}].columns[${columnIndex}].type`, 'must be a column type');
          }
        }
      }
    }
  }
  if (!isObject(spec.persistence)) at('persistence', 'must state how a write becomes a readable value');
  else {
    for (const key of ['write_route', 'read_route', 'reference', 'reload_assertion']) {
      if (!isString(spec.persistence[key])) at(`persistence.${key}`, 'must be stated');
    }
  }

  if (!Array.isArray(spec.routes) || spec.routes.length === 0) at('routes', 'must list the server contract');
  else {
    for (const [index, route] of spec.routes.entries()) {
      const where = `routes[${index}]`;
      if (!['GET', 'POST'].includes(route?.method)) at(`${where}.method`, 'must be GET or POST');
      if (!isString(route?.path)) at(`${where}.path`, 'must be a path');
      if (!ROUTE_KINDS.includes(route?.kind)) at(`${where}.kind`, `must be one of ${ROUTE_KINDS.join(', ')}`);
      if (!isString(route?.effect)) at(`${where}.effect`, 'must say what the route does, not only where it points');
      if (route?.redirect !== undefined && !isString(route.redirect)) at(`${where}.redirect`, 'must be a location template');
    }
    const writes = spec.routes.filter((route) => String(route.kind).startsWith('write'));
    for (const write of writes) {
      if (!isString(write.redirect)) at(`routes(${write.method} ${write.path}).redirect`, 'a write route must state where it redirects');
    }
  }

  if (!Array.isArray(spec.fields) || spec.fields.length === 0) at('fields', 'must list the form fields');
  else {
    const names = new Set();
    for (const [index, field] of spec.fields.entries()) {
      const where = `fields[${index}]`;
      for (const key of Object.keys(field ?? {})) if (!FIELD_KEYS.has(key)) at(`${where}.${key}`, 'is not a field property this format defines');
      for (const key of ['slug', 'name', 'type', 'label']) if (!isString(field?.[key])) at(`${where}.${key}`, 'must be a non-empty string');
      if (!isBoolean(field?.required)) at(`${where}.required`, 'must be true or false, stated rather than implied by absence');
      if (field?.required === false && field?.optional === undefined) {
        // `required: false` is the specification; the generator spells it `optional`. Both may appear,
        // but they may not contradict, and a contradiction is a specification that says two things.
        at(`${where}`, "a field with required: false must also be listed as optional in the generation input");
      }
      if (names.has(field?.name)) at(`${where}.name`, `duplicate field name ${field.name}`);
      names.add(field?.name);
      if (field?.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) at(`${where}.options`, 'a select must list its options');
    }
  }

  if (!isObject(spec.validation)) at('validation', 'must state what a missing field does');
  else {
    if (!Array.isArray(spec.validation.required_fields)) at('validation.required_fields', 'must list the fields the server requires');
    else {
      // The required set is derived from `fields[].required` by the generator, so a second copy that
      // disagrees is a specification saying two things. It is checked rather than trusted because the
      // prose is the part a reader believes, and the fields are the part that runs.
      const implemented = (spec.fields ?? []).filter((field) => field?.required && field?.type !== 'select').map((field) => field.name);
      const stated = spec.validation.required_fields;
      const omitted = implemented.filter((name) => !stated.includes(name));
      const extra = stated.filter((name) => !implemented.includes(name));
      if (omitted.length > 0) at('validation.required_fields', `omits ${omitted.join(', ')}, which the fields mark required`);
      if (extra.length > 0) at('validation.required_fields', `claims ${extra.join(', ')}, which the fields do not mark required`);
    }
    for (const key of ['on_missing', 'on_success']) if (!isString(spec.validation[key])) at(`validation.${key}`, 'must be stated');
  }

  // A journey that types into a field the family does not declare is a journey the generator cannot
  // build a form for: the run would fail in the browser rather than here, which is the expensive place
  // to find out. Every driven form is checked against the declared fields.
  if (Array.isArray(spec.fields) && spec.fields.length > 0) {
    const declared = new Set(spec.fields.map((field) => field?.name));
    const journeys = [
      ['journey', spec.journey],
      ['extra_form', spec.extra_form],
      ['write_journey', spec.write_journey],
      ['security_journey', spec.security_journey],
    ];
    for (const [name, journey] of journeys) {
      for (const selector of Object.keys(journey?.fill ?? {})) {
        const targets = selectorFieldNames(selector);
        if (targets.length === 0) at(`${name}.fill("${selector}")`, 'must name the field it types into, as [name=<field>]');
        for (const target of targets) if (!declared.has(target)) at(`${name}.fill("${selector}")`, `types into ${target}, which the fields do not declare`);
      }
    }
  }

  // A write route that redirects to a reference-addressed read route has to actually put the reference in
  // the redirect. Checked structurally, against the read route's own path and kind, rather than against
  // the prose in `persistence.reference`: keying it on the word "reference" was both too narrow - it
  // missed the second write route of a family whose prose described the first - and too broad - it would
  // have demanded a reference from every write route of a family that mentioned the word.
  const stripRef = (path) => String(path).replace(/\/:ref$/, '');
  const reads = (spec.routes ?? []).filter((route) => route?.method === 'GET');
  const served = new Set(reads.map((route) => stripRef(route.path)));
  const readByReference = new Set(reads.filter((route) => route?.kind === 'read-by-reference').map((route) => stripRef(route.path)));
  for (const route of spec.routes ?? []) {
    if (!route?.kind?.startsWith('write') || !isString(route.redirect)) continue;
    const target = stripRef(route.redirect);
    const where = `routes(${route.method} ${route.path}).redirect`;
    if (!served.has(target)) at(where, `redirects to ${target}, which this specification does not serve as a GET`);
    else if (readByReference.has(target) && !route.redirect.includes(':ref')) at(where, `${target} is read by reference, so this write must issue one`);
    else if (!readByReference.has(target) && route.redirect.includes(':ref')) at(where, `issues a reference, but ${target} is not a reference-addressed read route`);
  }

  if (!isObject(spec.echo)) at('echo', 'every archetype shows a value back to the user');
  else if (!isString(spec.echo.field)) at('echo.field', 'must name the echoed field');

  if (!Array.isArray(spec.acceptance) || spec.acceptance.length === 0) at('acceptance', 'must state what has to be true for a pair to count');

  if (!isObject(spec.journey)) at('journey', 'must state the driven journey');
  else {
    if (!isString(spec.journey.startPath)) at('journey.startPath', 'must state where the journey starts');
    if (!isString(spec.journey.formSelector)) at('journey.formSelector', 'must state the form it drives');
    if (!isObject(spec.journey.fill) || Object.keys(spec.journey.fill).length === 0) at('journey.fill', 'must state the values it types');
    if (!isString(spec.journey.expectText)) at('journey.expectText', 'must state what the reload has to show');
  }
  if (spec.session !== undefined && !isBoolean(spec.session)) at('session', 'must be a boolean when present');
  if (spec.capacity !== undefined && spec.capacity !== null && !Number.isInteger(spec.capacity)) at('capacity', 'must be an integer when present');
  return problems;
}

/** Read, parse and validate one specification. Throws rather than returning a partial one. */
export function specForFamily(familyId, root = process.cwd()) {
  const path = join(root, SPECS_DIR, `${familyId}.json`);
  let spec;
  try {
    spec = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`spec: cannot read ${SPECS_DIR}/${familyId}.json: ${error.message}`);
  }
  const problems = validateSpec(spec);
  if (problems.length > 0) throw new Error(`spec: ${familyId} is not a valid specification:\n  ${problems.join('\n  ')}`);
  if (spec.family_id !== familyId) throw new Error(`spec: ${SPECS_DIR}/${familyId}.json declares family_id ${spec.family_id}`);
  return spec;
}

/**
 * The archetype the generator consumes, rebuilt from the specification.
 *
 * The only translation is the redirect: the specification states a location *template*
 * (`/booking/:ref`), which is data, and the generator wants a function. Keeping the template in the
 * specification is what makes it readable and comparable; producing the function here is the whole of
 * the impedance match, deliberately.
 */
export function archetypeFromSpec(spec) {
  const redirectFor = (template) =>
    template.includes(':ref') ? (ref) => template.replace(':ref', ref) : () => template;
  const field = (entry) => {
    const { required, ...rest } = entry;
    return { ...rest, ...(required === false ? { optional: true } : {}) };
  };
  return {
    id: spec.family_id,
    title: spec.title,
    story: spec.story,
    routes: spec.routes.map((route) => {
      const { effect, redirect, ...rest } = route;
      return redirect === undefined ? { ...rest } : { ...rest, redirect: redirectFor(redirect) };
    }),
    fields: spec.fields.map(field),
    echo: spec.echo,
    journey: spec.journey,
    ...(spec.form ? { form: spec.form } : {}),
    ...(spec.extra_form ? { extraForm: spec.extra_form } : {}),
    ...(spec.write_journey ? { writeJourney: spec.write_journey } : {}),
    ...(spec.security_journey ? { securityJourney: spec.security_journey } : {}),
    ...(spec.session === undefined ? {} : { session: spec.session }),
    ...(spec.capacity === undefined ? {} : { capacity: spec.capacity }),
    ...(spec.password_field === undefined ? {} : { passwordField: spec.password_field }),
  };
}

/**
 * Rebuild a project from a specification alone.
 *
 * This reads no archetype table. That is the point: if `pilot/archetypes.mjs` were lost, this is the
 * path that still produces the project.
 */
export function buildProjectFromSpec({ spec, frameworkName, defects = [] }) {
  return buildProjectFor(archetypeFromSpec(spec), { frameworkName, defects });
}

/** The fields the server requires: required, and not a select (a select always has a value). */
export function requiredFieldNames(spec) {
  return spec.fields.filter((entry) => entry.required && entry.type !== 'select').map((entry) => entry.name);
}
