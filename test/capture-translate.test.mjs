import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { translateCapture, buildCapturedProjects, TranslationError, MAPPABLE_CONTROL_TYPES } from '../src/capture/translate.mjs';
import { validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS } from '../pilot/frameworks.mjs';
import { REPO_ROOT, QuarantineError } from '../src/provenance/store.mjs';

function gitRepo(dir, origin) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', dir]);
  if (origin) execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', origin]);
  return dir;
}

function fixtureCapture() {
  return {
    capture_version: 1,
    source: {
      url: 'https://feedback.example.test/',
      final_url: 'https://feedback.example.test/',
      captured_at: '2026-10-08T22:00:00Z',
      rights_ref: 'docs/provenance/assets/reproduction-studies.md',
      arm: 'A5_black_box_reproduction',
    },
    viewport: { width: 1280, height: 800, device_scale_factor: 1 },
    pages: [{
      path: '/',
      title: 'Customer Feedback',
      landmarks: ['main'],
      headings: ['Share your thoughts'],
      nav: ['/'],
      text_excerpt: 'Please send us your feedback.',
      forms: [{
        id: 'feedback-form',
        action: '/submit-feedback',
        method: 'post',
        controls: [
          { name: 'name', type: 'text', label: 'Your Name', required: true },
          { name: 'email', type: 'email', label: 'Your Email', required: true },
          { name: 'category', type: 'select', label: 'Category', required: false, options: ['General', 'Support', 'Billing'] },
          { name: 'comments', type: 'textarea', label: 'Comments', required: true },
        ],
      }],
      links: [{ href: '/', text: 'Home' }],
    }],
    assets: {
      desktop_screenshot: { rel_path: 'A5/site/desktop.png', sha256: 'a'.repeat(64), bytes: 1024 },
      mobile_screenshot: { rel_path: 'A5/site/mobile.png', sha256: 'b'.repeat(64), bytes: 2048 },
      dom: { rel_path: 'A5/site/dom.html', sha256: 'c'.repeat(64), bytes: 4096 },
    },
    console: [],
    requests: [{ url: 'https://feedback.example.test/', method: 'GET', status: 200 }],
  };
}

function fixtureFlow() {
  return {
    flow_version: 1,
    source: {
      url: 'https://feedback.example.test/',
      rights_ref: 'docs/provenance/assets/reproduction-studies.md',
      captured_at: '2026-10-08T22:00:00Z',
    },
    start_path: '/',
    steps: [
      { index: 0, path: '/', action: 'goto' },
      { index: 1, path: '/', action: 'fill', target: 'input[name=name]', value: 'Alice Smith' },
      { index: 2, path: '/', action: 'fill', target: 'input[name=email]', value: 'alice@example.test' },
      { index: 3, path: '/', action: 'fill', target: 'textarea[name=comments]', value: 'Great service today' },
      { index: 4, path: '/', action: 'submit', target: 'form#feedback-form', expected_path: '/feedback-receipt' },
      { index: 5, path: '/feedback-receipt', action: 'goto', expectText: 'Alice Smith' },
    ],
  };
}

