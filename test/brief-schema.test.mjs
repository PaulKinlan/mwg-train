/**
 * The brief-schema validator is the only thing standing between a brief and a project
 * whose form does not match the brief it claims to implement, so these tests are mostly
 * about what it REFUSES: a journey that types into a field the brief never declares, a
 * select where the echoed field has to be, and an echoed value the read page can never
 * show back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BRIEF_FIELD_TYPES, builderFields, echoFieldFor, selectorFieldName, serverRequiredFieldNames, validateBriefSchema } from '../src/train/brief-schema.mjs';

/** A valid brief schema, with a `journey.fill` that types into its echoed field. */
function brief(overrides = {}) {
  const fields = overrides.fields ?? [
    { slug: 'customer', name: 'customer', type: 'text', label: 'Full name', required: true, echoed: true },
    { slug: 'phone', name: 'phone', type: 'tel', label: 'Phone', required: true },
  ];
  return {
    brief_id: 'tr-99-v1',
    fields,
    journey: overrides.journey ?? {
      startPath: '/',
      formSelector: 'form#booking-form',
      fill: { 'input[name=customer]': 'Ada Lovelace', 'input[name=phone]': '+44 7700 900123' },
      expectText: 'Ada Lovelace',
    },
  };
}

const problems = (row) => validateBriefSchema(row).map((finding) => `${finding.at} ${finding.problem}`);

test('a brief that declares its own form and journey validates', () => {
  assert.deepEqual(validateBriefSchema(brief()), []);
});

test('a brief with no fields is refused rather than scaffolded from the archetype', () => {
  const row = brief();
  delete row.fields;
  assert.match(problems(row).join('\n'), /fields must be a non-empty array/);
});

test('a journey that types into an undeclared field is refused', () => {
  const row = brief({ journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=member]': 'x' }, expectText: 'x' } });
  const found = problems(row);
  assert.ok(found.some((p) => /types into 'member', which this brief does not declare/.test(p)), found.join('\n'));
});

test('a select in fill is not itself an error, but it cannot be the echoed field', () => {
  // Selects are legal controls; what must not happen is the harness trying to read the
  // record back through one, because the journey cannot type into it.
  const fields = [
    { slug: 'pew', name: 'pew', type: 'select', label: 'Pew', required: true, options: ['left', 'right'] },
    { slug: 'attendee', name: 'attendee', type: 'text', label: 'Name', required: true },
  ];
  const row = brief({
    fields,
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=attendee]': 'Ada' }, expectText: 'Ada' },
  });
  assert.deepEqual(validateBriefSchema(row), []);
  assert.equal(echoFieldFor(fields), 'attendee', 'the echoed field must fall to the text field, not the select');
});

test('a family whose only fields are selects is refused: nothing can echo the record back', () => {
  const fields = [{ slug: 'pew', name: 'pew', type: 'select', label: 'Pew', required: true, options: ['left', 'right'] }];
  const row = brief({ fields, journey: { startPath: '/', formSelector: 'form#f', fill: {}, expectText: 'x' } });
  assert.ok(problems(row).some((p) => /no field can echo the record back/.test(p)), problems(row).join('\n'));
});

test('expectText must be the value typed into the echoed field, or the read page cannot show it', () => {
  const row = brief({
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name=customer]': 'Ada Lovelace', 'input[name=phone]': '+44 7700 900123' },
      expectText: 'Something else',
    },
  });
  assert.ok(problems(row).some((p) => /must be the value typed into the echoed field/.test(p)), problems(row).join('\n'));
});

test('a journey that never types into the echoed field is refused', () => {
  const row = brief({
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=phone]': '+44 7700 900123' }, expectText: '+44 7700 900123' },
  });
  assert.ok(problems(row).some((p) => /must type into the echoed field/.test(p)), problems(row).join('\n'));
});

test('a field type with no renderer is refused', () => {
  const row = brief({
    fields: [{ slug: 'x', name: 'x', type: 'colour', label: 'X', required: true, echoed: true }],
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=x]': 'v' }, expectText: 'v' },
  });
  assert.ok(problems(row).some((p) => /has no renderer/.test(p)), problems(row).join('\n'));
});

test('required must be stated, not implied by absence', () => {
  const row = brief({ fields: [{ slug: 'x', name: 'x', type: 'text', label: 'X' }] });
  assert.ok(problems(row).some((p) => /required must be true or false/.test(p)), problems(row).join('\n'));
});

