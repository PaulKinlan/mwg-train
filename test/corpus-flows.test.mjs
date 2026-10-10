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

test('MULTI-STEP CARRY declaration: serves each step path, stores drafts, and renders server-side', async () => {
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

    // Generator-level template checks kept: verify that selector ID and styling class exist
    // in the emitted source so browsers and styles can target them.
    assert.ok(serverSource.includes('id="step-1-next"'), `${frameworkName}: generator output must include matching submit selector`);
    assert.ok(serverSource.includes('draft-carried'), `${frameworkName}: server source must include draft-carried markup class`);

    await withLiveServer(built, 5613, async (base) => {
      // 1. Server serves step paths and step 1 renders declared form controls
      const step1Res = await fetch(`${base}/book/step-1`);
      assert.equal(step1Res.status, 200, `${frameworkName}: server must serve /book/step-1`);
      const step1Html = await step1Res.text();
      assert.ok(step1Html.includes('name="phone"'), `${frameworkName}: premise - step 1 must render declared input field`);
      assert.ok(step1Html.includes('id="step-1-next"'), `${frameworkName}: step 1 must render declared submit selector`);
      const formAction = (step1Html.match(/<form[^>]*action="([^"]+)"/) ?? [])[1];
      assert.equal(formAction, '/draft?next=%2Fbook%2Fstep-2', `${frameworkName}: step 1 must post to draft with next step`);

      const step2Res = await fetch(`${base}/book/step-2`);
      assert.equal(step2Res.status, 200, `${frameworkName}: server must serve /book/step-2`);
      const step2Html = await step2Res.text();
      assert.ok(step2Html.includes('name="package"'), `${frameworkName}: premise - step 2 must render declared select field`);

      // 2. Server accepts draft posts at /draft and step paths, creating drafts table and running insertDraft
      const postDraft = await fetch(`${base}/draft?next=${encodeURIComponent('/book/step-2')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: '07700900077' }).toString(),
        redirect: 'manual',
      });
      assert.equal(postDraft.status, 303, `${frameworkName}: /draft endpoint must accept post and redirect (got ${postDraft.status})`);
      assert.equal(postDraft.headers.get('location'), '/book/step-2', `${frameworkName}: /draft must redirect to declared next path`);
      const sessionCookie = postDraft.headers.get('set-cookie');
      assert.ok(sessionCookie, `${frameworkName}: premise - server must set session cookie on draft post`);

      // POST to declared step path is also accepted as a draft endpoint
      const postStep1 = await fetch(`${base}/book/step-1`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: '07700900077' }).toString(),
        redirect: 'manual',
      });
      assert.equal(postStep1.status, 303, `${frameworkName}: declared step path /book/step-1 must accept POST and redirect`);
      assert.equal(postStep1.headers.get('location'), '/book/step-2', `${frameworkName}: POST /book/step-1 must redirect to next step`);

      // 3. Carried text rendered server-side on next step and startPath (proves selectDrafts by sid cookie)
      const step2CarriedRes = await fetch(`${base}/book/step-2`, { headers: { cookie: sessionCookie } });
      assert.equal(step2CarriedRes.status, 200, `${frameworkName}: step 2 must return 200 with session cookie`);
      const step2CarriedHtml = await step2CarriedRes.text();
      assert.ok(step2CarriedHtml.includes('draft-carried'), `${frameworkName}: step 2 must render draft-carried container`);
      assert.ok(step2CarriedHtml.includes('07700900077'), `${frameworkName}: step 2 must carry value from step 1 (expectText)`);

      const confirmCarriedRes = await fetch(`${base}/book/confirm`, { headers: { cookie: sessionCookie } });
      assert.equal(confirmCarriedRes.status, 200, `${frameworkName}: startPath /book/confirm must return 200 with session cookie`);
      const confirmCarriedHtml = await confirmCarriedRes.text();
      assert.ok(confirmCarriedHtml.includes('draft-carried'), `${frameworkName}: confirm page must render draft-carried container`);
      assert.ok(confirmCarriedHtml.includes('07700900077'), `${frameworkName}: confirm page must carry stored draft value`);

      // 4. Session isolation: a fresh session without cookie receives no carried drafts (selectDrafts.all isolation)
      const freshRes = await fetch(`${base}/book/confirm`);
      assert.equal(freshRes.status, 200, `${frameworkName}: startPath must return 200 for fresh session`);
      const freshHtml = await freshRes.text();
      assert.ok(!freshHtml.includes('07700900077'), `${frameworkName}: session with no draft must not receive another session's carried value`);
      assert.ok(!freshHtml.includes('draft-carried'), `${frameworkName}: session with no draft must not render draft-carried container`);

      // 5. Subsequent step stores draft and startPath carries all values
      const postStep2 = await fetch(`${base}/book/step-2`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
        body: new URLSearchParams({ package: 'Full service' }).toString(),
        redirect: 'manual',
      });
      assert.equal(postStep2.status, 303, `${frameworkName}: step 2 post must redirect to startPath`);
      assert.equal(postStep2.headers.get('location'), '/book/confirm', `${frameworkName}: step 2 post must redirect to /book/confirm`);

      const allCarriedHtml = await (await fetch(`${base}/book/confirm`, { headers: { cookie: sessionCookie } })).text();
      assert.ok(allCarriedHtml.includes('07700900077'), `${frameworkName}: confirm page must carry step 1 value`);
      assert.ok(allCarriedHtml.includes('Full service'), `${frameworkName}: confirm page must carry step 2 value`);
    });
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
  // Driven against the REAL generated server. The previous version never started it: it ran insertDraft and
  // selectDrafts statements of its own, read the row back with its own SELECT, then BUILT the expected
  // "carried html" as a template literal in the test and asserted that string contained the value it had just
  // written into it. Every assertion measured the test. Breaking the generated draft routes, or removing the
  // session cookie handling entirely, would not have failed it.
  const stepsDecl = [
    { path: '/step-1', fill: { 'input[name=option]': 'Option A' }, submit: 'button[type=submit]' },
    { path: '/step-2', expectText: 'Option A' },
  ];
  const archetype = makeTr01Archetype({ startPath: '/confirm', steps: stepsDecl });
  const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });

  await withLiveServer(built, 5612, async (base) => {
    // Routes measured from the generated template rather than assumed: GET on the startPath renders the
    // document, and if the session holds drafts it injects <div class="draft-carried"> before </main>. POST
    // /step-1 stores the declared field. My first attempt guessed /confirm/step-1 and failed - the step paths
    // carry no prefix.
    // Routes MEASURED from the running server, not assumed: /confirm serves the write form, and /step-1
    // serves the declared step page whose form posts to /draft?next=%2Fstep-2. My first two attempts guessed
    // /confirm/step-1 and then expected the step field on /confirm, and both were wrong.
    const step1 = await fetch(`${base}/step-1`);
    assert.equal(step1.status, 200, 'the generated server must serve the declared step path');
    const step1Html = await step1.text();
    assert.ok(step1Html.includes('name="option"'), 'premise: the step page must render the declared field');
    const stepFormAction = (step1Html.match(/<form[^>]*action="([^"]+)"/) ?? [])[1];
    assert.ok(stepFormAction, 'premise: the step form must post somewhere');

    const posted = await fetch(new URL(stepFormAction, base), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ option: 'Option A' }).toString(),
      redirect: 'manual',
    });
    assert.ok(posted.status < 400, `the draft post must be accepted, got ${posted.status}`);
    const sessionCookie = posted.headers.get('set-cookie');
    assert.ok(sessionCookie, 'premise: the server must set a session cookie, or the draft belongs to nobody');

    // THE PROPERTY THE TEST NAME PROMISES: the server carries the earlier step's value into the session, and
    // renders it. The old version built this html in the test and asserted its own string.
    const carried = await fetch(`${base}/confirm`, { headers: { cookie: sessionCookie } });
    assert.equal(carried.status, 200);
    const carriedHtml = await carried.text();
    assert.ok(carriedHtml.includes('draft-carried'),
      'the server must render the draft-carried container for a session holding a draft');
    assert.ok(carriedHtml.includes('Option A'),
      'and it must carry the value entered at the earlier step - the server does this, not the test');

    // A session with no draft must not see it, or a hard-coded value would satisfy the assertion above.
    const fresh = await fetch(`${base}/confirm`);
    assert.equal(fresh.status, 200);
    assert.ok(!(await fresh.text()).includes('Option A'),
      'a session with no draft must not receive another session\'s carried value');
  });

  // The template itself must carry the container the assertion above depends on; without this, renaming it
  // would look like a server regression rather than a fixture drift.
  const serverSource = built.files['server.mjs'] ?? '';
  assert.ok(serverSource.includes('draft-carried'), 'the generated server must contain the carried container');
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

