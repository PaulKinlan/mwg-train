import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  assert.equal(spec.family_id, 'feedback-example-test');
  assert.equal(spec.title, 'Customer Feedback');
  assert.equal(spec.story, 'Customer Feedback: Share your thoughts');
  assert.equal(spec.state.engine, 'sqlite');
  assert.equal(spec.persistence.write_route, '/submit-feedback');
  assert.equal(spec.persistence.read_route, '/feedback-receipt/:ref');
  assert.match(spec.persistence.reload_assertion, /reloading \/feedback-receipt\/<ref> still shows the stored name value/);

  // Routes: GET page, POST write with redirect, GET read-by-reference
  const pageRoute = spec.routes.find((r) => r.path === '/' && r.kind === 'page');
  const writeRoute = spec.routes.find((r) => r.path === '/submit-feedback' && r.kind === 'write');
  const readRoute = spec.routes.find((r) => r.path === '/feedback-receipt/:ref' && r.kind === 'read-by-reference');
  assert.ok(pageRoute, 'must serve page route /');
  assert.ok(writeRoute, 'must serve write route /submit-feedback');
  assert.equal(writeRoute.redirect, '/feedback-receipt/:ref');
  assert.ok(readRoute, 'must serve read-by-reference route /feedback-receipt/:ref');

  // Fields and required set
  assert.deepEqual(spec.validation.required_fields, ['name', 'email', 'comments']);
  const nameField = spec.fields.find((f) => f.name === 'name');
  assert.equal(nameField.echoed, true);
  assert.equal(nameField.required, true);

  const categoryField = spec.fields.find((f) => f.name === 'category');
  assert.equal(categoryField.optional, true);
  assert.deepEqual(categoryField.options, ['General', 'Support', 'Billing']);

  // Echo is derived from flow observation
  assert.equal(spec.echo.field, 'name');

  // Journey carries flow values and steps
  assert.equal(spec.journey.startPath, '/');
  assert.equal(spec.journey.formSelector, 'form#feedback-form');
  assert.equal(spec.journey.expectText, 'Alice Smith');
  assert.equal(spec.journey.fill['input[name=name]'], 'Alice Smith');
  assert.equal(spec.journey.fill['input[name=email]'], 'alice@example.test');
  assert.equal(spec.journey.fill['textarea[name=comments]'], 'Great service today');
  // The journey's steps are PLACES (path/fill/select/submit/expectText), not the flow's ACTIONS
  // (action/target/value). Six recorded actions merge into the steps the replay driver reads; asserting the
  // flow's count here would assert the shape the driver cannot read.
  assert.ok(spec.journey.steps.length > 0, 'the journey must carry the recorded flow');
  assert.ok(spec.journey.steps.some((s) => s.submit), 'the recorded submission must survive as step.submit');
  for (const step of spec.journey.steps) for (const key of Object.keys(step)) assert.ok(['path', 'fill', 'select', 'submit', 'expectText'].includes(key), `journey step carries ${key}`);

  // Capabilities infer nothing by default
  assert.deepEqual(spec.capabilities, { list_pages: false, detail_page: false, auth: false });
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
  assert.deepEqual(spec.journey.select, { 'select[name=category]': 'Billing' });
  assert.deepEqual(spec.journey.steps.find((step) => step.submit).select, { 'select[name=category]': 'Billing' });
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

  const { specPath, projects } = buildCapturedProjects({ spec, outDir: tempOut });
  assert.ok(existsSync(specPath));
  assert.equal(Object.keys(projects).length, 7);
  for (const [framework, dir] of Object.entries(projects)) {
    assert.ok(existsSync(join(dir, 'server.mjs')), `${framework} server.mjs must exist`);
    assert.ok(existsSync(join(dir, 'spec.json')), `${framework} spec.json must exist`);
  }
});

test('builds all seven framework arms and writes spec into quarantine store by default', (t) => {
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

  assert.equal(specPath, join(store, 'data/A4_clean_room_reproduction/specs/feedback-example-test.json'));
  assert.ok(existsSync(specPath));

  assert.equal(Object.keys(projects).length, 7);
  for (const framework of Object.keys(FRAMEWORKS)) {
    const dir = projects[framework];
    assert.equal(dir, join(store, `data/A4_clean_room_reproduction/projects/feedback-example-test-${framework}`));
    assert.ok(existsSync(join(dir, 'server.mjs')));
    assert.ok(existsSync(join(dir, 'spec.json')));
    assert.ok(existsSync(join(dir, 'package.json')));
  }
});

test('refuses to write generated projects into the repository tree', () => {
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
    { encoding: 'utf8' },
  );

  assert.match(stdout, /translated feedback-example-test/);
  assert.match(stdout, /spec written to/);
  assert.match(stdout, /built raw ->/);

  assert.ok(existsSync(join(outDir, 'feedback-example-test.json')));
  assert.ok(existsSync(join(outDir, 'feedback-example-test-raw/server.mjs')));
  assert.ok(existsSync(join(outDir, 'feedback-example-test-raw/spec.json')));
});
