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
import { hasArchetypeSet, loadArchetypeSet } from '../design/archetype-assets.mjs';

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

/** The functional-route capabilities a specification may opt into. A closed set, like FIELD_KEYS. */
export const CAPABILITY_KEYS = new Set(['list_pages', 'detail_page', 'auth', 'cart', 'pricing_tiers', 'checkout', 'survey', 'game']);

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
  // A route read by reference has to take the reference in its path, or the write that issues one
  // redirects to a path the server does not serve. The structural check below strips `:ref` from both
  // sides to match them, so it would match a reference-less read route against a reference-carrying
  // redirect and pass while the built project 404s.
  for (const route of reads) {
    if (route.kind === 'read-by-reference' && !String(route.path).endsWith('/:ref')) {
      at(`routes(GET ${route.path}).path`, 'is read by reference but does not take the reference in its path');
    }
  }
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

  // Capabilities opt a project into the FUNCTIONAL routes (list pages, a detail page, account
  // login/logout). They default off: a specification without them must regenerate byte-identically,
  // which is what keeps the frozen pilot trees frozen (mwg-train-37a's hard gate).
  if (spec.capabilities !== undefined) {
    if (!isObject(spec.capabilities)) at('capabilities', 'must be an object when present');
    else {
      for (const [key, value] of Object.entries(spec.capabilities)) {
        if (!CAPABILITY_KEYS.has(key)) at(`capabilities.${key}`, `unknown capability - the set is closed: ${[...CAPABILITY_KEYS].join(', ')}`);
        else if (!isBoolean(value)) at(`capabilities.${key}`, 'must be a boolean');
      }
      if (spec.capabilities.auth === true && spec.session === true) {
        at('capabilities.auth', 'cannot combine with session: both own the sid cookie and /api/me');
      }
      if (spec.capabilities.list_pages === true) {
        const lists = (spec.routes ?? []).filter((route) => route?.kind === 'list');
        if (lists.length === 0) at('capabilities.list_pages', 'is on, but no route has kind list');
      }
      if (spec.capabilities.detail_page === true) {
        const detail = (spec.routes ?? []).filter((route) => route?.kind === 'read-by-reference');
        if (detail.length === 0) at('capabilities.detail_page', 'is on, but no route is read-by-reference');
      }
      if (spec.capabilities.cart === true) {
        // The cart owns the sid cookie, as the session flow and auth both do, and it needs a product
        // route to add FROM, a variant to choose, and a quantity to accumulate. Each is refused here
        // rather than silently emitting a cart that adds nothing (mwg-train-11d).
        if (spec.session === true) at('capabilities.cart', 'cannot combine with session: both own the sid cookie');
        if (spec.capabilities.auth === true) at('capabilities.cart', 'cannot combine with auth: both own the sid cookie');
        // The cart's product page IS the record page (it shows the product and its variant choice), so
        // asking for the read-only detail page as well would emit a renderer nothing ever reaches.
        if (spec.capabilities.detail_page === true) at('capabilities.cart', 'cannot combine with detail_page: the cart product page is the record page');
        const products = (spec.routes ?? []).filter((route) => route?.kind === 'read-by-reference');
        if (products.length === 0) at('capabilities.cart', 'is on, but no route is read-by-reference to serve as the product page');
        // The builder binds the FIRST read-by-reference route as the product page, so a second one would
        // be declared and never served. Refused here rather than silently 404ing (mwg-train-11d review).
        if (products.length > 1) {
          at('capabilities.cart', `is on, but ${products.length} routes are read-by-reference: only the first would serve the product page`);
        }
        // A cart with nothing to put in it: the product page adds a reference to a record, and only a
        // write route creates one.
        if (!(spec.routes ?? []).some((route) => route?.method === 'POST' && String(route?.kind ?? '').startsWith('write'))) {
          at('capabilities.cart', 'is on, but no route writes a record, so there would be nothing to add to the cart');
        }
        if (!(spec.fields ?? []).some((field) => field?.type === 'select')) {
          at('capabilities.cart', 'is on, but no select field to choose a variant from');
        }
        if (!(spec.fields ?? []).some((field) => field?.type === 'number')) {
          at('capabilities.cart', 'is on, but no number field to accumulate a quantity in');
        }
      }
      if (spec.capabilities.survey === true) {
        // The survey owns the sid cookie that carries a visitor's answers, and the cart, the session flow
        // and auth all claim it too, so a survey that shared it would lose its own answers.
        if (spec.session === true) at('capabilities.survey', 'cannot combine with session: both own the sid cookie');
        if (spec.capabilities.auth === true) at('capabilities.survey', 'cannot combine with auth: both own the sid cookie');
        if (spec.capabilities.cart === true) at('capabilities.survey', 'cannot combine with cart: both own the sid cookie');
        if (spec.survey === undefined) at('capabilities.survey', 'is on, but no survey block states the questions and the outcome bands');
      }
      if (spec.capabilities.checkout === true) {
        // A checkout is arithmetic over the cart's lines: without the cart there is nothing to pay for,
        // and a second cart implementation here would be the defect rather than the feature (mwg-train-le6).
        if (spec.capabilities.cart !== true) at('capabilities.checkout', 'needs capabilities.cart: there would be no cart to check out');
        if (spec.session === true) at('capabilities.checkout', 'cannot combine with session: both own the sid cookie');
        if (spec.capabilities.auth === true) at('capabilities.checkout', 'cannot combine with auth: both own the sid cookie');
        if (spec.checkout === undefined) at('capabilities.checkout', 'is on, but no checkout block states the currency, the price field, the tax and the shipping');
        const priceField = spec.checkout?.price_field;
        const declaredNumberFields = (spec.fields ?? []).filter((field) => field?.type === 'number');
        const quantityField = declaredNumberFields[0];
        if (isString(priceField) && quantityField?.name === priceField) {
          // The builder binds the first number field as the quantity to accumulate, so naming that same
          // field as the price would charge the quantity as money. Refused rather than silently doubled.
          at('checkout.price_field', `names ${priceField}, which is the field the cart accumulates as a quantity`);
        } else if (isString(priceField) && priceField.trim() !== '' && !declaredNumberFields.some((field) => field.name === priceField)) {
          at('checkout.price_field', `names ${priceField}, which is not a number field this specification declares`);
        }
      }
    }
  }
  if (spec.seed_accounts !== undefined) {
    if (!Array.isArray(spec.seed_accounts)) at('seed_accounts', 'must be an array when present');
    else {
      for (const [index, account] of spec.seed_accounts.entries()) {
        const where = `seed_accounts[${index}]`;
        if (!isObject(account)) at(where, 'must be an object');
        else {
          for (const key of Object.keys(account)) if (!['email', 'password', 'display_name'].includes(key)) at(`${where}.${key}`, 'unknown key');
          if (!isString(account.email) || !account.email.includes('@')) at(`${where}.email`, 'must be an email address');
          if (!isString(account.password)) at(`${where}.password`, 'must be a non-empty string');
          if (account.display_name !== undefined && !isString(account.display_name)) at(`${where}.display_name`, 'must be a string when present');
        }
      }
    }
  }
  if (spec.seed_accounts !== undefined && spec.capabilities?.auth !== true) {
    at('seed_accounts', 'only meaningful with capabilities.auth - accounts need a login to be for');
  }
  // The pricing-tiers capability's data (mwg-train-4lk): the tiers, their monthly figures and the
  // annual policy. The annual prices and the saving are DERIVED from those, so a specification cannot
  // restate them and let the two columns drift ("computed rather than restated"), and the block is
  // refused unless the capability is on.
  if (spec.pricing_tiers !== undefined) {
    const pricing = spec.pricing_tiers;
    if (!isObject(pricing)) at('pricing_tiers', 'must be an object when present');
    else {
      for (const key of Object.keys(pricing)) {
        if (!['currency', 'annual_months', 'tiers'].includes(key)) at(`pricing_tiers.${key}`, 'unknown key');
      }
      if (!isString(pricing.currency) || pricing.currency.trim() === '') at('pricing_tiers.currency', 'must be a currency name or symbol');
      if (!Number.isInteger(pricing.annual_months) || pricing.annual_months < 10 || pricing.annual_months > 12) {
        at('pricing_tiers.annual_months', 'must be a whole number of months between 10 and 12');
      }
      if (!Array.isArray(pricing.tiers) || pricing.tiers.length < 3) {
        at('pricing_tiers.tiers', 'must list at least three tiers (lower, middle, upper)');
      } else {
        const names = new Set();
        let previous = null;
        for (const [index, tier] of pricing.tiers.entries()) {
          const where = `pricing_tiers.tiers[${index}]`;
          if (!isObject(tier)) {
            at(where, 'must be an object');
            continue;
          }
          for (const key of Object.keys(tier)) {
            if (!['name', 'monthly', 'features', 'recommended'].includes(key)) at(`${where}.${key}`, 'unknown key');
          }
          if (!isString(tier.name) || tier.name.trim() === '') at(`${where}.name`, 'must be a tier name');
          else if (names.has(tier.name)) at(`${where}.name`, 'is a duplicate tier name');
          else names.add(tier.name);
          if (typeof tier.monthly !== 'number' || !Number.isFinite(tier.monthly) || tier.monthly <= 0) {
            at(`${where}.monthly`, 'must be a positive monthly figure');
          } else {
            // Money is printed to two places, so a figure finer than a minor unit would print a monthly
            // price that the derived annual column does not match (9.999 shows as 10.00, not 9.999).
            if (Math.abs(tier.monthly * 100 - Math.round(tier.monthly * 100)) > 1e-6) {
              at(`${where}.monthly`, 'must be a whole number of minor units (at most two decimal places)');
            }
            if (previous !== null && tier.monthly <= previous) {
              at(`${where}.monthly`, `must be higher than the tier before it (${previous})`);
            } else {
              previous = tier.monthly;
            }
          }
          if (!Array.isArray(tier.features) || tier.features.length === 0 || tier.features.some((feature) => !isString(feature) || feature.trim() === '')) {
            at(`${where}.features`, 'must list at least one named feature');
          } else if (new Set(tier.features).size !== tier.features.length) {
            // The comparison table dedupes features, so a repeat inside one tier would render twice on
            // the card and once in the table - one specification, two answers.
            at(`${where}.features`, 'must not list the same feature twice');
          }
          if (tier.recommended !== undefined && typeof tier.recommended !== 'boolean') at(`${where}.recommended`, 'must be a boolean when present');
        }
        const recommended = pricing.tiers.filter((tier) => tier?.recommended === true).length;
        if (recommended !== 1) at('pricing_tiers.tiers', `must mark exactly one tier as recommended, not ${recommended}`);
        // "differ in more than price": the upper tier must include something the lower one does not, or
        // the comparison is a price list wearing three cards.
        const lower = pricing.tiers[0]?.features;
        const upper = pricing.tiers.at(-1)?.features;
        if (Array.isArray(lower) && Array.isArray(upper) && !upper.some((feature) => !lower.includes(feature))) {
          at('pricing_tiers.tiers', 'the upper tier must include at least one feature the lower tier does not');
        }
      }
    }
    if (spec.capabilities?.pricing_tiers !== true) {
      at('pricing_tiers', 'only meaningful with capabilities.pricing_tiers - there would be no page to render the tiers on');
    }
  }
  if (spec.checkout !== undefined) {
    const checkout = spec.checkout;
    if (!isObject(checkout)) at('checkout', 'must be an object when present');
    else {
      for (const key of Object.keys(checkout)) {
        if (!['currency', 'price_field', 'tax_rate_percent', 'shipping'].includes(key)) at(`checkout.${key}`, 'unknown key');
      }
      if (!isString(checkout.currency) || checkout.currency.trim() === '') at('checkout.currency', 'must be a currency name or symbol');
      if (!isString(checkout.price_field) || checkout.price_field.trim() === '') at('checkout.price_field', "must name the number field that carries a product's price");
      if (typeof checkout.tax_rate_percent !== 'number' || !Number.isFinite(checkout.tax_rate_percent) || checkout.tax_rate_percent < 0 || checkout.tax_rate_percent > 100) {
        at('checkout.tax_rate_percent', 'must be a percentage between 0 and 100');
      }
      if (!Array.isArray(checkout.shipping) || checkout.shipping.length === 0) {
        at('checkout.shipping', 'must list at least one shipping tier');
      } else {
        const shippingNames = new Set();
        for (const [index, tier] of checkout.shipping.entries()) {
          const where = `checkout.shipping[${index}]`;
          if (!isObject(tier)) {
            at(where, 'must be an object');
            continue;
          }
          for (const key of Object.keys(tier)) {
            if (!['name', 'price_minor'].includes(key)) at(`${where}.${key}`, 'unknown key');
          }
          if (!isString(tier.name) || tier.name.trim() === '') at(`${where}.name`, 'must be a shipping tier name');
          else if (shippingNames.has(tier.name)) at(`${where}.name`, 'is a duplicate shipping tier name');
          else shippingNames.add(tier.name);
          // Money is an integer number of minor units everywhere, so there is no fractional minor unit to
          // round and no float that can drift between what the page shows and what the receipt records.
          if (!Number.isInteger(tier.price_minor) || tier.price_minor < 0) at(`${where}.price_minor`, 'must be a whole number of minor units, zero or more');
        }
      }
    }
    if (spec.capabilities?.checkout !== true) at('checkout', 'only meaningful with capabilities.checkout - there would be no page to pay on');
  }
  if (spec.survey !== undefined) {
    const survey = spec.survey;
    if (!isObject(survey)) at('survey', 'must be an object when present');
    else {
      for (const key of Object.keys(survey)) {
        if (!['title', 'questions', 'bands'].includes(key)) at(`survey.${key}`, 'unknown key');
      }
      if (!isString(survey.title) || survey.title.trim() === '') at('survey.title', 'must be a title the page can show');
      // A condition may only look BACKWARDS at a question that was actually asked: one that depended on an
      // answer given later could never be reached, and a survey that depended on itself would never start.
      const conditionProblem = (when, where, askedBefore, allQuestions) => {
        for (const key of Object.keys(when)) {
          if (!['field', 'equals', 'in', 'at_most', 'at_least'].includes(key)) at(`${where}.${key}`, 'unknown key');
        }
        if (!isString(when.field) || when.field.trim() === '') {
          at(`${where}.field`, 'must name a question this survey asks');
        } else {
          const known = allQuestions.some((question) => question?.field === when.field);
          if (!known) at(`${where}.field`, `names ${when.field}, which this survey does not ask`);
          else if (askedBefore && !askedBefore.some((question) => question?.field === when.field)) {
            at(`${where}.field`, `names ${when.field}, which this survey only asks later, so the question could never be reached`);
          }
        }
        const operators = ['equals', 'in', 'at_most', 'at_least'].filter((key) => when[key] !== undefined);
        if (operators.length !== 1) at(where, 'must state exactly one of equals, in, at_most or at_least');
        if (when.in !== undefined && (!Array.isArray(when.in) || when.in.length === 0)) at(`${where}.in`, 'must list at least one answer');
        for (const key of ['at_most', 'at_least']) {
          if (when[key] !== undefined && (typeof when[key] !== 'number' || !Number.isFinite(when[key]))) at(`${where}.${key}`, 'must be a number');
        }
        const dependency = (spec.fields ?? []).find((entry) => entry?.name === when.field);
        if (dependency?.type === 'select') {
          const options = (dependency.options ?? []).map(String);
          if (when.equals !== undefined && !options.includes(String(when.equals))) {
            at(`${where}.equals`, `is not one of the options ${dependency.name} offers, so this could never be satisfied`);
          }
          if (Array.isArray(when.in) && when.in.some((value) => !options.includes(String(value)))) {
            at(`${where}.in`, `lists a value ${dependency.name} does not offer`);
          }
        }
        if ((when.at_most !== undefined || when.at_least !== undefined) && dependency !== undefined && dependency.type !== 'number') {
          at(where, `compares a number against ${dependency.name}, which is not a number field`);
        }
      };
      const questions = Array.isArray(survey.questions) ? survey.questions : [];
      if (!Array.isArray(survey.questions) || survey.questions.length === 0) {
        at('survey.questions', 'must list at least one question');
      } else {
        const asked = new Set();
        for (const [index, question] of survey.questions.entries()) {
          const where = `survey.questions[${index}]`;
          if (!isObject(question)) {
            at(where, 'must be an object');
            continue;
          }
          for (const key of Object.keys(question)) {
            if (!['field', 'when'].includes(key)) at(`${where}.${key}`, 'unknown key');
          }
          const field = (spec.fields ?? []).find((entry) => entry?.name === question.field);
          if (!isString(question.field) || question.field.trim() === '') at(`${where}.field`, 'must name a field this specification declares');
          else if (field === undefined) at(`${where}.field`, `names ${question.field}, which this specification does not declare`);
          else if (asked.has(question.field)) at(`${where}.field`, `asks ${question.field} twice`);
          else asked.add(question.field);
          if (question.when !== undefined) {
            if (!isObject(question.when)) at(`${where}.when`, 'must be an object when present');
            else conditionProblem(question.when, `${where}.when`, survey.questions.slice(0, index), survey.questions);
          }
        }
      }
      if (!Array.isArray(survey.bands) || survey.bands.length === 0) {
        at('survey.bands', 'must list at least one outcome band');
      } else {
        let unconditional = 0;
        for (const [index, band] of survey.bands.entries()) {
          const where = `survey.bands[${index}]`;
          if (!isObject(band)) {
            at(where, 'must be an object');
            continue;
          }
          for (const key of Object.keys(band)) {
            if (!['name', 'when'].includes(key)) at(`${where}.${key}`, 'unknown key');
          }
          if (!isString(band.name) || band.name.trim() === '') at(`${where}.name`, 'must name the outcome');
          if (band.when === undefined) {
            unconditional += 1;
            // A fallback band that is not last would make every band after it unreachable, so the visitor
            // would be told an outcome the survey's own declarations never reached.
            if (index !== survey.bands.length - 1) at(`${where}.when`, 'is missing, so every band after it could never be reached');
          } else if (isObject(band.when)) {
            conditionProblem(band.when, `${where}.when`, questions, questions);
          } else {
            at(`${where}.when`, 'must be an object when present');
          }
        }
        if (unconditional === 0) at('survey.bands', 'must end with one band that always matches, or a visitor could finish with no outcome at all');
      }
    }
    if (spec.capabilities?.survey !== true) at('survey', 'only meaningful with capabilities.survey - there would be no page to ask the questions on');
  }
  if (spec.game !== undefined) {
    const game = spec.game;
    if (!isObject(game)) at('game', 'must be an object when present');
    else {
      for (const key of Object.keys(game)) {
        if (!['label', 'width', 'height', 'tick_ms', 'target', 'lives'].includes(key)) at(`game.${key}`, 'unknown key');
      }
      if (!isString(game.label) || game.label.trim() === '') at('game.label', 'must name the game');
      // Every one of these is a bound on something that has to be playable: a field too small to see, a
      // tick so slow it is not a loop, a target of zero that ends the game before it starts, or no lives
      // to lose. The bounds are refused rather than clamped, so a specification cannot quietly disagree
      // with what it asked for (mwg-train-ypr).
      const bound = (name, value, low, high) => {
        if (!Number.isInteger(value) || value < low || value > high) at(`game.${name}`, `must be a whole number between ${low} and ${high}`);
      };
      bound('width', game.width, 120, 1200);
      bound('height', game.height, 120, 1200);
      bound('tick_ms', game.tick_ms, 16, 1000);
      bound('target', game.target, 1, 99);
      bound('lives', game.lives, 1, 9);
    }
    if (spec.capabilities?.game !== true) at('game', 'only meaningful with capabilities.game - there would be nothing to play on');
  }
  if (spec.capabilities?.game === true && spec.game === undefined) {
    at('capabilities.game', 'is on, but no game block states what the game is');
  }
  if (spec.capabilities?.pricing_tiers === true && spec.pricing_tiers === undefined) {
    at('capabilities.pricing_tiers', 'is on, but no pricing_tiers block states the tiers');
  }
  // A capability's own routes are emitted before the declared ones, so a specification that declares
  // the same path would leave a handler nothing ever reaches. Refused rather than silently shadowed
  // (mwg-train-4lk review).
  const capabilityOwnedRoutes = { cart: ['/cart', '/cart/add'], pricing_tiers: ['/pricing', '/pricing/select', '/pricing/:ref'], checkout: ['/checkout', '/checkout/pay', '/checkout/receipt/:ref'], survey: ['/survey', '/survey/answer', '/survey/review', '/survey/submit', '/survey/result/:ref'], game: ['/play', '/play/score', '/play/scores'] };
  for (const [capability, owned] of Object.entries(capabilityOwnedRoutes)) {
    if (spec.capabilities?.[capability] !== true) continue;
    for (const route of spec.routes ?? []) {
      const path = String(route?.path ?? '');
      // Matched by PREFIX as well as exactly: `/checkout/receipt/:id` shadows `/checkout/receipt/:ref`
      // just as surely as the same parameter name would, and the declared route would never be reached
      // (mwg-train-le6 review, P3).
      const shadows = owned.some((ownedPath) =>
        ownedPath.includes(':') ? path.startsWith(ownedPath.slice(0, ownedPath.indexOf(':'))) : path === ownedPath || path.startsWith(`${ownedPath}/`),
      );
      if (shadows) {
        at('routes', `${path} is the ${capability} capability's own route, which is served first, so declaring it as well would leave a route nothing reaches`);
      }
    }
  }
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
    ...(spec.capabilities === undefined ? {} : { capabilities: spec.capabilities }),
    ...(spec.pricing_tiers === undefined ? {} : { pricingTiers: spec.pricing_tiers }),
    // Carried under its own name: the spec key and the archetype key agree here (`checkout` is one word),
    // but the mapping is an explicit list, so a block that is not named here never reaches the builder.
    ...(spec.checkout === undefined ? {} : { checkout: spec.checkout }),
    ...(spec.survey === undefined ? {} : { survey: spec.survey }),
    // Named here for the same reason as the two above: a block that validates but is not named in this
    // list is dropped silently, and the capability would then build a dead page (mwg-train-4lk review).
    ...(spec.game === undefined ? {} : { game: spec.game }),
    ...(spec.seed_accounts === undefined ? {} : { seedAccounts: spec.seed_accounts }),
  };
}

/**
 * Rebuild a project from a specification alone.
 *
 * This reads no archetype table. That is the point: if `pilot/archetypes.mjs` were lost, this is the
 * path that still produces the project.
 */
export function buildProjectFromSpec({ spec, frameworkName, defects = [] }) {
  // A rebuild has to produce the same tree the generator produces, and the generator now gives a build
  // its archetype's asset set - so a rebuild that skipped the store would produce a differently
  // paletted page and the drift test would be measuring the store rather than the spec. The set is
  // loaded by the spec's own family id, and the store is a separate committed artefact from the
  // archetype table, so a machine that can read docs/eval/specs can still rebuild without
  // pilot/archetypes.mjs. An archetype with no set in the store (every training archetype) rebuilds
  // exactly as it did before, which is why this asks the store rather than assuming.
  const id = spec.family_id;
  const set = hasArchetypeSet(id) ? loadArchetypeSet(id) : null;
  return buildProjectFor(archetypeFromSpec(spec), { frameworkName, defects, set, purpose: 'build' });
}

/** The fields the server requires: required, and not a select (a select always has a value). */
export function requiredFieldNames(spec) {
  return spec.fields.filter((entry) => entry.required && entry.type !== 'select').map((entry) => entry.name);
}
