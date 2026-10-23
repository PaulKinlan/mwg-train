/**
 * The archetype asset sets: one shared set per archetype, extracted from that archetype's accepted target.
 *
 * The property under test is not "two files are identical". Paul was explicit that variance is acceptable,
 * because a test demanding byte-equality would fail correct work. What must hold is that the same
 * RECOGNISABLE set is present for every framework build of an archetype - the brand, the palette, the
 * typography, the copy and the imagery the target has - so that a build cannot invent its own and a model
 * asked to build the archetype is given what it needs to render the intended UI.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  REGISTER_PATH,
  STORE_DIR,
  archetypeIds,
  assertWritable,
  buildAll,
  copyTexts,
  extractTokens,
  inspectCommitted,
  renderRegister,
  renderStoreReadme,
  setDocument,
  setProblems,
  sha256,
  writeSets,
} from '../scripts/build-archetype-assets.mjs';
import {
  assetManifest,
  brandFor,
  loadArchetypeSet,
} from '../src/design/archetype-assets.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A throwaway repository root holding one fabricated accepted target. */
function withTarget({ readme, indexHtml, css = '' }, body) {
  const root = mkdtempSync(join(tmpdir(), 'archetype-assets-'));
  const dir = join(root, 'docs/design/archetypes/booking');
  mkdirSync(join(dir, 'demo'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), readme);
  writeFileSync(join(dir, 'demo/index.html'), indexHtml);
  writeFileSync(join(dir, 'demo/styles.css'), css);
  writeFileSync(join(dir, 'step1-browse.jpg'), 'not-really-a-jpeg');
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const RIGHTS_README = '`excluded_from_training: true`, `approved_for_training: false`.\n';
const PALETTE = ':root {\n  --accent: #10b981;\n  --font-sans: system-ui, sans-serif;\n}\n';

/** A throwaway root holding one complete, internally consistent store built from a real set document. */
function withSyntheticStore(document, body) {
  const root = mkdtempSync(join(tmpdir(), 'archetype-store-'));
  const dir = join(root, 'assets/archetypes/booking');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'set.json'), JSON.stringify(document));
  writeFileSync(join(dir, 'images/step1-browse.jpg'), 'board');
  writeFileSync(join(dir, 'README.md'), 'store page');
  const target = join(root, 'docs/design/archetypes/booking');
  mkdirSync(join(target, 'demo'), { recursive: true });
  writeFileSync(join(target, 'README.md'), `# Visual reference: Booking (${document.brand.site_name})\n\n${RIGHTS_README}`);
  writeFileSync(join(target, 'demo/index.html'), `<a class="brand"><span>${document.brand.site_name}</span></a><p>Book a class.</p>`);
  writeFileSync(join(target, 'demo/styles.css'), PALETTE);
  writeFileSync(join(target, 'step1-browse.jpg'), 'board');
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('every archetype has a committed set, and every set is complete', () => {
  const documents = buildAll(repoRoot);
  assert.equal(documents.length, archetypeIds(repoRoot).length, 'a set per archetype');
  for (const set of documents) {
    assert.deepEqual(setProblems(set), [], `${set.archetype}: the set is incomplete`);
  }
});

test('each set is an extraction of its accepted target, with the target own bytes', () => {
  for (const set of buildAll(repoRoot)) {
    const document = setDocument(set);
    const committed = JSON.parse(readFileSync(join(repoRoot, STORE_DIR, set.archetype, 'set.json'), 'utf8'));
    assert.deepEqual(committed.brand, document.brand, `${set.archetype}: committed brand`);
    assert.deepEqual(committed.tokens, document.tokens, `${set.archetype}: committed palette/typography`);
    assert.deepEqual(committed.copy, document.copy, `${set.archetype}: committed copy`);
    assert.deepEqual(committed.rights, document.rights, `${set.archetype}: committed rights`);
    assert.ok(document.rights.excluded_from_training === true, `${set.archetype}: rights are inherited, not assumed`);
    assert.ok(set.images.length > 0, `${set.archetype}: the set has the target's imagery`);
    for (const image of document.images) {
      const stored = readFileSync(join(repoRoot, STORE_DIR, set.archetype, 'images', image.name));
      const source = readFileSync(join(repoRoot, set.extracted_from.target_dir, image.name));
      assert.equal(stored.length, source.length, `${set.archetype}/${image.name}: stored copy differs in length from the target board`);
      assert.ok(stored.equals(source), `${set.archetype}/${image.name}: stored copy is not the accepted target's own bytes`);
    }
  }
});

