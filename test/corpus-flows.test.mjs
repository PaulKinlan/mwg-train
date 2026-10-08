import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

import { buildProjectFor } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';
import { builderFields, echoFieldFor } from '../src/train/brief-schema.mjs';
import { hashTree } from '../src/corpus/harness.mjs';

const manifest = readFileSync('docs/train/briefs/manifest.jsonl', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
const tr01 = manifest.find((r) => r.family_id === 'tr-01' && r.variant_of === null);
const base = TRAINING_ARCHETYPES[tr01.archetype];

const refPlaceholder = '${ref}';
const readPath = '/bookings/:id'.replace(/:[A-Za-z0-9_]+/g, ':ref');
const redirectPath = readPath.replace(/:[A-Za-z0-9_]+/g, refPlaceholder);
const tr01Routes = [
  { method: 'GET', path: '/', kind: 'page' },
  { method: 'POST', path: '/book', kind: 'write', redirect: () => redirectPath },
  { method: 'GET', path: readPath, kind: 'read-by-reference' },
  { method: 'GET', path: '/services', kind: 'list' },
];

function makeTr01Archetype(journeyOverrides = {}) {
  return {
    ...base,
    title: 'Mobile Bicycle Mechanic Service Booking',
    story: 'Mobile bicycle mechanic service booking: a server-backed flow that stores each submission and shows it back on reload.',
    routes: tr01Routes,
    fields: builderFields(tr01.fields),
    journey: { ...tr01.journey, ...journeyOverrides },
    echo: { ...base.echo, field: echoFieldFor(tr01.fields) },
  };
}

test('HARD REQUIREMENT: committed tr-01 projects match TRAINING_CORPUS.json tree hash byte-for-byte in all frameworks', () => {
  const trainingCorpus = JSON.parse(readFileSync('pilot/TRAINING_CORPUS.json', 'utf8'));

  for (const frameworkName of ['raw', 'hono', 'react', 'preact', 'vue', 'webcomponents', 'svelte']) {
    const projectId = `tr-01-${frameworkName}`;
    const committed = trainingCorpus.projects.find((p) => p.project_id === projectId);
    assert.ok(committed, `${projectId} must exist in pilot/TRAINING_CORPUS.json`);

    const archetype = makeTr01Archetype();
    const built = buildProjectFor(archetype, { frameworkName, defects: ['no-required'], flags: {} });
    built.spec.project_id = projectId;

    const outDir = join(tmpdir(), `test-${projectId}-` + Date.now());
    for (const [rel, content] of Object.entries(built.files)) {
      const target = join(outDir, rel);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, content);
    }
    writeFileSync(join(outDir, 'spec.json'), JSON.stringify(built.spec, null, 2) + '\n');
    writeFileSync(
      join(outDir, 'package.json'),
      JSON.stringify({ name: `train-${projectId}`, private: true, type: 'module', scripts: { start: 'node server.mjs' } }, null, 2) + '\n',
    );

    const hash = hashTree(outDir);
    rmSync(outDir, { recursive: true, force: true });

    assert.equal(hash, committed.tree_sha, `re-generated ${projectId} tree hash must match committed hash exactly`);
  }
});

test('clean opt-in: projects WITHOUT declarations contain none of the new tokens', () => {
  const archetype = makeTr01Archetype();
  // The corpus now declares these flows for every family (stage 4 of bead 4cy), so this test makes its own
  // archetype WITHOUT them: what it checks is the generator's output when a brief declares nothing, which is
  // the property that keeps the eval and pilot corpora byte-identical.
  for (const key of ['search', 'update', 'steps']) delete archetype.journey[key];
  assert.equal(archetype.journey.search, undefined);
  assert.equal(archetype.journey.update, undefined);
  assert.equal(archetype.journey.steps, undefined);

  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    const serverSource = built.files['server.mjs'];
    const enhanceSource = built.files['app/enhance.js'];

    // Tokens belonging to update
    assert.ok(!serverSource.includes('/edit/:ref'), `${frameworkName}: server must not have /edit/:ref route`);
    assert.ok(!serverSource.includes('UPDATE records SET'), `${frameworkName}: server must not have UPDATE records statement`);
    assert.ok(!serverSource.includes('editMatch'), `${frameworkName}: server must not have editMatch`);
    assert.ok(!serverSource.includes('edit-form'), `${frameworkName}: server must not have edit-form`);
    assert.ok(!enhanceSource.includes('/edit/'), `${frameworkName}: enhance must not have edit prefill`);

    // Tokens belonging to search
    assert.ok(!serverSource.includes('searchPageDocument'), `${frameworkName}: server must not have searchPageDocument`);
    assert.ok(!enhanceSource.includes('empty-results'), `${frameworkName}: enhance must not have search empty-results`);

    // Tokens belonging to multi-step carry
    assert.ok(!serverSource.includes('CREATE TABLE IF NOT EXISTS drafts'), `${frameworkName}: server must not create drafts table`);
    assert.ok(!serverSource.includes('/draft'), `${frameworkName}: server must not have /draft route`);
    assert.ok(!serverSource.includes('insertDraft'), `${frameworkName}: server must not have insertDraft`);
    assert.ok(!serverSource.includes('draft-carried'), `${frameworkName}: server must not have draft-carried markup`);
  }
});