test('translates a valid capture and flow into a durable specification validated by validateSpec', () => {
  const capture = fixtureCapture();
  const flow = fixtureFlow();
  const spec = translateCapture({ capture, flow });

  // Specification schema conformance
  const problems = validateSpec(spec);
  assert.deepEqual(problems, [], `spec should validate with zero problems: ${problems.join('\n')}`);

  // Derived attributes match strict clean-room mapping
  assert.match(spec.family_id, /^form-flow-[a-f0-9]{16}$/);
  assert.equal(spec.title, 'Generated form flow (4 fields)');
  assert.equal(spec.story, 'Generated form flow (4 fields): a clean-room server-backed flow with 3 routes.');
  assert.equal(spec.state.engine, 'sqlite');
  assert.equal(spec.persistence.write_route, '/page-2');
  assert.equal(spec.persistence.read_route, '/page-1/:ref');
  assert.match(spec.persistence.reload_assertion, /reloading \/page-1\/<ref> still shows the stored field-1 value/);

  // Routes: GET page, POST write with redirect, GET read-by-reference
  const pageRoute = spec.routes.find((r) => r.path === '/' && r.kind === 'page');
  const writeRoute = spec.routes.find((r) => r.path === '/page-2' && r.kind === 'write');
  const readRoute = spec.routes.find((r) => r.path === '/page-1/:ref' && r.kind === 'read-by-reference');
  assert.ok(pageRoute, 'must serve page route /');
  assert.ok(writeRoute, 'must serve generated write route');
  assert.equal(writeRoute.redirect, '/page-1/:ref');
  assert.ok(readRoute, 'must serve generated read-by-reference route');
  assert.equal(spec.journey.steps.find((step) => step.submit).submit, spec.journey.formSelector);
  assert.equal(spec.persistence.write_route, writeRoute.path);
  assert.equal(spec.persistence.read_route, writeRoute.redirect);
  assert.ok(spec.routes.some((route) => route.method === 'GET' && route.path === spec.journey.startPath));

  // Fields and required set
  assert.deepEqual(spec.validation.required_fields, ['field-1', 'field-2', 'field-4']);
  const nameField = spec.fields.find((f) => f.name === 'field-1');
  assert.equal(nameField.echoed, true);
  assert.equal(nameField.required, true);

  const categoryField = spec.fields.find((f) => f.name === 'field-3');
  assert.equal(categoryField.optional, true);
  assert.deepEqual(categoryField.options, ['Option 1 for field 3', 'Option 2 for field 3', 'Option 3 for field 3']);
  assert.equal(nameField.label, 'Field 1 (text)');

  // Echo is derived from flow observation
  assert.equal(spec.echo.field, 'field-1');

  // Journey carries synthesized values and the same recorded actions
  assert.equal(spec.journey.startPath, '/');
  assert.equal(spec.journey.formSelector, 'form#generated-form-1');
  assert.equal(spec.journey.expectText, 'Sample field 1');
  assert.equal(spec.journey.fill['input[name=field-1]'], 'Sample field 1');
  assert.equal(spec.journey.fill['input[name=field-2]'], 'sample2@example.test');
  assert.equal(spec.journey.fill['textarea[name=field-4]'], 'Sample field 4');
  // The journey's steps are PLACES (path/fill/select/submit/expectText), not the flow's ACTIONS
  // (action/target/value). Six recorded actions merge into the steps the replay driver reads; asserting the
  // flow's count here would assert the shape the driver cannot read.
  assert.ok(spec.journey.steps.length > 0, 'the journey must carry the recorded flow');
  assert.ok(spec.journey.steps.some((s) => s.submit), 'the recorded submission must survive as step.submit');
  for (const step of spec.journey.steps) for (const key of Object.keys(step)) assert.ok(['path', 'fill', 'select', 'submit', 'expectText'].includes(key), `journey step carries ${key}`);

  // Capabilities infer nothing by default
  assert.deepEqual(spec.capabilities, { list_pages: false, detail_page: false, auth: false });
});