test('the register describes the committed sets rather than a remembered version of them', () => {
  const { findings, documents } = inspectCommitted(repoRoot);
  assert.deepEqual(findings, []);
  assert.equal(readFileSync(join(repoRoot, REGISTER_PATH), 'utf8'), renderRegister(documents));
});

test('the extraction is deterministic: two runs produce the same set document', () => {
  // The pilot was once measured from a stale directory and reported as an unsatisfiable corpus. An asset
  // set has the same failure mode: a store that changes between the check and the build is not a set.
  const first = buildAll(repoRoot).map(setDocument);
  const second = buildAll(repoRoot).map(setDocument);
  assert.deepEqual(first, second);
});

test('a brand the target states twice is a recorded conflict, not a silent pick', () => {
  withTarget(
    { readme: `# Visual reference: Booking (Evening Class Studio)\n\n${RIGHTS_README}`, indexHtml: '<a class="brand"><span>Learning Hub</span></a><p>Book a class.</p>', css: PALETTE },
    (root) => {
      const set = buildAll(root, ['booking'])[0];
      assert.deepEqual(set.brand.strong.sort(), ['Evening Class Studio', 'Learning Hub']);
      assert.equal(setProblems(set).filter((problem) => problem.includes('has not been adjudicated')).length, 1);
      assert.deepEqual(inspectCommitted(root, ['booking']).findings.filter((finding) => finding.includes('adjudicated')).length >= 1, true);
    },
  );
});

test('an adjudicated conflict resolves, and every way it can go stale is a finding', () => {
  withTarget(
    {
      readme: `# Visual reference: Booking (Evening Class Studio)\n\n${RIGHTS_README}`,
      indexHtml: '<a class="brand"><span>Learning Hub</span></a><p>Book a class.</p>',
      css: PALETTE,
    },
    (root) => {
      mkdirSync(join(root, STORE_DIR, 'booking'), { recursive: true });
      const decide = (entry) => writeFileSync(join(root, STORE_DIR, 'booking/decisions.json'), JSON.stringify({ brand: entry }));

      decide({ siteName: 'Evening Class Studio', because: 'the boards are the accepted artefact', decided_on: '2026-10-11' });
      const adjudicated = buildAll(root, ['booking'])[0];
      assert.deepEqual(setProblems(adjudicated), [], 'an adjudicated conflict is not a problem');
      assert.equal(setDocument(adjudicated).brand.site_name, 'Evening Class Studio');

      // A decision that names a value the target never states is not an adjudication, and it has to be a
      // finding rather than an assertion about a value quietly absent from the candidates.
      decide({ siteName: 'Neither Brand', because: 'x', decided_on: '2026-10-11' });
      const invalid = buildAll(root, ['booking'])[0];
      assert.equal(setProblems(invalid).filter((problem) => problem.includes('not one of the target')).length, 1, 'a decision naming an unstated brand is a finding');
      assert.equal(setDocument(invalid).brand.site_name, 'Neither Brand', 'and it is what the set would otherwise publish, which is why it must fail');

      // Stale: the target stops contradicting itself and settles on the brand the decision named, so
      // there is nothing left to adjudicate and the file should go.
      writeFileSync(join(root, 'docs/design/archetypes/booking/README.md'), `# Visual reference: Booking (Learning Hub)\n\n${RIGHTS_README}`);
      decide({ siteName: 'Learning Hub', because: 'x', decided_on: '2026-10-11' });
      const stale = buildAll(root, ['booking'])[0];
      assert.deepEqual(stale.brand.strong, ['Learning Hub'], 'the target now states one brand');
      assert.equal(setProblems(stale).filter((problem) => problem.includes('no longer exists')).length, 1, 'a stale decision is a finding');

      // The target settles on a brand the decision does not name, while the decided name survives only as
      // a weak candidate - the case that silently published the wrong brand before.
      decide({ siteName: 'Evening Class Studio', because: 'x', decided_on: '2026-10-11' });
      writeFileSync(
        join(root, 'docs/design/archetypes/booking/demo/index.html'),
        '<a class="brand"><span>Learning Hub</span></a><h1>Evening Class Studio</h1><p>Book a class.</p>',
      );
      const contradicting = buildAll(root, ['booking'])[0];
      assert.deepEqual(contradicting.brand.strong, ['Learning Hub']);
      assert.ok(contradicting.brand.distinct.includes('Evening Class Studio'), 'it survives as a weak candidate, which is how this hid before');
      assert.equal(setProblems(contradicting).filter((problem) => problem.includes('contradicts it')).length, 1, 'a decision contradicting the target single brand is a finding');
    },
  );
});