test('a carried draft is usable: the form field is prefilled, not only displayed', async () => {
  // mwg-train-rmp. On the startPath the server injects <div class="draft-carried"> holding the earlier answers,
  // so they are VISIBLE - but no input or select is given a value, so a submit sends empty fields. The values a
  // user can see are not the values the form sends. I checked whether the client enhance script closed the gap
  // and it does not: draft-carried appears only in the server templates, and the script's only .value writes are
  // for search and edit. So the answer is not usable at any point.
  const stepsDecl = [
    { path: '/book/step-1', fill: { 'input[name=phone]': '07700900077' }, submit: '#step-1-next' },
    { path: '/book/step-2', select: { 'select[name=package]': 'Full service' }, submit: 'button[type=submit]' },
  ];
  const archetype = makeTr01Archetype({ startPath: '/book/confirm', steps: stepsDecl });

  let port = 5630;
  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    await withLiveServer(built, port, async (base) => {
      const posted = await fetch(`${base}/book/step-1`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: '07700900077' }).toString(),
        redirect: 'manual',
      });
      assert.ok(posted.status < 400, `${frameworkName}: the step post must be accepted`);
      const cookie = posted.headers.get('set-cookie');
      assert.ok(cookie, `${frameworkName}: premise - the server must set a session cookie`);

      const confirm = await fetch(`${base}/book/confirm`, { headers: { cookie } });
      const html = await confirm.text();

      // PREMISE: the value is carried and displayed, or there is nothing to prefill and this test is vacuous.
      assert.ok(html.includes('draft-carried'), `${frameworkName}: premise - the carried container must render`);
      assert.ok(html.includes('07700900077'), `${frameworkName}: premise - the carried value must be displayed`);

      // THE PROPERTY: it must also be USABLE. Find the declared field and require it to hold the value.
      const field = (html.match(/<input[^>]*name="phone"[^>]*>/) ?? [])[0];
      assert.ok(field, `${frameworkName}: premise - the startPath must render the declared phone field`);
      assert.ok(
        /value="07700900077"/.test(field),
        `${frameworkName}: the carried draft must be prefilled into the field, not merely displayed beside it - `
          + `a user who submits this form sends an empty phone. Field was: ${field}`,
      );
    });
    port += 1;
  }
});

