import test from 'node:test';
import assert from 'node:assert/strict';

import { ARCHETYPES } from '../pilot/archetypes.mjs';
import { FRAMEWORKS, buildProjectFor } from '../pilot/frameworks.mjs';

// The reflected-title XSS documented in docs/KNOWN-SINKS.md section 2, fixed by bead mwg-train-kipj.
//
// History, because the file changed sides: this suite was written by mwg-train-sia to PIN the debt - it derived which
// arms still interpolated title unescaped and failed if that set differed from a recorded list of 30 in either
// direction, so the re-record bill could not go out of date quietly. mwg-train-kipj paid the bill: every non-Hono page
// module now emits an inline escapeTitle helper and every title interpolation goes through it, and the frozen corpus
// was re-recorded in the same change.
//
// So the exception list is empty and the assertions are inverted: no arm may interpolate title unescaped, and the
// derived offender set must stay empty. Hono is still excluded by name rather than by text, for the reason below.

// Derived rather than restated. Empty is the fixed state; a non-empty list is a regression, not a bill to pay.
const KNOWN_UNESCAPED_TITLE_ARMS = new Set([]);

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

// The defect's exact shape: an unescaped title interpolation into the title element. An escaped fix reads
// ${escapeTitle(title)} and therefore does not contain the bare form.
function interpolatesTitleUnescaped(source) {
  const titleLine = source.split('\n').find((line) => line.includes('<title>'));
  if (!titleLine) return false;
  return /\$\{title\}/.test(titleLine) && !/escape|esc\(|encode/i.test(titleLine);
}

test('no non-Hono renderDocument interpolates title unescaped', () => {
  const offenders = [];
  for (const archetype of Object.values(ARCHETYPES)) {
    for (const frameworkName of Object.keys(FRAMEWORKS)) {
      if (ESCAPES_AT_RUNTIME.has(frameworkName)) continue;
      if (interpolatesTitleUnescaped(emittedFor(archetype, frameworkName))) {
        offenders.push(`${archetype.id}-${frameworkName}`);
      }
    }
  }

  // Both directions, which is the point of deriving rather than restating: a regression must appear here, and a fix
  // must empty the documented list rather than leaving it stale.
  const unlisted = offenders.filter((arm) => !KNOWN_UNESCAPED_TITLE_ARMS.has(arm));
  const stale = [...KNOWN_UNESCAPED_TITLE_ARMS].filter((arm) => !offenders.includes(arm));

  assert.deepEqual(unlisted, [], `these arms interpolate title unescaped but are not in the exception list: ${unlisted.join(', ')}`);
  assert.deepEqual(stale, [], `these arms are listed as unescaped but no longer are - remove them: ${stale.join(', ')}`);

  // The scan must reach something: every non-Hono arm emits a page module with a title line, so a detector that
  // suddenly found no title lines at all would otherwise pass by finding nothing.
  for (const archetype of Object.values(ARCHETYPES)) {
    for (const frameworkName of Object.keys(FRAMEWORKS)) {
      if (ESCAPES_AT_RUNTIME.has(frameworkName)) continue;
      const page = emittedFor(archetype, frameworkName);
      assert.match(page, /<title>/, `${archetype.id}-${frameworkName}: no title line for the scan to judge`);
    }
  }
});

test('hono is safe at runtime and must never be added to the exception list', () => {
  const emitted = emittedFor(ARCHETYPES.catalogue, 'hono');
  // Its source looks identical - that is exactly why this assertion exists.
  assert.match(emitted.split('\n').find((line) => line.includes('<title>')) ?? '', /\$\{title\}/);
  // The tag is on the line above the title, which is what makes this arm safe: assert it is really there, so an
  // edit that moved the title out of the tagged template would be caught rather than assumed.
  assert.match(emitted, /return html`<\!doctype html>[\s\S]{0,400}?<title>\$\{title\}<\/title>/, 'the hono title must sit inside the tagged template');
  assert.ok(!KNOWN_UNESCAPED_TITLE_ARMS.has('catalogue-hono'),
    'hono escapes through the tagged html template; listing it would misreport a safe arm as vulnerable');
});

function serverFor(archetype, frameworkName) {
  const { files } = buildProjectFor(archetype, { frameworkName, defects: [], flags: {} });
  return String(files['server.mjs'] ?? '');
}

test('the /search handler that reflects the query exists in every arm, which is why the radius was 30 and not 6', () => {
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
