// Regression tests for the two things docs/KNOWN-SINKS.md records: the seeded XSS defect is curriculum
// that must survive, and our own viewer escapes the query parameters it reads.
//
// The seeded-defect test is the unusual one. Everywhere else in this repository a test exists to prove a
// sink is absent; here one exists to prove a sink is PRESENT, because the corpus is a set of deliberately
// broken sites and deleting the breakage would delete the product. A future "secure the generator" change
// fails this test and has to read the doc, which is the intended outcome.
import test from 'node:test';
import assert from 'node:assert/strict';

import { html } from 'hono/html';

import { buildProjectFor } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';
import { renderIndex } from '../src/viewer/pages.mjs';

/** Files whose generated source contains a sink. Nothing is excluded: the whole tree is searched. */
const filesWith = (files, needle) =>
  Object.entries(files)
    .filter(([, source]) => source.includes(needle))
    .map(([name]) => name);

// The insertion only exists where the archetype carries the echo client, so the fixtures are derived
// from that property rather than hardcoded - a hardcoded list would go stale the moment an archetype
// gained or lost its echo field.
const echoArchetypes = Object.entries(TRAINING_ARCHETYPES).filter(([, archetype]) => archetype.echo);

test('at least one archetype carries the echo client, so the tests below check something real', () => {
  assert.ok(
    echoArchetypes.length >= 1,
    'no training archetype declares an echo field, so the seeded-defect tests would pass by finding nothing to check',
  );
});

test('the seeded xss-innerhtml defect is still emitted, and the clean baseline is still clean', () => {
  for (const [id, archetype] of echoArchetypes) {
    for (const frameworkName of ['raw', 'react']) {
      const seeded = buildProjectFor(archetype, { frameworkName, defects: ['xss-innerhtml'], flags: {} });
      assert.ok(
        filesWith(seeded.files, 'container.innerHTML = value').length >= 1,
        `${id}/${frameworkName}: the xss-innerhtml defect arm no longer emits its sink, so the defect corpus has been sanitized away`,
      );

      const clean = buildProjectFor(archetype, { frameworkName, defects: [], flags: {} });
      assert.deepEqual(
        filesWith(clean.files, 'innerHTML'),
        [],
        `${id}/${frameworkName}: the CLEAN baseline contains innerHTML; the clean arm is supposed to use setHTML with a textContent fallback, and a defect that appears in the clean arm is not a seeded defect`,
      );
      assert.ok(
        filesWith(clean.files, 'setHTML').length >= 1,
        `${id}/${frameworkName}: the clean baseline no longer uses setHTML, so the safe path was replaced rather than kept`,
      );
      // The safe path is setHTML WITH a fallback, not setHTML alone: a browser without setHTML must
      // still get inert text. Asserting only the first half would let the fallback be deleted.
      assert.ok(
        filesWith(clean.files, 'else container.textContent = value').length >= 1,
        `${id}/${frameworkName}: the clean baseline lost its textContent fallback, so browsers without setHTML would get nothing`,
      );
    }
  }
});

test('the Hono arm is exempt because its tagged html template escapes interpolations', () => {
  // docs/KNOWN-SINKS.md exempts the Hono arm from the title finding, and says why: its renderDocument
  // returns a TAGGED html`...` template (pilot/frameworks.mjs:239, importing html from hono/html at
  // :229), and a tagged template escapes its interpolations. That is a claim about a dependency rather
  // than about our code, so it is tested against the real tag: if an upgrade ever stopped escaping, this
  // fails instead of the exemption quietly becoming false. A first version of the doc named the Hono
  // arm as a sink; this test is what keeps that from being re-asserted.
  const payload = '</title><script>alert(1)</script>';
  const rendered = String(html`<title>Search: ${payload}</title>`);
  assert.equal(rendered.includes('<script>'), false, 'hono/html must escape interpolations');
  assert.ok(rendered.includes('&lt;script&gt;'), 'the payload should appear, escaped, in the title');
});

test('the viewer escapes query parameters it reflects into the page', () => {
  // The viewer takes archetype/framework/state/rule and family/variant/framework straight from the URL,
  // so an unknown value is attacker-controlled text on a page the viewer renders. It is escaped through
  // option(), and this asserts that by payload rather than by reading the code.
  // Only `state` is asserted, because only `state` is actually REFLECTED. An earlier version of this
  // test passed payloads as archetype/framework/rule as well, which proved nothing: those are compared
  // with strict equality against the known values to set a `selected` flag, and never written to the
  // page. A filter whose value equals no known value is simply not rendered. Testing them looked like
  // extra coverage and was vacuous, which is the same mistake as a test that cannot fail.
  const payload = '<img src=x onerror=alert(1)>';
  const html = renderIndex({
    views: [],
    allViews: [],
    filters: { state: payload },
    runId: null,
    runs: [],
    yieldReport: null,
    scanAvailable: false,
    liveOrigin: 'http://127.0.0.1:1',
  });

  assert.equal(html.includes(payload), false, 'the raw payload must not survive into the page');
  assert.ok(
    html.includes('&lt;img src=x onerror=alert(1)&gt;'),
    'the payload should appear, escaped, in the unknown-state option',
  );

  // And the vacuous case above is asserted from the other side: an archetype filter whose value is not
  // a known archetype must not appear on the page at all. If that ever changes, this test says so
  // rather than silently becoming a real assertion.
  const sneaky = 'not-a-known-archetype-<b>';
  const withArchetypeFilter = renderIndex({
    views: [],
    allViews: [],
    filters: { archetype: sneaky },
    runId: null,
    runs: [],
    yieldReport: null,
    scanAvailable: false,
    liveOrigin: 'http://127.0.0.1:1',
  });
  assert.equal(withArchetypeFilter.includes(sneaky), false, 'an unknown archetype filter is not reflected');
});

test('a quote in a filter value cannot break out of the attribute it sits in', () => {
  // Escaping the angle brackets is not enough on its own: these values also land inside
  // value="..." attributes, so a quote is the cheaper escape. Checked separately for that reason.
  const payload = '" onmouseover="alert(1)';
  const html = renderIndex({
    views: [],
    allViews: [],
    filters: { state: payload },
    runId: null,
    runs: [],
    yieldReport: null,
    scanAvailable: false,
    liveOrigin: 'http://127.0.0.1:1',
  });

  assert.equal(html.includes(payload), false, 'the raw quote-and-handler payload must not survive');
  assert.ok(html.includes('&quot;'), 'the quote should have been escaped rather than passed through');
});
