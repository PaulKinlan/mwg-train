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
import { generateCorpus } from '../pilot/generate.mjs';
import { buildProject } from '../pilot/projects.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { TRANSFORMS, upliftProject } from '../src/corpus/uplift.mjs';
import { decidePair, journeyWorks, renderYieldReport, summarizeYield, validationObservation } from '../src/corpus/accept.mjs';
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
  // Declared explicitly: the gate refuses to assess a pair whose spec requires nothing, so that a
  // project cannot pass by not asking to be measured.
  required_rules: ['forms/required-field-feedback'],
  project_id: 'booking-raw',
  archetype: 'booking',
  framework: { name: 'raw', family: 'raw-web-platform' },
  seeded_defects: ['no-required'],
  echo_expect: 'Window seat please',
  ...overrides,
});

test('pilot project manifests retain the original dependency-free bytes for every arm', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pilot-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    const built = buildProject({ archetypeId: plan.projects[0].archetype, frameworkName });
    const dir = join(root, frameworkName);
    writeProject(dir, built);
    const expected = `${JSON.stringify({ name: `pilot-${built.projectId}`, private: true, type: 'module', scripts: { start: 'node server.mjs' } }, null, 2)}\n`;
    assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), expected, frameworkName);
  }
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
    spec: spec({ required_rules: ['forms/autofill-address-form'] }),
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

  // A step the tool reported it could not complete means the uplifted tree is not the tool's output.
  // For the Svelte arm that step is the template rebuild, and scoring the pair would measure the
  // pre-edit page while the decision still listed the rule edits.
  const incomplete = decidePair({
    ...base,
    original: unchanged,
    uplifted: improved,
    uplift: { applied: ['forms/required-field-feedback'], skipped: [], failed: [{ rule: 'compile/svelte-template', reason: 'template did not parse' }] },
  });
  assert.equal(incomplete.category, 'uplift-incomplete');
  assert.equal(incomplete.accepted, false);
  assert.match(incomplete.detail.join(' '), /compile\/svelte-template/);

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
    assert.match(result.stderr, /refusing to record/);
    assert.match(result.stderr, /partial corpus is not the corpus/);
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

test('every check compiles every browser expression it can reach', async () => {
  // The checks build JavaScript as a string and send it to the browser, so a stray backtick or an
  // unescaped quote is a runtime syntax error. The first version of this test was vacuous: its stub
  // returned {} for every call, so any check that returns early never compiled its later expressions,
  // and it matched only the literal word SyntaxError in the message. It now drives each check along a
  // full path (every value truthy) and an empty path, and requires every evaluate() call site in the
  // check's own source to have been executed at least once.
  const checks = [...Object.entries(RULES), ...Object.entries(SECURITY_CHECKS)];
  assert.ok(checks.length >= 8, 'the vector should have at least eight checks');

  const truthy = (depth = 0) => new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString') return () => '';
      if (prop === 'length') return 0;
      if (prop === 'offsetParent') return {};
      if (prop === 'textContent') return 'stub';
      return truthy(depth + 1);
    },
    apply() { return truthy(depth + 1); },
  });

  const syntaxError = (error) => error instanceof SyntaxError
    || error?.name === 'SyntaxError'
    || /SyntaxError|Unexpected token|Unexpected identifier|Invalid or unexpected token|missing \) after argument list/.test(String(error?.message ?? ''));

  for (const [id, check] of checks) {
    const source = check.check.toString();
    const siteCount = (source.match(/page\.evaluate\(/g) ?? []).length;
    const compiled = [];
    for (const value of [truthy(), undefined]) {
      const stub = {
        async evaluate(expression) {
          assert.equal(typeof expression, 'string', id + ': evaluate was not given a string');
          new Function('(async () => { ' + expression + ' })()');
          compiled.push(expression);
          return value;
        },
        async touchEmpty() {}, async goto() {}, async waitFor() {}, async realType() {},
        async realKey() {}, async url() { return ''; }, async cookies() { return []; },
      };
      const ctx = {
        primaryField: '[name=name]', formSelector: 'form', usernameField: '[name=email]',
        passwordField: '[name=password]', addressField: '[name=address]', postcodeField: '[name=postcode]',
        base: 'http://127.0.0.1', startPath: '/', journey: { submitContent: async () => true },
      };
      try {
        await check.check(stub, ctx);
      } catch (error) {
        assert.ok(!syntaxError(error), id + ': its browser expression is not valid JavaScript - ' + (error?.message ?? error));
      }
    }
    if (source.includes('page.evaluate')) {
      assert.ok(compiled.length > 0, id + ': builds a browser expression but none was compiled');
      // Distinct, not just total: two visits to one site could otherwise compensate for a site that
      // never ran, which is exactly the hole this assertion is meant to close.
      assert.ok(
        new Set(compiled).size >= siteCount,
        id + ': ' + new Set(compiled).size + ' distinct expression(s) compiled, ' + siteCount
          + ' call site(s) exist, so an unreached branch holds an uncompiled expression',
      );
    }
  }
});

