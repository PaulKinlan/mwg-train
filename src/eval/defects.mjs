/**
 * The repair-defect audit.
 *
 * A repair brief hands the model a defective starter and asks it to fix three named problems. For the
 * `R_repair` endpoint to mean anything, the starter must actually contain those three defects and no
 * others: a starter with a fourth, unnamed defect would make a repair run fail for a reason the brief
 * never named, and a starter whose named defect is absent would make it pass without the model doing
 * anything.
 *
 * So the check is not "does the prose appear in the code". It drives the starter the way a person
 * would - renders the pages, submits the form - and decides each defect from what the starter does.
 * The catalog below is the whole vocabulary a repair starter may draw on; a starter declares its
 * defects in `spec.json`, and the test asserts the audited set equals the declared set exactly.
 * "Present" and "only those" are therefore the same assertion.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { createRoutes, handle, openStore } from './site-kit.mjs';

/** Every defect class a repair starter may carry. A starter must carry a subset and nothing else. */
export const DEFECT_CLASSES = Object.freeze([
  'unlabelled-control',
  'click-only-control',
  'error-not-announced',
  'early-submit',
  'state-not-persisted',
  'invalid-value-accepted',
  'unkeyboardable-widget',
  'browser-only-totals',
]);

/** The manifest names each seeded defect in prose; this is the map from that prose to the class id. */
export const SEEDED_DEFECT_IDS = Object.freeze({
  'the registration form submits on Enter in any text field before the rest of the form is filled': 'early-submit',
  'error messages are shown only by turning the field border red, with nothing announced to screen readers': 'error-not-announced',
  'the confirmation page is rebuilt from an in-memory list and disappears on reload': 'state-not-persisted',
  'the totals are computed in the browser only and are lost or wrong after a reload because the data is not persisted': 'browser-only-totals',
  'amount inputs use a custom dropdown widget that cannot be operated by keyboard and has no label': 'unkeyboardable-widget',
  'submitting a negative or empty amount is silently accepted and corrupts the running total': 'invalid-value-accepted',
});

function labelsIn(html) {
  return new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/gi)].map((match) => match[1]));
}

function controlsIn(html) {
  return [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].map((match) => ({ tag: match[1].toLowerCase(), attrs: match[2] }));
}

/** A control with no programmatic label: no `for`-linked label and no aria labelling. */
export function hasUnlabelledControl(html) {
  const labelFor = labelsIn(html);
  for (const { attrs } of controlsIn(html)) {
    if (/type="hidden"/i.test(attrs)) continue;
    const id = /id="([^"]+)"/.exec(attrs)?.[1];
    const aria = /aria-label(ledby)?=/i.test(attrs);
    if (!aria && !(id && labelFor.has(id))) return true;
  }
  return false;
}

/** A control that is not a button but only responds to a pointer. */
export function hasClickOnlyControl(html) {
  for (const match of html.matchAll(/<(div|span)\b([^>]*)>/gi)) {
    const attrs = match[2];
    const isControl = /role="button"/i.test(attrs) || /onclick=/i.test(attrs);
    if (!isControl) continue;
    const keyboard = /tabindex=/i.test(attrs) || /onkeydown=/i.test(attrs) || /onkeyup=/i.test(attrs);
    if (!keyboard) return true;
  }
  return false;
}

/** A custom combobox that cannot be reached by keyboard. */
export function hasUnkeyboardableWidget(html) {
  for (const match of html.matchAll(/<(div|span)\b([^>]*)>/gi)) {
    const attrs = match[2];
    if (!/role="(combobox|listbox|menu)"/i.test(attrs)) continue;
    if (!/tabindex=/i.test(attrs) && !/onkeydown=/i.test(attrs)) return true;
  }
  return false;
}

function url(pathName) {
  return pathName.replace(/:([A-Za-z0-9_]+)/g, '$1');
}

/** A total element that is empty server-side and filled in by a script: the value does not survive a reload. */
export function pagesHaveClientTotal(html) {
  return /id="[^"]*-total"><\/p><script>/i.test(html);
}