test('recorded words and typed values remain in quarantine, never in the spec or any generated source', (t) => {
  const capture = fixtureCapture();
  const flow = fixtureFlow();
  const canaries = ['Leak Canary', 'leak-canary@example.test', 'Secret site heading 8462', 'Secret label 7391', 'Secret option 5728',
    '/canary-path-5555', '/canary-action-6666', 'canary-host-7777', 'canary-form-8888', 'canary-field-9999', 'canary-slug-4321', 'canary-autocomplete-7654'];
  capture.source.url = 'https://canary-host-7777.example.test/canary-path-5555';
  capture.source.final_url = capture.source.url;
  flow.source.url = capture.source.url;
  capture.pages[0].path = '/canary-path-5555';
  capture.pages[0].forms[0].action = '/canary-action-6666';
  capture.pages[0].forms[0].id = 'canary-form-8888';
  capture.pages[0].forms[0].controls[0].name = 'canary-field-9999';
  capture.pages[0].forms[0].controls[0].slug = 'canary-slug-4321';
  capture.pages[0].forms[0].controls[0].autocomplete = 'canary-autocomplete-7654';
  flow.start_path = '/canary-path-5555';
  for (const step of flow.steps) {
    if (step.path === '/') step.path = '/canary-path-5555';
    if (step.target === 'input[name=name]') step.target = 'input[name=canary-field-9999]';
    if (step.target === 'form#feedback-form') step.target = 'form#canary-form-8888';
  }
  capture.pages[0].title = 'Secret site heading 8462';
  capture.pages[0].headings = ['Secret site heading 8462'];
  capture.pages[0].forms[0].controls[0].label = 'Secret label 7391';
  capture.pages[0].forms[0].controls[2].options[1] = 'Secret option 5728';
  flow.steps[1].value = 'Leak Canary';
  flow.steps[2].value = 'leak-canary@example.test';
  flow.steps.splice(4, 0, { index: 4, path: '/canary-path-5555', action: 'select', target: 'select[name=category]', value: 'Secret option 5728' });
  flow.steps[5].index = 5;
  flow.steps[6].index = 6;
  flow.steps[6].expectText = 'Leak Canary';
  const temp = mkdtempSync(join(tmpdir(), 'capture-no-leak-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const captureFile = join(temp, 'capture.json');
  writeFileSync(captureFile, JSON.stringify({ capture, flow }));
  const quarantined = readFileSync(captureFile, 'utf8');
  for (const word of canaries) assert.ok(quarantined.includes(word), `quarantined evidence retains ${word}`);

  const spec = translateCapture({ capture, flow });
  const { specPath, projects } = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });
  const generatedFiles = [specPath];
  const generatedNames = [specPath, ...Object.values(projects)];
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path);
      else generatedFiles.push(path);
      generatedNames.push(path);
    }
  }
  for (const dir of Object.values(projects)) {
    collect(dir);
    const contents = generatedFiles.filter((file) => file.startsWith(dir)).map((file) => readFileSync(file, 'utf8'));
    assert.ok(contents.some((source) => source.includes(`action="${spec.persistence.write_route}"`)),
      'rendered form action must match the generated write route');
    assert.ok(contents.some((source) => source.includes(`id="${spec.journey.formSelector.slice(5)}"`)),
      'rendered form must match the journey submit selector');
  }
  for (const word of canaries) {
    assert.ok(!JSON.stringify(spec).includes(word), `spec must not contain ${word}`);
    for (const file of generatedFiles) assert.ok(!readFileSync(file, 'utf8').includes(word), `${file} must not contain ${word}`);
    for (const path of generatedNames) assert.ok(!path.includes(word), `generated path ${path} must not contain ${word}`);
  }
});

test('translating identical evidence twice emits byte-identical specs', () => {
  const capture = fixtureCapture();
  const flow = fixtureFlow();
  assert.equal(JSON.stringify(translateCapture({ capture, flow })), JSON.stringify(translateCapture({ capture, flow })));
});

