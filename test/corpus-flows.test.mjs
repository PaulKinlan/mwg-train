import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

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


const ROOT = resolve(import.meta.dirname, '..');
const NODE_MODULES = join(ROOT, 'node_modules');

/**
 * Write a generated project somewhere and drive its REAL server over HTTP.
 *
 * This exists because five tests in this file read as though they cover server behaviour while measuring
 * something else: the three named "server execution" re-implemented the server's SQL inline and asserted
 * against that copy (one even commented "Helper matching /api/records implementation"), and the SEARCH and
 * UPDATE declaration tests assert that a source string CONTAINS a fetch call. None of them would fail if the
 * generated server stopped working. test/edit-flow.test.mjs already drives a generated server over HTTP, so
 * the technique is proven in this suite - it just was not used here (mwg-train-0xk).
 */
async function withLiveServer(built, port, fn, seed = null) {
  const dir = mkdtempSync(join(tmpdir(), 'corpus-flows-live-'));
  try {
    for (const [rel, content] of Object.entries(built.files)) {
      const target = join(dir, rel);
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
      writeFileSync(target, content);
    }
    symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
    // Seeded before the server starts, so the server reads a database that already holds the fixture. The
    // schema is created by the server itself on boot; a seed that ran after spawn raced that.
    if (seed) await seed(join(dir, 'pilot.sqlite'));
    const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'pilot.sqlite')], {
      cwd: dir, stdio: ['ignore', 'ignore', 'pipe'],
    });
    try {
      const base = `http://127.0.0.1:${port}`;
      let up = false;
      for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
        await new Promise((done) => setTimeout(done, 250));
        up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
      }
      assert.ok(up, 'the generated server did not come up, so nothing below measures the real thing');
      return await fn(base);
    } finally {
      child.kill('SIGKILL');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
  // Driven against the REAL generated server. The previous version never started it: it seeded a database,
  // then ran UPDATE and SELECT statements of its own and asserted on those, under comments saying "Simulate
  // POST /edit/ref-1234". Breaking the generated update route would not have failed it.
  const updateDecl = { field: 'customer', newValue: 'Jane Mechanic' };
  const archetype = makeTr01Archetype({ update: updateDecl });
  const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });

  await withLiveServer(built, 5611, async (base) => {
    const listed = async () => (await (await fetch(`${base}/api/records`)).json());
    const before = await listed();
    assert.equal(before.length, 1, 'premise: exactly one seeded record, so "does not insert" means something');
    const ref = before[0].ref;
    assert.ok(ref, 'premise: the seeded record must carry a ref to route the update at');

    // A real POST to the generated update route.
    const posted = await fetch(`${base}/edit/${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ customer: 'Jane Mechanic' }).toString(),
      redirect: 'manual',
    });
    assert.ok(posted.status === 303 || posted.status === 302 || posted.status === 200,
      `the update route must accept the edit, got ${posted.status}`);

    const after = await listed();
    assert.equal(after.length, 1, `UPDATE, not INSERT: still one record after the edit (got ${after.length})`);
    assert.equal(after[0].ref, ref, 'and it is the SAME ref - the update replaced in place');
    assert.equal(after[0].customer, 'Jane Mechanic', 'the edit was stored');
    assert.equal(after[0].notes, before[0].notes, 'and the fields not in the form survived, so it merged rather than replaced the payload');

    // Reading the record by ref agrees with the list.
    const one = await (await fetch(`${base}/api/record/${encodeURIComponent(ref)}`)).json();
    assert.equal(one.ref, ref);
    assert.equal(one.customer, 'Jane Mechanic', 'the single-record route shows the edit too');
  }, async (dbPath) => {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS records (ref TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)');
    db.prepare('INSERT OR REPLACE INTO records (ref, created_at, payload) VALUES (?, ?, ?)').run(
      'ref-1234', '2026-10-08T12:00:00.000Z',
      JSON.stringify({ customer: 'Original Customer', phone: '0123456789', address: '1 High Street', package: 'Basic tune-up', notes: 'Gate code 1234' }),
    );
    db.close();
  });
});

test('server execution: search query filtering on /api/records', async () => {
  // Driven against the REAL generated server. The previous version never started it: it re-implemented the
  // /api/records filter in the test and asserted on that copy, under a comment saying "Helper matching
  // /api/records implementation". Deleting the search query from the generator would not have failed it.
  const searchDecl = {
    path: '/search',
    queryParam: 'q',
    query: 'tune-up',
    resultsSelector: '#results',
    expectIncludes: ['tune-up'],
  };
  const archetype = makeTr01Archetype({ search: searchDecl });
  const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });

  await withLiveServer(built, 5610, async (base) => {
    // The server seeds its own records, so the fixture is whatever it creates - asserted rather than assumed.
    const all = await (await fetch(`${base}/api/records`)).json();
    assert.ok(Array.isArray(all), 'the endpoint must return an array');
    assert.ok(all.length > 0, 'the real server must serve at least one seeded record, or the filters below prove nothing');

    const noQuery = await (await fetch(`${base}/api/records?q=`)).json();
    assert.equal(noQuery.length, all.length, 'an empty query returns everything, like no query');

    // A query is matched case-insensitively against the record payload, and returns a SUBSET.
    const first = all.find((record) => String(record.customer ?? '').length > 1);
    assert.ok(first, 'premise: a seeded record must carry a customer to search on');
    const needle = String(first.customer).slice(0, 4);
    const matched = await (await fetch(`${base}/api/records?q=${encodeURIComponent(needle)}`)).json();
    assert.ok(matched.length > 0, `a query for ${JSON.stringify(needle)} must match the record it came from`);
    assert.ok(matched.length <= all.length, 'and must never return more than the unfiltered list');
    assert.ok(matched.every((record) => JSON.stringify(record).toLowerCase().includes(needle.toLowerCase())),
      'every returned record must actually contain the query');

    // Case-insensitivity is the property the old comment claimed and never checked against the server.
    const upper = await (await fetch(`${base}/api/records?q=${encodeURIComponent(needle.toUpperCase())}`)).json();
    assert.equal(upper.length, matched.length, 'the match must be case-insensitive');

    // A query matching nothing returns nothing - the empty case that a stand-in cannot get wrong.
    const none = await (await fetch(`${base}/api/records?q=zzz-no-such-record-zzz`)).json();
    assert.equal(none.length, 0, 'a query matching no record returns an empty list');
  }, async (dbPath) => {
    // The server creates its own schema on boot, so this runs first and only INSERTS. The two rows are the
    // ones the old stand-in test used, so the assertions below are the same properties - now measured against
    // the real endpoint instead of a copy of its filter.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS records (ref TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)');
    const insert = db.prepare('INSERT OR REPLACE INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
    insert.run('r1', '2026-10-08T10:00:00Z', JSON.stringify({ customer: 'Alice', notes: 'Basic tune-up needed' }));
    insert.run('r2', '2026-10-08T11:00:00Z', JSON.stringify({ customer: 'Bob', notes: 'Brake pad replacement' }));
    db.close();
  });
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

test('a flow and a capability page compose: the edit form is appended to whichever document the read route renders', () => {
  // The reviewer's P1, kept as a test because the combination was unexercised - no training archetype
  // declares both, which is exactly why the silent drop of one of them survived until a reviewer built the
  // case by hand. The generator must not choose between the two features: the capability renders the
  // document and the flow's form is appended to it.
  const make = (extra) => {
    const base = Object.values(TRAINING_ARCHETYPES).find((a) => a.id && a.journey?.fill && a.fields?.length);
    return { ...base, ...extra, journey: { ...base.journey, ...(extra.journey ?? {}) } };
  };
  const update = { update: { field: 'customer', newValue: 'Grace Hopper' } };
  const cases = [
    ['both', make({ capabilities: { detail_page: true }, journey: update }), true, true],
    ['flow only', make({ journey: update }), true, false],
    ['capability only', make({ capabilities: { detail_page: true } }), false, true],
    ['neither', make({}), false, false],
  ];
  for (const frameworkName of ['raw', 'hono']) {
    for (const [label, archetype, wantEditForm, wantDetailPage] of cases) {
      const source = buildProjectFor(archetype, { frameworkName, defects: [] }).files['server.mjs'];
      assert.equal(source.includes('edit-form'), wantEditForm, `${frameworkName} ${label}: edit form`);
      assert.equal(source.includes('detailPage(row)'), wantDetailPage, `${frameworkName} ${label}: capability page`);
    }
  }
});