function concretePath(pageSpec, spec) {
  const items = spec.seed?.[pageSpec.collection];
  const id = Array.isArray(items) && items.length ? items[0].id : '1';
  return pageSpec.path.replace(/:([A-Za-z0-9_]+)/g, id);
}

function valueFor(fieldSpec, { invalid = false } = {}) {
  if (invalid && fieldSpec.min !== undefined) return String(Number(fieldSpec.min) - 1);
  if (fieldSpec.type === 'email') return 'runner@example.test';
  if (fieldSpec.type === 'number') return fieldSpec.min !== undefined ? String(fieldSpec.min + 10) : '10';
  return 'Test value';
}

function collectionSize(storeFile, collection) {
  if (!existsSync(storeFile)) return 0;
  try {
    return (JSON.parse(readFileSync(storeFile, 'utf8'))[collection] ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * Drive the starter and return the set of defect classes it actually exhibits.
 * `storeFile` must be a path the caller owns and can start empty; the audit writes to it.
 */
export async function auditProject(spec, { storeFile }) {
  const routes = createRoutes(spec, openStore(storeFile, spec.seed ?? {}));
  const present = new Set();

  const getPages = {};
  for (const pageSpec of spec.pages ?? []) {
    if (pageSpec.kind === 'form') {
      getPages[pageSpec.path] = (await handle(routes, { method: 'GET', path: pageSpec.path })).body;
    } else {
      getPages[pageSpec.path] = (await handle(routes, { method: 'GET', path: concretePath(pageSpec, spec) })).body;
    }
  }
  const allHtml = Object.values(getPages).join('\n');
  if (hasUnlabelledControl(allHtml)) present.add('unlabelled-control');
  if (hasClickOnlyControl(allHtml)) present.add('click-only-control');
  if (hasUnkeyboardableWidget(allHtml)) present.add('unkeyboardable-widget');
  if (spec.pages?.some((pageSpec) => pageSpec.total && pagesHaveClientTotal(getPages[pageSpec.path] ?? ''))) present.add('browser-only-totals');

  const formSpec = (spec.pages ?? []).find((pageSpec) => pageSpec.kind === 'form');
  if (formSpec) {
    const required = (formSpec.fields ?? []).filter((fieldSpec) => fieldSpec.required);
    const action = formSpec.action ?? formSpec.path;
    const encode = (pairs) => new URLSearchParams(pairs).toString();
    const valid = Object.fromEntries((formSpec.fields ?? []).map((fieldSpec) => [fieldSpec.name, valueFor(fieldSpec)]));

    const beforeValid = collectionSize(storeFile, formSpec.collection);
    await handle(routes, { method: 'POST', path: action, body: encode(Object.entries(valid)) });
    const afterValid = collectionSize(storeFile, formSpec.collection);
    if (afterValid <= beforeValid) present.add('state-not-persisted');

    // Early submission only means something when there is more than one required field: with a single
    // required field, submitting it is a complete submission, not an early one.
    if (required.length >= 2) {
      const partial = { [required[0].name]: valueFor(required[0]) };
      const partialResponse = await handle(routes, { method: 'POST', path: action, body: encode(Object.entries(partial)) });
      if (partialResponse.status >= 300 && partialResponse.status < 400) present.add('early-submit');
    }

    const invalid = { ...valid };
    const numberField = (formSpec.fields ?? []).find((fieldSpec) => fieldSpec.min !== undefined);
    const emailField = (formSpec.fields ?? []).find((fieldSpec) => fieldSpec.type === 'email');
    if (numberField) invalid[numberField.name] = valueFor(numberField, { invalid: true });
    else if (emailField) invalid[emailField.name] = 'not-an-email';
    else if (required.length > 0) delete invalid[required[0].name];
    const beforeInvalid = collectionSize(storeFile, formSpec.collection);
    const invalidResponse = await handle(routes, { method: 'POST', path: action, body: encode(Object.entries(invalid)) });
    const invalidAccepted = invalidResponse.status >= 300 && invalidResponse.status < 400;
    if (invalidAccepted) present.add('invalid-value-accepted');
    else if (invalidResponse.status === 200) {
      const announced = /role="alert"|aria-live=/i.test(invalidResponse.body);
      if (!announced) present.add('error-not-announced');
    }
  }

  return [...present].sort();
}
