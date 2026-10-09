/** Corpus discovery and page rendering tests, against a fixture corpus built on disk. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { filterProjects, loadCorpus, projectView } from '../src/viewer/corpus.mjs';
import { renderIndex, renderProject } from '../src/viewer/pages.mjs';
import { combineScanStatus } from '../src/viewer/server.mjs';

function buildFixtureCorpus() {
  const root = mkdtempSync(join(tmpdir(), 'viewer-corpus-test-'));
  const project = (id, { defects = [], run = null }) => {
    const dir = join(root, 'projects', id);
    mkdirSync(join(dir, 'app'), { recursive: true });
    writeFileSync(join(dir, 'server.mjs'), '// server');
    writeFileSync(
      join(dir, 'spec.json'),
      JSON.stringify({
        project_id: id,
        archetype: id.split('-')[0],
        archetype_title: `${id} title`,
        framework: { name: id.endsWith('raw') ? 'raw' : 'react', version: '1.0', family: 'test', dialect: 'html' },
        seeded_defects: defects,
        required_rules: ['forms/required-field-feedback', 'accessibility/accessible-error-announcement'],
        journey: { startPath: '/' },
      }),
    );
    if (run) {
      const runDir = join(root, 'out', '2026-10-08T00-00-00-000Z', id);
      mkdirSync(join(runDir, 'evidence'), { recursive: true });
      writeFileSync(join(runDir, 'decision.json'), JSON.stringify(run.decision));
      writeFileSync(join(runDir, 'original.json'), JSON.stringify(run.original));
      writeFileSync(join(runDir, 'uplifted.json'), JSON.stringify(run.uplifted));
      writeFileSync(join(runDir, 'evidence', 'original-desktop.png'), Buffer.from([137, 80, 78, 71]));
    }
  };

  project('booking-raw', {
    defects: ['no-required'],
    run: {
      decision: {
        project_id: 'booking-raw',
        archetype: 'booking',
        framework: 'raw',
        accepted: true,
        category: 'accepted',
        detail: ['improved forms/required-field-feedback'],
        improved_rules: ['forms/required-field-feedback'],
        regressed_rules: [],
        new_security_findings: [],
        seeded_defects: ['no-required'],
        original_sha: 'sha256:aaaa',
        uplifted_sha: 'sha256:bbbb',
        uplift_edits: [{ rule: 'forms/required-field-feedback', file: 'app/page.mjs' }],
        uplift_applied: ['forms/required-field-feedback'],
        uplift_skipped: [],
        uplift_failed: [],
      },
      original: {
        project_id: 'booking-raw',
        label: 'original',
        journeys: [{ name: 'server-persistence', steps: [{ step: 'open', url: '/', status: 200 }] }],
        rules: [{ rule: 'forms/required-field-feedback', status: 'FAIL', detail: 'no required attribute' }],
        security: [{ check: 'no-secrets-in-client', status: 'PASS' }],
        console: [],
        console_errors: 0,
      },
      uplifted: {
        project_id: 'booking-raw',
        label: 'uplifted',
        journeys: [{ name: 'server-persistence', steps: [{ step: 'open', url: '/', status: 200 }] }],
        rules: [{ rule: 'forms/required-field-feedback', status: 'PASS', detail: 'required present' }],
        security: [{ check: 'no-secrets-in-client', status: 'PASS' }],
        console: [],
        console_errors: 0,
      },
    },
  });
  project('catalogue-react', {
    defects: [],
    run: {
      decision: {
        project_id: 'catalogue-react',
        archetype: 'catalogue',
        framework: 'react',
        accepted: false,
        category: 'no-warranted-change',
        detail: ['the original already satisfied every measured property'],
        improved_rules: [],
        regressed_rules: [],
        new_security_findings: [],
        seeded_defects: [],
        original_sha: 'sha256:cccc',
        uplifted_sha: 'sha256:dddd',
      },
      original: { project_id: 'catalogue-react', label: 'original', journeys: [], rules: [], security: [], console: [], console_errors: 0 },
      uplifted: { project_id: 'catalogue-react', label: 'uplifted', journeys: [], rules: [], security: [], console: [], console_errors: 0 },
    },
  });
  project('contact-lead-raw', { defects: ['xss-innerhtml'] }); // no run recorded
  return root;
}

test('loadCorpus discovers projects, the latest run and honest no-run state', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  assert.equal(corpus.projects.length, 3);
  assert.equal(corpus.runId, '2026-10-08T00-00-00-000Z');
  const byId = new Map(corpus.projects.map((project) => [project.id, project]));
  assert.equal(byId.get('booking-raw').decision.accepted, true);
  assert.equal(byId.get('catalogue-react').decision.accepted, false);
  assert.equal(byId.get('contact-lead-raw').decision, null);
});

test('filters select by archetype, framework, state and rule', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const views = corpus.projects.map((project) => projectView(project));

  assert.deepEqual(filterProjects(views, { archetype: 'booking' }).map((v) => v.id), ['booking-raw']);
  assert.deepEqual(filterProjects(views, { framework: 'react' }).map((v) => v.id), ['catalogue-react']);
  assert.deepEqual(filterProjects(views, { state: 'accepted' }).map((v) => v.id), ['booking-raw']);
  assert.deepEqual(filterProjects(views, { state: 'rejected' }).map((v) => v.id), ['catalogue-react']);
  assert.deepEqual(filterProjects(views, { state: 'no-run' }).map((v) => v.id), ['contact-lead-raw']);
  assert.deepEqual(filterProjects(views, { state: 'no-warranted-change' }).map((v) => v.id), ['catalogue-react']);
  assert.deepEqual(filterProjects(views, { rule: 'forms/required-field-feedback' }).map((v) => v.id).sort(), ['booking-raw', 'catalogue-react', 'contact-lead-raw']);
});

test('the index shows accepted and rejected with equal prominence, and escaping holds', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const views = corpus.projects.map((project) => projectView(project));
  const html = renderIndex({ views, allViews: views, filters: {}, runId: corpus.runId, runs: corpus.runs, yieldReport: null, scanAvailable: true, liveOrigin: 'http://127.0.0.1:7701' });
  assert.match(html, /ACCEPTED PAIR/);
  assert.match(html, /REJECTED ATTEMPT · no-warranted-change/);
  assert.match(html, /NOT YET RUN/);
  assert.match(html, /booking-raw/);
  assert.match(html, /catalogue-react/);
});

test('index distinguishes absent run data, empty corpus and filters excluding recorded projects', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const allViews = corpus.projects.map((project) => projectView(project));
  const render = (views, source = allViews, filters = {}) => renderIndex({ views, allViews: source, filters,
    runId: corpus.runId, runs: corpus.runs, yieldReport: null, scanAvailable: true, liveOrigin: 'http://127.0.0.1:7701' });
  assert.match(render([], allViews, { archetype: 'booking' }), /No projects match these filters/);
  assert.match(render([], allViews, { archetype: 'booking' }), /Clear filters/);
  assert.match(render([], []), /No corpus projects are present/);
  const unrun = allViews.filter((view) => !view.hasRun);
  const noRuns = render([], unrun, { state: 'accepted' });
  assert.match(noRuns, /No pilot run data is present/);
  assert.match(noRuns, /filters also exclude the unrun projects/);
  assert.doesNotMatch(noRuns, /No projects match these filters/);
  assert.match(render(allViews), /role="region" aria-label="Corpus projects"/);
});

test('record content is escaped: evidence text cannot inject markup into the viewer', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const project = corpus.projects.find((p) => p.id === 'booking-raw');
  project.decision.detail = ['<script>alert(1)</script>'];
  project.spec.archetype_title = '<img src=x onerror=alert(1)>';
  const view = projectView(project);
  const html = renderProject({ view, runId: corpus.runId, runs: corpus.runs, liveOrigin: 'http://127.0.0.1:7701' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.match(html, /&lt;script&gt;/);
});

test('the default run is the manifest run, not a newer decisionless local run (review finding)', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // A manifest recording run R, and a NEWER local run dir with no decisions: the default view
  // must stay the manifest run so recorded projects do not silently become unpaired.
  mkdirSync(join(root, 'out', '2999-01-01T00-00-00-000Z'), { recursive: true });
  writeFileSync(
    join(root, 'CORPUS.json'),
    JSON.stringify({
      run_id: '2026-10-08T00-00-00-000Z',
      generated_at: '2026-10-08T00:00:00.000Z',
      generator: 'scripts/scaffold-pilot.mjs',
      projects: [{ project_id: 'booking-raw', archetype: 'booking', framework: 'raw', accepted: true, category: null, original_sha: 'sha256:aaaa', uplift_sha: 'sha256:bbbb', improved_rules: [], uplift_applied: [] }],
    }),
  );
  const corpus = loadCorpus(root);
  assert.equal(corpus.runId, '2026-10-08T00-00-00-000Z', 'default view is the manifest run');
  // An explicit selection of the newer run is honoured (its projects are honestly decisionless).
  const newer = loadCorpus(root, '2999-01-01T00-00-00-000Z');
  assert.equal(newer.runId, '2999-01-01T00-00-00-000Z');
  assert.equal(newer.projects.find((p) => p.id === 'booking-raw').decision, null);
});

test('the pair scan combiner: a MISSING original is PARTIAL, never PASS (mixed-state regression)', () => {
  const P = { status: 'PASS', findings: [] };
  const M = { status: 'MISSING', findings: [] };
  assert.equal(combineScanStatus({ original: P, uplifted: P, records: P }), 'PASS');
  assert.equal(combineScanStatus({ original: M, uplifted: P, records: P }), 'PARTIAL');
  assert.equal(combineScanStatus({ original: P, uplifted: M, records: P }), 'PARTIAL');
  assert.equal(combineScanStatus({ original: M, uplifted: M, records: P }), 'PARTIAL');
  assert.equal(combineScanStatus({ original: P, uplifted: P, records: { status: 'NO-RUN', findings: [] } }), 'PARTIAL');
  assert.equal(combineScanStatus({ original: P, uplifted: P, records: { status: 'FAIL', findings: [{}] } }), 'FAIL');
  assert.equal(combineScanStatus({ original: P, uplifted: { status: 'ERROR', findings: [] }, records: P }), 'ERROR');
});

test('a manifest-only project (tree not on disk) offers live actions with honest pending labels', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const views = corpus.projects.map((project) =>
    projectView(project, {
      // The scan state of a manifest-only project: both trees absent, records clean.
      scan: { status: 'PARTIAL', original: { status: 'MISSING', findings: [] }, uplifted: { status: 'MISSING', findings: [] }, records: { status: 'PASS', findings: [] } },
    }),
  );
  const html = renderIndex({ views, allViews: views, filters: {}, runId: corpus.runId, runs: corpus.runs, yieldReport: null, scanAvailable: true, liveOrigin: 'http://127.0.0.1:7701' });
  assert.match(html, /pending \(verified\+scanned at serve\)/, 'absent trees are labelled pending, not clean');
  assert.match(html, /\/live\/booking-raw\/original\//, 'the live action is offered (the serve-time gate enforces)');
});

test('a record-level owner-auth failure disables BOTH live buttons (the pair is refused)', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const views = corpus.projects.map((project) =>
    projectView(project, {
      scan: { status: 'FAIL', original: { status: 'PASS', findings: [] }, uplifted: { status: 'PASS', findings: [] }, records: { status: 'FAIL', findings: [{ file: 'decision.json', line: 1, patternId: 'x', kind: 'identity-name' }] } },
    }),
  );
  const html = renderIndex({ views, allViews: views, filters: {}, runId: corpus.runId, runs: corpus.runs, yieldReport: null, scanAvailable: true, liveOrigin: 'http://127.0.0.1:7701' });
  assert.equal(html.includes('/live/booking-raw/original'), false, 'a pair whose records FAIL offers no live action');
  assert.match(html, /disabled/);
});

test('a hostile decision category cannot inject markup (independent-review finding)', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const project = corpus.projects.find((p) => p.id === 'catalogue-react');
  project.decision.category = '<img src=x onerror=alert(1)>';
  const view = projectView(project);
  const html = renderProject({ view, runId: corpus.runId, runs: corpus.runs, liveOrigin: 'http://127.0.0.1:7701' });
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'the category must be escaped everywhere it renders');
  assert.match(html, /&lt;img src=x/);
});

test('live links point at the live origin, not the viewer origin', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const cleanScan = { status: 'PASS', original: { status: 'PASS' }, uplifted: { status: 'PASS' } };
  const views = corpus.projects.map((project) => projectView(project, { scan: cleanScan }));
  const html = renderIndex({ views, allViews: views, filters: {}, runId: corpus.runId, runs: corpus.runs, yieldReport: null, scanAvailable: true, liveOrigin: 'http://127.0.0.1:7701' });
  assert.match(html, /action="http:\/\/127\.0\.0\.1:7701\/live\/booking-raw\/original\/run\/2026-10-08T00-00-00-000Z\/start"/);
  assert.ok(!html.includes('action="/live/'), 'live forms must not target the viewer origin');
});

test('the project page renders per-rule before/after with the deciding detail', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpus = loadCorpus(root);
  const view = projectView(corpus.projects.find((p) => p.id === 'booking-raw'));
  const html = renderProject({ view, runId: corpus.runId, runs: corpus.runs, liveOrigin: 'http://127.0.0.1:7701' });
  assert.match(html, /forms\/required-field-feedback/);
  assert.match(html, /FAIL/);
  assert.match(html, /PASS/);
  assert.match(html, /↑ improved/);
  assert.match(html, /sha256:aaaa/);
});