test('a brand the target keeps beside its primary one is a declared variant, not an unresolved conflict', () => {
  withTarget(
    {
      readme: `# Visual reference: Booking (Evening Class Studio)\n\n${RIGHTS_README}`,
      indexHtml: '<title>Booking Confirmation &amp; Receipt — Learning Hub</title><a class="brand"><span>Learning Hub</span></a><p>Book a class.</p>',
      css: PALETTE,
    },
    (root) => {
      mkdirSync(join(root, STORE_DIR, 'booking'), { recursive: true });
      const decide = (entry) => writeFileSync(join(root, STORE_DIR, 'booking/decisions.json'), JSON.stringify({ brand: entry }));

      // Before the decision the two strong candidates are an unadjudicated conflict - and the copy title that
      // states the second brand is a finding too, because the set would publish a brand its copy contradicts.
      const unresolved = buildAll(root, ['booking'])[0];
      assert.equal(setProblems(unresolved).filter((problem) => problem.includes('has not been adjudicated')).length, 1);
      assert.equal(setProblems(unresolved).filter((problem) => problem.includes('neither the set\'s brand nor a supported variant')).length, 1);

      // The owner keeps both brands. The variant is declared, carried into the set and rendered as supported,
      // rather than being resolved into a primary and a silent deletion of the second name.
      decide({ siteName: 'Evening Class Studio', variants: ['Learning Hub'], because: "owner: 'we probably need both'", decided_on: '2026-10-13' });
      const dual = buildAll(root, ['booking'])[0];
      assert.deepEqual(setProblems(dual), [], 'a declared variant is not a problem');
      const document = setDocument(dual);
      assert.equal(document.brand.site_name, 'Evening Class Studio');
      assert.deepEqual(document.brand.variants, ['Learning Hub'], 'the variant travels with the set');
      assert.equal(document.copy['index.html'].brand, 'Learning Hub', 'the copy slot records the brand its title states');
      const readme = renderStoreReadme(document, []);
      assert.match(readme, /supported variants of the same archetype/);
      assert.match(readme, /`Learning Hub` — the brand stated by `index.html`/);
      assert.doesNotMatch(readme, /do not agree, which is recorded rather than resolved/, 'a declared variant is not left looking unresolved');

      // A variant the target does not state is a claim about a product that no longer exists.
      decide({ siteName: 'Evening Class Studio', variants: ['Neither Brand'], because: 'x', decided_on: '2026-10-13' });
      const stale = buildAll(root, ['booking'])[0];
      assert.equal(setProblems(stale).filter((problem) => problem.includes('does not state; the decision is stale')).length, 1);

      // A name cannot be both the primary brand and its own variant.
      decide({ siteName: 'Evening Class Studio', variants: ['Evening Class Studio'], because: 'x', decided_on: '2026-10-13' });
      const sameBoth = buildAll(root, ['booking'])[0];
      assert.equal(setProblems(sameBoth).filter((problem) => problem.includes('as both the site name and a supported variant')).length, 1);

      // A brandless target has no primary brand for a variant to coexist with.
      decide({ brandless: true, variants: ['Learning Hub'], because: 'x', decided_on: '2026-10-13' });
      assert.throws(() => buildAll(root, ['booking']), /a brandless decision cannot also declare variants/);
    },
  );
});

