/**
 * Tests for the pilot's corpus: the archetypes, the framework arms, the uplift tool, the acceptance
 * gate and the yield report.
 *
 * These are the parts that can be checked without a browser. What the browser observes is checked by
 * running the pilot itself, whose records are the evidence; these tests are the guards against the
 * specific ways this harness has already lied to me:
 *
 *   - a form id that no journey could find,
 *   - a check whose selector was built from a field's slug while the field's name was different,
 *   - a rule helper that returned from its enclosing evaluate and inspected `undefined`,
 *   - an expectation that went missing and turned the assertion into a no-op,
 *   - a required field the project never asked for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ARCHETYPES, ARCHETYPE_IDS } from '../pilot/archetypes.mjs';
import { buildProject, FRAMEWORKS } from '../pilot/frameworks.mjs';
import { TRANSFORMS, upliftProject } from '../src/corpus/uplift.mjs';
import { decidePair, journeyWorks, renderYieldReport, summarizeYield } from '../src/corpus/accept.mjs';
import { hashTree } from '../src/corpus/harness.mjs';
import { MWG_RULE_IDS, MWG_SNAPSHOT, RULES, SECURITY_CHECK_IDS, SECURITY_CHECKS } from '../src/corpus/rules.mjs';

const repoRoot = join(dirname(new URL(import.meta.url).pathname), '..');
const plan = JSON.parse(readFileSync(join(repoRoot, 'pilot/plan.json'), 'utf8'));

/** Write a generated project to a temporary directory, so the uplift tool has real files to edit. */
function materialise(projectId, files) {
  const root = mkdtempSync(join(tmpdir(), `pilot-${projectId}-`));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const workbook = (overrides = {}) => {
  const persistence = {
    name: 'server-persistence',
    steps: [{ step: 'open', status: 200 }, { step: 'submit', status: 303 }, { step: 'reload' }],
    persistedText: 'Ada Lovelace Window seat please',
    echoedText: 'Window seat please',
    ...(overrides.persistence ?? {}),
  };
  const validation = {
    name: 'validation-failure',
    stillOnForm: true,
    invalidCount: 2,
    visibleErrors: 1,
    ...(overrides.validation ?? {}),
  };
  return {
    rules: overrides.rules ?? [{ rule: 'forms/required-field-feedback', status: 'FAIL' }],
    security: overrides.security ?? [{ check: 'session-cookie-attributes', status: 'PASS' }],
    journeys: overrides.journeys ?? [persistence, validation],
    errors: overrides.errors ?? [],
  };
};

const spec = (overrides = {}) => ({
  project_id: 'booking-raw',
  archetype: 'booking',
  framework: { name: 'raw', family: 'raw-web-platform' },
  seeded_defects: ['no-required'],
  echo_expect: 'Window seat please',
  ...overrides,
});

test('every measured rule resolves to a guide in the pinned snapshot', () => {
  // rules.json stores guides as `categories[category][slug]`, not as `category/slug` strings. Comparing
  // against the file as text reported all six rules as missing guides when all six are real ones.
  const snapshot = JSON.parse(readFileSync(join(repoRoot, 'docs/eval/rules.json'), 'utf8'));
  assert.equal(snapshot.skill_version, MWG_SNAPSHOT, 'the vector is cut from this snapshot');
  assert.ok(snapshot.rule_set_hash.startsWith('sha256:'), 'the snapshot records the hash of what it extracted');

  for (const id of Object.keys(RULES)) {
    const [category, slug] = id.split('/');
    // Each category is an array of guide slugs, not a map of slug to guide.
    assert.ok(Array.isArray(snapshot.categories[category]), `${id}: no such category in the snapshot`);
    assert.ok(
      snapshot.categories[category].includes(slug),
      `${id} is measured but is not a guide in the pinned snapshot`,
    );
  }
  assert.ok(MWG_RULE_IDS.length === Object.keys(RULES).length && MWG_RULE_IDS.length >= 6);

  // The other checks are local properties, and must be marked as such: the corpus must never present a
  // property of its own invention as a guide.
  assert.equal(SECURITY_CHECK_IDS.length, 2);
  for (const id of SECURITY_CHECK_IDS) {
    assert.equal(SECURITY_CHECKS[id].guide, null, `${id} is not an MWG guide and must not claim one`);
  }
});

test('every transform claims a rule in the measured vector', () => {
  const measured = new Set([...MWG_RULE_IDS, ...SECURITY_CHECK_IDS]);
  for (const transform of TRANSFORMS) {
    assert.ok(measured.has(transform.rule), `${transform.rule} is not measured, so its edits cannot be counted`);
  }
});

test('the corpus is five archetypes across five arms, every one with a server journey', () => {
  assert.deepEqual(plan.targets.archetypes, ARCHETYPE_IDS.length);
  assert.deepEqual(plan.targets.frameworks, Object.keys(FRAMEWORKS).length);
  assert.equal(plan.projects.length, ARCHETYPE_IDS.length * Object.keys(FRAMEWORKS).length);

  const seen = new Set();
  for (const entry of plan.projects) {
    seen.add(`${entry.archetype}/${entry.framework}`);
  }
  assert.equal(seen.size, plan.projects.length, 'each archetype/framework pair appears exactly once');

  for (const archetype of Object.values(ARCHETYPES)) {
    assert.ok(
      archetype.routes.some((route) => route.method === 'POST' && route.kind.startsWith('write')),
      `${archetype.id} must have a route that writes`,
    );
    assert.ok(
      archetype.routes.some((route) => route.kind === 'read-by-reference' || route.kind === 'read-session' || route.kind === 'search'),
      `${archetype.id} must have a route that reads the record back`,
    );
  }
});

test('a form id is the one its journey selects', () => {
  for (const archetypeId of ARCHETYPE_IDS) {
    const { files, spec: built } = buildProject({ archetypeId, frameworkName: 'raw', defects: [] });
    const id = built.journey.formSelector.replace(/^form#/, '');
    assert.ok(
      files[built.framework.markupFile].includes(`<form id="${id}"`),
      `${archetypeId}: the markup has no form with id ${id}, so the journey could not submit it`,
    );
    assert.equal(built.check_context.formSelector, built.journey.formSelector);
  }
});

test('the clean baseline satisfies every rule it is not seeded to fail', () => {
  // The control arm of this pilot is a project with no seeded defects. When the baseline was
  // incomplete the control failed rules it should have satisfied, and the uplift scored a "fix" on it -
  // which is how a corpus bug becomes an inflated yield.
  for (const archetypeId of ARCHETYPE_IDS) {
    const { files, spec: built } = buildProject({ archetypeId, frameworkName: 'raw', defects: [] });
    const markup = files[built.framework.markupFile];
    const styles = files[built.framework.stylesFile];
    const script = files[built.framework.enhanceFile];

    // required-field-feedback: the requirement, the error text, and the link between them
    assert.ok(markup.includes(' required'), `${archetypeId}: nothing is marked required`);
    assert.ok(markup.includes('aria-errormessage="'), `${archetypeId}: no field points at its error text`);
    assert.ok(markup.includes('-error"'), `${archetypeId}: the error text it points at does not exist`);
    // validate-input-after-interaction: the error is styled only after interaction
    assert.ok(styles.includes(':user-invalid'), `${archetypeId}: no :user-invalid styling`);
    assert.ok(!/(?<!user-):invalid\b/.test(styles), `${archetypeId}: the baseline styles :invalid eagerly`);
    // accessible-error-announcement: a live region, and the script that fills it
    assert.ok(markup.includes('role="alert"'), `${archetypeId}: no live region`);
    assert.ok(script.includes('function announce('), `${archetypeId}: nothing ever fills the live region`);
    assert.ok(script.includes('syncValidity'), `${archetypeId}: no aria-invalid synchronisation`);
    // sanitize-untrusted-html: user text is never inserted as live HTML
    assert.ok(!script.includes('innerHTML'), `${archetypeId}: the baseline inserts untrusted text as HTML`);
  }
});

test('the content journey addresses fields by name, not slug', () => {
  // The catalogue's echoed field has slug `query` and name `q`; addressing it by slug made every
  // content journey fail with "type([name=query]) failed: not found" on a form that has the field.
  const { spec: built } = buildProject({ archetypeId: 'catalogue', frameworkName: 'raw', defects: [] });
  const field = ARCHETYPES.catalogue.fields.find((entry) => entry.slug === 'query');
  assert.equal(built.content_journey.inputSelector, `[name=${field.name}]`);
  assert.equal(built.content_journey.source, 'query');
  assert.equal(built.journey.kind, 'get-query-reload');
});

test('an optional field is neither required in the markup nor claimed by the uplift', () => {
  const { files, spec: built } = buildProject({ archetypeId: 'catalogue', frameworkName: 'raw', defects: [] });
  const markup = files[built.framework.markupFile];
  const quantity = /<input[^>]*name="quantity"[^>]*>/.exec(markup)[0];
  assert.ok(!quantity.includes('required'), 'a field the user may leave empty must not be required');
  assert.ok(
    !built.primaryFields.some((field) => field.name === 'quantity'),
    'the uplift must not start requiring a field the project treats as optional',
  );
});

test('the uplift adds the requirement, its error element and the aria link', () => {
  const { files, spec: built } = buildProject({ archetypeId: 'booking', frameworkName: 'raw', defects: ['no-required', 'eager-invalid', 'xss-innerhtml'] });
  const root = materialise('booking-uplift', files);
  try {
    const out = join(root, '..', `${built.project_id}-uplifted`);
    const result = upliftProject(root, built, out);
    assert.ok(result.applied.includes('forms/required-field-feedback'));
    const markup = readFileSync(join(out, built.framework.markupFile), 'utf8');
    const notes = /<textarea[^>]*name="notes"[^>]*>/.exec(markup)[0];
    assert.ok(notes.includes('required'), 'the field must carry required');
    assert.ok(notes.includes('aria-errormessage="notes-error"'), 'the field must point at its error text');
    assert.ok(markup.includes('id="notes-error"'), 'the element it points at must exist');
    assert.ok(result.edits.length > 0, 'every applied change must be recorded');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the uplift rewrites eager :invalid styling, and does not touch :user-invalid', () => {
  const { files, spec: built } = buildProject({ archetypeId: 'booking', frameworkName: 'raw', defects: ['eager-invalid'] });
  const styles = files[built.framework.stylesFile];
  assert.ok(/(?<!user-):invalid\b/.test(styles), 'this project is seeded with eager :invalid styling');
  const root = materialise('booking-invalid', files);
  try {
    const out = join(root, '..', `${built.project_id}-uplifted`);
    upliftProject(root, built, out);
    const after = readFileSync(join(out, built.framework.stylesFile), 'utf8');
    // The regression this guards: `(^|[^:a-z-])` before `:invalid` matched only prose in comments,
    // because the character before `:invalid` in a real selector is the element name.
    assert.ok(!/(?<!user-):invalid\b/.test(after), 'no selector may style :invalid after the uplift');
    assert.ok(after.includes(':user-invalid'), 'the :user-invalid rules must survive');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uplifting an already-clean project changes nothing', () => {
  const { files, spec: built } = buildProject({ archetypeId: 'booking', frameworkName: 'raw', defects: [] });
  const root = materialise('booking-clean', files);
  try {
    const result = upliftProject(root, built, join(root, '..', `${built.project_id}-uplifted`));
    assert.deepEqual(result.applied, [], 'a project that satisfies a rule must not be cosmetically changed');
    assert.deepEqual(result.failed, []);
    assert.equal(result.edits.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the live region is inserted once, not once per pass, and markup stays well-formed', () => {
  const { files, spec: built } = buildProject({ archetypeId: 'booking', frameworkName: 'raw', defects: ['no-required'] });
  const root = materialise('booking-live', files);
  try {
    const out = join(root, '..', `${built.project_id}-uplifted`);
    upliftProject(root, built, out);
    const markup = readFileSync(join(out, built.framework.markupFile), 'utf8');
    assert.equal(markup.split('role="alert"').length - 1, 1, 'exactly one live region');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a journey with no expected echoed value fails closed', () => {
  const check = journeyWorks({ ...workbook(), echo_expect: null });
  assert.equal(check.ok, false);
  assert.ok(
    check.problems.some((problem) => /not asserted/.test(problem)),
    'the missing expectation must be reported, not skipped: a gate that checks nothing must not pass',
  );
});

test('a journey whose reload loses the record is reported', () => {
  const check = journeyWorks({ ...workbook({ persistence: { echoedText: '' } }), echo_expect: 'Window seat please' });
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((problem) => problem.includes('Window seat please')));
});

test('acceptance requires an improvement, and classifies every refusal', () => {
  const base = { spec: spec(), uplift: { applied: ['forms/required-field-feedback'], skipped: [], failed: [] } };
  const improved = workbook({ rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }] });
  const unchanged = workbook();

  const accepted = decidePair({ ...base, original: unchanged, uplifted: improved });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.category, 'accepted');
  assert.deepEqual(accepted.improved_rules, ['forms/required-field-feedback']);

  const gap = decidePair({ ...base, original: unchanged, uplifted: unchanged });
  assert.equal(gap.accepted, false);
  assert.equal(gap.category, 'no-mwg-improvement');

  const nothingToFix = decidePair({
    ...base,
    spec: spec({ seeded_defects: [] }),
    original: workbook({ rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }] }),
    uplifted: workbook({ rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }] }),
  });
  assert.equal(nothingToFix.category, 'no-warranted-change');

  const regressed = decidePair({
    ...base,
    original: workbook({ rules: [{ rule: 'forms/autofill-address-form', status: 'PASS' }] }),
    uplifted: workbook({
      rules: [
        { rule: 'forms/autofill-address-form', status: 'FAIL' },
        { rule: 'forms/required-field-feedback', status: 'PASS' },
      ],
    }),
  });
  assert.equal(regressed.category, 'rule-regression');
  assert.equal(regressed.accepted, false);

  const insecure = decidePair({
    ...base,
    original: workbook({ security: [{ check: 'session-cookie-attributes', status: 'PASS' }] }),
    uplifted: workbook({
      security: [{ check: 'session-cookie-attributes', status: 'FAIL' }],
      rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }],
    }),
  });
  assert.equal(insecure.category, 'security-regression');

  const broken = decidePair({
    ...base,
    original: unchanged,
    uplifted: workbook({ rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }], journeys: [] }),
  });
  assert.equal(broken.category, 'uplift-broke-the-flow');

  const unrunnable = decidePair({
    ...base,
    original: workbook({ journeys: [] }),
    uplifted: improved,
  });
  assert.equal(unrunnable.category, 'original-not-runnable');
});

