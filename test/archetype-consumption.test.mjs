/**
 * The store has to be consumed, checkably, and it has to stay UNCONSUMED where the rights forbid it.
 *
 * Two properties matter here and they are different in kind. The first is presence, not identity: every
 * framework build for an archetype must carry the same recognisable set - the target's brand, its
 * accent, its font stack, its recorded imagery - so that a variant cannot invent its own palette or drop
 * an asset the target has, while still being free to differ in the details. Paul, 2026-10-11: "I'm ok if
 * there is some variance here and there". A test demanding identical bytes would fail correct work, so
 * this asserts membership and derivation instead.
 *
 * The second is that the store is not consumed for training at all. Every set in it is
 * excluded_from_training (the reference targets are conformance instruments), so the training corpus
 * must keep the plain palette it has always had, byte for byte, and its 210 recorded tree hashes must
 * not move.
 */
import assert from 'node:assert/strict';
import { startArmServer } from './helpers/arm-server.mjs';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { ARCHETYPES, ARCHETYPE_IDS } from '../pilot/archetypes.mjs';
import { FRAMEWORKS, buildProjectFor, writeProject } from '../pilot/frameworks.mjs';
import { buildProject } from '../pilot/projects.mjs';

const ROOT = resolve(import.meta.dirname, '..');
import {
  ArchetypeAssetError,
  assertConsumable,
  derivePalette,
  hasArchetypeSet,
  loadArchetypeSet,
  renderTokenDeclarations,
} from '../src/design/archetype-assets.mjs';

const EVERY_ARM = Object.keys(FRAMEWORKS);

test('every pilot archetype has a loadable set, and the brand states are the ones the store records', () => {
  const states = {};
  for (const id of ARCHETYPE_IDS) {
    assert.ok(hasArchetypeSet(id), `${id}: the pilot archetype has no set in the store`);
    const set = loadArchetypeSet(id);
    assert.equal(set.archetype, id);
    assert.ok(Object.keys(set.tokens.colors).length > 0, `${id}: no colours`);
    assert.ok(set.images.length > 0, `${id}: no imagery in the register`);
    assert.equal(set.rights.excluded_from_training, true, `${id}: a reference target must be excluded from training`);
    states[id] = set.brand.state;
  }
  // Named where the target names itself, brandless where it does not: account-recovery's accepted target
  // has no brand, and inventing one for it would be the opposite of drawing from the set.
  assert.equal(states['account-recovery'], 'brandless');
  assert.deepEqual(
    Object.entries(states).filter(([, state]) => state === 'named').map(([id]) => id).sort(),
    ['booking', 'catalogue', 'contact-lead', 'event-registration'],
  );
});

test('the palette the arm works in is derived from the store, token name and all', () => {
  // No role may be missing for any archetype: a missing role is what makes the arm fall back to the
  // pilot palette, and the fallback is invisible in the output - it looks like a plausible palette.
  for (const id of ARCHETYPE_IDS) {
    const set = loadArchetypeSet(id);
    const missing = Object.entries(derivePalette(set)).filter(([, hit]) => hit === null).map(([role]) => role);
    assert.deepEqual(missing, [], `${id}: the store declares no token for ${missing.join(', ')}, so the arm would silently use the pilot palette`);
    // And what is emitted from it has to be valid CSS: two targets record their font stack under the
    // extractor's ':root' key, and `:root: system-ui` is not a declaration anyone can use.
    const block = renderTokenDeclarations(set);
    assert.ok(block.includes('--font-sans: '), `${id}: the emitted token block has no usable font stack`);
    assert.ok(!/:root\s*:/.test(block), `${id}: the emitted token block contains a selector-shaped declaration`);
  }
  const booking = loadArchetypeSet('booking');
  const contactLead = loadArchetypeSet('contact-lead');
  // Two targets, two vocabularies: booking calls its accent --accent, contact-lead calls it --action. The
  // arm has to follow the token the set actually declares rather than a hardcoded name that happens to be
  // present in one of them - a fallback chain would have silently used the pilot blue for the other.
  assert.equal(derivePalette(booking).accent.name, '--accent');
  assert.equal(derivePalette(contactLead).accent.name, '--action');
  for (const set of [booking, contactLead]) {
    assert.equal(derivePalette(set).fg.name, '--text-primary', `${set.archetype}: fg is not the target's text colour`);
    assert.equal(derivePalette(set).fontStack.name, '--font-sans', `${set.archetype}: the font stack is not the target's`);
  }
});

