import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TRAIN_BRIEFS_MANIFEST,
  TRAIN_DESIGN_DIR,
  TRAIN_TARGETS_DIR,
  allowedPaths,
  canonicalBrief,
  checkTrainDesignDocument,
  checkTrainPlanDocument,
  repositoryLinkResolver,
  targetStylesheet,
  targetTokens,
} from '../src/train/design-contract.mjs';

// A checker that has only ever been shown to pass is not a checker, so most rules below are exercised by a
// document that must be rejected. The builders produce a VALID document; each test breaks exactly one thing
// and asserts the finding it should be.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BRIEF = {
  family_id: 'tr-99',
  brief_id: 'tr-99-v1',
  archetype: 'booking',
  topic: 'test community tool booking',
  prompt: 'A test prompt asking for a straightforward booking application with server-stored records.',
  framework: 'vanilla-ts',
  locale: 'en-GB',
  task: 'generate',
  seeded_defects: [],
  routes: ['/', '/book', '/bookings/:id'],
  journeys: ['browse the options and choose one', 'submit details and reload to confirm persistence'],
  server_persistence: ['records are stored on the server and retrieved by reference'],
  assertions: [
    'POST /book creates a record and redirects to /bookings/:id',
    'submitting without a required phone displays an inline error and stores nothing',
  ],
  applicable_rules: ['forms/forms', 'accessibility/accessibility', 'css/responsive-design'],
  required_rules: ['forms/forms', 'accessibility/accessibility'],
  non_goals: ['no payment processing'],
  fields: [
    { slug: 'customer', name: 'customer', type: 'text', required: true, echoed: true },
    { slug: 'phone', name: 'phone', type: 'tel', required: true },
  ],
  journey: {
    startPath: '/',
    formSelector: 'form#booking-form',
    fill: { 'input[name=customer]': 'Ada Lovelace', 'input[name=phone]': '+44 7700 900123' },
    select: {},
    expectText: 'Ada Lovelace',
    search: {
      path: '/search',
      queryParam: 'q',
      query: 'Ada',
      resultsSelector: '#search-results',
      expectIncludes: ['Ada Lovelace'],
      expectAbsent: ['zzz-decoy'],
    },
    steps: [{ path: '/intake', submit: 'form' }],
  },
};

const PLAN_FRONTMATTER = '---\nfamily: tr-99\nbrief: docs/train/briefs/manifest.jsonl\nbrief_id: tr-99-v1\n---\n\n';
const PLAN_SECTIONS = {
  'Use case':
    'The scenario is test community tool booking, in the `booking` archetype. Fields `customer` and `phone`.',
  'Routes and effects': '| Path | Role |\n| --- | --- |\n| `/` | form page |\n| `/book` | write |\n| `/bookings/:id` | read-back |',
  'Data and state':
    'records are stored on the server and retrieved by reference; framework `vanilla-ts`; locale `en-GB`.',
  Journey:
    'Start at `/`, drive `form#booking-form`, fill `input[name=customer]` and `input[name=phone]`, '
    + 'assert on `Ada Lovelace`. Search `/search` with `q` in `#search-results`. Visit `/intake` first.',
  'Validation and states':
    'Required fields `customer` and `phone`; required rules `forms/forms` and `accessibility/accessibility`.',
  'Acceptance criteria':
    '- POST /book creates a record and redirects to /bookings/:id\n'
    + '- submitting without a required phone displays an inline error and stores nothing',
  'Implementation status': 'Task: `generate`. Scaffold output.',
  Provenance: 'Synthetic; see the brief manifest.',
};

function planText(overrides = {}, { frontmatter = PLAN_FRONTMATTER, sections = PLAN_SECTIONS, order = null } = {}) {
  const merged = { ...sections, ...overrides };
  const headings = order ?? [
    'Use case',
    'Routes and effects',
    'Data and state',
    'Journey',
    'Validation and states',
    'Acceptance criteria',
    'Implementation status',
    'Provenance',
  ];
  return frontmatter
    + '# `tr-99` functional specification — Test tool\n\n'
    + headings.map((heading) => `## ${heading}\n\n${merged[heading] ?? 'Body.'}\n`).join('\n');
}