test('route and identifier mapping depends on structure, not captured spelling or host', () => {
  const first = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const capture = fixtureCapture();
  const flow = fixtureFlow();
  capture.source.url = 'https://another-person.example.test/';
  capture.source.final_url = capture.source.url;
  flow.source.url = capture.source.url;
  capture.pages[0].forms[0].id = 'private-form-id';
  capture.pages[0].forms[0].controls[0].name = 'private-field-name';
  flow.steps[1].target = 'input[name=private-field-name]';
  flow.steps[4].target = 'form#private-form-id';
  capture.pages[0].forms[0].action = '/secret-write';
  flow.steps[4].expected_path = '/secret-result';
  flow.steps[5].path = '/secret-result';
  const second = translateCapture({ capture, flow });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('generic field identifiers avoid collisions with captured names', () => {
  const capture = fixtureCapture();
  const flow = fixtureFlow();
  capture.pages[0].forms[0].controls[0].name = 'field-1';
  flow.steps[1].target = 'input[name=field-1]';
  const spec = translateCapture({ capture, flow });
  assert.deepEqual(spec.fields.map((field) => field.name), ['field-2', 'field-3', 'field-4', 'field-5']);
  assert.deepEqual(validateSpec(spec), []);
});

test('refuses query-bearing form actions and journey pages rather than publishing them', () => {
  const capture = fixtureCapture();
  capture.pages[0].forms[0].action = '/submit?token=private';
  assert.throws(() => translateCapture({ capture, flow: fixtureFlow() }),
    (err) => err instanceof TranslationError && /cannot synthesize route/.test(err.message));
  const flow = fixtureFlow();
  flow.steps[1].path = '/person?token=private';
  assert.throws(() => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && /cannot synthesize route/.test(err.message));
});

test('refuses an unserved journey page instead of producing an undrivable replay', () => {
  const flow = fixtureFlow();
  flow.steps[1].path = '/missing-page';
  assert.throws(() => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && /has no captured page route/.test(err.message));
});

test('generated arms declare exactly their runtime dependencies from the repository package', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'capture-dependencies-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const versions = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).dependencies;
  const expected = {
    hono: ['hono'], raw: [], react: ['htm', 'react', 'react-dom'],
    preact: ['htm', 'preact', 'preact-render-to-string'], vue: ['vue'],
    webcomponents: [], svelte: ['svelte'],
  };
  const spec = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const { projects } = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });
  for (const [arm, packages] of Object.entries(expected)) {
    const manifest = JSON.parse(readFileSync(join(projects[arm], 'package.json'), 'utf8'));
    assert.deepEqual(manifest.dependencies, Object.fromEntries(packages.map((name) => [name, versions[name]])), arm);
  }
});

test('refuses translation if no POST form is found in capture', () => {
  const capture = fixtureCapture();
  capture.pages[0].forms[0].method = 'get';
  assert.throws(
    () => translateCapture({ capture, flow: fixtureFlow() }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /no POST form found in capture: nothing to clean-room reconstruct/);
      return true;
    },
  );
});

test('refuses translation if no step observes a supplied value', () => {
  const flow = fixtureFlow();
  delete flow.steps[5].expectText;
  assert.throws(
    () => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /no step observed a supplied value: cannot establish persistence without an observed reload assertion/);
      return true;
    },
  );
});

test('refuses a submit target that cannot identify the captured POST form', () => {
  for (const target of ['button#send', 'form#other']) {
    const flow = fixtureFlow();
    flow.steps[4].target = target;
    assert.throws(
      () => translateCapture({ capture: fixtureCapture(), flow }),
      (err) => err instanceof TranslationError && err.message.includes(target),
      `submit target ${target} must be named in refusal`,
    );
  }
});

test('refuses a fill selector without an exact captured field name', () => {
  const flow = fixtureFlow();
  flow.steps[1].target = 'input#name';
  assert.throws(
    () => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && err.message.includes('input#name'),
  );
});

test('refuses translation if flow touches a control never recorded in capture', () => {
  const flow = fixtureFlow();
  flow.steps[1].target = 'input[name=unrecorded_control]';
  assert.throws(
    () => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /flow touches control 'unrecorded_control' which was never recorded in capture/);
      return true;
    },
  );
});

test('refuses translation if captured POST form has no id for formSelector', () => {
  const capture = fixtureCapture();
  capture.pages[0].forms[0].id = '';
  assert.throws(
    () => translateCapture({ capture, flow: fixtureFlow() }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /captured POST form \(action: \/submit-feedback, method: post, controls: name, email, category, comments\) has no id: generator requires form selector in the form form#id/);
      return true;
    },
  );
});

test('submit buttons are triggers rather than data fields, and selections reach the top-level journey', () => {
  const capture = fixtureCapture();
  capture.pages[0].forms[0].controls.push({ name: 'send', type: 'submit', label: 'Send', required: false });
  const flow = fixtureFlow();
  flow.steps.splice(4, 0, { index: 4, path: '/', action: 'select', target: 'select[name=category]', value: 'Billing' });
  flow.steps[5].index = 5;
  flow.steps[6].index = 6;
  const spec = translateCapture({ capture, flow });
  assert.equal(spec.fields.some((field) => field.type === 'submit'), false);
  assert.deepEqual(spec.journey.select, { 'select[name=field-3]': 'Option 3 for field 3' });
  assert.deepEqual(spec.journey.steps.find((step) => step.submit).select, { 'select[name=field-3]': 'Option 3 for field 3' });
});