test('every framework build carries the archetype set: brand, tokens, font, imagery register', () => {
  for (const id of ARCHETYPE_IDS) {
    const set = loadArchetypeSet(id);
    const brand = set.brand;
    const expected = { fg: derivePalette(set).fg.name, bg: derivePalette(set).bg.name, accent: derivePalette(set).accent.name };
    const seen = new Set();
    for (const frameworkName of EVERY_ARM) {
      const built = buildProject({ archetypeId: id, frameworkName });
      const css = built.files[FRAMEWORKS[frameworkName].stylesFile];
      const page = built.files[FRAMEWORKS[frameworkName].markupFile];
      const where = `${id}-${frameworkName}`;

      // The store's own tokens are emitted verbatim, so the build carries the target's palette rather
      // than a paraphrase a later reader cannot trace back.
      for (const name of Object.keys(set.tokens.colors)) {
        assert.ok(css.includes(`${name}: `), `${where}: the stylesheet does not carry the target's ${name}`);
      }
      assert.ok(css.includes(renderTokenDeclarations(set).split('\n')[0].trim()), `${where}: the token block is not the store's`);
      // Each role points at the token the set declares, not at a literal the template chose.
      for (const [role, name] of Object.entries(expected)) {
        assert.ok(css.includes(`--arm-${role}: var(${name})`), `${where}: ${role} is not ${name}`);
      }
      assert.ok(css.includes('var(--font-sans)'), `${where}: the font stack is not the target's`);
      // The brand is the store's, or explicitly absent because the target is brandless.
      if (set.brand.state === 'brandless') {
        assert.ok(!page.includes('<header class="brand"'), `${where}: a brand was invented for a brandless target`);
      } else {
        // Escaped, because the page is HTML: catalogue's target is 'Kiln & Copper' and the page must carry
        // that name as markup, not as a bare ampersand.
        const escaped = set.brand.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        assert.ok(page.includes(escaped), `${where}: the page does not carry the target's brand name (${escaped})`);
        assert.ok(page.includes(`data-asset-store="assets/archetypes/${id}"`), `${where}: the brand does not say where it came from`);
      }
      // The board it shows is the one the register records, at the harness's own asset path.
      assert.ok(
        page.includes(`<img src="/app/${set.images[0].name}"`),
        `${where}: the page does not reference the archetype's first board (${set.images[0].name})`,
      );
      // And the build records what it was given: the register with digests, and the rights.
      assert.equal(built.spec.assets.archetype, id, `${where}: the spec does not record the set it was given`);
      assert.deepEqual(
        built.spec.assets.images.map((image) => [image.name, image.sha256]),
        set.images.map((image) => [image.name, image.sha256]),
        `${where}: the spec's image register is not the store's`,
      );
      assert.equal(built.spec.assets.rights.excluded_from_training, true, `${where}: the spec does not record the rights`);
      seen.add(JSON.stringify(built.spec.assets.images));
    }
    // The same recognisable set in every arm: if one arm's register differed, that arm was built against
    // a different store and nothing measured from the pair would be comparable.
    assert.equal(seen.size, 1, `${id}: the arms were not all given the same image register`);
  }
});