test('the yield report counts the observations its decisions carry', () => {
  // The report looked for the original record under a key decisions do not have, defaulted every
  // observation to 'not-driven', and printed '0 of 25 ... 0 accepted it' - a section that looked
  // authoritative and measured nothing. A missing observation must now be visible as missing.
  const decision = decidePair({
    spec: spec({}),
    original: workbook({
      validation: { path: '/search', invalidCount: 0, visibleErrors: 0, stillOnForm: false, urlUnchanged: false, serverRefused: false },
      journeys: [
        ...workbook().journeys.filter((journey) => journey.name !== 'validation-failure'),
        { name: 'validation-failure', path: '/search', invalidCount: 0, visibleErrors: 0, stillOnForm: false, urlUnchanged: false, serverRefused: false },
      ],
    }),
    uplifted: workbook({ rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }] }),
    uplift: { applied: ['forms/required-field-feedback'], skipped: [], failed: [] },
  });
  assert.equal(decision.validation_observation, 'accepted-empty');

  const summary = summarizeYield([decision]);
  const report = renderYieldReport({ summary, decisions: [decision], runId: 'test', generatedAt: 'now' });
  assert.match(report, /1 accepted it; 0 left the page with neither an observed refusal nor an error\./);

  const stripped = renderYieldReport({
    summary,
    decisions: [{ ...decision, validation_observation: undefined }],
    runId: 'test',
    generatedAt: 'now',
  });
  assert.match(stripped, /1 decision\(s\) carry no observation/);
});
test('an original that accepts an empty form is still assessable', () => {
  // The gate used to require the original to refuse an empty submission. The originals seeded without a
  // client-side requirement cannot, so the gate labelled exactly the most defective pairs 'not runnable'
  // and dropped them from the yield - survivorship bias in the flattering direction.
  const accepting = workbook({
    validation: { path: '/search', invalidCount: 0, visibleErrors: 0, stillOnForm: false, urlUnchanged: false, serverRefused: false },
  });
  const original = { ...accepting, echo_expect: 'Window seat please' };
  const verdict = journeyWorks(original);
  assert.equal(verdict.ok, true, 'a seeded validation defect must not make the original unassessable');
  assert.equal(validationObservation(original), 'accepted-empty');

  const refused = workbook({
    validation: { path: '/', invalidCount: 1, visibleErrors: 0, stillOnForm: true, urlUnchanged: true, serverRefused: false },
  });
  assert.equal(validationObservation({ ...refused, echo_expect: 'Window seat please' }), 'refused-observed');
  assert.equal(validationObservation({ journeys: [] }), 'not-driven');
});
test('a declared write journey must be driven and shown to persist', () => {
  // A write journey is only evidence of a write if its POST was observed to succeed and the value it
  // posted was read back.
  const write = { name: 'write-journey', posted: true, landedStatus: 200, persisted: true, submittedValue: 'part-x' };
  const uplift = { applied: ['forms/required-field-feedback'], skipped: [], failed: [] };
  const passing = { rules: [{ rule: 'forms/required-field-feedback', status: 'PASS' }] };
  const specWithWrite = { write_journey: { itemValue: 'bearing' } };

  const missing = decidePair({
    spec: spec(specWithWrite),
    original: workbook(),
    uplifted: workbook(passing),
    uplift,
  });
  assert.equal(missing.category, 'original-not-runnable');
  assert.ok(missing.detail.some((line) => /declared write journey was not driven/.test(line)));

  const notPersisted = decidePair({
    spec: spec(specWithWrite),
    original: workbook({ journeys: [...workbook().journeys, { ...write, persisted: false }] }),
    uplifted: workbook({ ...passing, journeys: [...workbook().journeys, write] }),
    uplift,
  });
  assert.equal(notPersisted.category, 'original-not-runnable');
  assert.ok(notPersisted.detail.some((line) => /did not show the posted value stored/.test(line)));

  const refusedPost = decidePair({
    spec: spec(specWithWrite),
    original: workbook({ journeys: [...workbook().journeys, { name: 'write-journey', posted: false, landedStatus: 422, persisted: false }] }),
    uplifted: workbook({ ...passing, journeys: [...workbook().journeys, write] }),
    uplift,
  });
  assert.equal(refusedPost.category, 'original-not-runnable');
  assert.ok(refusedPost.detail.some((line) => /POST was not observed to succeed \(status 422\)/.test(line)));

  const good = decidePair({
    spec: spec(specWithWrite),
    original: workbook({ journeys: [...workbook().journeys, write] }),
    uplifted: workbook({ ...passing, journeys: [...workbook().journeys, write] }),
    uplift,
  });
  assert.equal(good.accepted, true);
});