test('refuses a coincidental match between recorded and synthetic values', () => {
  const flow = fixtureFlow();
  flow.steps[1].value = 'Sample field 1';
  flow.steps[5].expectText = 'Sample field 1';
  assert.throws(() => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && /coincides with recorded/.test(err.message));
});

test('refuses a selection absent from captured options instead of publishing its value', () => {
  const flow = fixtureFlow();
  flow.steps.splice(4, 0, { index: 4, path: '/', action: 'select', target: 'select[name=category]', value: 'not an option' });
  flow.steps[5].index = 5;
  flow.steps[6].index = 6;
  assert.throws(() => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && /not recorded among its options/.test(err.message));
});

test('refuses translation if a control type cannot be mapped to generator', () => {
  const capture = fixtureCapture();
  // checkbox is allowed by capture schema but cannot be rendered by the 7 framework generators
  capture.pages[0].forms[0].controls.push({
    name: 'subscribe',
    type: 'checkbox',
    label: 'Subscribe to updates',
    required: false,
  });
  assert.throws(
    () => translateCapture({ capture, flow: fixtureFlow() }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /control 'subscribe' has unmappable type 'checkbox': generator cannot render this control type/);
      return true;
    },
  );
});

test('refuses translation if capture or flow fails schema validation', () => {
  const capture = fixtureCapture();
  capture.source.rights_ref = '';
  assert.throws(
    () => translateCapture({ capture, flow: fixtureFlow() }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /invalid capture:/);
      return true;
    },
  );

  const flow = fixtureFlow();
  flow.start_path = 'relative/path';
  assert.throws(
    () => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => {
      assert.ok(err instanceof TranslationError);
      assert.match(err.message, /invalid flow:/);
      return true;
    },
  );
});

test('clean-room boundary: translating and generating does not open or read raw assets', (t) => {
  const capture = fixtureCapture();
  // Point all raw assets to non-existent files under imaginary paths
  capture.assets.desktop_screenshot.rel_path = 'A5/non-existent-desktop-screenshot.png';
  capture.assets.mobile_screenshot.rel_path = 'A5/non-existent-mobile-screenshot.png';
  capture.assets.dom.rel_path = 'A5/non-existent-dom-snapshot.html';

  const flow = fixtureFlow();
  // Translating must succeed without opening or reading these non-existent asset files
  const spec = translateCapture({ capture, flow });
  assert.equal(validateSpec(spec).length, 0);

  // Generating all seven frameworks to an external temp dir must also succeed without touching raw assets
  const tempOut = mkdtempSync(join(tmpdir(), 'clean-room-boundary-'));
  t.after(() => rmSync(tempOut, { recursive: true, force: true }));

  const { specPath, projects } = buildCapturedProjects({ spec, outDir: tempOut, testTempDir: tempOut });
  assert.ok(existsSync(specPath));
  assert.equal(Object.keys(projects).length, 7);
  for (const [framework, dir] of Object.entries(projects)) {
    assert.ok(existsSync(join(dir, 'server.mjs')), `${framework} server.mjs must exist`);
    assert.ok(existsSync(join(dir, 'spec.json')), `${framework} spec.json must exist`);
  }
});

test('builds all seven framework arms and publishes the spec to public A4 by default', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'quarantine-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const publicRepo = gitRepo(join(root, 'mwg-train'), 'https://github.example/PaulKinlan/mwg-train');
  const store = gitRepo(join(root, 'mwg-quarantine'), 'https://github.example/PaulKinlan/mwg-quarantine');

  const capture = fixtureCapture();
  const flow = fixtureFlow();
  const spec = translateCapture({ capture, flow });

  const { specPath, projects } = buildCapturedProjects({
    spec,
    quarantineRoot: store,
    repoRoot: publicRepo,
  });

  assert.equal(specPath, join(publicRepo, `data/A4_clean_room_reproduction/specs/${spec.family_id}.json`));
  assert.ok(existsSync(specPath));

  assert.equal(Object.keys(projects).length, 7);
  for (const framework of Object.keys(FRAMEWORKS)) {
    const dir = projects[framework];
    assert.equal(dir, join(publicRepo, `data/A4_clean_room_reproduction/projects/${spec.family_id}-${framework}`));
    assert.ok(existsSync(join(dir, 'server.mjs')));
    assert.ok(existsSync(join(dir, 'spec.json')));
    assert.ok(existsSync(join(dir, 'package.json')));
  }
  assert.equal(existsSync(join(store, 'data/A4_clean_room_reproduction')), false);
});