test('a page title that states two brands is a finding, not a recorded absence of one', () => {
  // The set used to record a title naming both brands as "no brand stated", which is the one answer that
  // hides the contradiction: a build reading it cannot tell whether the page adopts neither brand or both.
  withTarget(
    {
      readme: `# Visual reference: Booking (Evening Class Studio)\n\n${RIGHTS_README}`,
      indexHtml: '<title>Booking Confirmation — Evening Class Studio · Learning Hub</title><a class="brand"><span>Learning Hub</span></a><p>Book a class.</p>',
      css: PALETTE,
    },
    (root) => {
      mkdirSync(join(root, STORE_DIR, 'booking'), { recursive: true });
      writeFileSync(
        join(root, STORE_DIR, 'booking/decisions.json'),
        JSON.stringify({ brand: { siteName: 'Evening Class Studio', variants: ['Learning Hub'], because: "owner: 'we probably need both'", decided_on: '2026-10-13' } }),
      );
      const set = buildAll(root, ['booking'])[0];
      const slot = setDocument(set).copy['index.html'];
      assert.equal(slot.brand, null, 'a title stating two brands adopts neither');
      assert.deepEqual(slot.brands.sort(), ['Evening Class Studio', 'Learning Hub'], 'both are recorded, so the contradiction is visible in the set');
      assert.equal(setProblems(set).filter((problem) => problem.includes('states more than one brand')).length, 1, 'and it is a finding rather than null');
      // Fail closed at both ends: the gate reports it, and the builder refuses to write the set at all.
      assert.ok(inspectCommitted(root, ['booking']).findings.some((finding) => finding.includes('states more than one brand')), 'the gate reports the contradiction');
      assert.throws(() => writeSets(root, [set]), /refusing to write an incomplete set/);
    },
  );
});

test('a page title that names a brand the target does not state is a finding, not "no brand"', () => {
  withTarget(
    {
      readme: `# Visual reference: Booking (Evening Class Studio)\n\n${RIGHTS_README}`,
      indexHtml: '<title>Booking Confirmation — Northwind Studio</title><a class="brand"><span>Evening Class Studio</span></a><p>Book a class.</p>',
      css: PALETTE,
    },
    (root) => {
      const set = buildAll(root, ['booking'])[0];
      assert.deepEqual(setDocument(set).copy['index.html'].brands, [], 'the title states none of the target own names');
      assert.equal(setProblems(set).filter((problem) => problem.includes('Northwind Studio') && problem.includes('brand position')).length, 1, 'a name in the brand position is not silently read as no brand');

      // The same position naming the brand the target does state is not a finding, and is recorded.
      writeFileSync(
        join(root, 'docs/design/archetypes/booking/demo/index.html'),
        '<title>Booking Confirmation — Evening Class Studio</title><a class="brand"><span>Evening Class Studio</span></a><p>Book a class.</p>',
      );
      const adopted = buildAll(root, ['booking'])[0];
      assert.deepEqual(setProblems(adopted), []);
      assert.equal(setDocument(adopted).copy['index.html'].brand, 'Evening Class Studio');

      // A description in the brand position on the demo own comparison page is apparatus, not an unknown brand.
      writeFileSync(join(root, 'docs/design/archetypes/booking/demo/compare.html'), '<title>Visual Design Comparison — Booking Archetype</title><div class="comparison-grid"><p>Side by side.</p></div>');
      const withApparatus = buildAll(root, ['booking'])[0];
      assert.equal(setProblems(withApparatus).filter((problem) => problem.includes('brand position')).length, 0, 'the comparison page describes the artefact rather than naming a site');
    },
  );
});

test('a target that states no brand is a problem until the absence is adjudicated', () => {
  withTarget(
    { readme: `# Account recovery — illustrative references\n\n${RIGHTS_README}`, indexHtml: '<h1>Reset Your Password</h1><p>Enter the email for your account.</p>', css: PALETTE },
    (root) => {
      const set = buildAll(root, ['booking'])[0];
      assert.equal(set.brand.strong.length, 0, 'a page heading is not a brand statement');
      assert.equal(setProblems(set).filter((problem) => problem.includes('no brand outright')).length, 1);
      mkdirSync(join(root, STORE_DIR, 'booking'), { recursive: true });
      writeFileSync(
        join(root, STORE_DIR, 'booking/decisions.json'),
        JSON.stringify({ brand: { brandless: true, because: 'the target depicts an unbranded journey', decided_on: '2026-10-11' } }),
      );
      const brandless = buildAll(root, ['booking'])[0];
      assert.deepEqual(setProblems(brandless), []);
      assert.equal(setDocument(brandless).brand.site_name, null);
      assert.equal(setDocument(brandless).brand.brandless, true);
    },
  );
});

