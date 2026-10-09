import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLAN_SECTIONS, checkPlanDocument } from '../src/design/contract.mjs';

// The plan contract is entirely derived from the archetype's spec, so every negative case here is a way of
// disagreeing with that spec - which is the only way a plan.md can be wrong.

const SPEC = {
  family_id: 'booking',
  story: 'A training centre takes bookings and shows the booking back to the student.',
  state: { engine: 'sqlite' },
  persistence: { write_route: '/book', read_route: '/booking/:ref' },
  routes: [
    { method: 'GET', path: '/', kind: 'page', effect: 'render the booking form' },
    { method: 'POST', path: '/book', kind: 'write', effect: 'store the booking and redirect' },
  ],
  fields: [{ slug: 'name' }, { slug: 'notes' }],
  validation: {
    required_fields: ['name', 'notes'],
    on_missing: 'the server refuses the submission and re-renders the form; nothing is stored',
    on_success: 'insert one row into records and answer 303',
  },
  journey: {
    startPath: '/',
    formSelector: 'form#booking-form',
    fill: { 'input[name=name]': 'Ada Lovelace', 'textarea[name=notes]': 'Window seat please' },
    expectText: 'Ada Lovelace',
  },
  acceptance: [
    'after a successful submit the browser lands on /booking/<ref> and the echoed notes text is present',
    'reloading that URL still shows it, which is only possible if the server stored it',
  ],
};

const FRONTMATTER = '---\narchetype: booking\nspec: docs/eval/specs/booking.json\n---\n\n';

const SECTIONS = {
  'Use case': 'A training centre takes bookings. Fields: `name`, `notes`.',
  'Routes and effects':
    '- `GET /` - render the booking form\n- `POST /book` - store the booking and redirect',
  'Data and state': 'Engine `sqlite`. Write route `/book`, read route `/booking/:ref`.',
  Journey:
    'Starts at `/`, fills `form#booking-form` including `input[name=name]` and `textarea[name=notes]`, '
    + 'and asserts on `Ada Lovelace`.',
  'Validation and states':
    'Required: `name`, `notes`. On missing: the server refuses the submission and re-renders the form; '
    + 'nothing is stored. On success: insert one row into records and answer 303.',
  'Acceptance criteria':
    '- after a successful submit the browser lands on /booking/<ref> and the echoed notes text is present\n'
    + '- reloading that URL still shows it, which is only possible if the server stored it',
  'Implementation status': 'All routes exist; loading is declared only.',
  Provenance: 'Bound to `docs/eval/specs/booking.json`.',
};

function doc(overrides = {}) {
  const sections = { ...SECTIONS, ...overrides };
  const headings = overrides.__sections ?? PLAN_SECTIONS;
  delete overrides.__sections;
  return FRONTMATTER + '# Booking \u2014 functional specification\n\n'
    + headings.map((heading) => `## ${heading}\n\n${sections[heading] ?? 'Body.'}\n`).join('\n');
}

const check = (text, over = {}) =>
  checkPlanDocument({ name: 'booking/plan.md', text, spec: { ...SPEC, ...over }, specPath: 'docs/eval/specs/booking.json' });
const problems = (text, over) => check(text, over).map((f) => `${f.at}: ${f.problem}`).join(' | ');

test('a plan that agrees with its spec produces no findings', () => {
  assert.deepEqual(check(doc()), []);
});

test('the route check runs in both directions', () => {
  // An omitted route is a finding, because the spec defines it and the plan does not describe it.
  assert.match(
    problems(doc({ 'Routes and effects': '- `GET /` - render the booking form' })),
    /does not name 'POST \/book'/,
  );
  // An invented route is a finding, because the family does not serve it.
  assert.match(
    problems(doc({ 'Routes and effects': SECTIONS['Routes and effects'] + '\n- `GET /admin` - manage bookings' })),
    /claims 'GET \/admin' which docs\/eval\/specs\/booking.json does not define/,
  );
});

test('naming a route without stating its effect is a finding', () => {
  assert.match(
    problems(doc({ 'Routes and effects': '- `GET /`\n- `POST /book`' })),
    /does not state the spec's effect for 'GET \/'/,
  );
});

test('the storage engine and both routes that touch it are checked against the spec', () => {
  assert.match(problems(doc({ 'Data and state': 'Write route `/book`, read route `/booking/:ref`.' })), /storage engine 'sqlite'/);
  assert.match(problems(doc({ 'Data and state': 'Engine `sqlite`. Read route `/booking/:ref`.' })), /write_route '\/book'/);
  assert.match(problems(doc({ 'Data and state': 'Engine `sqlite`. Write route `/book`.' })), /read_route '\/booking\/:ref'/);
});