test('the harness serves the archetype boards from the store, and only while their bytes match the register', async () => {
  // A generated tree inside the repository, because the server finds the store by walking up from itself -
  // an absolute path baked into a generated file would put this machine into the tree hash. pilot/out is
  // ignored, so an interrupted run leaves nothing tracked behind.
  // existing is not a precondition: pilot/out is gitignored, so a CLEAN checkout does not have it and mkdtemp fails
  // with ENOENT. Creating it recursively is what makes this test pass in a fresh worktree, not only in one where a
  // previous pilot run happened to leave the directory behind (review finding mwg-train-d4a).
  mkdirSync(join(ROOT, 'pilot/out'), { recursive: true });
  const root = mkdtempSync(join(ROOT, 'pilot/out/o3t-assets-'));
  const set = loadArchetypeSet('booking');
  const board = set.images[0];
  const scripts = [];
  try {
    const built = buildProject({ archetypeId: 'booking', frameworkName: 'raw' });
    writeProject(root, { ...built, includeDependencies: false });
    const port = 4500 + Math.floor(Math.random() * 400);
    const server = startArmServer({ projectDir: root, port: port, stdio: 'ignore' });
    scripts.push(server);
    const url = (path) => `http://127.0.0.1:${port}${path}`;
    // Bounded readiness wait: the server is a child of this process, so there is nothing to poll that is not
    // also being started by this test.
    let mapped = false;
    for (let attempt = 0; attempt < 40 && !mapped; attempt += 1) {
      try {
        const probe = await fetch(url('/__health'));
        mapped = probe.ok;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(mapped, 'the generated server did not start');

    const response = await fetch(url(`/app/${board.name}`));
    assert.equal(response.status, 200, 'the harness did not serve the registered board');
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    // Provenance, so a reader (and this test) can tell a board of the target from a file the build wrote.
    assert.equal(response.headers.get('x-asset-source'), `assets/archetypes/booking/images`);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(body).digest('hex'), board.sha256, 'the served board is not the board the register records');

    // A name the register does not record is not served, and neither is a tree file the build never wrote.
    assert.equal((await fetch(url('/app/not-a-board.jpg'))).status, 404);
    assert.equal((await fetch(url('/app/styles.css'))).status, 200);

    // A malformed percent-escape must not take the process down. GET /app/%zz used to throw an unhandled URIError
    // out of decodeURIComponent inside the request handler and kill the server, so the assertion here is not only
    // "404" but "and it is still answering" (review finding mwg-train-dtc).
    assert.equal((await fetch(url('/app/%zz'))).status, 404, 'a malformed asset path must fail closed');
    // The other shape of the same defect, and the one coord's GLM review named: a percent-escape that is
    // syntactically valid but not a valid UTF-8 sequence. decodeURIComponent throws on this too, so it is the same
    // class of crash arriving by a different route and worth pinning separately.
    assert.equal((await fetch(url('/app/%E0%A4%A'))).status, 404, 'an invalid UTF-8 escape must fail closed too');
    assert.ok((await fetch(url('/__health'))).ok, 'the server died on a malformed asset path');
  } finally {
    for (const script of scripts) script.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});

test('a board whose bytes no longer match the register is not served, even though the store still has it', async () => {
  mkdirSync(join(ROOT, 'pilot/out'), { recursive: true }); // mwg-train-d4a: pilot/out is absent in a clean checkout
  const root = mkdtempSync(join(ROOT, 'pilot/out/o3t-tamper-'));
  const set = loadArchetypeSet('booking');
  const board = set.images[0];
  const scripts = [];
  try {
    const built = buildProject({ archetypeId: 'booking', frameworkName: 'raw' });
    writeProject(root, { ...built, includeDependencies: false });
    // The store itself is left alone: the digest the generated server holds is changed instead, which is
    // the same disagreement (bytes on disk vs digest expected) with no writes to a shared artefact.
    const serverPath = join(root, 'server.mjs');
    const source = readFileSync(serverPath, 'utf8');
    const tampered = source.replace(board.sha256, 'f'.repeat(64));
    assert.notEqual(tampered, source, 'the generated server does not carry the register digest to tamper with');
    writeFileSync(serverPath, tampered);

    const port = 4900 + Math.floor(Math.random() * 90);
    const server = startArmServer({ projectDir: root, port: port, stdio: 'ignore' });
    scripts.push(server);
    const url = (path) => `http://127.0.0.1:${port}${path}`;
    let mapped = false;
    for (let attempt = 0; attempt < 40 && !mapped; attempt += 1) {
      try {
        mapped = (await fetch(url('/__health'))).ok;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(mapped, 'the generated server did not start');
    assert.equal(
      (await fetch(url(`/app/${board.name}`))).status,
      404,
      'a board that no longer hashes to the recorded digest was served anyway',
    );
  } finally {
    for (const script of scripts) script.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});

test('a build with no set is unchanged, so the training corpus keeps its recorded trees', () => {
  const archetype = ARCHETYPES['booking'];
  for (const frameworkName of EVERY_ARM) {
    const built = buildProjectFor(archetype, { frameworkName });
    assert.ok(!('assets' in built.spec), `${frameworkName}: a build with no set gained an assets key`);
    const css = built.files[FRAMEWORKS[frameworkName].stylesFile];
    assert.ok(css.includes('--accent: #1b4fd8'), `${frameworkName}: the plain palette changed`);
    assert.ok(!css.includes('--bg-page'), `${frameworkName}: a build with no set consumed the store`);
    assert.ok(!built.files[FRAMEWORKS[frameworkName].markupFile].includes('<header class="brand"'), `${frameworkName}: a build with no set gained a brand`);
  }
});

test('the rights travel with the set: a training consumer is refused, a build is not', () => {
  const set = loadArchetypeSet('booking');
  assert.equal(assertConsumable(set, { purpose: 'build' }), set);
  assert.throws(() => assertConsumable(set, { purpose: 'training' }), /may not be consumed for training/);
  assert.throws(() => assertConsumable(set, { purpose: 'whatever' }), /unknown consumption purpose/);
  // And the builder checks it too, so a caller cannot consume a set by forgetting the rule.
  assert.throws(
    () => buildProjectFor(ARCHETYPES['booking'], { frameworkName: 'raw', set, purpose: 'training' }),
    /may not be consumed for training/,
  );
  // A set that is not the archetype's own is a mismatch, not a substitute.
  assert.throws(
    () => buildProjectFor(ARCHETYPES['catalogue'], { frameworkName: 'raw', set }),
    /the asset set is for 'booking' but the archetype is 'catalogue'/,
  );
});

test('the loader fails closed, and it fails on the state that matters rather than on a missing field', () => {
  const root = mkdtempSync(join(tmpdir(), 'archetype-assets-'));
  try {
    assert.throws(() => loadArchetypeSet('not-an-archetype!'), /is not an archetype id/);
    assert.throws(() => loadArchetypeSet('no-such-archetype'), /is missing at/);
    assert.throws(() => loadArchetypeSet('../../etc'), /is not an archetype id/);

    const imagePath = join(root, 'board.jpg');
    writeFileSync(imagePath, 'pretend jpeg bytes');
    const digest = createHash('sha256').update('pretend jpeg bytes').digest('hex');
    const dir = join(root, 'assets', 'archetypes', 'fixture');
    mkdirSync(dir, { recursive: true });
    const set = {
      archetype: 'fixture',
      brand: { site_name: 'Fixture Co', brandless: false },
      tokens: { colors: { '--text-primary': '#111' }, fonts: { '--font-sans': 'system-ui' } },
      copy: { 'index.html': { title: 'Fixture', strings: ['hello'] } },
      images: [{ name: 'board.jpg', sha256: digest, bytes: 18, source: 'board.jpg' }],
      rights: { excluded_from_training: true, approved_for_training: false },
    };
    writeFileSync(join(dir, 'set.json'), JSON.stringify(set));
    assert.equal(loadArchetypeSet('fixture', { root }).brand.name, 'Fixture Co');

    // A board whose bytes no longer match the register is a failure, not a warning: the register is the
    // only thing that makes "this build used the target's imagery" checkable.
    writeFileSync(imagePath, 'different bytes');
    assert.throws(() => loadArchetypeSet('fixture', { root }), /but the register says/);

    // A contradiction between the two brand records is also a failure: a build cannot tell which to use.
    set.brand = { site_name: 'Fixture Co', brandless: true };
    writeFileSync(join(dir, 'set.json'), JSON.stringify(set));
    assert.throws(() => loadArchetypeSet('fixture', { root }), /marked brandless and still names a brand/);

    // Rights are not optional: a set with none cannot be checked against anything.
    set.brand = { site_name: 'Fixture Co', brandless: false };
    writeFileSync(imagePath, 'pretend jpeg bytes');
    delete set.rights;
    writeFileSync(join(dir, 'set.json'), JSON.stringify(set));
    assert.throws(() => loadArchetypeSet('fixture', { root }), /has no rights record/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.ok(ArchetypeAssetError.prototype instanceof Error);
});