const DESIGN_FRONTMATTER = [
  '---',
  'family: tr-99',
  `target: ${TRAIN_TARGETS_DIR}/tr-99/index.html`,
  'tokens:',
  '  --tt-bg: "#101820"',
  '  --tt-accent: "#2fa37a"',
  'literals:',
  '  control-radius: 6px',
  'antiPatterns:',
  '  - a second accent colour competing with the primary action',
  '---',
  '',
].join('\n');
const DESIGN_SECTIONS = {
  'Visual thesis': 'A test board in a dark palette.',
  'Grammar and layout': 'One column; no media queries.',
  Typography: '`system-ui, sans-serif`; the heading sets the scale.',
  'Token usage': 'The `--tt-bg` token is the page background; `--tt-accent` is the single accent.',
  'Spacing rhythm': '`1.5rem` page padding.',
  'Component hierarchy': '`header`, `main`, then `form#tt-form`.',
  'Anti-patterns': 'A second accent.',
  Rationale: 'A conformance instrument.',
  Provenance: 'Authored in this repository.',
};
const TARGET_CSS = ':root { --tt-bg: #101820; --tt-accent: #2fa37a; }\nbody { padding: 1.5rem; border-radius: 6px; }\n';

function designText(overrides = {}, { frontmatter = DESIGN_FRONTMATTER, order = null } = {}) {
  const merged = { ...DESIGN_SECTIONS, ...overrides };
  const headings = order ?? [
    'Visual thesis',
    'Grammar and layout',
    'Typography',
    'Token usage',
    'Spacing rhythm',
    'Component hierarchy',
    'Anti-patterns',
    'Rationale',
    'Provenance',
  ];
  return frontmatter
    + '# `tr-99` target design — Test tool\n\n'
    + headings.map((heading) => `## ${heading}\n\n${merged[heading] ?? 'Body.'}\n`).join('\n');
}

const planFindings = (text, over = {}) => checkTrainPlanDocument({ name: 'tr-99/plan.md', text, brief: { ...BRIEF, ...over } })
  .map((finding) => `${finding.at}: ${finding.problem}`);

const designFindings = (text, over = {}) => checkTrainDesignDocument({
  name: 'tr-99/design.md',
  text,
  family: 'tr-99',
  target: { path: `${TRAIN_TARGETS_DIR}/tr-99/index.html`, css: TARGET_CSS, formId: 'tt-form', ...over },
}).map((finding) => `${finding.at}: ${finding.problem}`);

test('a valid plan document produces no findings', () => {
  assert.deepEqual(planFindings(planText()), []);
});

test('a plan that omits an assertion is rejected', () => {
  const text = planText({ 'Acceptance criteria': '- POST /book creates a record and redirects to /bookings/:id' });
  assert.match(planFindings(text).join('\n'), /does not state this assertion verbatim/);
});

test('a plan that claims a route the brief does not define is rejected', () => {
  const text = planText({ 'Routes and effects': '| `/rogue` | invented |' });
  assert.match(planFindings(text).join('\n'), /claims '\/rogue' which the brief does not declare/);
});

test('a plan that omits a required field from validation is rejected', () => {
  const text = planText({ 'Validation and states': 'Required field `customer` only; rules `forms/forms`.' });
  assert.match(planFindings(text).join('\n'), /does not name required field 'phone'/);
});

test('a plan bound to the wrong family or brief is rejected', () => {
  assert.match(planFindings(planText(), { family_id: 'tr-98' }).join('\n'), /family is 'tr-99', expected 'tr-98'/);
  const wrongId = PLAN_FRONTMATTER.replace('tr-99-v1', 'tr-99-v2');
  assert.match(planFindings(planText({}, { frontmatter: wrongId })).join('\n'), /brief_id is 'tr-99-v2'/);
});

test('a plan section out of contract order is rejected', () => {
  const order = [
    'Routes and effects',
    'Use case',
    'Data and state',
    'Journey',
    'Validation and states',
    'Acceptance criteria',
    'Implementation status',
    'Provenance',
  ];
  assert.match(planFindings(planText({}, { order })).join('\n'), /sections must appear in contract order/);
});

test('a repair family must state its seeded defects verbatim', () => {
  const repair = { task: 'repair', seeded_defects: ['the save button posts twice when double-clicked'] };
  assert.match(planFindings(planText(), repair).join('\n'), /does not state this seeded defect verbatim/);
  const withDefect = planText({ 'Implementation status': 'Task: `repair`. Seeded defect: the save button posts twice when double-clicked.' });
  assert.deepEqual(planFindings(withDefect, repair), []);
});

