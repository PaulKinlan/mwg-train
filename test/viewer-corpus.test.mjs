/** Corpus discovery and page rendering tests, against a fixture corpus built on disk. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { filterProjects, loadCorpus, projectView } from '../src/viewer/corpus.mjs';
import { renderIndex, renderProject } from '../src/viewer/pages.mjs';
import { combineScanStatus, createViewer } from '../src/viewer/server.mjs';
import { hashTree } from '../src/corpus/tree-hash.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';

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

test('unscored training original serves verified while missing uplift hash never authorizes an IDEAL tree', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-training-unscored-'));
  const corpusRoot = join(root, 'pilot');
  const site = join(corpusRoot, 'training-projects', 'tr-01-raw');
  const stateDir = join(root, 'state');
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, 'server.mjs'), `import { createServer } from 'node:http';
const port = Number(process.env.PILOT_PORT);
createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<h1>VERIFIED ORIGINAL</h1>'); }).listen(port);\n`);
  writeFileSync(join(site, 'spec.json'), JSON.stringify({ project_id: 'tr-01-raw', archetype: 'booking',
    framework: { name: 'raw', dialect: 'html' }, routes: ['/'], required_rules: [] }));
  const originalSha = hashTree(site);
  writeFileSync(join(corpusRoot, 'CORPUS.json'), JSON.stringify({ run_id: 'fixture-run', projects: [] }));
  writeFileSync(join(corpusRoot, 'TRAINING_CORPUS.json'), JSON.stringify({ projects: [
    { project_id: 'tr-01-raw', family_id: 'tr-01', archetype: 'booking', framework: 'raw', tree_sha: originalSha },
  ] }));
  let viewer = null;
  t.after(async () => {
    if (viewer) {
      viewer.pool.stopAll();
      await Promise.all([new Promise((done) => viewer.server.close(done)),
        new Promise((done) => viewer.liveServer.close(done))]);
    }
    rmSync(root, { recursive: true, force: true });
  });
  const project = loadCorpus(corpusRoot, null, { includeTraining: true }).projects[0];
  const view = projectView(project);
  assert.equal(project.decision.original_sha, originalSha);
  assert.equal(project.decision.has_run, false);
  assert.equal(view.upliftedSha, null, 'missing evidence is never a fabricated *_sha');
  const html = renderIndex({ views: [view], allViews: [view], filters: {}, runId: null, runs: [],
    yieldReport: null, scanAvailable: true, liveOrigin: 'http://127.0.0.1:7701' });
  assert.match(html, /IDEAL not yet uplifted.*no recorded tree hash/);
  assert.doesNotMatch(html, /action="[^"]*\/live\/tr-01-raw\/uplifted/);

  viewer = createViewer({ corpusRoot, repoRoot: resolve(import.meta.dirname, '..'),
    stateDir, allowAnonymous: true });
  await new Promise((done) => viewer.server.listen(0, '127.0.0.1', done));
  await new Promise((done) => viewer.liveServer.listen(0, '127.0.0.1', done));
  const live = `http://127.0.0.1:${viewer.liveServer.address().port}`;
  const index = await fetch(`http://127.0.0.1:${viewer.server.address().port}/`);
  const indexHtml = await index.text();
  assert.match(indexHtml, /owner-auth scan: DEFAULT pending.*no IDEAL recorded/);
  assert.doesNotMatch(indexHtml, /DEFAULT \+ IDEAL pending|action="[^"]*\/live\/tr-01-raw\/uplifted/);
  const missing = await fetch(`${live}/live/tr-01-raw/uplifted/`);
  assert.equal(missing.status, 404, 'an unrecorded uplift never serves a self-hashed regeneration');
  assert.match(await missing.text(), /no uplifted sha|no uplift hash/i);
  const original = await fetch(`${live}/live/tr-01-raw/original/`);
  assert.equal(original.status, 200, 'original-only training entries must remain available');
  assert.match(await original.text(), /VERIFIED ORIGINAL/);

  const scoredRecord = join(root, 'docs/train/corpus/records.json');
  mkdirSync(join(root, 'docs/train/corpus'), { recursive: true });
  const record = (uplifted_sha) => writeFileSync(scoredRecord, JSON.stringify({ projects: [
    { project_id: 'tr-01-raw', decision: { accepted: true }, uplifted_sha },
  ] }));
  record('derived-from-verified-original'); // A stale or hostile sentinel must never bypass a scored pair gate.
  assert.equal((await fetch(`${live}/live/tr-01-raw/original/`)).status, 403,
    'a scored pair cannot expose its original without a verifiable uplifted sha');
  const invalid = await fetch(`${live}/live/tr-01-raw/uplifted/`);
  assert.equal(invalid.status, 404);
  assert.match(await invalid.text(), /did not reproduce the recorded uplifted sha/);

  const expectedTree = join(root, 'expected-uplift');
  upliftProject(site, JSON.parse(readFileSync(join(site, 'spec.json'), 'utf8')), expectedTree);
  const expectedSha = hashTree(expectedTree);
  record(expectedSha); // Synthetic measured fixture only; no digest is added to a real corpus record.
  const valid = await fetch(`${live}/live/tr-01-raw/uplifted/`);
  assert.equal(valid.status, 200, 'a genuinely matching recorded uplifted hash still serves');
  const cacheDir = join(stateDir, 'uplifted', `tr-01-raw-${expectedSha.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`);
  assert.equal(hashTree(cacheDir), expectedSha);
  writeFileSync(join(cacheDir, 'server.mjs'), 'tampered cached code');
  assert.notEqual(hashTree(cacheDir), expectedSha);
  assert.equal((await fetch(`${live}/live/tr-01-raw/uplifted/`)).status, 200);
  assert.ok(existsSync(cacheDir));
  assert.equal(hashTree(cacheDir), expectedSha, 'a drifted cache must be rebuilt and hash-checked before reuse');
});

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
  assert.match(render([], allViews, { state: 'bogus-value' }), /<option value="bogus-value" selected>Unknown state filter: bogus-value<\/option>/);
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
  assert.match(html, /role="region" aria-label="Rule measurements" aria-describedby="rule-table-hint"/);
  assert.match(html, /<caption class="sr-only">Default and ideal rule measurements<\/caption>/);
  assert.match(html, /FAIL/);
  assert.match(html, /PASS/);
  assert.match(html, /↑ improved/);
  assert.match(html, /sha256:aaaa/);
});

test('loadCorpus, filterProjects and renderIndex preserve and filter multiple generating models per project_id', (t) => {
  const root = buildFixtureCorpus();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'CORPUS.json'),
    JSON.stringify({
      run_id: '2026-10-08T00-00-00-000Z',
      generated_at: '2026-10-08T00:00:00.000Z',
      generator: 'scripts/scaffold-pilot.mjs',
      projects: [
        {
          project_id: 'booking-raw',
          archetype: 'booking',
          framework: 'raw',
          model: 'deterministic:no-model',
          build_key: 'booking-raw@deterministic:no-model',
          accepted: true,
          original_sha: 'sha256:aaaa',
          uplift_sha: 'sha256:bbbb',
        },
        {
          project_id: 'booking-raw',
          archetype: 'booking',
          framework: 'raw',
          model: 'deepseek/deepseek-flash',
          build_key: 'booking-raw@deepseek/deepseek-flash',
          accepted: true,
          original_sha: 'sha256:1111',
          uplift_sha: 'sha256:2222',
        },
      ],
    }),
  );
  const corpus = loadCorpus(root);
  const views = corpus.projects.map((project) => projectView(project));
  const bookingViews = views.filter((v) => v.id === 'booking-raw');
  assert.equal(bookingViews.length, 2, 'both model builds for booking-raw must be preserved');
  assert.deepEqual(
    bookingViews.map((v) => v.buildKey).sort(),
    ['booking-raw@deepseek/deepseek-flash', 'booking-raw@deterministic:no-model'],
  );
  const deepseekOnly = filterProjects(views, { model: 'deepseek/deepseek-flash' });
  assert.equal(deepseekOnly.length, 1);
  assert.equal(deepseekOnly[0].buildKey, 'booking-raw@deepseek/deepseek-flash');
  assert.equal(deepseekOnly[0].attribution.model, 'deepseek/deepseek-flash');
  const html = renderIndex({
    views: deepseekOnly,
    allViews: views,
    filters: { model: 'deepseek/deepseek-flash' },
    runId: corpus.runId,
    runs: corpus.runs,
    yieldReport: null,
    scanAvailable: true,
    liveOrigin: 'http://127.0.0.1:7701',
  });
  assert.match(html, /<select name="model">[\s\S]*<option value="deepseek\/deepseek-flash" selected>deepseek\/deepseek-flash<\/option>/);
  assert.match(html, /<th scope="col">model<\/th>/);
  assert.match(html, /<td><code>deepseek\/deepseek-flash<\/code><\/td>/);
});
