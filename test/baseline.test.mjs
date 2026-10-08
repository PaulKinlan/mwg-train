/**
 * The control fixtures: do they exist, are they the ones the briefs name, and do they behave the way
 * the briefs assume?
 *
 * Three things are checked here that nothing else checks:
 *   1. every `existing_site` in the sealed manifest resolves to a project on disk and to the hash in
 *      `docs/eval/projects/index.json`, so a baseline cannot be edited without the check noticing;
 *   2. the repair starters exhibit exactly the seeded defects their family names - proved by driving
 *      them, not by reading their flags back;
 *   3. the already-modern baselines are clean, so a run that makes the one requested change is not
 *      fighting a pre-existing problem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { FIXTURES, fixturePath, snapshotSeed } from '../docs/eval/projects/fixtures.mjs';
import { diffPages, diffTrees, matchPath, normaliseText, pageModel, snapshotPages, treeSnapshot, assessDiff } from '../src/eval/baseline.mjs';
import { DEFECT_CLASSES, SEEDED_DEFECT_IDS, auditProject } from '../src/eval/defects.mjs';
import { ALREADY_MODERN_MARKER, parseBriefs, validateBriefs } from '../src/eval/prereg.mjs';
import { createRoutes, openStore } from '../src/eval/site-kit.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'docs/eval/briefs/manifest.jsonl');
const INDEX = JSON.parse(readFileSync(join(ROOT, 'docs/eval/projects/index.json'), 'utf8')).fixtures;

function rows() {
  return parseBriefs(readFileSync(MANIFEST, 'utf8'));
}

function makeStore(fixture) {
  const dir = mkdtempSync(join(tmpdir(), `eval-fixture-${fixture.project_id}-`));
  return openStore(join(dir, 'data.json'), snapshotSeed(fixture));
}

function concretePath(pageSpec, fixture) {
  return pageSpec.path.replace(/:([A-Za-z0-9_]+)/g, () => fixture.seed?.[pageSpec.collection]?.[0]?.id ?? '1');
}

test('every existing_site in the sealed manifest names a fixture that exists and matches its hash', () => {
  const withSite = rows().filter((row) => typeof row.existing_site === 'string');
  assert.equal(withSite.length, 12, 'expected the 8 already-modern baselines and 4 sealed repair variants');
  for (const row of withSite) {
    const absolute = join(ROOT, row.existing_site);
    assert.ok(existsSync(absolute), `${row.brief_id}: ${row.existing_site} does not exist`);
    const fixture = FIXTURES.find((candidate) => fixturePath(candidate) === row.existing_site);
    assert.ok(fixture, `${row.brief_id}: ${row.existing_site} is not a declared fixture`);
    const expected = INDEX[fixture.project_id];
    assert.ok(expected, `${row.brief_id}: ${fixture.project_id} is missing from index.json`);
    assert.equal(treeSnapshot(absolute).tree, expected.tree, `${row.brief_id}: fixture tree does not match index.json`);
    if ((row.non_goals ?? []).includes(ALREADY_MODERN_MARKER)) {
      assert.equal(row.existing_site, `docs/eval/projects/already-modern/${row.brief_id}`);
    } else {
      assert.equal(row.existing_site, `docs/eval/projects/repair/${row.family_id}`);
      assert.equal(row.split, 'test');
    }
  }
});

test('exactly the already-modern and sealed repair rows carry existing_site', () => {
  for (const row of rows()) {
    const alreadyModern = (row.non_goals ?? []).includes(ALREADY_MODERN_MARKER);
    const needs = alreadyModern || (row.task === 'repair' && row.split === 'test');
    if (needs) assert.equal(typeof row.existing_site, 'string', `${row.brief_id} must name its project`);
    else assert.ok(!row.existing_site, `${row.brief_id} must not carry existing_site`);
  }
});

test('the validator requires existing_site where it is meaningful and forbids it elsewhere', () => {
  const base = rows().find((row) => row.brief_id === 'cf-06');
  const missing = validateBriefs([{ ...base, existing_site: '' }], undefined);
  assert.ok(missing.findings.some((finding) => finding.code === 'MISSING_EXISTING_SITE'), 'an empty existing_site must be refused');

  const generate = rows().find((row) => row.brief_id === 'fam-01-v1');
  const stray = validateBriefs([{ ...generate, existing_site: 'docs/eval/projects/already-modern/cf-06' }], undefined);
  assert.ok(stray.findings.some((finding) => finding.code === 'UNEXPECTED_EXISTING_SITE'));
});

test('every fixture reproduces its committed tree hash and page snapshot', async () => {
  for (const fixture of FIXTURES) {
    const dir = join(ROOT, fixturePath(fixture));
    assert.equal(treeSnapshot(dir).tree, JSON.parse(readFileSync(join(dir, 'tree.json'), 'utf8')).tree, `${fixture.project_id}: tree.json is stale`);
    const routes = createRoutes(fixture, makeStore(fixture));
    const paths = (fixture.pages ?? []).map((pageSpec) => concretePath(pageSpec, fixture));
    const pages = await snapshotPages(routes, paths);
    for (const [path, page] of Object.entries(pages)) assert.equal(page.status, 200, `${fixture.project_id}: ${path} did not render`);
    const committed = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).pages;
    assert.deepEqual(pages, committed, `${fixture.project_id}: snapshot.json is stale`);
  }
});

test('the repair starters exhibit exactly the seeded defects their family names', async () => {
  const manifest = rows();
  for (const fixture of FIXTURES.filter((candidate) => candidate.group === 'repair')) {
    const row = manifest.find((candidate) => candidate.family_id === fixture.family_id && candidate.split === 'test');
    assert.ok(row, `${fixture.family_id}: no sealed manifest row`);
    const declared = row.seeded_defects.map((defect) => {
      const id = SEEDED_DEFECT_IDS[defect];
      assert.ok(id, `unmapped seeded defect: ${defect}`);
      assert.ok(DEFECT_CLASSES.includes(id), `unknown defect class ${id}`);
      return id;
    });
    const audited = await auditProject(fixture, { storeFile: join(mkdtempSync(join(tmpdir(), `audit-${fixture.project_id}-`)), 'store.json') });
    assert.deepEqual(audited, [...new Set(declared)].sort(), `${fixture.family_id}: audited defects must equal the seeded ones`);
  }
});

test('the already-modern baselines carry no seeded defect', async () => {
  for (const fixture of FIXTURES.filter((candidate) => candidate.group === 'already-modern')) {
    const audited = await auditProject(fixture, { storeFile: join(mkdtempSync(join(tmpdir(), `audit-clean-${fixture.project_id}-`)), 'store.json') });
    assert.deepEqual(audited, [], `${fixture.project_id} should already be modern`);
  }
});

test('every fixture serves through a real HTTP status', async () => {
  const { serve } = await import('../src/eval/site-kit.mjs');
  const fixture = FIXTURES.find((candidate) => candidate.group === 'already-modern' && candidate.pages.some((pageSpec) => pageSpec.kind === 'static'));
  const { server, port } = await serve(createRoutes(fixture, makeStore(fixture)));
  try {
    const response = await fetch(`http://127.0.0.1:${port}${fixture.pages.find((pageSpec) => pageSpec.kind === 'static').path}`);
    assert.equal(response.status, 200, 'a static page served over HTTP must return 200, not a heading');
  } finally {
    server.close();
  }
});

test('the diff oracle separates main-content changes from a nav-only update', () => {
  const before = { pages: { '/': { main: 'a', nav: 'n' }, '/about': { main: 'b', nav: 'n' } } };
  const after = { pages: { '/': { main: 'a', nav: 'n2' }, '/about': { main: 'b', nav: 'n2' }, '/access': { main: 'c', nav: 'n2' } } };
  const diff = diffPages(before.pages, after.pages);
  assert.deepEqual(diff.added, ['/access']);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.nav_only, ['/', '/about']);
  assert.equal(diff.changed_pages, 1);
});

test('the page model ignores scripts and reads only the visible text', () => {
  const model = pageModel('<html><body><nav>Home</nav><main><h1>Hello</h1><script>var x = 1;</script><p>The end</p></main></body></html>');
  assert.equal(model.main_text, 'hello the end');
  assert.notEqual(pageModel('<main><h1>Hello</h1></main>').main, pageModel('<main><h1>Goodbye</h1></main>').main);
});

test('the tree oracle reports added, removed and modified files, and an allowlist can account for them', () => {
  const before = { files: { 'server.mjs': 'a', 'spec.json': 'b' }, tree: 't1' };
  const after = { files: { 'server.mjs': 'a', 'spec.json': 'c', 'access.mjs': 'd' }, tree: 't2' };
  const diff = diffTrees(before, after);
  assert.deepEqual(diff.modified, ['spec.json']);
  assert.deepEqual(diff.added, ['access.mjs']);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.changed_pages, 2);

  const clean = assessDiff(diff, { allowed_modified: ['spec.json'], allowed_new: ['access.mjs'], describe: 'add the access page' });
  assert.equal(clean.accounted_for, true, JSON.stringify(clean.findings));

  const stray = assessDiff(diff, { allowed_modified: [], allowed_new: [], describe: 'nothing' });
  assert.equal(stray.accounted_for, false);
  assert.equal(stray.findings.length, 2);
});

test('the page model decodes entities rather than turning them into spaces', () => {
  assert.equal(normaliseText('<main>It&#39;s &amp; more &lt;fine&gt;</main>'), "it's & more <fine>");
});

test('the allowlist glob matches paths, not substrings', () => {
  assert.ok(matchPath('spec.json', 'spec.json'));
  assert.ok(matchPath('app/**', 'app/page.mjs'));
  assert.ok(!matchPath('app/**', 'server.mjs'));
  assert.ok(!matchPath('spec.json', 'not-spec.json'));
  assert.ok(matchPath('?est.mjs', 'test.mjs'), '? must match one character, not throw');
  assert.ok(!matchPath('?est.mjs', 'ttest.mjs'));
  assert.ok(matchPath('app/**/', 'app/page.mjs'), 'a trailing slash must not disable globbing');
});
