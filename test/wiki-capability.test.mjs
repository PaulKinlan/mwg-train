import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { archetypeFromSpec, buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { wikiSpec } from '../scripts/lib/wiki-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

const availablePort = () =>
  new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });

const pages = (mutate) => {
  const spec = wikiSpec();
  return { ...spec, wiki: { pages: mutate(spec.wiki.pages) } };
};
const says = (spec, needle) => validateSpec(spec).some((problem) => problem.includes(needle));

test('spec gate: the wiki corpus is validated as content, and a link to a page nobody wrote is legal', () => {
  assert.deepEqual(validateSpec(wikiSpec()), [], 'the corpus validates clean');

  // The two directions of the block/capability agreement. A capability that is on without a corpus would
  // emit a wiki with nothing in it, and a corpus without the capability would validate and emit nothing.
  assert.ok(says({ ...wikiSpec(), wiki: undefined }, 'no wiki block'), 'capability on without a corpus is refused');
  assert.ok(says({ ...wikiSpec(), capabilities: {} }, 'only meaningful with capabilities.wiki'), 'a corpus without the capability is refused');

  // One page cannot be cross-linked, and a cross-linked corpus is the whole of what this type is.
  assert.ok(says(pages((list) => [list[0]]), 'at least two pages'), 'a corpus of one page is refused');
  assert.ok(says(pages((list) => [list[0], { ...list[1], slug: 'soil' }]), 'repeats soil'), 'a duplicate slug is refused');
  assert.ok(says(pages((list) => [list[0], { ...list[1], slug: 'Not A Slug' }]), 'kebab-case'), 'a slug that is not an address is refused');
  // The capability serves `/wiki/search` itself, before `/wiki/:slug`, so a page called `search` would be
  // unreachable - the reader would get the search form. Found in review of this branch.
  const searchPage = { slug: 'search', title: 'Search', revisions: [{ body: 'A page called search.', author: 'Ada Lovelace', created_at: '2026-05-01T00:00:00.000Z' }] };
  assert.ok(says(pages((list) => [...list, searchPage]), "cannot be 'search'"), 'a page slugged search is refused, because that is where the search route is served');
  assert.ok(says(pages((list) => [list[0], { ...list[1], revisions: [] }]), 'nothing to read'), 'a page with no revisions is refused');

  // History is what separates this type from a blog (the type axis is explicit), and it has to be orderable
  // and attributable: a revision with no author, or an instant that is not after the one before it, cannot be
  // told from its neighbours in the history view.
  assert.ok(
    says(pages((list) => list.map((page) => ({ ...page, revisions: [page.revisions[0]] }))), 'no history is a blog'),
    'a corpus with no history anywhere is refused, in those words',
  );
  assert.ok(
    says(pages((list) => [{ ...list[0], revisions: [list[0].revisions[0], { ...list[0].revisions[1], created_at: list[0].revisions[0].created_at }] }, list[1]]), 'later than the revision before it'),
    'two revisions sharing an instant are refused',
  );
  assert.ok(says(pages((list) => [{ ...list[0], revisions: [{ ...list[0].revisions[0], author: ' ' }] }, list[1]]), 'who wrote'), 'a revision with no author is refused');
  assert.ok(says(pages((list) => [{ ...list[0], revisions: [{ ...list[0].revisions[0], created_at: '2026-01-02 10:00' }] }, list[1]]), 'ISO-8601'), 'a local time instead of an instant is refused');

  // Link syntax is checked; link EXISTENCE is not. A wiki is defined by links to pages that do not exist yet,
  // and the corpus's own `leaf-mould` link is deliberately one of them - it must not be an error.
  assert.ok(says(pages((list) => [{ ...list[0], revisions: [{ ...list[0].revisions[0], body: 'See [[Bad Target]].' }] }, list[1]]), 'kebab-case slug'), 'a malformed link target is refused');
  assert.ok(says(pages((list) => [{ ...list[0], revisions: [{ ...list[0].revisions[0], body: 'See [[soil|]].' }] }, list[1]]), 'labels nothing'), 'a link with an empty label is refused');
  assert.ok(JSON.stringify(wikiSpec()).includes('leaf-mould'), 'the corpus does carry a link to an unwritten page');
  assert.ok(!says(wikiSpec(), 'leaf-mould'), 'and that link is not an error');

  // The capability serves these paths before any declared route, so a specification declaring one as well
  // would leave a handler nothing ever reaches.
  const shadow = { ...wikiSpec(), routes: [...wikiSpec().routes, { method: 'GET', path: '/wiki/:slug', kind: 'page', effect: 'shadow the capability' }] };
  assert.ok(says(shadow, "the wiki capability's own route"), 'a specification that declares a wiki route is refused');
});