test('explicit output may still target a verified quarantine checkout', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'capture-explicit-store-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const publicRepo = gitRepo(join(root, 'mwg-train'), 'https://github.example/PaulKinlan/mwg-train');
  const store = gitRepo(join(root, 'mwg-quarantine'), 'https://github.example/PaulKinlan/mwg-quarantine');
  const outDir = join(store, 'alternate-output');
  const spec = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const { specPath, projects } = buildCapturedProjects({ spec, framework: 'raw', outDir,
    quarantineRoot: store, repoRoot: publicRepo });
  assert.equal(specPath, join(outDir, `${spec.family_id}.json`));
  assert.ok(existsSync(specPath));
  assert.ok(existsSync(join(projects.raw, 'server.mjs')));
  assert.equal(existsSync(join(publicRepo, 'data/A4_clean_room_reproduction')), false);
});

test('explicit output remains contained: refuses arbitrary repository paths', () => {
  const capture = fixtureCapture();
  const flow = fixtureFlow();
  const spec = translateCapture({ capture, flow });

  assert.throws(
    () => buildCapturedProjects({ spec, outDir: join(REPO_ROOT, 'data/escaped') }),
    (err) => {
      assert.ok(err instanceof QuarantineError);
      assert.equal(err.code, 'REPO_WRITE_PROHIBITED');
      return true;
    },
  );
});

test('capture-to-projects CLI builds spec and projects via command-line arguments', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-run-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const capFile = join(tempDir, 'capture.json');
  const flowFile = join(tempDir, 'flow.json');
  const outDir = join(tempDir, 'projects-out');

  writeFileSync(capFile, JSON.stringify(fixtureCapture()));
  writeFileSync(flowFile, JSON.stringify(fixtureFlow()));

  const scriptPath = join(REPO_ROOT, 'scripts/capture-to-projects.mjs');
  const stdout = execFileSync(
    'node',
    [scriptPath, '--capture', capFile, '--flow', flowFile, '--framework', 'raw', '--out', outDir],
    { encoding: 'utf8', timeout: 30000, env: { ...process.env, MWG_TRAIN_CAPTURE_TEST_TEMP: tempDir } },
  );

  const familyId = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() }).family_id;
  assert.match(stdout, new RegExp(`translated ${familyId}`));
  assert.match(stdout, /spec written to/);
  assert.match(stdout, /built raw ->/);

  assert.ok(existsSync(join(outDir, `${familyId}.json`)));
  assert.ok(existsSync(join(outDir, `${familyId}-raw/server.mjs`)));
  assert.ok(existsSync(join(outDir, `${familyId}-raw/spec.json`)));
  assert.equal(JSON.parse(readFileSync(join(outDir, `${familyId}.json`))).family_id, familyId);
  assert.ok(!existsSync(join(REPO_ROOT, `${familyId}.json`)));
  assert.ok(!existsSync(join(REPO_ROOT, `${familyId}-raw`)));
});

test('capture-to-projects CLI refuses repo output without writing a spec or project', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cli-refusal-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const capFile = join(tempDir, 'capture.json');
  const flowFile = join(tempDir, 'flow.json');
  const rejected = join(REPO_ROOT, 'data/generated-refused');
  writeFileSync(capFile, JSON.stringify(fixtureCapture()));
  writeFileSync(flowFile, JSON.stringify(fixtureFlow()));
  assert.throws(
    () => execFileSync('node', [join(REPO_ROOT, 'scripts/capture-to-projects.mjs'), '--capture', capFile, '--flow', flowFile, '--out', rejected], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }),
    (err) => err.status !== 0 && err.stderr.includes(rejected) && /refus|repo tree/i.test(err.stderr),
  );
  assert.ok(!existsSync(rejected));
});

