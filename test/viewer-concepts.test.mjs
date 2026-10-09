import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { conceptBookingStep, conceptImage, conceptJourneyStep, conceptTarget, listConcepts, renderConcepts } from '../src/viewer/concepts.mjs';
import { createViewer } from '../src/viewer/server.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function serve(t, repoRoot) {
  const stateDir = mkdtempSync(join(tmpdir(), 'viewer-concepts-state-'));
  const { server, liveServer, pool } = createViewer({ corpusRoot: join(ROOT, 'pilot'), stateDir, repoRoot });
  t.after(() => { pool.stopAll(); server.close(); liveServer.close(); rmSync(stateDir, { recursive: true, force: true }); });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${server.address().port}`;
}

test('gallery presents all three excluded boards, honest booking slot, and authored eval target', async (t) => {
  const gallery = listConcepts(ROOT);
  assert.deepEqual(gallery.boards.map((board) => board.id), ['layout-storefront', 'layout-saas', 'layout-explainer']);
  assert.deepEqual(gallery.archetypes, [
    { id: 'booking', reference: true, target: true, referencePath: '/concepts/images/booking/step1-browse.jpg' },
    { id: 'account-recovery', reference: true, target: true, referencePath: '/concepts/images/account-recovery/step1-request.jpg' },
    { id: 'catalogue', reference: true, target: true, referencePath: '/concepts/images/catalogue/step1-grid.jpg' },
    { id: 'contact-lead', reference: true, target: true, referencePath: '/concepts/images/contact-lead/step1-form.jpg' },
    { id: 'event-registration', reference: true, target: true, referencePath: '/concepts/images/event-registration/step1-event.jpg' },
  ]);
  assert.deepEqual(gallery.journeys.map(({ id, steps }) => [id, steps.length]), [
    ['booking', 5], ['catalogue', 3], ['contact-lead', 2], ['account-recovery', 2], ['event-registration', 2],
  ]);
  assert.ok(gallery.journeys.every((journey) => journey.steps.every((step) => step.available)), 'all 14 supplied boards exist');
  assert.deepEqual(gallery.bookingSteps.map(({ id, available }) => [id, available]), [
    ['step1-browse', true], ['step2-form', true], ['step3-confirmation', true],
    ['step4-error', true], ['step5-empty', true],
  ]);
  const html = renderConcepts(gallery);
  assert.match(html, /href="\/concepts">concepts<\/a>/);
  assert.match(html, /layout-storefront\.jpg" alt=/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /layout-saas\.jpg" alt=.*loading="lazy"/);
  assert.match(html, /Side-by-side visual reference only/);
  assert.match(html, /Booking journey · five visual steps/);
  assert.match(html, /Catalogue journey · three visual steps/);
  for (const family of ['contact-lead', 'account-recovery', 'event-registration']) {
    assert.match(html, new RegExp(`/concepts/images/${family}/step1-[a-z-]+\\.jpg`));
    assert.match(html, new RegExp(`docs/design/archetypes/${family}/README\\.md`));
  }
  assert.match(html, /unverified placeholders/);
  assert.equal((html.match(/\/concepts\/images\/booking\/step[1-5]-[a-z-]+\.jpg/g) ?? []).length, 12);
  assert.doesNotMatch(html, /Image pending:/);
  assert.match(html, /Authored target render/);
  assert.match(html, /not screenshots of generated websites/);
  assert.doesNotMatch(html, /<iframe/);
  const base = await serve(t, ROOT);
  const page = await fetch(`${base}/concepts`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Archetype references and targets/);
  for (const name of ['layout-storefront', 'layout-saas', 'layout-explainer']) {
    const response = await fetch(`${base}/concepts/images/${name}.jpg`);
    assert.equal(response.status, 200);
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
  assert.equal((await fetch(`${base}/concepts`, { method: 'POST' })).status, 404);
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
    assert.match(renderConcepts(gallery), /Side-by-side visual reference only/);
    assert.match(renderConcepts(gallery), /No authored target render for this archetype/);
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