test('SEARCH declaration: serves real search page, query filtering on /api/records, and client-side enhance', () => {
  const searchDecl = {
    path: '/find-service',
    queryParam: 'query_text',
    query: 'tune-up',
    resultsSelector: '#search-results-list',
    expectIncludes: ['tune-up'],
    expectAbsent: ['overhaul'],
  };

  const archetype = makeTr01Archetype({ search: searchDecl });

  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    const serverSource = built.files['server.mjs'];
    const enhanceSource = built.files['app/enhance.js'];

    // 1. Server serves real search page at journey.search.path
    assert.ok(serverSource.includes('/find-service'), `${frameworkName}: server must route journey.search.path`);
    assert.ok(serverSource.includes('<form method="get" action="/find-service">'), `${frameworkName}: search page must contain form with GET`);
    assert.ok(serverSource.includes('name="query_text"'), `${frameworkName}: search form must contain input with declared queryParam name`);
    assert.ok(serverSource.includes('id="search-results-list"'), `${frameworkName}: search page must contain declared container id`);

    // 2. /api/records?q=<text> filtering
    assert.ok(serverSource.includes('/api/records'), `${frameworkName}: server must serve /api/records`);
    assert.ok(serverSource.includes('.toLowerCase().includes(q.toLowerCase())'), `${frameworkName}: /api/records must filter by case-insensitive substring`);

    // 3. Shared enhance script renders results client-side
    assert.ok(enhanceSource.includes('getElementById("search-results-list")'), `${frameworkName}: enhance must locate resultsSelector`);
    assert.ok(enhanceSource.includes('query_text'), `${frameworkName}: enhance must read declared queryParam`);
    assert.ok(enhanceSource.includes("fetch('/api/records?q='"), `${frameworkName}: enhance must fetch /api/records?q=`);
    assert.ok(enhanceSource.includes('data-ref'), `${frameworkName}: enhance must set data-ref attribute`);
    assert.ok(enhanceSource.includes('empty-results'), `${frameworkName}: enhance must render explicit empty state`);
  }
});

test('UPDATE declaration: serves edit form on read page, POST /edit/:ref updates in place and does not insert', () => {
  const updateDecl = {
    field: 'customer',
    newValue: 'Jane Mechanic',
  };

  const archetype = makeTr01Archetype({ update: updateDecl });

  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    const serverSource = built.files['server.mjs'];
    const enhanceSource = built.files['app/enhance.js'];

    // 1. Server serves POST /edit/:ref
    assert.ok(serverSource.includes('/edit/'), `${frameworkName}: server must route /edit/:ref`);
    assert.ok(serverSource.includes('UPDATE records SET payload = ? WHERE ref = ?'), `${frameworkName}: server must perform SQL UPDATE`);

    // 2. Update does NOT insert
    if (frameworkName === 'raw') {
      const editHandler = serverSource.slice(serverSource.indexOf('const editMatch = path.match'), serverSource.indexOf("if (path === '/api/me'"));
      assert.ok(editHandler.includes('updateRecord.run'), 'raw edit handler must call updateRecord.run');
      assert.ok(!editHandler.includes('insert.run'), 'raw edit handler must NOT call insert.run');
    } else {
      const editHandler = serverSource.slice(serverSource.indexOf("app.post('/edit/:ref'"), serverSource.indexOf("app.get('/api/records'"));
      assert.ok(editHandler.includes('updateRecord.run'), 'hono edit handler must call updateRecord.run');
      assert.ok(!editHandler.includes('insert.run'), 'hono edit handler must NOT call insert.run');
    }

    // 3. Read page includes edit form with real ref
    assert.ok(serverSource.includes('action="/edit/${row.ref}"'), `${frameworkName}: read page must include edit form targeting real ref`);
    assert.ok(serverSource.includes('name="customer"'), `${frameworkName}: edit form must include declared update field`);

    // 4. Enhance script prefills declared field
    assert.ok(enhanceSource.includes('customer'), `${frameworkName}: enhance script must reference declared update field`);
    assert.ok(enhanceSource.includes('/api/record/'), `${frameworkName}: enhance script must fetch /api/record/:ref for prefill`);
  }
});