test('preserves the navigation a recorded click caused, instead of dropping the destination', () => {
  // The click's own target is synthesized away and the driver cannot re-perform it, so reproducing the
  // navigation it caused is what keeps the replay on the page the recording reached.
  const capture = fixtureCapture();
  capture.pages.push({
    path: '/feedback-receipt',
    title: 'Receipt',
    landmarks: ['main'],
    headings: ['Thank you'],
    nav: ['/'],
    text_excerpt: 'Thank you for your feedback.',
    forms: [],
    links: [{ href: '/', text: 'Home' }],
  });
  const flow = fixtureFlow();
  flow.steps = [
    { index: 0, path: '/', action: 'goto' },
    { index: 1, path: '/', action: 'click', target: 'a#more', expected_path: '/feedback-receipt' },
    { index: 2, path: '/', action: 'fill', target: 'input[name=name]', value: 'Alice Smith' },
    { index: 3, path: '/', action: 'fill', target: 'input[name=email]', value: 'alice@example.test' },
    { index: 4, path: '/', action: 'fill', target: 'textarea[name=comments]', value: 'Great service today' },
    { index: 5, path: '/', action: 'submit', target: 'form#feedback-form', expected_path: '/feedback-receipt' },
    { index: 6, path: '/feedback-receipt', action: 'goto', expectText: 'Alice Smith' },
  ];
  const spec = translateCapture({ capture, flow });
  const receiptPath = spec.routes.find((route) => route.kind === 'page' && route.path !== '/').path;
  const visited = [spec.journey.startPath, ...spec.journey.steps.map((step) => step.path)];
  assert.ok(visited.includes(receiptPath),
    `the page the click navigated to must appear in the journey, got ${JSON.stringify(visited)}`);
});

test('refuses a click into an uncaptured page rather than dropping the navigation silently', () => {
  // Before the click was preserved this translated and published, with the journey quietly missing a page.
  const flow = fixtureFlow();
  flow.steps.splice(1, 0, { index: 1, path: '/', action: 'click', target: 'a#more', expected_path: '/never-captured' });
  flow.steps = flow.steps.map((step, index) => ({ ...step, index }));
  assert.throws(() => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && /has no captured page route/.test(err.message));
});

test('refuses a start path with no captured page instead of publishing an undrivable replay', () => {
  // The harness navigates startPath before every step, so an unserved start path is a 404 in every arm,
  // while validateSpec and the translation both looked fine.
  const flow = fixtureFlow();
  flow.start_path = '/never-captured';
  assert.throws(() => translateCapture({ capture: fixtureCapture(), flow }),
    (err) => err instanceof TranslationError && /journey start path/.test(err.message) && /has no captured page route/.test(err.message));
});

test('the CLI refuses differing existing output, and replaces it only with --overwrite', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'capture-cli-overwrite-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const captureFile = join(temp, 'capture.json');
  const flowFile = join(temp, 'flow.json');
  writeFileSync(captureFile, JSON.stringify(fixtureCapture()));
  writeFileSync(flowFile, JSON.stringify(fixtureFlow()));
  const out = join(temp, 'published');
  const cli = (extra) => execFileSync('node', [
    join(REPO_ROOT, 'scripts', 'capture-to-projects.mjs'),
    '--capture', captureFile, '--flow', flowFile, '--framework', 'react', '--out', out, ...extra,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, env: { ...process.env, MWG_TRAIN_CAPTURE_TEST_TEMP: temp } });

  const firstRun = cli([]);
  const built = firstRun.match(/built react -> (.+)/)[1].trim();
  const stale = join(built, 'server.mjs');
  writeFileSync(stale, '// built by an older generator\n');

  // The published tree is what a guarded store protects, so the CLI must refuse here rather than replace it.
  assert.throws(() => cli([]), (err) => err.status !== 0 && /already holds different output/.test(err.stderr) && err.stderr.includes(built));
  assert.equal(readFileSync(stale, 'utf8'), '// built by an older generator\n', 'a refusal must not touch the destination');

  const replaced = cli(['--overwrite']);
  assert.match(replaced, /built react ->/);
  assert.notEqual(readFileSync(stale, 'utf8'), '// built by an older generator\n');
});