test('a select needs at least two options; options elsewhere are refused', () => {
  const row = brief({
    fields: [
      { slug: 'one', name: 'one', type: 'select', label: 'One', required: true, options: ['only'] },
      { slug: 'x', name: 'x', type: 'text', label: 'X', required: true, options: ['nope'], echoed: true },
    ],
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=x]': 'v' }, expectText: 'v' },
  });
  const found = problems(row);
  assert.ok(found.some((p) => /at least two options/.test(p)), found.join('\n'));
  assert.ok(found.some((p) => /options are only meaningful on a select/.test(p)), found.join('\n'));
});

test('the form selector must be the form#id the builder derives the form id from', () => {
  const row = brief({ journey: { startPath: '/', formSelector: '.my-form', fill: { 'input[name=customer]': 'a' }, expectText: 'a' } });
  assert.ok(problems(row).some((p) => /form#<id>/.test(p)), problems(row).join('\n'));
});

test('an unknown journey property is refused rather than silently ignored', () => {
  const row = brief({ journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=customer]': 'a' }, expectText: 'a', submit: true } });
  assert.ok(problems(row).some((p) => /journey.submit is not a journey property/.test(p)), problems(row).join('\n'));
});

test('the field vocabulary matches what the builders can render', () => {
  for (const type of ['text', 'tel', 'email', 'date', 'time', 'number', 'select', 'search', 'textarea', 'password']) {
    assert.ok(BRIEF_FIELD_TYPES.has(type), `${type} should be renderable`);
  }
});

test('selector field names are read from every selector quote style', () => {
  assert.equal(selectorFieldName('input[name=email]'), 'email');
  assert.equal(selectorFieldName('input[name="email"]'), 'email');
  assert.equal(selectorFieldName("textarea[name='notes']"), 'notes');
  assert.equal(selectorFieldName('form#f'), null);
});

// The builders' servers read `optional`, not `required`, and a brief that is passed through
// unchanged therefore makes every non-select field server-required. tr-27 was rejected
// `original-not-runnable` for exactly this: its brief marked `phone` optional, its form agreed,
// and its server demanded the field anyway.
test('builderFields states optional from required, so the server agrees with the brief', () => {
  const fields = [
    { slug: 'attendee', name: 'attendee', type: 'text', label: 'Name', required: true },
    { slug: 'phone', name: 'phone', type: 'tel', label: 'Phone', required: false },
    { slug: 'pew', name: 'pew', type: 'select', label: 'Pew', required: true, options: ['a', 'b'] },
  ];
  const built = builderFields(fields);
  assert.equal(built[0].optional, false, 'a required field must not be optional');
  assert.equal(built[1].optional, true, 'a non-required field must be optional');
  // The builders decide requiredness from `optional` alone, so `required` must not be the only
  // thing set: a server reading the un-derived fields would demand every non-select field.
  assert.deepEqual(serverRequiredFieldNames(fields), ['attendee']);
});

test('a select is never server-required: it always submits a value', () => {
  const fields = [{ slug: 'pew', name: 'pew', type: 'select', label: 'Pew', required: true, options: ['a', 'b'] }];
  assert.deepEqual(serverRequiredFieldNames(fields), []);
});

test('a journey that omits a required field is refused before any browser runs', () => {
  const row = brief({
    fields: [
      { slug: 'attendee', name: 'attendee', type: 'text', label: 'Name', required: true, echoed: true },
      { slug: 'phone', name: 'phone', type: 'tel', label: 'Phone', required: true },
    ],
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=attendee]': 'Ada' }, expectText: 'Ada' },
  });
  assert.ok(
    problems(row).some((p) => /does not fill 'phone', which its own fields mark required/.test(p)),
    problems(row).join('\n'),
  );
});

test('a journey may omit a field the brief marks optional', () => {
  const row = brief({
    fields: [
      { slug: 'attendee', name: 'attendee', type: 'text', label: 'Name', required: true, echoed: true },
      { slug: 'phone', name: 'phone', type: 'tel', label: 'Phone', required: false },
    ],
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=attendee]': 'Ada' }, expectText: 'Ada' },
  });
  assert.deepEqual(validateBriefSchema(row), []);
});

test('a field that states required and optional contradictorily is refused', () => {
  const row = brief({
    fields: [{ slug: 'x', name: 'x', type: 'text', label: 'X', required: true, optional: true, echoed: true }],
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=x]': 'v' }, expectText: 'v' },
  });
  assert.ok(problems(row).some((p) => /contradicts required:true/.test(p)), problems(row).join('\n'));
});