test('a rule that could not be measured blocks acceptance', () => {
  // The account-recovery arm's sanitisation check once reported PASS for both versions because the
  // payload never reached the DOM. "Not measured" must never be reported, or counted, as a pass.
  const decision = decidePair({
    spec: spec({ required_rules: ['security/sanitize-untrusted-html'] }),
    original: workbook({ rules: [{ rule: 'security/sanitize-untrusted-html', status: 'ERROR', detail: 'payload never reached the container' }] }),
    uplifted: workbook({ rules: [{ rule: 'security/sanitize-untrusted-html', status: 'PASS' }] }),
    uplift: { applied: ['security/sanitize-untrusted-html'], skipped: [], failed: [] },
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.category, 'rule-not-measured');
  assert.ok(decision.detail.some((line) => /could not be measured/.test(line)));

  const missing = decidePair({
    spec: spec({ required_rules: ['security/sanitize-untrusted-html'] }),
    original: workbook({ rules: [] }),
    uplifted: workbook({ rules: [{ rule: 'security/sanitize-untrusted-html', status: 'PASS' }] }),
    uplift: { applied: [], skipped: [], failed: [] },
  });
  assert.equal(missing.category, 'rule-not-measured');
});

test('the yield counts what was attempted, and names where the refusals came from', () => {
  const decisions = [
    { accepted: true, category: 'accepted', framework: 'raw', archetype: 'booking', improved_rules: ['forms/required-field-feedback'], seeded_defects: ['no-required'] },
    { accepted: true, category: 'accepted', framework: 'react', archetype: 'booking', improved_rules: ['forms/required-field-feedback', 'security/sanitize-untrusted-html'], seeded_defects: ['no-required'] },
    { accepted: false, category: 'no-mwg-improvement', framework: 'vue', archetype: 'catalogue', improved_rules: [], seeded_defects: ['xss-innerhtml'] },
  ];
  const summary = summarizeYield(decisions);
  assert.equal(summary.attempted, 3);
  assert.equal(summary.accepted, 2);
  assert.equal(Math.round(summary.yield * 100), 67);
  assert.deepEqual(summary.by_framework.raw, { total: 1, accepted: 1 });
  assert.deepEqual(summary.by_framework.vue, { total: 1, accepted: 0 });
  assert.deepEqual(summary.rules_improved, {
    'forms/required-field-feedback': 2,
    'security/sanitize-untrusted-html': 1,
  });
});

test('the report states the yield and the meaning of every refusal', () => {
  const decisions = [
    { accepted: false, category: 'uplift-broke-the-flow', framework: 'react', archetype: 'booking', improved_rules: [], seeded_defects: [], detail: [] },
  ];
  const report = renderYieldReport({
    summary: summarizeYield(decisions),
    decisions,
    runId: 'test-run',
    generatedAt: '2026-10-08T00:00:00.000Z',
  });
  assert.ok(report.includes('0.0%'), 'the report must state the yield');
  assert.ok(report.includes('`uplift-broke-the-flow`'), 'and the category of each refusal');
  assert.ok(report.includes('**tool or rule bug**'), 'and what that category means for the tool');
});

test('the corpus record refuses a partial run', () => {
  // A partial corpus is not the corpus: recording one would let a half-finished run stand in as the
  // measured artefact, and every number derived from it would describe a different experiment.
  const run = mkdtempSync(join(tmpdir(), 'partial-run-'));
  try {
    writeFileSync(
      join(run, 'yield.json'),
      JSON.stringify({ run_id: 'partial', generated_at: '2026-10-08T00:00:00.000Z', summary: {}, decisions: [{ project_id: 'booking-raw' }] }),
    );
    const result = spawnSync(process.execPath, ['scripts/pilot-corpus.mjs', '--record', run], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.equal(result.status, 1, 'recording a partial run must fail');
    assert.match(result.stderr, /refusing to record a partial corpus/);
  } finally {
    rmSync(run, { recursive: true, force: true });
  }
});

test('the recorded corpus covers the plan, with a hash for every original and every uplift', () => {
  const recorded = JSON.parse(readFileSync(join(repoRoot, 'pilot/CORPUS.json'), 'utf8'));
  assert.equal(recorded.projects.length, plan.projects.length, 'the record must cover every planned project');
  assert.equal(recorded.projects.length, recorded.summary.attempted, 'and match the run it came from');
  assert.equal(
    recorded.summary.accepted + Object.entries(recorded.summary.by_category)
      .filter(([category]) => category !== 'accepted')
      .reduce((total, [, count]) => total + count, 0),
    recorded.projects.length,
    'every project must be either accepted or counted in exactly one refusal category',
  );
  for (const project of recorded.projects) {
    // hashTree returns `sha256:<hex>`, and the prefix is part of the recorded contract.
    assert.match(project.original_sha, /^sha256:[a-f0-9]{64}$/, `${project.project_id}: no original tree hash`);
    assert.match(project.uplift_sha, /^sha256:[a-f0-9]{64}$/, `${project.project_id}: no uplift tree hash`);
  }
  const ids = new Set(recorded.projects.map((project) => project.project_id));
  for (const entry of plan.projects) {
    const id = `${entry.archetype}-${entry.framework}`;
    assert.ok(ids.has(id), `${id} is planned but not recorded`);
  }
});

test('hashTree is stable for the same content and differs for different content', () => {
  const files = { 'a.txt': 'one', 'nested/b.txt': 'two' };
  const first = materialise('hash-a', files);
  const second = materialise('hash-b', files);
  const third = materialise('hash-c', { ...files, 'a.txt': 'one!' });
  try {
    assert.equal(hashTree(first), hashTree(second), 'the same tree must hash the same');
    assert.notEqual(hashTree(first), hashTree(third), 'a changed file must change the hash');
  } finally {
    for (const root of [first, second, third]) rmSync(root, { recursive: true, force: true });
  }
});