test('a repeated build writes nothing at all, so an identical published tree is never touched', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'capture-noop-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const spec = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const first = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });
  const stamp = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}/${entry.name}:${statSync(join(entry.parentPath, entry.name)).mtimeMs}`)
    .sort();
  const before = [...stamp(dirname(first.specPath)), ...Object.values(first.projects).flatMap(stamp)];

  const again = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });
  const after = [...stamp(dirname(again.specPath)), ...Object.values(again.projects).flatMap(stamp)];
  assert.deepEqual(after, before, 'an identical re-run must not rewrite any file');
});

test('refuses a destination holding a symlink instead of writing through it', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'capture-symlink-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const spec = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const { projects } = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });

  // A symlink in the destination is not a "regular destination file": following it would write outside the store.
  // The target holds IDENTICAL bytes, so only the entry's kind can distinguish this from a normal re-run - with
  // a differing target the comparison would refuse on content alone and prove nothing about following symlinks.
  const victim = join(projects.raw, 'server.mjs');
  const outside = join(temp, 'outside.txt');
  const original = readFileSync(victim);
  writeFileSync(outside, original);
  rmSync(victim);
  symlinkSync(outside, victim);
  const outsideBefore = statSync(outside).mtimeMs;

  assert.throws(() => buildCapturedProjects({ spec, outDir: temp, testTempDir: temp }),
    (err) => err instanceof TranslationError && /already holds different output/.test(err.message));
  assert.ok(readFileSync(outside).equals(original), 'the target must keep its bytes');
  assert.equal(statSync(outside).mtimeMs, outsideBefore, 'a refusal must not write through a symlink');
  assert.ok(lstatSync(victim).isSymbolicLink(), 'the symlink itself must survive the refusal');
});

test('refuses a destination it cannot compare, instead of crashing on it', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'capture-unreadable-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const spec = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const { specPath } = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });

  // A directory where the spec file belongs: the comparison must refuse with a reason, not throw EISDIR.
  rmSync(specPath);
  mkdirSync(specPath);
  assert.throws(() => buildCapturedProjects({ spec, outDir: temp, testTempDir: temp }),
    (err) => err instanceof TranslationError
      && /already holds different output/.test(err.message)
      && err.message.includes(specPath)
      && err.code === undefined);
});

test('refuses to overwrite existing output that differs, and replaces it only when asked', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'capture-collision-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const spec = translateCapture({ capture: fixtureCapture(), flow: fixtureFlow() });
  const { specPath, projects } = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp });

  // Re-running the same capture proves identity and stays a no-op rather than being treated as a collision.
  assert.equal(buildCapturedProjects({ spec, outDir: temp, testTempDir: temp }).specPath, specPath);

  // Output that differs - a tree built by an earlier generator, or an edited one - must not be replaced silently.
  const stale = join(projects.react, 'server.mjs');
  writeFileSync(stale, '// built by an older generator\n');
  assert.throws(() => buildCapturedProjects({ spec, outDir: temp, testTempDir: temp }),
    (err) => err instanceof TranslationError
      && /already holds different output/.test(err.message)
      && err.message.includes(projects.react));
  assert.equal(readFileSync(stale, 'utf8'), '// built by an older generator\n', 'a refusal must not touch the destination');

  // The spec is guarded the same way, and the refusal names the spec.
  writeFileSync(specPath, '{}\n');
  assert.throws(() => buildCapturedProjects({ spec, outDir: temp, testTempDir: temp }),
    (err) => err instanceof TranslationError
      && /already holds different output/.test(err.message)
      && err.message.includes(specPath));

  // An explicit overwrite replaces both, and a replacement starts clean so no stale file survives.
  const replaced = buildCapturedProjects({ spec, outDir: temp, testTempDir: temp, overwrite: true });
  assert.equal(replaced.specPath, specPath);
  assert.notEqual(readFileSync(stale, 'utf8'), '// built by an older generator\n');
  assert.deepEqual(validateSpec(spec), []);
});
