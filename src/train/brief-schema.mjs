/**
 * Brief-authored form schema for the tr-* training corpus.
 *
 * The tr-* briefs originally described their flows only in prose (`journeys`), while
 * the generated projects took their `fields` and `journey` from a shared archetype.
 * That made every project in a family render the archetype's form - a coffee
 * subscription brief produced a bakery form - so a brief could not be told apart from
 * its project.
 *
 * This module lets a brief carry its OWN structured schema, so the project's form and
 * journey come from the brief that describes them. It is deliberately small and
 * fail-closed: a brief whose schema cannot be built into a working form is refused
 * rather than scaffolded into something that merely renders.
 *
 * The field vocabulary matches `src/eval/spec.mjs` (FIELD_KEYS) and the renderer in
 * `pilot/frameworks.mjs`, so an authored field is expressed in the same terms as every
 * other field in the project.
 */

/**
 * Field types the framework builders can render. `pilot/frameworks.mjs` has explicit
 * branches for textarea and select and an `input type=` fallback, so these are the
 * types that produce a real control rather than an unknown one.
 */
export const BRIEF_FIELD_TYPES = new Set([
  'text',
  'tel',
  'email',
  'date',
  'time',
  'number',
  'select',
  'search',
  'textarea',
]);

/** Properties an authored field may carry, mirroring the spec's closed field set. */
export const BRIEF_FIELD_KEYS = new Set([
  'slug',
  'name',
  'type',
  'label',
  'autocomplete',
  'required',
  'optional',
  'options',
  'echoed',
]);

const isString = (v) => typeof v === 'string' && v.length > 0;
const isBool = (v) => typeof v === 'boolean';

/**
 * The field the project echoes its record back through.
 *
 * The builder needs `echo.field` to name a slug that exists in `fields`, then looks up
 * that field's control to read the value back (`pilot/frameworks.mjs`). Deriving it
 * here - rather than asking 30 briefs to each name one - removes a whole class of
 * hand-authored mistake, and the choice is deterministic: the first textarea, else the
 * first text field. A family with no such field is refused, because the harness has
 * nothing to read the record back through.
 */
export function echoFieldFor(fields) {
  const echoable =
    fields.find((field) => field.echoed === true) ??
    fields.find((field) => field.type === 'textarea') ??
    fields.find((field) => field.type === 'text');
  return echoable ? echoable.slug : null;
}

/** Field names a journey's fill selectors type into: `[name=x]`, `[name="x"]`, `[name='x']`. */
export function selectorFieldName(selector) {
  const match = String(selector).match(/\[name=["']?([^\]"']+)["']?\]/);
  return match ? match[1] : null;
}

/**
 * Validate one brief's authored schema. Returns findings rather than throwing, so a
 * caller can report every problem at once; `[]` means the brief is authorable.
 *
 * These are the checks that matter for the schema to be truthful rather than merely
 * well-formed:
 *   - a field must be renderable and nameable;
 *   - the journey must type into fields the brief actually declares, which is what
 *     makes it brief-faithful rather than the archetype's journey relabelled;
 *   - the journey must have an echoed field to assert on, or a project could pass its
 *     journey while showing nothing back.
 */
export function validateBriefSchema(row) {
  const findings = [];
  const at = (path, problem) => findings.push({ brief_id: row.brief_id, at: path, problem });

  const fields = row.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    at('fields', 'must be a non-empty array - a brief without fields cannot be rendered brief-faithfully');
    return findings;
  }

  const seen = new Set();
  fields.forEach((field, index) => {
    const where = `fields[${index}]`;
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      at(where, 'must be an object');
      return;
    }
    for (const key of Object.keys(field)) {
      if (!BRIEF_FIELD_KEYS.has(key)) at(`${where}.${key}`, 'is not a field property this format defines');
    }
    for (const key of ['slug', 'name', 'type', 'label']) {
      if (!isString(field[key])) at(`${where}.${key}`, 'must be a non-empty string');
    }
    if (!isBool(field.required)) at(`${where}.required`, 'must be true or false, stated rather than implied by absence');
    if (isString(field.type) && !BRIEF_FIELD_TYPES.has(field.type)) {
      at(`${where}.type`, `'${field.type}' has no renderer; use one of ${[...BRIEF_FIELD_TYPES].join(', ')}`);
    }
    if (isString(field.name) && seen.has(field.name)) at(`${where}.name`, `'${field.name}' is declared twice`);
    if (isString(field.name)) seen.add(field.name);
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || field.options.length < 2) {
        at(`${where}.options`, 'a select must offer at least two options');
      } else if (field.options.some((option) => !isString(option))) {
        at(`${where}.options`, 'every option must be a non-empty string');
      }
    } else if (field.options !== undefined) {
      at(`${where}.options`, 'options are only meaningful on a select');
    }
  });

  const journey = row.journey;
  if (!journey || typeof journey !== 'object' || Array.isArray(journey)) {
    at('journey', 'must be an object - the brief must state the journey its user takes');
    return findings;
  }
  for (const key of Object.keys(journey)) {
    if (!['startPath', 'formSelector', 'fill', 'expectText'].includes(key)) {
      at(`journey.${key}`, 'is not a journey property this format defines');
    }
  }
  if (!isString(journey.startPath) || !journey.startPath.startsWith('/')) {
    at('journey.startPath', 'must be an absolute path starting with /');
  }
  if (!isString(journey.formSelector) || !journey.formSelector.startsWith('form#')) {
    at('journey.formSelector', "must be a 'form#<id>' selector; the builder derives the form id from it");
  }
  if (!isString(journey.expectText)) {
    at('journey.expectText', 'must be a non-empty string - the journey must assert what it sees');
  }
  const fill = journey.fill;
  if (!fill || typeof fill !== 'object' || Array.isArray(fill) || Object.keys(fill).length === 0) {
    at('journey.fill', 'must be a non-empty map of selector -> value');
  } else {
    const names = new Set(fields.filter((f) => isString(f.name)).map((f) => f.name));
    for (const [selector, value] of Object.entries(fill)) {
      const name = selectorFieldName(selector);
      if (!name) {
        at(`journey.fill['${selector}']`, "selector must address a field by name, e.g. 'input[name=email]'");
      } else if (!names.has(name)) {
        at(`journey.fill['${selector}']`, `types into '${name}', which this brief does not declare - the journey is not this brief's`);
      }
      if (!isString(String(value))) at(`journey.fill['${selector}']`, 'must be a non-empty value');
    }
  }

  const echoed = echoFieldFor(fields);
  if (!echoed) {
    at('fields', 'no field can echo the record back (need a text or textarea field, or one marked echoed)');
  } else if (isString(journey.expectText)) {
    // The harness waits for the echoed value to appear on the read page, so the value
    // the journey types into the echoed field is what it will look for.
    const echoedName = fields.find((f) => f.slug === echoed)?.name;
    const typed = Object.entries(fill ?? {})
      .filter(([selector]) => selectorFieldName(selector) === echoedName)
      .map(([, value]) => value);
    if (typed.length === 0) {
      at('journey.fill', `must type into the echoed field '${echoedName}' (echo.source defaults to the record page)`);
    } else if (!typed.some((value) => String(value) === journey.expectText)) {
      at('journey.expectText', `must be the value typed into the echoed field ('${typed[0]}'), which is what the read page shows`);
    }
  }

  return findings;
}