test('a target with no rights statement cannot produce a set', () => {
  withTarget({ readme: '# Booking (Evening Class Studio)\n', indexHtml: '<a class="brand"><span>Evening Class Studio</span></a><p>Book a class.</p>', css: PALETTE }, (root) => {
    const problems = setProblems(buildAll(root, ['booking'])[0]);
    assert.equal(problems.filter((problem) => problem.includes('no rights statement')).length, 1, 'the rights boundary is inherited or absent, never assumed');
  });
});

test('a palette declaration preceded by a comment is still read', () => {
  // This was a real defect: the `:root` pass kept the comment in the declaration name, so booking's main
  // font stack was dropped while its mono stack survived, and the set looked complete.
  const tokens = extractTokens('/* Typography */\n:root {\n  /* base */\n  --font-sans: system-ui, sans-serif;\n}\n', 'x.css');
  assert.equal(tokens.fonts['--font-sans'], 'system-ui, sans-serif');
});

test('a font stack declared on a selector is read, and `inherit` is not a token', () => {
  const tokens = extractTokens('body { font-family: system-ui, sans-serif; }\n.btn { font-family: inherit; }\n', 'x.css');
  assert.equal(tokens.fonts.body, 'system-ui, sans-serif');
  assert.equal(Object.values(tokens.fonts).includes('inherit'), false);
});

test('the demo own controls are not read as the archetype copy', () => {
  const html = `
    <div class="state-switcher"><span>Design States:</span><button>Boards Comparison</button></div>
    <div class="comparison-grid"><p>Visual Design Reference Comparison</p></div>
    <main><h1>Reset Your Password</h1><p>Enter the email associated with your account.</p></main>`;
  const texts = copyTexts(html).map((entry) => entry.text);
  assert.deepEqual(texts, ['Reset Your Password', 'Enter the email associated with your account.']);
});

test('the store can only ever be written inside assets/ and docs/', () => {
  const root = '/srv/repo';
  assert.doesNotThrow(() => assertWritable(root, join(root, 'assets/archetypes/booking/set.json')));
  assert.doesNotThrow(() => assertWritable(root, join(root, 'docs/provenance/assets/x.md')));
  for (const forbidden of ['data/A1_self_generated/targets/tr-01/target.png', '../outside/x', 'assets-evil/x', 'docs-evil/x']) {
    assert.throws(() => assertWritable(root, join(root, forbidden)), /refusing to write outside/, `${forbidden} must be refused`);
  }
  // An unresolved path is the bypass that matters: `<root>/assets/../data/x` begins with an allowed
  // prefix, so a guard that compares before it resolves waves it through.
  for (const traversal of ['assets/../data/A1_self_generated/x.png', 'docs/../../etc/x', 'assets/./../data/x']) {
    assert.throws(() => assertWritable(root, join(root, traversal)), /refusing to write outside/, `${traversal} must be refused`);
  }
});

test('a brand name split across spans is one name, and the mark is not part of it', () => {
  withTarget(
    {
      readme: `# Visual reference: Catalogue\n\n${RIGHTS_README}`,
      indexHtml: '<a class="brand"><span class="brand-mark">\u{1F3FA}</span><span>Kiln &amp;</span> <span>Copper</span></a><p>Browse the catalogue.</p>',
      css: PALETTE,
    },
    (root) => {
      const set = buildAll(root, ['booking'])[0];
      const strong = set.brand.candidates.filter((candidate) => candidate.strength === 'strong');
      assert.deepEqual(strong.map((candidate) => candidate.value), ['Kiln & Copper'], 'the whole name, not the last fragment');
      assert.deepEqual(setProblems(set), []);
    },
  );
});

test('two identical strings in sibling elements are two copy entries, not one', () => {
  // The dedupe exists for a text run split by inline markup; applied by tag alone it silently dropped a
  // repeated label, which is a real thing a page has.
  const texts = copyTexts('<ul><li>Pending</li><li>Pending</li></ul><p><strong>Book</strong> now</p>');
  assert.deepEqual(texts.filter((entry) => entry.text === 'Pending').length, 2, 'both list items are recorded');
  assert.deepEqual(texts.map((entry) => entry.text), ['Pending', 'Pending', 'Book', 'now']);
});