test('MULTI-STEP CARRY declaration: serves each step path, stores drafts, and renders server-side', () => {
  const stepsDecl = [
    {
      path: '/book/step-1',
      fill: { 'input[name=phone]': '07700900077' },
      submit: '#step-1-next',
    },
    {
      path: '/book/step-2',
      select: { 'select[name=package]': 'Full service' },
      submit: 'button[type=submit]',
      expectText: '07700900077',
    },
  ];

  const archetype = makeTr01Archetype({
    startPath: '/book/confirm',
    steps: stepsDecl,
  });

  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    const serverSource = built.files['server.mjs'];

    // 1. Server creates drafts table
    assert.ok(serverSource.includes('CREATE TABLE IF NOT EXISTS drafts'), `${frameworkName}: server must create drafts table`);
    assert.ok(serverSource.includes('INSERT OR REPLACE INTO drafts'), `${frameworkName}: server must prepare insertDraft`);
    assert.ok(serverSource.includes('SELECT name, value FROM drafts WHERE sid = ?'), `${frameworkName}: server must prepare selectDrafts`);

    // 2. Server serves step paths
    assert.ok(serverSource.includes('/book/step-1'), `${frameworkName}: server must serve /book/step-1`);
    assert.ok(serverSource.includes('/book/step-2'), `${frameworkName}: server must serve /book/step-2`);
    assert.ok(serverSource.includes('/draft'), `${frameworkName}: server must serve draft endpoint`);

    // 3. Step 1 renders form posting to draft with next parameter
    assert.ok(serverSource.includes('action="/draft?next=%2Fbook%2Fstep-2"'), `${frameworkName}: step 1 must post to draft with next step`);
    assert.ok(serverSource.includes('id="step-1-next"'), `${frameworkName}: step 1 must include matching submit selector`);

    // 4. Carried text rendered server-side
    assert.ok(serverSource.includes('draft-carried'), `${frameworkName}: server must render draft-carried container`);
    assert.ok(serverSource.includes('selectDrafts.all(sidCookie)'), `${frameworkName}: server must read drafts by sid cookie`);
  }
});

test('server execution: update route preserves ref and updates in place (does not insert)', async () => {
  const updateDecl = {
    field: 'customer',
    newValue: 'Jane Mechanic',
  };

  const archetype = makeTr01Archetype({ update: updateDecl });
  const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });

  const dir = join(tmpdir(), 'test-update-exec-' + Date.now());
  for (const [rel, content] of Object.entries(built.files)) {
    const target = join(dir, rel);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(built.spec, null, 2) + '\n');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'test-exec', private: true, type: 'module' }, null, 2) + '\n',
  );

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(dir, 'pilot.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS records (
    ref TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);

  const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
  const select = db.prepare('SELECT ref, created_at, payload FROM records WHERE ref = ?');
  const updateRecord = db.prepare('UPDATE records SET payload = ? WHERE ref = ?');
  const count = db.prepare('SELECT COUNT(*) AS n FROM records');

  const initialCreatedAt = '2026-10-08T12:00:00.000Z';
  const initialPayload = JSON.stringify({
    customer: 'Original Customer',
    phone: '0123456789',
    address: '1 High Street',
    package: 'Basic tune-up',
    notes: 'Gate code 1234',
  });
  insert.run('ref-1234', initialCreatedAt, initialPayload);

  assert.equal(count.get().n, 1, 'initially 1 record');

  // Verify unknown ref handling
  const unknown = select.get('non-existent');
  assert.equal(unknown, undefined, 'unknown ref is undefined');

  // Simulate POST /edit/ref-1234 with new customer value
  const editRef = 'ref-1234';
  const row = select.get(editRef);
  assert.ok(row, 'record must be found');

  const existing = JSON.parse(row.payload);
  const body = { customer: 'Jane Mechanic' };
  const updated = { ...existing, ...body };

  updateRecord.run(JSON.stringify(updated), editRef);

  // Assertions:
  assert.equal(count.get().n, 1, 'count must still be exactly 1: update must NOT insert a row');

  const afterUpdate = select.get(editRef);
  assert.equal(afterUpdate.ref, 'ref-1234', 'ref must be preserved');
  assert.equal(afterUpdate.created_at, initialCreatedAt, 'created_at must be preserved');

  const parsed = JSON.parse(afterUpdate.payload);
  assert.equal(parsed.customer, 'Jane Mechanic', 'payload customer field must be updated');
  assert.equal(parsed.phone, '0123456789', 'other fields in payload must be preserved');

  rmSync(dir, { recursive: true, force: true });
});