test('the write journey posts a value that cannot already be stored', () => {
  // A fixed posted value can be satisfied by a row already in the database, so the read-back would
  // report a successful write that never happened.
  const catalogue = Object.values(ARCHETYPES).find((archetype) => archetype.id === 'catalogue');
  assert.ok(catalogue.writeJourney, 'the catalogue declares a write journey');
  assert.equal(catalogue.writeJourney.itemValue, undefined, 'no fixed posted value');
  assert.equal(catalogue.writeJourney.itemField, 'input[name=item]');
  assert.ok(catalogue.extraForm.fields.includes('item'), 'the posted field is part of the cart form');
  const item = Object.values(ARCHETYPES).flatMap((archetype) => archetype.fields ?? [])
    .find((field) => field.slug === 'item');
  assert.ok(item && !item.optional, 'the part number is required, so the server validates it');
  const source = readFileSync(join(repoRoot, 'src', 'corpus', 'harness.mjs'), 'utf8');
  assert.match(source, /const unique = /, 'the harness generates the posted value');
  assert.match(source, /body\.includes\(unique\)/, 'the read-back is checked against the generated value');
  assert.match(source, /posted:/, 'the POST status is recorded');
});

test('every error reference in a generated project has a target, in every arm', () => {
  // The two form renderers drifted apart: the second emitted aria-errormessage without the element it
  // names, which made a project with no seeded defects fail a rule and handed the uplift an edit to make
  // on the clean control. A substring check for the attribute passed the whole time.
  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    for (const archetypeId of ARCHETYPE_IDS) {
      for (const defects of [[], ['no-required'], ['xss-innerhtml'], ['no-aria-sync', 'no-autofill']]) {
        const { files, spec: built } = buildProject({ archetypeId, frameworkName, defects });
        const markup = files[built.framework.markupFile];
        const ids = new Set([...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
        for (const reference of [...markup.matchAll(/aria-errormessage="([^"]+)"/g)].map((m) => m[1])) {
          assert.ok(
            ids.has(reference),
            `${archetypeId}/${frameworkName}/${defects.join('+') || 'clean'}: aria-errormessage="${reference}" has no element with that id`,
          );
        }
      }
    }
  }
});

test('a project with no seeded defects gets no edits at all', () => {
  // The control is what proves the tool is not simply always finding something. Its guarantee is zero
  // edits, so it is asserted as zero edits, not as "few rules improved".
  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    for (const archetypeId of ARCHETYPE_IDS) {
      const { files, spec: built } = buildProject({ archetypeId, frameworkName, defects: [] });
      const root = mkdtempSync(join(tmpdir(), 'clean-'));
      const outDir = mkdtempSync(join(tmpdir(), 'clean-uplifted-'));
      try {
        writeProject(root, { projectId: `${archetypeId}-${frameworkName}`, files, spec: built });
        const result = upliftProject(root, built, outDir);
        assert.deepEqual(
          result.applied,
          [],
          `${archetypeId}/${frameworkName}: a clean project should need nothing, but the tool applied ${result.applied.join(', ')}`,
        );
        assert.deepEqual(result.edits, [], `${archetypeId}/${frameworkName}: a clean project should be edited not at all`);
        // The returned arrays are the tool's own account of what it did; the tree is the fact.
        assert.equal(
          hashTree(outDir),
          hashTree(root),
          `${archetypeId}/${frameworkName}: the uplift changed a tree it reported as unchanged`,
        );
        assert.deepEqual(result.failed, [], `${archetypeId}/${frameworkName}: nothing should fail on a clean project`);
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outDir, { recursive: true, force: true });
      }
    }
  }
});