test('a carried draft value is escaped, never emitted as markup', async () => {
  // The prefill fix interpolates a stored draft value into a value attribute and into the carried container, so
  // a draft holding HTML is an injection point. The prefill change escaped values but shipped with NO test, so
  // nothing would have caught a regression back to raw interpolation. This one fails if escaping is removed.
  const stepsDecl = [
    { path: '/book/step-1', fill: { 'input[name=phone]': '07700900077' }, submit: '#step-1-next' },
    { path: '/book/step-2', select: { 'select[name=package]': 'Full service' }, submit: 'button[type=submit]' },
  ];
  const archetype = makeTr01Archetype({ startPath: '/book/confirm', steps: stepsDecl });
  const payload = '" onfocus="alert(1)';

  let port = 5640;
  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    await withLiveServer(built, port, async (base) => {
      const posted = await fetch(`${base}/book/step-1`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: payload }).toString(),
        redirect: 'manual',
      });
      assert.ok(posted.status < 400, `${frameworkName}: the step post must be accepted`);
      const cookie = posted.headers.get('set-cookie');
      assert.ok(cookie, `${frameworkName}: premise - a session cookie must be set`);

      const confirm = await fetch(`${base}/book/confirm`, { headers: { cookie } });
      const html = await confirm.text();
      // PREMISE: the value must actually be carried, or this test proves nothing about escaping.
      assert.ok(html.includes('draft-carried'), `${frameworkName}: premise - the carried container must render`);
      // `"` and `onfocus=` reaching the document unescaped would break out of the attribute and inject a handler.
      assert.ok(
        !html.includes('onfocus="alert(1)"'),
        `${frameworkName}: a draft value must not break out of its attribute - the payload appeared as markup`,
      );
      assert.ok(
        html.includes('&quot;') || html.includes('&#34;'),
        `${frameworkName}: the quote in a carried draft value must be escaped`,
      );
    });
    port += 1;
  }
});

test('an explicit next override on a step POST is honoured by every arm', async () => {
  // mwg-train-213. The raw arm resolves the redirect target as
  //   url.searchParams.get('next') || stepNextMap[path] || startPath
  // while the hono arm hardcodes `c.redirect(nextPath, 303)` and never reads the query. Both arms' generated
  // FORMS post to /draft?next=..., which both handle, so the pages cannot show the divergence - it takes a
  // DIRECT post to a step path to see it, which is why nothing caught it until the MULTI-STEP block was
  // converted to live requests.
  const stepsDecl = [
    { path: '/book/step-1', fill: { 'input[name=phone]': '07700900077' }, submit: '#step-1-next' },
    { path: '/book/step-2', select: { 'select[name=package]': 'Full service' }, submit: 'button[type=submit]' },
  ];
  const archetype = makeTr01Archetype({ startPath: '/book/confirm', steps: stepsDecl });

  let port = 5620;
  for (const frameworkName of ['raw', 'hono']) {
    const built = buildProjectFor(archetype, { frameworkName, defects: [] });
    await withLiveServer(built, port, async (base) => {
      // The override must differ from the declared next step, or the assertion cannot tell a server that honours
      // it from one that ignores it. My first version used /book/step-2 here - which IS the declared next step -
      // and passed on BOTH arms while measuring nothing.
      const target = '/book/confirm';
      const posted = await fetch(`${base}/book/step-1?next=${encodeURIComponent(target)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: '07700900077' }).toString(),
        redirect: 'manual',
      });
      assert.equal(posted.status, 303, `${frameworkName}: a step POST must redirect`);
      assert.equal(
        posted.headers.get('location'),
        target,
        `${frameworkName}: an explicit next override must be honoured, not replaced by the hardcoded next step`,
      );

      // With NO override the declared next step is still used, so the fix cannot be "always follow next".
      const plain = await fetch(`${base}/book/step-1`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone: '07700900077' }).toString(),
        redirect: 'manual',
      });
      assert.equal(plain.status, 303, `${frameworkName}: a step POST without an override still redirects`);
      assert.equal(plain.headers.get('location'), '/book/step-2', `${frameworkName}: with no override the declared next step is used`);
    });
    port += 1;
  }
});
