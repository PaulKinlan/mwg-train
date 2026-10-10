import test from 'node:test';
import assert from 'node:assert/strict';

import { ARCHETYPES } from '../pilot/archetypes.mjs';
import { FRAMEWORKS, buildProjectFor } from '../pilot/frameworks.mjs';

// The reflected-title XSS documented in docs/KNOWN-SINKS.md section 2: every non-Hono renderDocument interpolates title
// into <title>${title}</title> with a plain template literal, and the generated /search handler feeds it
// url.searchParams.get('q'). It is unfixed only because fixing it rewrites 30 of the 35 frozen trees in
// pilot/CORPUS.json, and re-recording needs a browser pipeline run a lane cannot perform (see the bead for the bill).
//
// So this test does not pretend the corpus is fixed. It pins the debt: it derives, from the generator itself, exactly
// which arms still interpolate title unescaped, and fails if that set differs from the exception list below in either
// direction. Adding a board, changing an archetype, or fixing one arm without removing it here all fail.

// Derived rather than restated, but written out so a failure reads as a name rather than an index. Six non-Hono
// frameworks x five archetypes. Hono is absent on purpose - see the note in the loop.
const KNOWN_UNESCAPED_TITLE_ARMS = new Set([
  'account-recovery-preact', 'account-recovery-raw', 'account-recovery-react', 'account-recovery-svelte',
  'account-recovery-vue', 'account-recovery-webcomponents',
  'booking-preact', 'booking-raw', 'booking-react', 'booking-svelte', 'booking-vue', 'booking-webcomponents',
  'catalogue-preact', 'catalogue-raw', 'catalogue-react', 'catalogue-svelte', 'catalogue-vue', 'catalogue-webcomponents',
  'contact-lead-preact', 'contact-lead-raw', 'contact-lead-react', 'contact-lead-svelte', 'contact-lead-vue', 'contact-lead-webcomponents',
  'event-registration-preact', 'event-registration-raw', 'event-registration-react', 'event-registration-svelte',
  'event-registration-vue', 'event-registration-webcomponents',
]);

// Hono is excluded by NAME and not by text. Its emitted page module contains the same literal
// <title>${title}</title>, because the interpolation happens inside hono/html's tagged template, which escapes at
// runtime. A test that matched on the source text would either flag Hono as broken or, if written loosely, pass
// everything - so the framework identity is the only sound discriminator here.
const ESCAPES_AT_RUNTIME = new Set(['hono']);

// The page module is the only file that carries renderDocument's <title>, for every arm including svelte, whose
// markup lives in app/page.svelte and whose renderDocument is emitted into app/page.mjs by sveltePageModule.
//
// This used to join every emitted file and take the first line containing <title>, which found the 404 handler in
// server.mjs - a static '<title>Not found</title>' - instead of the template under test, so the detector reported zero
// offenders and the suite failed with every arm wrongly listed as fixed. That is the same first-match defect that
// mwg-train-vre was about: a scan is only as strong as the thing it actually reaches.
function emittedFor(archetype, frameworkName) {
  const { files } = buildProjectFor(archetype, { frameworkName, defects: [], flags: {} });
  const pageModule = files['app/page.mjs'];
  return pageModule ? String(pageModule) : '';
}

// The defect's exact shape: an unescaped title interpolation into the title element. An escaped fix would read
// ${escapeTitle(title)} or similar and therefore would not contain the bare form.
function interpolatesTitleUnescaped(source) {
  const titleLine = source.split('\n').find((line) => line.includes('<title>'));
  if (!titleLine) return false;
  return /\$\{title\}/.test(titleLine) && !/escape|esc\(|encode/i.test(titleLine);
}

test('every non-Hono renderDocument still interpolates title unescaped, and the exception list is exactly right', () => {
  const offenders = [];
  for (const archetype of Object.values(ARCHETYPES)) {
    for (const frameworkName of Object.keys(FRAMEWORKS)) {
      if (ESCAPES_AT_RUNTIME.has(frameworkName)) continue;
      if (interpolatesTitleUnescaped(emittedFor(archetype, frameworkName))) {
        offenders.push(`${archetype.id}-${frameworkName}`);
      }
    }
  }

  // Staleness in both directions, which is the point of the list. An arm that has been fixed must come off it, and an
  // arm that regresses must go on it - so this fails loudly rather than letting the debt drift out of date.
  const unlisted = offenders.filter((arm) => !KNOWN_UNESCAPED_TITLE_ARMS.has(arm));
  const stale = [...KNOWN_UNESCAPED_TITLE_ARMS].filter((arm) => !offenders.includes(arm));

  assert.deepEqual(unlisted, [], `these arms interpolate title unescaped but are not in the exception list: ${unlisted.join(', ')}`);
  assert.deepEqual(stale, [], `these arms are listed as unescaped but no longer are - remove them, and the re-record bill shrank: ${stale.join(', ')}`);

  // And the floor, so this cannot pass by finding nothing: the defect this file documents must still be present.
  assert.ok(offenders.length >= KNOWN_UNESCAPED_TITLE_ARMS.size,
    'the scan found fewer unescaped arms than the known bill, which means the scan itself broke');
});

test('hono is safe at runtime and must never be added to the exception list', () => {
  const emitted = emittedFor(ARCHETYPES.catalogue, 'hono');
  // Its source looks identical - that is exactly why this assertion exists.
  assert.match(emitted.split('\n').find((line) => line.includes('<title>')) ?? '', /\$\{title\}/);
  assert.ok(!KNOWN_UNESCAPED_TITLE_ARMS.has('catalogue-hono'),
    'hono escapes through the tagged html template; listing it would misreport a safe arm as vulnerable');
});

function serverFor(archetype, frameworkName) {
  const { files } = buildProjectFor(archetype, { frameworkName, defects: [], flags: {} });
  return String(files['server.mjs'] ?? '');
}

test('the /search handler that reflects the query exists in every arm, which is why the radius is 30 and not 6', () => {
  const offenders = [];
  for (const archetype of Object.values(ARCHETYPES)) {
    for (const frameworkName of Object.keys(FRAMEWORKS)) {
      const source = serverFor(archetype, frameworkName);
      if (!/Search: \$\{/.test(source) && !/Search: \$\{query\}/.test(source)) offenders.push(`${archetype.id}-${frameworkName}`);
    }
  }
  assert.deepEqual(offenders, [],
    `only catalogue declares a search journey, yet the generator emits a reflecting handler for every arm - these do not: ${offenders.join(', ')}`);
});

test('the detector itself bites: a synthetic escaped emitter is not flagged', () => {
  const escaped = 'return `<title>${escapeTitle(title)}</title>`;';
  const unescaped = 'return `<title>${title}</title>`;';
  assert.equal(interpolatesTitleUnescaped(unescaped), true);
  assert.equal(interpolatesTitleUnescaped(escaped), false,
    'a fixed emitter must not be reported as a defect, or the exception list can never legitimately shrink');
});
