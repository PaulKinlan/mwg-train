/**
 * The brief-schema validator is the only thing standing between a brief and a project
 * whose form does not match the brief it claims to implement, so these tests are mostly
 * about what it REFUSES: a journey that types into a field the brief never declares, a
 * select where the echoed field has to be, and an echoed value the read page can never
 * show back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRIEF_FIELD_TYPES,
  builderFields,
  completeSelectorFieldName,
  hasUnpairedSurrogate,
  UNSAFE_FIELD_NAME,
  echoFieldFor,
  selectorFieldName,
  serverRequiredFieldNames,
  validateBriefSchema,
} from '../src/train/brief-schema.mjs';

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

test('a select is driven with its own key, and cannot be the echoed field', () => {
  // Selects are legal controls; what must not happen is the harness trying to read the record back
  // through one, because the journey cannot type into it. They also need `journey.select` rather
  // than `fill`, so a required select driven here is what makes the schema valid.
  const fields = [
    { slug: 'pew', name: 'pew', type: 'select', label: 'Pew', required: true, options: ['left', 'right'] },
    { slug: 'attendee', name: 'attendee', type: 'text', label: 'Name', required: true },
  ];
  const row = brief({
    fields,
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name=attendee]': 'Ada' },
      select: { 'select[name=pew]': 'right' },
      expectText: 'Ada',
    },
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

// A `<select>` cannot be typed into, so leaving one alone leaves it on its first option and the value
// that reaches the server is the markup's, not the brief's. These are the rules that make the corpus
// able to say the journey drives the select rather than that the control renders.
const withSelect = (journey, { required = true } = {}) => ({
  brief_id: 'tr-99-v1',
  fields: [
    { slug: 'customer', name: 'customer', type: 'text', label: 'Name', required: true, echoed: true },
    { slug: 'grind', name: 'grind', type: 'select', label: 'Grind', required, options: ['Whole bean', 'Espresso', 'Filter'] },
  ],
  journey,
});

test('a journey that drives a required select with a non-default option validates', () => {
  const row = withSelect({
    startPath: '/',
    formSelector: 'form#f',
    fill: { 'input[name=customer]': 'Ada' },
    select: { 'select[name=grind]': 'Espresso' },
    expectText: 'Ada',
  });
  assert.deepEqual(validateBriefSchema(row), []);
});

test('a required select the journey never drives is refused', () => {
  const row = withSelect({ startPath: '/', formSelector: 'form#f', fill: { 'input[name=customer]': 'Ada' }, expectText: 'Ada' });
  assert.ok(
    problems(row).some((p) => /does not choose 'grind', which its own fields mark required/.test(p)),
    problems(row).join('\n'),
  );
});

test('choosing the first option is refused: an untouched select already submits it', () => {
  const row = withSelect({
    startPath: '/',
    formSelector: 'form#f',
    fill: { 'input[name=customer]': 'Ada' },
    select: { 'select[name=grind]': 'Whole bean' },
    expectText: 'Ada',
  });
  assert.ok(problems(row).some((p) => /which is what an untouched select already submits/.test(p)), problems(row).join('\n'));
});

test('an option the field does not offer is refused', () => {
  const row = withSelect({
    startPath: '/',
    formSelector: 'form#f',
    fill: { 'input[name=customer]': 'Ada' },
    select: { 'select[name=grind]': 'Turkish' },
    expectText: 'Ada',
  });
  assert.ok(problems(row).some((p) => /is not one of \["Whole bean","Espresso","Filter"\]/.test(p)), problems(row).join('\n'));
});

test('a select instruction that addresses a non-select field is refused', () => {
  const row = withSelect({
    startPath: '/',
    formSelector: 'form#f',
    fill: { 'input[name=customer]': 'Ada' },
    select: { 'input[name=customer]': 'Ada' },
    expectText: 'Ada',
  });
  assert.ok(problems(row).some((p) => /does not address a select this brief declares/.test(p)), problems(row).join('\n'));
});

test('an optional select may be left alone', () => {
  const row = withSelect({ startPath: '/', formSelector: 'form#f', fill: { 'input[name=customer]': 'Ada' }, expectText: 'Ada' }, { required: false });
  assert.deepEqual(validateBriefSchema(row), []);
});

// A flow that spans more than one page visits earlier pages before the form page. These steps are
// validated like the main page, so a step cannot quietly exercise a control the brief never declared.
const withSteps = (steps) => ({
  brief_id: 'tr-98-v1',
  fields: [
    { slug: 'ground', name: 'ground', type: 'text', label: 'Ground', required: true, echoed: true },
    { slug: 'roast', name: 'roast', type: 'select', label: 'Roast', required: true, options: ['Light', 'Medium'] },
  ],
  journey: {
    startPath: '/results',
    formSelector: 'form#pick',
    fill: { 'input[name=ground]': 'filter' },
    select: { 'select[name=roast]': 'Medium' },
    expectText: 'filter',
    steps,
  },
});

test('a journey may visit an earlier page before the form page', () => {
  const row = withSteps([{ path: '/search', fill: { 'input[name=ground]': 'kaffe' }, submit: 'form#s' }]);
  assert.deepEqual(validateBriefSchema(row), []);
});

test('a step that types into a field the brief does not declare is refused', () => {
  const row = withSteps([{ path: '/search', fill: { 'input[name=budget]': '10' } }]);
  assert.ok(problems(row).some((p) => /types into 'budget', which this brief does not declare/.test(p)), problems(row).join('\n'));
});

test('a step must name an absolute path', () => {
  const row = withSteps([{ path: 'search' }]);
  assert.ok(problems(row).some((p) => /must be an absolute path starting with \//.test(p)), problems(row).join('\n'));
});

test('a step may not carry a property the format does not define', () => {
  const row = withSteps([{ path: '/search', click: 'form#s' }]);
  assert.ok(problems(row).some((p) => /journey\.steps\[0\]\.click is not a step property this format defines/.test(p)), problems(row).join('\n'));
});

test('a step select must choose an option the field offers', () => {
  const row = withSteps([{ path: '/search', select: { 'select[name=roast]': 'Burnt' } }]);
  assert.ok(problems(row).some((p) => /option 'Burnt' is not one of \["Light","Medium"\]/.test(p)), problems(row).join('\n'));
});

test('steps must be an array, not a single object', () => {
  const row = withSteps({ path: '/search' });
  assert.ok(problems(row).some((p) => /journey\.steps must be an array of steps/.test(p)), problems(row).join('\n'));
});

// The reviewer's counterexample: validation read the field name out of the FIRST `[name=...]` in the
// selector, while the browser resolves the whole string with `querySelector`. A compound selector can
// therefore name one field to this check and drive another, which would let a required select be left
// on its default while the schema reported it as driven.
test('a compound selector cannot stand in for a required select', () => {
  const row = brief({
    fields: [
      { slug: 'grind', name: 'grind', type: 'select', label: 'Grind', required: true, options: ['A', 'B'] },
      { slug: 'other', name: 'other', type: 'select', label: 'Other', required: false, options: ['A', 'B'] },
      { slug: 'c', name: 'c', type: 'text', label: 'C', required: true, echoed: true },
    ],
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name=c]': 'x' },
      select: { 'select[name=grind]:not(*), select[name=other]': 'B' },
      expectText: 'x',
    },
  });
  const found = problems(row);
  assert.ok(found.some((p) => /does not address a select this brief declares/.test(p)), found.join('\n'));
  assert.ok(found.some((p) => /does not choose 'grind'/.test(p)), found.join('\n'));
  assert.equal(completeSelectorFieldName('select[name=grind]:not(*), select[name=other]'), null);
});

test('a compound fill selector is refused for the same reason', () => {
  const row = brief({
    fields: [
      { slug: 'a', name: 'a', type: 'text', label: 'A', required: true, echoed: true },
      { slug: 'b', name: 'b', type: 'text', label: 'B', required: true },
    ],
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name=a], input[name=b]': 'x' },
      expectText: 'x',
    },
  });
  assert.ok(problems(row).some((p) => /must be one complete selector/.test(p)), problems(row).join('\n'));
});

test('complete selectors still pass, in every quote style', () => {
  assert.equal(completeSelectorFieldName('input[name=customer]'), 'customer');
  assert.equal(completeSelectorFieldName('select[name="grind"]'), 'grind');
  assert.equal(completeSelectorFieldName("textarea[name='notes']"), 'notes');
  assert.equal(completeSelectorFieldName('input[name=a][type=text]'), null);
  assert.equal(completeSelectorFieldName('form input[name=a]'), null);
});

// A name outside the unquoted charset is legitimate HTML and `field.name` accepts any non-empty
// string, so the selector rule must be able to reach it rather than rejecting the brief. Quoting is
// how: `input[name="contact.email"]` addresses that field exactly, with nothing ambiguous about it.
test('a name outside the unquoted charset is reachable by quoting it', () => {
  assert.equal(completeSelectorFieldName('input[name="contact.email"]'), 'contact.email');
  assert.equal(completeSelectorFieldName("input[name='a b']"), 'a b');
  const row = brief({
    fields: [
      { slug: 'contact-email', name: 'contact.email', type: 'text', label: 'Email', required: true, echoed: true },
    ],
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name="contact.email"]': 'ada@example.test' },
      expectText: 'ada@example.test',
    },
  });
  assert.deepEqual(validateBriefSchema(row), []);
});

// CSS escapes make the validator and the browser disagree about which field a selector names: this
// rule reports the literal characters it sees, while `querySelector` resolves `\67 rind` to `grind`.
// A required select could therefore count as driven while the page left it on its first option, which
// is exactly the hole the complete-selector rule exists to close - so escapes are refused outright.
test('a CSS escape cannot stand in for a required select', () => {
  assert.equal(completeSelectorFieldName('select[name="\\67 rind"]'), null);
  assert.equal(completeSelectorFieldName('input[name=\\67rind]'), null);
  const row = brief({
    fields: [
      { slug: 'esc', name: '\\67 rind', type: 'select', label: 'Esc', required: true, options: ['A', 'B'] },
      { slug: 'grind', name: 'grind', type: 'select', label: 'Grind', required: false, options: ['A', 'B'] },
      { slug: 'c', name: 'c', type: 'text', label: 'C', required: true, echoed: true },
    ],
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name=c]': 'x' },
      select: { 'select[name="\\67 rind"]': 'B' },
      expectText: 'x',
    },
  });
  assert.ok(problems(row).some((p) => /does not address a select this brief declares/.test(p)), problems(row).join('\n'));
  assert.ok(problems(row).some((p) => /does not choose '\\67 rind'/.test(p)), problems(row).join('\n'));
});

// A field may legitimately be named with an apostrophe, and its selector is then double-quoted; the
// rule must allow the opposite quote inside a quoted value rather than refusing a usable selector.
test('a name containing the opposite quote is reachable', () => {
  assert.equal(completeSelectorFieldName('input[name="o\'brien"]'), 'o\'brien');
  assert.equal(completeSelectorFieldName('input[name=\'a "b\']'), 'a "b');
  const row = brief({
    fields: [{ slug: 'who', name: "o'brien", type: 'text', label: 'Who', required: true, echoed: true }],
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name="o\'brien"]': 'ada' },
      expectText: 'ada',
    },
  });
  assert.deepEqual(validateBriefSchema(row), []);
});

test('whitespace around the operator is insignificant, and a raw newline is not', () => {
  assert.equal(completeSelectorFieldName('input[name = customer]'), 'customer');
  assert.equal(completeSelectorFieldName('input[ name = customer ]'), 'customer');
  // Measured in Chrome: all three of those forms match, and an upper-case tag name matches too,
  // because HTML tag names are case-insensitive. The name a selector resolves to is unchanged by
  // either, so accepting them cannot make reading and driving disagree.
  assert.equal(completeSelectorFieldName('INPUT[name=customer]'), 'customer');
  assert.equal(completeSelectorFieldName('Select[name=grind]'), 'grind');
  assert.equal(completeSelectorFieldName('input[name="a\nb"]'), null);
  assert.equal(completeSelectorFieldName('input[name=1x]'), null, 'an unquoted value must be a valid CSS identifier');
});

// The builders interpolate `name="${field.name}"` into the form RAW, so the HTML parser reinterprets
// anything entity-like: a field named `a&#32;b` reaches the DOM as `a b`, and a selector quoting either
// literal name matches the OTHER field - measured in Chrome, which is how a required select could be
// left on its default while validation counted it driven.
test('a field name the HTML parser would rewrite is refused', () => {
  const unsafe = ['a&#32;b', 'a&amp;b', 'a&copy', 'a"b', 'a\\b', 'a\nb', 'a\u0000b', 'a\u000Cb', '\uD800', 'a\uDC00b'];
  for (const name of unsafe) {
    // Two mechanisms refuse a name: the character set, and the unpaired-surrogate check.
    assert.ok(
      UNSAFE_FIELD_NAME.test(name) || hasUnpairedSurrogate(name),
      `expected '${name}' to be refused`,
    );
    const row = brief({
      fields: [
        { slug: 'bad', name, type: 'text', label: 'Bad', required: true, echoed: true },
        { slug: 'ok', name: 'ok', type: 'text', label: 'Ok', required: true },
      ],
      journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name=ok]': 'x' }, expectText: 'x' },
    });
    assert.ok(
      problems(row).some((p) => /cannot be written into the form and read back unchanged/.test(p)),
      `expected '${name}' to be refused by the validator`,
    );
  }
});

// The rule is deliberately no broader than the measurement: in the same Chrome probe these names all
// reached the DOM unchanged AND matched a quoted selector, so refusing them would reject usable briefs.
test('an unpaired surrogate is detected and a valid pair is not', () => {
  assert.equal(hasUnpairedSurrogate('\uD800'), true, 'a lone high surrogate');
  assert.equal(hasUnpairedSurrogate('a\uDC00b'), true, 'a lone low surrogate');
  assert.equal(hasUnpairedSurrogate('\u{1F600}'), false, 'a valid pair is one code point above the range');
  assert.equal(hasUnpairedSurrogate('a\u{10000}b'), false);
  assert.equal(hasUnpairedSurrogate('customer'), false);
});

test('names Chrome round-trips unchanged are allowed', () => {
  for (const name of ['customer', 'contact.email', "o'brien", 'a b', 'a<b', 'a=b', 'a$b', 'line-item', 'field1', 'a\tb', 'a\u007Fb', '\uFFFD', 'a\u00A0b', 'a\u2028b', '\u{1F600}', 'a\u{10000}b']) {
    assert.equal(UNSAFE_FIELD_NAME.test(name) || hasUnpairedSurrogate(name), false, `${name} should be allowed`);
  }
  const row = brief({
    fields: [
      { slug: 'who', name: "o'brien", type: 'text', label: 'Who', required: true, echoed: true },
      { slug: 'note', name: 'a b', type: 'text', label: 'Note', required: true },
    ],
    journey: {
      startPath: '/',
      formSelector: 'form#f',
      fill: { 'input[name="o\'brien"]': 'ada', 'input[name="a b"]': 'x' },
      expectText: 'ada',
    },
  });
  assert.deepEqual(validateBriefSchema(row), []);
});


// An unquoted attribute value must be a valid CSS identifier. Measured in Chrome: `[name=-foo]` and
// `[name=--foo]` parse, while `[name=-1]` and `[name=-]` throw a SyntaxError, because a hyphen
// followed by a digit or by nothing does not start an identifier. The rule accepted both before, so a
// brief could write a selector the browser cannot parse - the same class of bug as the CSS escape,
// caught one shape later. Quoting reaches every one of these names, so nothing became unaddressable.
test('an unquoted name must be a valid CSS identifier', () => {
  assert.equal(completeSelectorFieldName('input[name=-1]'), null, 'a hyphen then a digit is not an identifier');
  assert.equal(completeSelectorFieldName('input[name=-]'), null, 'a lone hyphen is not an identifier');
  assert.equal(completeSelectorFieldName('input[name=1x]'), null);
  for (const ident of ['-foo', '--foo', '-a-', 'x-', 'a--b', '_x', 'x1', 'customer']) {
    assert.equal(completeSelectorFieldName(`input[name=${ident}]`), ident, `${ident} is a valid identifier`);
  }
  // The quoted form still reaches a name the unquoted form cannot express.
  assert.equal(completeSelectorFieldName('input[name="-1"]'), '-1');
  const row = brief({
    fields: [{ slug: 'minus', name: '-1', type: 'text', label: 'Minus', required: true, echoed: true }],
    journey: { startPath: '/', formSelector: 'form#f', fill: { 'input[name="-1"]': 'x' }, expectText: 'x' },
  });
  assert.deepEqual(validateBriefSchema(row), [], 'a legitimate -1 field is addressable when quoted');
});
