/** Corpus discovery and page rendering tests, against a fixture corpus built on disk. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { filterProjects, loadCorpus, projectView } from '../src/viewer/corpus.mjs';
import { renderIndex, renderProject } from '../src/viewer/pages.mjs';

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
  assert.match(html, /ACCEPTED/);
  assert.match(html, /rejected: no-warranted-change/);
  assert.match(html, /no run recorded/);
  assert.match(html, /booking-raw/);
  assert.match(html, /catalogue-react/);
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
  assert.match(html, /action="http:\/\/127\.0\.0\.1:7701\/live\/booking-raw\/original\/start"/);
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