test('the committed store matches the accepted targets as they are today', () => {
  // The gate's own assertion, exercised here so a regression fails a unit test rather than only the
  // heavier check:all run a landing later.
  const { findings } = inspectCommitted(repoRoot);
  assert.deepEqual(findings, []);
});

test('a tampered digest, an unexpected file and an unreadable set are all findings', () => {
  const document = JSON.parse(readFileSync(join(repoRoot, STORE_DIR, 'booking/set.json'), 'utf8'));
  withSyntheticStore(document, (root) => {
    // Every other key is compared, `images` included: a digest in the record that no longer matches the
    // target is a lie about the bytes, even when the bytes themselves are still correct.
    const tampered = structuredClone(document);
    tampered.images[0].sha256 = 'deadbeef';
    writeFileSync(join(root, STORE_DIR, 'booking/set.json'), JSON.stringify(tampered));
    assert.equal(inspectCommitted(root, ['booking']).findings.filter((finding) => finding.includes('images disagrees')).length, 1);

    writeFileSync(join(root, STORE_DIR, 'booking/set.json'), JSON.stringify(document));
    writeFileSync(join(root, STORE_DIR, 'booking/stray.txt'), 'a claim that looks generated');
    assert.equal(inspectCommitted(root, ['booking']).findings.filter((finding) => finding.includes('unexpected file')).length, 1);
    rmSync(join(root, STORE_DIR, 'booking/stray.txt'));

    // Fail closed, not a stack trace: an unreadable record is the operator's finding to act on.
    writeFileSync(join(root, STORE_DIR, 'booking/set.json'), '{ not json');
    const findings = inspectCommitted(root, ['booking']).findings;
    assert.equal(findings.filter((finding) => finding.includes('cannot be read as JSON')).length, 1);
  });
});