test('every part of the journey the harness drives is checked against the spec', () => {
  assert.match(problems(doc({ Journey: 'Fills `form#booking-form`.' })), /startPath '\/'/);
  assert.match(problems(doc({ Journey: 'Starts at `/`, asserts on `Ada Lovelace`.' })), /formSelector 'form#booking-form'/);
  assert.match(problems(doc({ Journey: 'Starts at `/`, fills `form#booking-form`, asserts on `Ada Lovelace`.' })), /filled field 'input\[name=name\]'/);
  assert.match(problems(doc({ Journey: 'Starts at `/`, fills `form#booking-form` and both fields.' })), /filled field 'textarea\[name=notes\]'/);
});

test('required fields and both outcomes are checked against the spec', () => {
  assert.match(problems(doc({ 'Validation and states': 'Nothing is required.' })), /required field 'name'/);
  assert.match(
    problems(doc({ 'Validation and states': 'Required: `name`, `notes`.' })),
    /does not state the spec's on_missing/,
  );
});

test('acceptance criteria are quoted verbatim: a paraphrase is the drift this binding exists to prevent', () => {
  assert.match(
    problems(doc({ 'Acceptance criteria': '- the browser ends up on the booking page after submitting' })),
    /does not state this criterion verbatim/,
  );
});

test('every field the spec defines is named in the use case', () => {
  assert.match(problems(doc({ 'Use case': 'A training centre takes bookings.' })), /does not name the spec's field 'notes'/);
});

test('the binding is declared, not implied', () => {
  assert.match(problems(doc()), /^$|^.{0}$/, 'valid baseline');
  assert.match(
    problems(FRONTMATTER.replace('spec: docs/eval/specs/booking.json', 'spec: ../specs/booking.json') + doc().slice(FRONTMATTER.length)),
    /spec is '..\/specs\/booking.json', expected 'docs\/eval\/specs\/booking.json'/,
  );
  assert.match(
    problems(FRONTMATTER.replace('archetype: booking', 'archetype: catalogue') + doc().slice(FRONTMATTER.length)),
    /archetype is 'catalogue'/,
  );
});

test('the section list is closed, ordered and non-empty, as it is for a design contract', () => {
  for (const heading of PLAN_SECTIONS) {
    const text = doc().replace(new RegExp(`## ${heading}\\n\\n[^\\n]*\\n`), '');
    assert.match(problems(text), new RegExp(`missing required section '## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(problems(doc({ __sections: [...PLAN_SECTIONS].reverse() })), /sections must appear in contract order/);
  assert.match(problems(doc({ Provenance: '' })), /section '## Provenance' is empty/);
});

test('a plan lives beside its design documents, named for its archetype', () => {
  const findings = checkPlanDocument({
    name: 'booking/raw.md',
    text: doc(),
    spec: SPEC,
    specPath: 'docs/eval/specs/booking.json',
  });
  assert.match(findings.map((f) => f.problem).join(' | '), /must live at booking\/plan.md/);
});

// A path must not be evidenced by being the prefix of a longer path. This is the same trap the link rule
// taught: substring matching said the spec's write route was present because the read route began with it.
test('a route is not evidenced by the prefix of a longer route', () => {
  assert.match(
    problems(doc({ 'Data and state': 'Engine `sqlite`. Read route `/booking/:ref`.' })),
    /does not name the spec's write_route '\/book'/,
  );
  assert.match(
    // '/booking/book' would NOT be a counterexample: it ends in the path the spec names, so it does contain it.
    // '/booking' is, because the spec's '/book' appears there only as a prefix.
    problems(doc({ 'Data and state': 'Engine `sqlite`. Write route `/booking`.' })),
    /does not name the spec's write_route '\/book'/,
  );
});

// A route claim is a claim wherever it is written. The check used to read only the Routes and effects section,
// so a paragraph elsewhere could name a route the spec does not define and pass - which the rule's own comment
// claimed could not happen.
test('a route the spec does not define is a finding wherever it is claimed', () => {
  const findings = checkPlanDocument({
    name: 'booking/plan.md',
    text: doc({ Journey: SECTIONS.Journey + '\n\nThe admin posts to `POST /admin/purge` to clear the table.' }),
    spec: SPEC,
    specPath: 'docs/eval/specs/booking.json',
  });
  assert.match(findings.map((f) => f.problem).join(' | '), /claims 'POST \/admin\/purge' which/);
});

test('a spec route mentioned outside the table is not a finding, because it is defined', () => {
  const findings = checkPlanDocument({
    name: 'booking/plan.md',
    text: doc({ 'Data and state': SECTIONS['Data and state'] + ' The write goes to `POST /book`.' }),
    spec: SPEC,
    specPath: 'docs/eval/specs/booking.json',
  });
  assert.deepEqual(findings, []);
});