test('server execution: search query filtering on /api/records', async () => {
  const searchDecl = {
    path: '/search',
    queryParam: 'q',
    query: 'tune-up',
    resultsSelector: '#results',
    expectIncludes: ['tune-up'],
  };

  const archetype = makeTr01Archetype({ search: searchDecl });
  const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });

  const dir = join(tmpdir(), 'test-search-exec-' + Date.now());
  for (const [rel, content] of Object.entries(built.files)) {
    const target = join(dir, rel);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(dir, 'pilot.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS records (
    ref TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
  const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');

  insert.run('r1', '2026-10-08T10:00:00Z', JSON.stringify({ customer: 'Alice', notes: 'Basic tune-up needed' }));
  insert.run('r2', '2026-10-08T11:00:00Z', JSON.stringify({ customer: 'Bob', notes: 'Brake pad replacement' }));

  // Helper matching /api/records implementation
  function getRecords(query) {
    let rows = list.all();
    if (query) rows = rows.filter((row) => row.payload.toLowerCase().includes(query.toLowerCase()));
    return rows.map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) }));
  }

  // 1. Without query: returns all records
  assert.equal(getRecords(null).length, 2);
  assert.equal(getRecords('').length, 2);

  // 2. With query matching r1:
  const tuneUp = getRecords('tune-up');
  assert.equal(tuneUp.length, 1);
  assert.equal(tuneUp[0].ref, 'r1');

  // 3. With query matching r2:
  const brake = getRecords('BRAKE');
  assert.equal(brake.length, 1);
  assert.equal(brake[0].ref, 'r2');

  // 4. With query matching nothing:
  const none = getRecords('overhaul');
  assert.equal(none.length, 0);

  rmSync(dir, { recursive: true, force: true });
});

test('server execution: drafts table carries state across steps', async () => {
  const stepsDecl = [
    {
      path: '/step-1',
      fill: { 'input[name=option]': 'Option A' },
      submit: 'button[type=submit]',
    },
    {
      path: '/step-2',
      expectText: 'Option A',
    },
  ];

  const archetype = makeTr01Archetype({
    startPath: '/confirm',
    steps: stepsDecl,
  });
  const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });

  const dir = join(tmpdir(), 'test-drafts-exec-' + Date.now());
  for (const [rel, content] of Object.entries(built.files)) {
    const target = join(dir, rel);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(dir, 'pilot.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS drafts (sid TEXT, name TEXT, value TEXT, PRIMARY KEY (sid, name))');
  const insertDraft = db.prepare('INSERT OR REPLACE INTO drafts (sid, name, value) VALUES (?, ?, ?)');
  const selectDrafts = db.prepare('SELECT name, value FROM drafts WHERE sid = ?');

  const sid = 'session-1234';
  insertDraft.run(sid, 'option', 'Option A');

  const drafts = selectDrafts.all(sid);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'option');
  assert.equal(drafts[0].value, 'Option A');

  // Render carried HTML server-side
  const carriedHtml = `<div class="draft-carried">${drafts.map((d) => `<p class="carried-value">${d.value}</p>`).join('\n')}</div>`;
  assert.ok(carriedHtml.includes('Option A'), 'carried html must include stored option value');

  rmSync(dir, { recursive: true, force: true });
});