test('cpSync of the store keeps the digest agreement the check relies on', () => {
  // The store is copied into a build, so the assertion is about the bytes surviving the copy. Asserting
  // the length alone would have passed for a re-encoded image, which is the failure this guards.
  const root = mkdtempSync(join(tmpdir(), 'archetype-copy-'));
  try {
    cpSync(join(repoRoot, STORE_DIR), join(root, STORE_DIR), { recursive: true });
    for (const name of ['booking/images/step1-browse.jpg', 'catalogue/images/step1-grid.jpg']) {
      const copied = readFileSync(join(root, STORE_DIR, name));
      const original = readFileSync(join(repoRoot, STORE_DIR, name));
      assert.equal(sha256(copied), sha256(original), `${name}: the copy is not the same bytes`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the set is not corpus: nothing in it claims to be a functional or training artefact', () => {
  const sets = buildAll(repoRoot).map(setDocument);
  for (const document of sets) {
    assert.deepEqual(Object.keys(document).sort(), ['archetype', 'brand', 'copy', 'extracted_from', 'images', 'rights', 'tokens']);
    assert.equal(document.rights.approved_for_training, false, `${document.archetype}: approved for training would be a different decision`);
  }
});

/**
 * A throwaway store holding one complete set, so the consumer's own rules can be exercised on a fixture.
 *
 * The board's digest is computed from the bytes written beside it, so a set the fixture writes is one the
 * loader accepts by default - each assertion below then changes exactly one record.
 */
function withConsumerStore(mutate, body) {
  const root = mkdtempSync(join(tmpdir(), 'archetype-consumer-'));
  const dir = join(root, STORE_DIR, 'fixture');
  const bytes = Buffer.from('board');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images/board.jpg'), bytes);
  const document = {
    archetype: 'fixture',
    brand: { site_name: 'Fixture Co', brandless: false, variants: [] },
    tokens: { colors: { '--text-primary': '#111111' }, fonts: { '--font-sans': 'system-ui, sans-serif' } },
    copy: { 'index.html': { title: 'Book a table — Fixture Co', brand: 'Fixture Co', brands: ['Fixture Co'], strings: ['Book a table'] } },
    images: [{ name: 'board.jpg', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, source: `${STORE_DIR}/fixture/images/board.jpg` }],
    rights: { excluded_from_training: true, approved_for_training: false },
  };
  const write = (next) => writeFileSync(join(dir, 'set.json'), JSON.stringify(next));
  write(mutate(document));
  try {
    return body({ root, document, write });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the consumer refuses the brand contradictions the builder refuses', () => {
  withConsumerStore((document) => document, ({ root, document, write }) => {
    assert.equal(loadArchetypeSet('fixture', { root }).copy[0].brand, 'Fixture Co', 'a copy slot naming the set brand loads, and is recorded');

    // The builder refuses a name declared as both the brand and its own variant; a set that has it is not
    // one the builder wrote, and a build consuming it could not tell the two records apart.
    write({ ...document, brand: { site_name: 'Fixture Co', brandless: false, variants: ['Fixture Co'] } });
    assert.throws(() => loadArchetypeSet('fixture', { root }), /as both its brand and a supported variant/);

    // A brandless set has no identity for a variant to coexist with.
    write({ ...document, brand: { site_name: null, brandless: true, variants: ['Alt Co'] } });
    assert.throws(() => loadArchetypeSet('fixture', { root }), /brandless and still lists the brand variant/);

    // A copy slot naming a second site is the builder's copy-slot finding, arriving at the consumer.
    write({ ...document, copy: { 'index.html': { title: 'Book a table — Other Co', brand: 'Other Co', brands: ['Other Co'], strings: ['Book a table'] } } });
    assert.throws(() => loadArchetypeSet('fixture', { root }), /neither the set's brand nor one of its variants/);

    // And so is a slot that states two brands, which no build can resolve.
    write({ ...document, copy: { 'index.html': { title: 'Fixture Co · Other Co', brand: null, brands: ['Fixture Co', 'Other Co'], strings: ['Book a table'] } } });
    assert.throws(() => loadArchetypeSet('fixture', { root }), /states more than one brand/);

    // A declared variant is a supported identity, so a page rendering it is not a contradiction.
    write({
      ...document,
      brand: { site_name: 'Fixture Co', brandless: false, variants: ['Alt Co'] },
      copy: { 'index.html': { title: 'Book a table — Alt Co', brand: 'Alt Co', brands: ['Alt Co'], strings: ['Book a table'] } },
    });
    assert.equal(loadArchetypeSet('fixture', { root }).copy[0].brand, 'Alt Co');
  });
});

test('a build can select and record a supported variant, and is refused one the set does not record', () => {
  const booking = loadArchetypeSet('booking');
  assert.deepEqual(booking.brand.variants, ['Learning Hub'], 'the store records the second identity the owner kept');

  const primary = brandFor(booking);
  assert.equal(primary.name, 'Evening Class Studio');
  assert.equal(primary.variant, null, 'a build that asks for nothing renders the primary brand');
  assert.deepEqual(primary.supported_variants, ['Learning Hub']);

  // The variant is selectable, and the choice travels: a spec says which identity its pages carry rather
  // than leaving a reader to infer it from the markup.
  const variant = brandFor(booking, { variant: 'Learning Hub' });
  assert.equal(variant.name, 'Learning Hub');
  assert.equal(variant.variant, 'Learning Hub');
  const manifest = assetManifest(booking, { variant: 'Learning Hub' });
  assert.equal(manifest.brand.name, 'Learning Hub');
  assert.equal(manifest.brand.variant, 'Learning Hub');
  assert.deepEqual(manifest.brand.supported_variants, ['Learning Hub']);
  // A build that renders the primary brand carries the spec it always had: the pilot corpus records the tree
  // hash of every arm, and a new key in every spec would move all of them for no change in what was built.
  assert.equal('variant' in assetManifest(booking).brand, false, 'a default build records no variant');
  assert.equal('variant' in assetManifest(booking, { variant: 'Evening Class Studio' }).brand, true, 'a build that chose the primary explicitly still says so');

  assert.throws(() => brandFor(booking, { variant: 'Neither Brand' }), /is not a brand variant/);
  assert.throws(() => brandFor(booking, { variant: '' }), /must be a name/);
  const brandless = loadArchetypeSet('account-recovery');
  assert.equal(brandFor(brandless).name, null);
  assert.throws(() => brandFor(brandless, { variant: 'Learning Hub' }), /brandless, so it has no/);
});