test('the Svelte arm crosses its compile boundary in the scaffolder and again in the uplift tool', () => {
  // The arm's whole claim is that the template stays the editable source while the served page is the
  // compiled one. That only holds if the uplift rebuilds after editing, so this pins both halves: the
  // scaffolder writes a build output plus the stable importer, and the tool's edits change the rebuilt
  // module. Without the rebuild the arm's uplift would silently measure the pre-edit page.
  const { files, spec: built } = buildProject({ archetypeId: 'booking', frameworkName: 'svelte', defects: ['no-required'] });
  assert.ok(files['app/page.compiled.mjs']?.includes('svelte'), 'the scaffolder writes a compiled server module');
  assert.ok(files['app/page.mjs']?.includes("from './page.compiled.mjs'"), 'and a stable page module that imports it');
  const root = mkdtempSync(join(tmpdir(), 'svelte-'));
  const out = mkdtempSync(join(tmpdir(), 'svelte-up-'));
  try {
    writeProject(root, { projectId: 'booking-svelte', files, spec: built });
    const result = upliftProject(root, built, out);
    assert.deepEqual(result.compiled, ['app/page.compiled.mjs'], 'the rebuild is reported as a build step');
    assert.ok(result.applied.includes('forms/required-field-feedback'), 'the rule edits are still reported as edits');
    assert.notEqual(
      readFileSync(join(out, 'app/page.compiled.mjs'), 'utf8'),
      files['app/page.compiled.mjs'],
      'the served module is rebuilt from the edited template',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('the generator is deterministic, so the measured tree is the verified tree', () => {
  // The pilot used to measure whatever was in pilot/projects while the recorder regenerated the plan,
  // so a stale directory was measured silently and then reported as unreproducible. Both now come from
  // generateCorpus, and this is what makes that safe: two generations of the same plan are identical.
  const first = mkdtempSync(join(tmpdir(), 'gen-a-'));
  const second = mkdtempSync(join(tmpdir(), 'gen-b-'));
  try {
    const a = generateCorpus({ outDir: first });
    const b = generateCorpus({ outDir: second });
    assert.equal(a.projects.length, plan.projects.length, 'every planned project is generated');
    assert.deepEqual(
      a.projects.map((project) => project.projectId),
      b.projects.map((project) => project.projectId),
      'generation order is stable',
    );
    for (let index = 0; index < a.projects.length; index += 1) {
      assert.equal(
        hashTree(a.projects[index].dir),
        hashTree(b.projects[index].dir),
        a.projects[index].projectId + ': two generations of the same plan differ',
      );
    }
    assert.equal(a.projects.length, ARCHETYPE_IDS.length * Object.keys(FRAMEWORKS).length, 'the corpus is the whole archetype x framework matrix');
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('the write journey is witnessed by the server that stored the row', () => {
  // The browser's own network log did not report the form POST at all, so the POST status was being read
  // off the page it redirected to: the claim "the POST succeeded" was made with no POST observed. The
  // witness is now the server's log of what it answered.
  const source = readFileSync(join(repoRoot, 'src', 'corpus', 'harness.mjs'), 'utf8');
  assert.match(source, /fetch\('\/__requests'\)/, 'the harness asks the server what it received');
  assert.match(source, /entry\.method === 'POST' && entry\.path === action/, 'the POST is matched to the form action');
  assert.match(source, /posted: postEntry !== null/, 'an unobserved POST is not a pass');
  // Only a POST the server recorded after the journey started counts, so an archetype that also writes
  // on its persistence path cannot have that earlier POST read as this journey's.
  assert.match(source, /entry\.index >= before\.length/, 'the check is scoped to requests made after the baseline');
  assert.match(source, /const before = await readServerLog\(page\)/, 'a baseline is taken before the submit');
  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    const { files, spec: built } = buildProject({ archetypeId: 'catalogue', frameworkName, defects: [] });
    const server = files[built.framework.serverFile];
    assert.ok(server, frameworkName + ': no server file in the built project');
    assert.ok(server.includes('/__requests'), frameworkName + ': the server does not expose its request log');
    assert.ok(/requestLog\.push\(/.test(server), frameworkName + ': the server does not record its answers');
  }
});

test('the committed records support every claim the report makes', () => {
  // The report was committed and its evidence was not, so none of its numbers could be checked from
  // the repository. docs/pilot/records.json is the run's journeys, rule statuses and hashes, and this
  // test is what keeps the report's claims tied to it.
  const records = JSON.parse(readFileSync(join(repoRoot, 'docs', 'pilot', 'records.json'), 'utf8'));
  const report = JSON.parse(readFileSync(join(repoRoot, 'docs', 'pilot', 'yield.json'), 'utf8'));
  assert.equal(records.projects.length, ARCHETYPE_IDS.length * Object.keys(FRAMEWORKS).length, 'every project is recorded');
  assert.equal(report.decisions.length, ARCHETYPE_IDS.length * Object.keys(FRAMEWORKS).length, 'every project has a decision');

  for (const project of records.projects) {
    const where = project.project_id;
    for (const version of ['original', 'uplifted']) {
      assert.ok(project[version], where + ': ' + version + ' record is missing');
      const statuses = { ...project[version].rules, ...project[version].security };
      assert.ok(Object.keys(statuses).length >= 4, where + ': ' + version + ' has too few measured properties');
      for (const [subject, status] of Object.entries(statuses)) {
        assert.notEqual(status, 'ERROR', where + ': ' + version + ' ' + subject + ' could not be measured');
      }
      assert.ok(project[version].journeys.length >= 2, where + ': ' + version + ' recorded too few journeys');
    }
    // The write claim is only true if a write journey was actually driven and shown to persist, from a
    // value posted in that attempt - not merely read back.
    if (project.project_id.startsWith('catalogue')) {
      for (const version of ['original', 'uplifted']) {
        const write = project[version].journeys.find((journey) => journey.name === 'write-journey');
        assert.ok(write, where + ': ' + version + ' has no write journey');
        assert.equal(write.posted, true, where + ': ' + version + ' posted to a refused route');
        assert.equal(write.persisted, true, where + ': ' + version + ' did not persist its posted value');
        assert.ok(write.submittedValue, where + ': the posted value was not recorded');
      }
    }
  }

  // The report's observation counts must be the counts in the records, not a second opinion.
  // Per-project verdicts, not just totals: a report that swapped two projects' outcomes would keep the
  // same counts and still be wrong.
  const byProject = new Map(report.decisions.map((decision) => [decision.project_id, decision]));
  for (const project of records.projects) {
    const decision = byProject.get(project.project_id);
    assert.ok(decision, project.project_id + ': the report has no decision');
    assert.equal(project.category, decision.category, project.project_id + ': verdict differs from the report');
    assert.equal(project.accepted, decision.accepted, project.project_id + ': acceptance differs from the report');
    assert.equal(project.original_sha, decision.original_sha, project.project_id + ': original hash differs');
    assert.equal(project.uplifted_sha, decision.uplifted_sha, project.project_id + ': uplift hash differs');
    assert.deepEqual(project.validation_observation, decision.validation_observation, project.project_id + ': observation differs');
    const applied = project.uplifted ? Object.entries(project.uplifted.rules).filter(([, status]) => status === 'PASS').map(([rule]) => rule) : [];
    for (const rule of decision.improved_rules) {
      assert.ok(
        applied.includes(rule) || project.uplifted.security[rule] === 'PASS',
        project.project_id + ': the report claims ' + rule + ' improved but the records do not show it passing after the uplift',
      );
      // "Improved" means it changed. A rule that was already passing did not improve, and a report that
      // counts it did not document this uplift.
      assert.equal(
        project.original.rules[rule],
        'FAIL',
        project.project_id + ': ' + rule + ' is counted as improved but did not start FAIL',
      );
    }
  }

  // The reload assertion the persistence gate used must be visible in the committed records.
  for (const project of records.projects) {
    const persistence = project.original.journeys.find((journey) => journey.name === 'server-persistence');
    assert.ok(persistence?.echoed, project.project_id + ': no echoed value in the persistence journey');
    assert.ok(persistence?.textLength > 0, project.project_id + ': no reload text length recorded');
  }

  const observations = records.projects.map((project) => project.validation_observation);
  assert.equal(observations.filter((value) => value === 'refused-observed').length, 33);
  assert.equal(observations.filter((value) => value === 'accepted-empty').length, 2);
  assert.equal(observations.filter((value) => value === 'blocked-without-evidence').length, 0);
  assert.match(readFileSync(join(repoRoot, 'docs', 'pilot', 'YIELD.md'), 'utf8'), /33 of 35 originals/);

  // The README's table of which properties improved, and in how many pairs, against the decisions it
  // summarises. Those counts were typed by hand, and one of them was wrong for four reviews.
  const counts = new Map();
  for (const decision of report.decisions) {
    for (const rule of decision.improved_rules) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  }
  const readme = readFileSync(join(repoRoot, 'docs', 'pilot', 'README.md'), 'utf8');
  const row = readme.split('\n').find((line) => line.startsWith('| `raw` | 5 | 5 |'));
  assert.ok(row, 'the README still carries the per-rule table');
  const claimed = [...row.matchAll(/`([a-z-]+\/[a-z0-9-]+)` (\d+)/g)].map((match) => [match[1], Number(match[2])]);
  assert.ok(claimed.length >= 4, 'the per-rule table lists its rules with counts');
  for (const [rule, claimedCount] of claimed) {
    assert.ok(counts.has(rule), rule + ' is claimed in the README but no decision improved it');
    assert.equal(claimedCount, counts.get(rule), rule + ': the README says ' + claimedCount + ' pairs, the decisions say ' + counts.get(rule));
  }
  assert.deepEqual(
    claimed.map(([rule]) => rule).sort(),
    [...counts.keys()].sort(),
    'the README table and the decisions should name the same rules',
  );
});

test('the clean baseline satisfies every rule it is not seeded to fail, in every arm', () => {
  // The first version of this test generated only the raw arm, so a dialect-specific gap in the clean
  // baseline would have gone unnoticed in four arms out of five.
  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    for (const archetypeId of ARCHETYPE_IDS) {
      const { files, spec: built } = buildProject({ archetypeId, frameworkName, defects: [] });
      const markup = files[built.framework.markupFile];
      const styles = files[built.framework.stylesFile];
      const script = files[built.framework.enhanceFile];
      const where = archetypeId + '/' + frameworkName;
      assert.ok(markup.includes(' required'), where + ': nothing is marked required');
      assert.ok(markup.includes('aria-errormessage='), where + ': no field points at its error text');
      assert.ok(styles.includes(':user-invalid'), where + ': no :user-invalid styling');
      assert.ok(markup.includes('role="alert"'), where + ': no live region');
      assert.ok(script.includes('function announce('), where + ': nothing fills the live region');
      assert.ok(script.includes('dataset.echoInserted'), where + ': the insertion is not marked');
      assert.ok(!script.includes('innerHTML'), where + ': the baseline inserts untrusted text as HTML');
      // A project must not be required to measure a property it cannot express, and must not be able to
      // drop one it can: the four always-on rules are required everywhere.
      for (const rule of [
        'forms/required-field-feedback',
        'forms/validate-input-after-interaction',
        'accessibility/accessible-error-announcement',
        'security/sanitize-untrusted-html',
      ]) {
        assert.ok(built.required_rules.includes(rule), where + ': ' + rule + ' is not required');
      }
    }
  }
});

test('the recorded corpus reproduces, through the gate the suite runs', () => {
  // A reproducibility gate nobody runs is a promise, not a check.
  const result = spawnSync(process.execPath, ['scripts/pilot-corpus.mjs', '--verify'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 240_000,
  });
  assert.equal(result.status, 0, 'check:pilot-corpus failed:\n' + result.stdout + result.stderr);
  assert.match(result.stdout, /PASS/);
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
