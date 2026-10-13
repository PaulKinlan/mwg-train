import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { conceptBookingStep, conceptImage, conceptJourneyStep, conceptTarget, listConcepts, renderConcepts, trainingBoard } from '../src/viewer/concepts.mjs';
import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function serve(t, repoRoot) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-concepts-state-'));
  const { server, liveServer, pool } = createViewer({ allowAnonymous: true, corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot });
  t.after(() => { pool.stopAll(); server.close(); liveServer.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${server.address().port}`;
}

test('gallery serves the generated archetype reference boards and the authored eval targets', async (t) => {
  const gallery = listConcepts(ROOT);
  assert.deepEqual(gallery.boards.map((board) => `${board.archetype}/${board.id}`),
    ['editorial-blog/step1-index', 'fan-community-site/step4-moderation', 'product-card-comparison/step2-compare']);
  assert.deepEqual(gallery.archetypes, [
    { id: 'booking', reference: true, target: true, referencePath: '/concepts/images/booking/step1-browse.jpg' },
    { id: 'account-recovery', reference: true, target: true, referencePath: '/concepts/images/account-recovery/step1-request.jpg' },
    { id: 'catalogue', reference: true, target: true, referencePath: '/concepts/images/catalogue/step1-grid.jpg' },
    { id: 'contact-lead', reference: true, target: true, referencePath: '/concepts/images/contact-lead/step1-form.jpg' },
    { id: 'event-registration', reference: true, target: true, referencePath: '/concepts/images/event-registration/step1-event.jpg' },
  ]);
  assert.deepEqual(gallery.journeys.map(({ id, steps }) => [id, steps.length]), [
    ['booking', 5], ['catalogue', 3], ['contact-lead', 3], ['account-recovery', 3], ['event-registration', 3],
    ['editorial-blog', 4], ['fan-community-site', 5], ['product-card-comparison', 4],
    ['community-forum', 1], ['expense-tracker', 1], ['job-board', 1], ['library-catalogue', 1],
    ['restaurant-ordering', 1], ['survey-form', 1], ['web-shop', 1],
  ]);
  assert.equal(gallery.patterns.length, 21, 'all authored patterns are indexed, not just those with boards');
  assert.equal(gallery.patterns.flatMap(({ steps }) => steps).filter(({ available }) => available).length, 37);
  assert.equal(gallery.patterns.filter(({ steps }) => steps.length === 0).length, 6, 'missing board sets stay visible');
  assert.ok(gallery.patterns.every(({ brief }) => brief?.sitePrompt.includes('Step-by-step behaviour')));
  assert.ok(gallery.patterns.flatMap(({ steps }) => steps).every(({ imagePrompt }) => imagePrompt), 'every committed step includes its original prompt');
  // The training arm is the 30 declared families, every one of them backed by a target render on disk, and none of
  // them is an A6 archetype id: the two arms cannot leak into each other's label space.
  assert.equal(gallery.trainingTargets.length, 30);
  assert.deepEqual(gallery.trainingTargets.map(({ id }) => id), Array.from({ length: 30 }, (_, index) => `tr-${String(index + 1).padStart(2, '0')}`));
  assert.ok(gallery.trainingTargets.every((family) => family.available), 'all 30 declared training targets exist');
  const tr01 = gallery.trainingTargets[0];
  assert.deepEqual(
    (({ id, archetype, title, origin, available, board }) => ({ id, archetype, title, origin, available, board }))(tr01),
    { id: 'tr-01', archetype: 'booking', title: 'Mobile bicycle mechanic service booking',
      origin: 'docs/train/targets/tr-01/index.html', available: true, board: true },
  );
  // Both images report a size measured from their own bytes. The exact numbers are pinned by the fixture tests below;
  // here the point is that a real render and a real board each yield a positive measured size.
  assert.ok(Number.isInteger(tr01.width) && tr01.width > 0 && Number.isInteger(tr01.height) && tr01.height > 0, 'the harness render reports a measured PNG size');
  assert.ok(Number.isInteger(tr01.boardWidth) && tr01.boardWidth > 0 && Number.isInteger(tr01.boardHeight) && tr01.boardHeight > 0, 'the designed board reports a measured JPEG size');
  // The two kinds of image are separate facts about the TREE: every declared family has a harness instrument, and a
  // family carries a designed board exactly when its reference.jpg is on disk. Deriving this from the tree is what
  // keeps this test true as boards are authored, instead of restating a count that goes stale (review finding mwg-train-bmr).
  const familyIds = gallery.trainingTargets.map(({ id }) => id);
  const boardsOnDisk = familyIds.filter((id) => existsSync(join(ROOT, 'docs/design/training', id, 'reference.jpg')));
  assert.deepEqual(gallery.trainingTargets.filter((family) => family.board).map(({ id }) => id), boardsOnDisk,
    'a family is reported with a designed board exactly when its reference.jpg is on disk');
  assert.ok(boardsOnDisk.length > 0, 'this checkout carries at least one designed board');
  assert.equal(gallery.trainingTargets.filter((family) => gallery.archetypes.some(({ id }) => id === family.id)).length, 0,
    'no id is listed in both arms');
  assert.ok(gallery.journeys.every((journey) => journey.steps.every((step) => step.available)), 'all 37 supplied boards exist');
  assert.deepEqual(gallery.bookingSteps.map(({ id, available }) => [id, available]), [
    ['step1-browse', true], ['step2-form', true], ['step3-confirmation', true],
    ['step4-error', true], ['step5-empty', true],
  ]);
  const html = renderConcepts(gallery);
  assert.match(html, /href="\/concepts">concepts<\/a>/);
  assert.match(html, /Concept image ≠ conformance image/);
  assert.match(html, /not<\/em> the desired production design/);
  assert.match(html, /The proposed 42-family expansion has not landed/);
  assert.match(html, /Sealed evaluation targets \(A6\)/);
  assert.match(html, /not part of the 30 families above/);
  assert.match(html, /37 concept boards have committed bytes/);
  assert.match(html, /id="pattern-course-enrolment"/);
  assert.match(html, /No multi-step reference boards are authored for this pattern yet/);
  assert.match(html, /Image Generation Prompt · inherited single training reference, NOT a step board/);
  assert.match(html, /id="pattern-community-forum"/);
  assert.match(html, /\/concepts\/images\/community-forum\/step3-refusal\.jpg/);
  assert.match(html, /Image Generation Prompt for this state/);
  assert.match(html, /No step-specific browser assertion is registered for this picture/);
  assert.equal((html.match(/aria-labelledby="pattern-heading-[a-z-]+"/g) ?? []).length, 21);
  assert.equal((html.match(/<summary>Site Generation Prompt/g) ?? []).length, 51);
  assert.equal((html.match(/<summary>Image Generation Prompt for this state<\/summary>/g) ?? []).length, 37);
  assert.doesNotMatch(html, /(?:src|href)="\/concepts\/images\/layout-(storefront|saas|explainer)\.jpg/, 'retired sketches remain unserved even when their names occur in original prompt text');
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, new RegExp(`${boardsOnDisk.length} of ${familyIds.length} declared families have a designed reference board`));
  for (const family of ['tr-01', 'tr-17', 'tr-30']) {
    assert.match(html, new RegExp(`href="/concepts/targets/${family}\\.png"`));
    assert.match(html, new RegExp(`alt="Harness target render, the A1 conformance instrument, for ${family}`));
  }
  assert.equal((html.match(/\/concepts\/targets\/tr-\d{2}\.png" aria-label/g) ?? []).length, 30);
  assert.equal((html.match(/\/concepts\/references\/tr-\d{2}\.jpg" aria-label/g) ?? []).length, boardsOnDisk.length);
  assert.match(html, /Designed reference board · <code>docs\/design\/training\/tr-01\/reference\.jpg<\/code>/);
  assert.match(html, /Harness target render \(A1 conformance instrument\) · <code>data\/A1_self_generated\/targets\/tr-01\/target\.png<\/code> — a deterministic headless-Chrome render/);
  const registerOnDisk = existsSync(join(ROOT, 'docs/provenance/assets/training-reference-boards.md'));
  assert.equal(gallery.trainingBoardRegister, registerOnDisk ? 'docs/provenance/assets/training-reference-boards.md' : null);
  if (registerOnDisk) assert.match(html, /Model and digests: <code>docs\/provenance\/assets\/training-reference-boards\.md<\/code>/);
  else assert.match(html, /the provenance register is pending/);
  const renderedOrder = [...html.matchAll(/aria-labelledby="target-(tr-\d{2})"/g)].map((match) => match[1]);
  assert.deepEqual(renderedOrder, [...boardsOnDisk, ...familyIds.filter((id) => !boardsOnDisk.includes(id))]);
  const base = await serve(t, ROOT);
  const page = await fetch(`${base}/concepts`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Training families \(A1\): designed boards and harness targets/);
  assert.match(pageHtml, /Sealed evaluation targets \(A6\)/);
  assert.match(pageHtml, /21 archetype patterns/);
  for (const family of ['tr-01', 'tr-15', 'tr-30']) {
    const render = await fetch(`${base}/concepts/targets/${family}.png`);
    assert.equal(render.status, 200, family);
    assert.match(render.headers.get('content-type'), /image\/png/);
    assert.equal(render.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await render.arrayBuffer()).byteLength > 1000, true);
  }
  const board = await fetch(`${base}/concepts/references/tr-01.jpg`);
  assert.equal(board.status, 200);
  assert.match(board.headers.get('content-type'), /image\/jpeg/);
  assert.equal(board.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((await board.arrayBuffer()).byteLength > 1000);
  const boardless = familyIds.find((id) => !boardsOnDisk.includes(id));
  if (boardless) assert.equal((await fetch(`${base}/concepts/references/${boardless}.jpg`)).status, 404, 'a family with no designed board has no board route');
  else assert.equal((await fetch(`${base}/concepts/references/${boardsOnDisk.at(-1)}.jpg`)).status, 200, 'a family with a designed board serves it');
  assert.equal((await fetch(`${base}/concepts/references/tr-31.jpg`)).status, 404, 'an undeclared family has no board route');
  assert.equal((await fetch(`${base}/concepts/targets/tr-31.png`)).status, 404);
  assert.equal((await fetch(`${base}/concepts/targets/tr-1.png`)).status, 404);
  // The retired hand-drawn sketches are no longer served by the viewer at all, while the generated archetype
  // boards the gallery now shows are served through the allowlisted two-segment route.
  for (const name of ['layout-storefront', 'layout-saas', 'layout-explainer']) {
    assert.equal((await fetch(`${base}/concepts/images/${name}.jpg`)).status, 404, `${name} is retired from the viewer`);
  }
  for (const [archetype, step] of [['editorial-blog', 'step1-index'], ['fan-community-site', 'step4-moderation'],
    ['product-card-comparison', 'step2-compare']]) {
    const response = await fetch(`${base}/concepts/images/${archetype}/${step}.jpg`);
    assert.equal(response.status, 200, `${archetype}/${step} is served`);
    assert.match(response.headers.get('content-type'), /image\/jpeg/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await response.arrayBuffer()).byteLength > 1000, true);
  }
  const target = await fetch(`${base}/concepts/targets/booking.png`);
  assert.equal(target.status, 200);
  assert.match(target.headers.get('content-type'), /image\/png/);
  assert.equal((await target.arrayBuffer()).byteLength > 1000, true);
  assert.equal((await fetch(`${base}/concepts/images/booking.jpg`)).status, 404);
  for (const journey of gallery.journeys) {
    for (const step of journey.steps) {
      const response = await fetch(`${base}/concepts/images/${journey.id}/${step.id}.jpg`);
      assert.equal(response.status, 200, `${journey.id}/${step.id}`);
      assert.equal(response.headers.get('content-type'), 'image/jpeg');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal((await response.arrayBuffer()).byteLength > 1000, true);
    }
  }
  const step = await fetch(`${base}/concepts/images/booking/step1-browse.jpg`);
  assert.equal(step.status, 200);
  assert.equal(step.headers.get('content-type'), 'image/jpeg');
  assert.equal((await step.arrayBuffer()).byteLength > 1000, true);
  assert.equal((await fetch(`${base}/concepts`, { method: 'POST', headers: { origin: new URL(base).origin } })).status, 404);
  assert.equal((await fetch(`${base}/live/example/original/`)).status, 404);
});

test('future per-archetype references appear in pairs only when their images exist; escape every label', () => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-concepts-list-'));
  try {
    mkdirSync(join(root, 'docs/design/archetypes/booking'), { recursive: true });
    mkdirSync(join(root, 'data/A6_evaluation/targets/booking'), { recursive: true });
    writeFileSync(join(root, 'docs/design/archetypes/booking.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    writeFileSync(join(root, 'docs/design/archetypes/future-reference.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    writeFileSync(join(root, 'docs/design/archetypes/booking/step1-browse.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    writeFileSync(join(root, 'data/A6_evaluation/targets/booking/target.png'), Buffer.from([137, 80, 78, 71]));
    const gallery = listConcepts(root);
    assert.deepEqual(gallery.archetypes, [
      { id: 'booking', reference: true, target: true },
      { id: 'future-reference', reference: true, target: false },
    ]);
    assert.deepEqual(gallery.bookingSteps.map(({ available }) => available), [true, false, false, false, false]);
    assert.match(renderConcepts(gallery), /\/concepts\/images\/booking\/step1-browse\.jpg/);
    assert.match(renderConcepts(gallery), /A6 target PNG/);
    assert.match(renderConcepts(gallery), /Authored target render unavailable in this checkout/);
    const hostile = renderConcepts({ boards: [], archetypes: [{ id: '<img src=x onerror=alert(1)>', reference: false, target: false }] });
    assert.doesNotMatch(hostile, /<img src=x/);
    assert.match(hostile, /&lt;img src=x/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('concept image endpoints refuse traversal, unexpected names, and symlink escapes', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-concepts-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/design/archetypes'), { recursive: true });
  mkdirSync(join(root, 'data/A6_evaluation/targets/booking'), { recursive: true });
  const outside = join(root, 'private.jpg');
  writeFileSync(outside, 'PRIVATE');
  symlinkSync(outside, join(root, 'docs/design/archetypes/booking.jpg'));
  symlinkSync(outside, join(root, 'data/A6_evaluation/targets/booking/target.png'));
  assert.equal(conceptImage(root, 'booking'), null);
  assert.equal(conceptTarget(root, 'booking'), null);
  assert.equal(conceptImage(root, '../private'), null);
  const base = await serve(t, root);
  for (const path of ['/concepts/images/booking.jpg', '/concepts/targets/booking.png', '/concepts/images/../../private.jpg', '/concepts/images/layout-unknown.jpg', '/concepts/images/%2e%2e%2fprivate.jpg', '/concepts/targets/unknown.png']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
  rmSync(join(root, 'docs/design/archetypes'), { recursive: true });
  symlinkSync(join(root, 'data/A6_evaluation/targets/booking'), join(root, 'docs/design/archetypes'));
  assert.equal(conceptImage(root, 'booking'), null);
  rmSync(join(root, 'data/A6_evaluation/targets/booking'), { recursive: true });
  symlinkSync(join(root, 'docs/design'), join(root, 'data/A6_evaluation/targets/booking'));
  assert.equal(conceptTarget(root, 'booking'), null);
});

test('five booking step routes are exact and reject nested symlink/file escapes', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-concepts-steps-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'docs/design/archetypes/booking');
  mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  for (const id of ['step1-browse', 'step2-form', 'step3-confirmation', 'step4-error', 'step5-empty']) {
    writeFileSync(join(dir, `${id}.jpg`), bytes);
  }
  const outside = join(root, 'private.jpg');
  writeFileSync(outside, 'PRIVATE');
  rmSync(join(dir, 'step4-error.jpg'));
  symlinkSync(outside, join(dir, 'step4-error.jpg'));
  const base = await serve(t, root);
  for (const id of ['step1-browse', 'step2-form', 'step3-confirmation', 'step5-empty']) {
    assert.equal(conceptBookingStep(root, id)?.bytes.equals(bytes), true);
    const response = await fetch(`${base}/concepts/images/booking/${id}.jpg`);
    assert.equal(response.status, 200, id);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  for (const path of ['/concepts/images/booking/step4-error.jpg', '/concepts/images/booking/step6-exploit.jpg', '/concepts/images/booking/%2e%2e%2fprivate.jpg', '/concepts/images/booking/step1-browse.png']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
  rmSync(dir, { recursive: true });
  mkdirSync(join(root, 'external'));
  writeFileSync(join(root, 'external/step1-browse.jpg'), bytes);
  symlinkSync(join(root, 'external'), dir);
  assert.equal(conceptBookingStep(root, 'step1-browse'), null);
  assert.equal((await fetch(`${base}/concepts/images/booking/step1-browse.jpg`)).status, 404);
});

test('Wave 2 routes allow only named archetype/step pairs and reject symlinked files or ancestors', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-wave2-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entries = [
    ['catalogue', 'step1-grid', 'step2-cart'],
    ['contact-lead', 'step1-form', 'step2-success'],
    ['account-recovery', 'step1-request', 'step2-sent'],
    ['event-registration', 'step1-event', 'step2-pass'],
  ];
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const outside = join(root, 'private.jpg');
  writeFileSync(outside, 'PRIVATE');
  for (const [family, valid, symlinked] of entries) {
    const dir = join(root, 'docs/design/archetypes', family);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${valid}.jpg`), bytes);
    symlinkSync(outside, join(dir, `${symlinked}.jpg`));
    assert.deepEqual(conceptJourneyStep(root, family, valid)?.bytes, bytes);
    assert.equal(conceptJourneyStep(root, family, symlinked), null);
  }
  const base = await serve(t, root);
  for (const [family, valid, symlinked] of entries) {
    const response = await fetch(`${base}/concepts/images/${family}/${valid}.jpg`);
    assert.equal(response.status, 200, `${family}/${valid}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal((await fetch(`${base}/concepts/images/${family}/${symlinked}.jpg`)).status, 404);
  }
  for (const path of [
    '/concepts/images/unknown/step1-grid.jpg',
    '/concepts/images/catalogue/step2-success.jpg',
    '/concepts/images/catalogue/step99-grid.jpg',
    '/concepts/images/catalogue/%2e%2e%2fprivate.jpg',
    '/concepts/images/catalogue/step1-grid.png',
    '/concepts/images/catalogue/step1-grid.jpg/../../private.jpg',
  ]) assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  const catalogueDir = join(root, 'docs/design/archetypes/catalogue');
  rmSync(catalogueDir, { recursive: true });
  symlinkSync(join(root, 'docs/design/archetypes/contact-lead'), catalogueDir);
  assert.equal(conceptJourneyStep(root, 'catalogue', 'step1-grid'), null);
  assert.equal((await fetch(`${base}/concepts/images/catalogue/step1-grid.jpg`)).status, 404);
  const archetypeDir = join(root, 'docs/design/archetypes');
  const escaped = join(root, 'escaped');
  mkdirSync(join(escaped, 'catalogue'), { recursive: true });
  writeFileSync(join(escaped, 'catalogue/step1-grid.jpg'), bytes);
  rmSync(archetypeDir, { recursive: true });
  symlinkSync(escaped, archetypeDir);
  assert.equal(conceptJourneyStep(root, 'catalogue', 'step1-grid'), null);
  assert.equal((await fetch(`${base}/concepts/images/catalogue/step1-grid.jpg`)).status, 404);
});

test('the A1 training arm is the manifest, not the directory: only declared families are listed and served', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-concepts-a1-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const arm = join(root, 'data/A1_self_generated/targets');
  const png = Buffer.from([137, 80, 78, 71]);
  const line = (over = {}) => JSON.stringify({
    id: 'target-tr-01', arm: 'A1_self_generated', kind: 'asset', family_id: 'tr-01',
    archetype: 'booking', title: 'Declared family', origin: 'docs/train/targets/tr-01/index.html',
    image_path: 'data/A1_self_generated/targets/tr-01/target.png', viewport: { width: 1280, height: 900 }, ...over,
  });
  for (const id of ['tr-01', 'tr-07']) {
    mkdirSync(join(arm, id), { recursive: true });
    writeFileSync(join(arm, id, 'target.png'), png);
  }
  // tr-01 declared and present; tr-02 declared twice and absent; tr-07 present on disk but never declared.
  writeFileSync(join(arm, 'manifest.jsonl'), [line(), line({ archetype: 'second-declaration' }), line({ family_id: 'tr-02', origin: 'docs/train/targets/tr-02/index.html', image_path: 'data/A1_self_generated/targets/tr-02/target.png' }), ''].join('\n'));
  const gallery = listConcepts(root);
  assert.deepEqual(gallery.trainingTargets, [
    { id: 'tr-01', archetype: 'booking', title: 'Declared family', origin: 'docs/train/targets/tr-01/index.html', brief: null, available: true, board: false },
    { id: 'tr-02', archetype: 'booking', title: 'Declared family', origin: 'docs/train/targets/tr-02/index.html', brief: null, available: false, board: false },
  ], 'first declaration wins, an absent render is an honest gap, and an undeclared file is not a family');
  assert.equal(conceptTarget(root, 'tr-07'), null, 'a file the manifest never declared is not public');
  assert.equal(conceptTarget(root, 'tr-01')?.bytes.equals(png), true);
  const html = renderConcepts(gallery);
  assert.match(html, /Harness target render pending\. Expected <code>data\/A1_self_generated\/targets\/tr-02\/target\.png<\/code>/);
  assert.doesNotMatch(html, /tr-07/, 'an undeclared directory cannot put a name on the page');

  // A hostile or malformed line adds nothing: wrong arm, wrong kind, a path that is not this family's, an id that
  // is not tr-NN, and unparseable JSON are all ignored rather than followed.
  writeFileSync(join(arm, 'manifest.jsonl'), [
    line({ family_id: '../private', image_path: 'data/A1_self_generated/targets/../private/target.png' }),
    line({ family_id: 'tr-03', arm: 'A6_evaluation' }),
    line({ family_id: 'tr-04', kind: 'report' }),
    line({ family_id: 'tr-05', image_path: 'docs/design/archetypes/tr-05/target.png' }),
    line({ family_id: 'booking' }),
    '{ not json',
  ].join('\n'));
  assert.deepEqual(listConcepts(root).trainingTargets, []);
  for (const id of ['tr-03', 'tr-04', 'tr-05', 'private', 'booking']) assert.equal(conceptTarget(root, id), null, id);
  assert.match(renderConcepts(listConcepts(root)), /No A1 training families are declared in this checkout\./);

  // A symlinked family directory or target is unavailable, not a path to follow.
  const outside = join(root, 'private.png');
  writeFileSync(outside, 'PRIVATE');
  writeFileSync(join(arm, 'manifest.jsonl'), `${line()}\n`);
  rmSync(join(arm, 'tr-01/target.png'));
  symlinkSync(outside, join(arm, 'tr-01/target.png'));
  assert.equal(conceptTarget(root, 'tr-01'), null);
  const base = await serve(t, root);
  assert.equal((await fetch(`${base}/concepts/targets/tr-01.png`)).status, 404);
  assert.equal(await (await fetch(`${base}/concepts/targets/tr-01.png`)).text(), 'authored target unavailable');
  assert.equal(await (await fetch(`${base}/concepts/targets/tr-07.png`)).text(), 'authored target unavailable', 'an undeclared file is refused by the route, not served');
  assert.equal(await (await fetch(`${base}/concepts/targets/%2e%2e%2fprivate.png`)).text(), 'not found');
  const dir = join(root, 'escaped');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'target.png'), png);
  rmSync(join(arm, 'tr-01'), { recursive: true });
  symlinkSync(dir, join(arm, 'tr-01'));
  assert.equal(conceptTarget(root, 'tr-01'), null, 'a symlinked family directory is not the family directory');
});

test('the A1 target size is measured from the PNG header, never taken from the manifest viewport', () => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-concepts-size-'));
  try {
    const arm = join(root, 'data/A1_self_generated/targets/tr-09');
    mkdirSync(arm, { recursive: true });
    // A 24-byte PNG header with a full-page capture size (1280x2400), declared as a 1280x900 viewport.
    const header = Buffer.alloc(24);
    header.writeUInt32BE(0x89504e47, 0); header.writeUInt32BE(0x0d0a1a0a, 4);
    header.write('IHDR', 12, 'latin1'); header.writeUInt32BE(1280, 16); header.writeUInt32BE(2400, 20);
    writeFileSync(join(arm, 'target.png'), header);
    writeFileSync(join(root, 'data/A1_self_generated/targets/manifest.jsonl'), `${JSON.stringify({
      id: 'target-tr-09', arm: 'A1_self_generated', kind: 'asset', family_id: 'tr-09', archetype: 'booking',
      title: 'Tall capture', origin: 'docs/train/targets/tr-09/index.html',
      image_path: 'data/A1_self_generated/targets/tr-09/target.png', viewport: { width: 1280, height: 900 },
    })}\n`);
    assert.deepEqual(listConcepts(root).trainingTargets, [{
      id: 'tr-09', archetype: 'booking', title: 'Tall capture', origin: 'docs/train/targets/tr-09/index.html',
      brief: null, available: true, board: false, width: 1280, height: 2400,
    }]);
    assert.match(renderConcepts(listConcepts(root)), /width="1280" height="2400"/);
    // Bytes that are not a PNG header prove no size, so no width/height is claimed at all.
    writeFileSync(join(arm, 'target.png'), Buffer.from([137, 80, 78, 71]));
    const unmeasured = listConcepts(root).trainingTargets[0];
    assert.equal(unmeasured.available, true);
    assert.equal('width' in unmeasured, false);
    assert.doesNotMatch(renderConcepts(listConcepts(root)), /width="1280" height="2400"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a designed board is shown as a designed board: measured, separately labelled, and refused when undeclared', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-concepts-board-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const arm = join(root, 'data/A1_self_generated/targets');
  const boards = join(root, 'docs/design/training');
  const png = Buffer.from([137, 80, 78, 71]);
  const jpeg = Buffer.alloc(20);
  jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff; jpeg[3] = 0xc0;
  jpeg.writeUInt16BE(0x0011, 4); jpeg[6] = 8;
  jpeg.writeUInt16BE(768, 7);   // height
  jpeg.writeUInt16BE(1376, 9);  // width
  const line = (id) => JSON.stringify({
    id: `target-${id}`, arm: 'A1_self_generated', kind: 'asset', family_id: id, archetype: 'booking',
    title: 'A family', origin: `docs/train/targets/${id}/index.html`,
    image_path: `data/A1_self_generated/targets/${id}/target.png`, viewport: { width: 1280, height: 900 },
  });
  for (const id of ['tr-01', 'tr-02', 'tr-05']) {
    mkdirSync(join(arm, id), { recursive: true });
    writeFileSync(join(arm, id, 'target.png'), png);
  }
  writeFileSync(join(arm, 'manifest.jsonl'), [line('tr-01'), line('tr-02'), ''].join('\n'));
  // tr-01 has a designed board, tr-05 has a board for a family the manifest never declared, tr-02 has none.
  for (const id of ['tr-01', 'tr-05']) {
    mkdirSync(join(boards, id), { recursive: true });
    writeFileSync(join(boards, id, 'reference.jpg'), id === 'tr-01' ? jpeg : Buffer.from([0xff, 0xd8, 0x01]));
  }
  const gallery = listConcepts(root);
  assert.deepEqual(gallery.trainingTargets.map(({ id, board }) => [id, board]), [['tr-01', true], ['tr-02', false]],
    'a designed board is only reported for a family the manifest declares, and tr-05 is not a family at all');
  const tr01 = gallery.trainingTargets[0];
  assert.equal(tr01.boardWidth, 1376);
  assert.equal(tr01.boardHeight, 768);
  assert.equal('boardWidth' in gallery.trainingTargets[1], false, 'no board means no measured size at all');
  assert.equal(trainingBoard(root, 'tr-01')?.bytes.equals(jpeg), true);
  // The register is cited only when it is actually there; a symlinked register is not provenance.
  assert.equal(listConcepts(root).trainingBoardRegister, null);
  assert.match(renderConcepts(listConcepts(root)), /provenance register is pending/);
  mkdirSync(join(root, 'docs/provenance/assets'), { recursive: true });
  writeFileSync(join(root, 'docs/provenance/assets/training-reference-boards.md'), '# register\n');
  assert.equal(listConcepts(root).trainingBoardRegister, 'docs/provenance/assets/training-reference-boards.md');
  const cited = renderConcepts(listConcepts(root));
  assert.match(cited, /Model and digests: <code>docs\/provenance\/assets\/training-reference-boards\.md<\/code>/);
  assert.doesNotMatch(cited, /has not landed in this checkout yet/);
  rmSync(join(root, 'docs/provenance/assets/training-reference-boards.md'));
  const notARegister = join(root, 'not-a-register.txt');
  writeFileSync(notARegister, 'nope');
  symlinkSync(notARegister, join(root, 'docs/provenance/assets/training-reference-boards.md'));
  assert.equal(listConcepts(root).trainingBoardRegister, null, 'a symlinked register is not a register');
  assert.equal(trainingBoard(root, 'tr-05'), null, 'a board the manifest never declared is not public');
  assert.equal(trainingBoard(root, 'tr-03'), null);
  assert.equal(trainingBoard(root, 'tr-99'), null);
  assert.equal(trainingBoard(root, '../private'), null);
  const html = renderConcepts(gallery);
  assert.match(html, /\/concepts\/references\/tr-01\.jpg" aria-label="Open the tr-01 designed reference board at full size"><img src="\/concepts\/references\/tr-01\.jpg"[^>]*width="1376" height="768"/);
  assert.doesNotMatch(html, /concepts\/references\/tr-05\.jpg/, 'an undeclared board cannot put a reference on the page');
  assert.match(html, /Designed board not generated yet\. Expected <code>docs\/design\/training\/tr-02\/reference\.jpg<\/code>/);
  assert.doesNotMatch(html, /Designed board not generated yet\. Expected <code>docs\/design\/training\/tr-01\/reference\.jpg<\/code>/);

  // A symlinked board directory or file is unavailable, and the route refuses it too.
  const outside = join(root, 'private.jpg');
  writeFileSync(outside, 'PRIVATE');
  rmSync(join(boards, 'tr-01/reference.jpg'));
  symlinkSync(outside, join(boards, 'tr-01/reference.jpg'));
  assert.equal(trainingBoard(root, 'tr-01'), null);
  const base = await serve(t, root);
  assert.equal((await fetch(`${base}/concepts/references/tr-01.jpg`)).status, 404);
  assert.equal(await (await fetch(`${base}/concepts/references/tr-01.jpg`)).text(), 'designed reference board unavailable');
  assert.equal(await (await fetch(`${base}/concepts/references/tr-05.jpg`)).text(), 'designed reference board unavailable');
  const escaped = join(root, 'escaped');
  mkdirSync(escaped, { recursive: true });
  writeFileSync(join(escaped, 'reference.jpg'), jpeg);
  rmSync(join(boards, 'tr-01'), { recursive: true });
  symlinkSync(escaped, join(boards, 'tr-01'));
  assert.equal(trainingBoard(root, 'tr-01'), null, 'a symlinked board directory is not the board directory');
});