test('a plan links a file that does not resolve from its own directory is rejected', () => {
  const text = planText({ Provenance: 'See [nowhere](../../nope/absent.md).' });
  assert.match(planFindings(text).join('\n') || '', /.*/); // no resolver supplied: link findings are opt-in
  const withResolver = checkTrainPlanDocument({
    name: 'tr-99/plan.md',
    text,
    brief: BRIEF,
    resolveLink: () => false,
  });
  assert.match(withResolver.map((finding) => finding.problem).join('\n'), /does not resolve from this document/);
});

test('every brief path and journey path is allowed, and nothing else is', () => {
  const allowed = allowedPaths(BRIEF);
  for (const path of ['/', '/book', '/bookings/:id', '/search', '/intake']) assert.ok(allowed.has(path), path);
  assert.equal(allowed.has('/rogue'), false);
});

test('a valid design document produces no findings', () => {
  assert.deepEqual(designFindings(designText()), []);
});

test('a token the target stylesheet does not declare is rejected', () => {
  const frontmatter = DESIGN_FRONTMATTER.replace('--tt-accent: "#2fa37a"', '--tt-accent: "#2fa37b"');
  assert.match(designFindings(designText({}, { frontmatter })).join('\n'), /is not a declaration the target stylesheet makes/);
});

test('a design that restates a token value in the body is rejected', () => {
  const text = designText({ 'Token usage': 'The `--tt-bg` token holds #101820 and carries the page background.' });
  assert.match(designFindings(text).join('\n'), /restates the frontmatter value/);
});

test('a design that claims a route is rejected', () => {
  const text = designText({ 'Grammar and layout': 'The client posts to `POST /book` when it submits.' });
  assert.match(designFindings(text).join('\n'), /routes belong in plan.md/);
});

test('a design that omits the form from its component map is rejected', () => {
  const text = designText({ 'Component hierarchy': '`header`, `main`, `footer`.' });
  assert.match(designFindings(text).join('\n'), /does not name the board's form 'tt-form'/);
});

test('a design with no anti-patterns is rejected', () => {
  const frontmatter = DESIGN_FRONTMATTER.replace('antiPatterns:\n  - a second accent colour competing with the primary action\n', '');
  const findings = designFindings(designText({}, { frontmatter })).join('\n');
  assert.match(findings, /antiPatterns/);
});

test('the committed documents describe the sources they claim: every family has a passing plan and design', () => {
  const rows = readFileSync(join(ROOT, TRAIN_BRIEFS_MANIFEST), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const families = [...new Set(rows.map((row) => row.family_id))].sort();
  assert.equal(families.length, 30, 'the training manifest should carry exactly 30 families');
  for (const family of families) {
    const brief = canonicalBrief(rows, family);
    assert.ok(brief, `${family} has no canonical (-v1) brief row`);
    const dir = join(ROOT, TRAIN_DESIGN_DIR, family);
    assert.ok(existsSync(join(dir, 'plan.md')), `${family}/plan.md is missing`);
    assert.ok(existsSync(join(dir, 'design.md')), `${family}/design.md is missing`);
    const resolveLink = repositoryLinkResolver({ root: ROOT, documentDir: dir });
    assert.deepEqual(
      checkTrainPlanDocument({ name: `${family}/plan.md`, text: readFileSync(join(dir, 'plan.md'), 'utf8'), brief, resolveLink }),
      [],
      `${family}/plan.md should pass`,
    );
    const html = readFileSync(join(ROOT, TRAIN_TARGETS_DIR, family, 'index.html'), 'utf8');
    const css = targetStylesheet(html);
    assert.notEqual(css, null, `${family} target board must carry exactly one style block`);
    assert.ok((targetTokens(css) ?? new Map()).size > 0, `${family} target board must declare :root tokens`);
    assert.deepEqual(
      checkTrainDesignDocument({
        name: `${family}/design.md`,
        text: readFileSync(join(dir, 'design.md'), 'utf8'),
        family,
        target: { path: `${TRAIN_TARGETS_DIR}/${family}/index.html`, css, formId: /<form[^>]*\bid="([^"]+)"/.exec(html)?.[1] ?? null },
        resolveLink,
      }),
      [],
      `${family}/design.md should pass`,
    );
  }
});