test('wiring guard: the corpus reaches the builder archetype, and byte-invariance holds without it', () => {
  // The trap mwg-train-le6 found and mwg-train-ksn re-tested: `archetypeFromSpec` is an explicit list, so a
  // block not named there validates cleanly and is then silently dropped while the capability flag still
  // arrives - the capability would be on and emit nothing.
  const spec = wikiSpec();
  assert.deepEqual(archetypeFromSpec(spec).wiki, spec.wiki, 'the corpus survives archetypeFromSpec');

  // And the drift trap this capability is most exposed to: a specification that never opted in must not
  // gain a single character. A capability that emits unconditionally moves every recorded tree hash - one
  // did exactly that to all 210 training trees by adding 51 bytes to a shared page helper.
  for (const frameworkName of ARMS) {
    const { files } = buildProjectFromSpec({ spec: specForFamily('booking', ROOT), frameworkName });
    assert.equal(
      /WIKI|wiki_pages|wiki_revisions|wikiPage|wikiAnchor|wikiBacklinks|\/wiki\//.test(files['server.mjs']),
      false,
      `${frameworkName} emitted wiki code for a specification that never opted in`,
    );
  }
});

test('functional: a reader searches the corpus, follows a cross-link, reads history, and meets a link to create', async (t) => {
  const spec = wikiSpec();
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `wiki-${arm}-`));
      const port = await availablePort();
      const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
      writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'test.sqlite')], {
        cwd: dir,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);
        const page = async (path) => {
          const response = await fetch(`${base}${path}`);
          return { status: response.status, html: await response.text() };
        };
        const create = async (slug, body) =>
          fetch(`${base}/wiki/${slug}/create`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body).toString(),
            redirect: 'manual',
          });

        const index = await page('/wiki');
        assert.equal(index.status, 200, `${arm} serves the index`);
        for (const title of ['Soil', 'Clay', 'Compost']) assert.ok(index.html.includes(title), `${arm} index lists ${title}`);

        // The word only appears in a revision body, never in a title, so a search that reads titles alone
        // would find nothing - which is precisely what "search a corpus" has to mean.
        const found = await page('/wiki/search?q=alkaline');
        assert.equal(found.status, 200, `${arm} serves search`);
        assert.ok(found.html.includes('Soil'), `${arm} finds the page by a word in its body`);
        const nothing = await page('/wiki/search?q=nothingisyw');
        assert.ok(!nothing.html.includes('Soil'), `${arm} reports no results for a word in the corpus`);

        const soil = await page('/wiki/soil');
        assert.equal(soil.status, 200, `${arm} serves a page`);
        assert.ok(soil.html.includes('Do not add lime'), `${arm} shows the current revision`);
        assert.ok(soil.html.includes('Grace Hopper'), `${arm} names the current revision's author`);
        assert.ok(soil.html.includes('href="/wiki/clay"'), `${arm} renders a resolving cross-link`);

        // "Can tell the two apart": the first revision tells the reader to add lime and the second withdraws
        // it, so the assertion is that the older revision contains the old advice and not the new.
        const older = await page('/wiki/soil/revision/1');
        assert.equal(older.status, 200, `${arm} serves an older revision`);
        assert.ok(older.html.includes('add lime in spring'), `${arm} shows the older revision's advice`);
        assert.ok(!older.html.includes('Do not add lime'), `${arm} does not show the current advice on the older revision`);
        assert.ok(older.html.includes('wiki-revision-banner') && older.html.includes('Ada Lovelace'), `${arm} says whose revision you are reading`);
        assert.equal((await page('/wiki/soil/revision/99')).status, 404, `${arm} answers 404 for a revision that does not exist`);

        const history = await page('/wiki/soil/history');
        assert.equal(history.status, 200, `${arm} serves history`);
        for (const author of ['Ada Lovelace', 'Grace Hopper']) assert.ok(history.html.includes(author), `${arm} history names ${author}`);

        // The link-to-create. `leaf-mould` is linked from clay and nobody has written it, so the requirement
        // is a link a reader can follow to a page that offers to create it - not a 404.
        const clay = await page('/wiki/clay');
        assert.ok(clay.html.includes('wiki-link missing') && clay.html.includes('data-create="true"'), `${arm} marks the unwritten link as a link to create`);
        assert.ok(clay.html.includes('href="/wiki/leaf-mould"'), `${arm} keeps the unwritten link a real anchor`);
        const missing = await page('/wiki/leaf-mould');
        assert.equal(missing.status, 200, `${arm} answers 200 rather than 404 for an unwritten page`);
        assert.ok(missing.html.includes('wiki-missing-notice'), `${arm} says the page does not exist yet`);
        assert.ok(missing.html.includes('action="/wiki/leaf-mould/create"'), `${arm} offers a form to create it`);

        const created = await create('leaf-mould', { author: 'Alan Turing', title: 'Leaf mould', body: 'Leaf mould is leaf litter broken down. See [[soil]].' });
        assert.equal(created.status, 303, `${arm} accepts a new page`);
        assert.equal(created.headers.get('location'), '/wiki/leaf-mould', `${arm} redirects to the page it created`);
        const written = await page('/wiki/leaf-mould');
        assert.equal(written.status, 200, `${arm} serves the page that was just created`);
        assert.ok(!written.html.includes('wiki-missing-notice'), `${arm} no longer offers to create a page that exists`);
        const afterCreate = await page('/wiki/clay');
        assert.ok(!afterCreate.html.includes('data-create="true"'), `${arm} turns the link to it into a resolving link`);

        const backlinks = await page('/wiki/clay');
        assert.ok(backlinks.html.includes('wiki-backlinks') && backlinks.html.includes('Soil'), `${arm} lists the pages that link here`);

        // mwg-train-lfz0. A malformed percent-escape used to escape decodeURIComponent as a URIError, and because
        // the throw happened inside the request handler the WHOLE PROCESS exited: one bad URL for every reader, not
        // one failed request. Reproduced against this same served arm before the fix (GET /wiki/%/history -> server
        // exited 1, URIError on stderr, every later request failed). The three requests below are driven against the
        // live server on purpose - a unit test on the helper would not have seen the process die.
        const malformed = [
          ['/wiki/%/history', undefined],
          ['/wiki/%', undefined],
          ['/wiki/%/revision/1', undefined],
          ['/wiki/%/create', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'author=A&body=B', redirect: 'manual' }],
        ];
        for (const [path, init] of malformed) {
          const response = await fetch(`${base}${path}`, init);
          if (arm === 'hono') {
            // Hono's router decodes path params with its own try/fallback (node_modules/hono/dist/utils/url.js,
            // tryDecodeURIComponent), so nothing can throw here: the bad escape stays a literal slug and the page
            // simply does not exist. Recorded rather than asserted away - the arms differ deliberately, and the
            // asset route's earlier fix for this same crash class is raw-only for the same reason.
            assert.notEqual(response.status, 400, `${arm} cannot raise the URIError this fix answers, so it must not claim to`);
          } else {
            assert.equal(response.status, 400, `${arm} refuses a malformed escape with 400`);
            assert.match(await response.text(), /Malformed page name/, `${arm} says what was wrong`);
          }
        }

        // The DoS assertion, and the reason this regression test exists: the server is still serving after them.
        const health = await fetch(`${base}/__health`);
        assert.ok(health.ok, `${arm} survives a malformed escape instead of exiting`);
        assert.equal((await page('/wiki/soil')).status, 200, `${arm} still serves a real page afterwards`);
      } finally {
        child.kill('SIGTERM');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
