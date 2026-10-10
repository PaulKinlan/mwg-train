// Regression tests for the two things docs/KNOWN-SINKS.md records: the seeded XSS defect is curriculum
// that must survive, and our own viewer escapes the query parameters it reads.
//
// The seeded-defect test is the unusual one. Everywhere else in this repository a test exists to prove a
// sink is absent; here one exists to prove a sink is PRESENT, because the corpus is a set of deliberately
// broken sites and deleting the breakage would delete the product. A future "secure the generator" change
// fails this test and has to read the doc, which is the intended outcome.
import test from 'node:test';
import assert from 'node:assert/strict';

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
    }
  }
});

test('the viewer escapes query parameters it reflects into the page', () => {
  // The viewer takes archetype/framework/state/rule and family/variant/framework straight from the URL,
  // so an unknown value is attacker-controlled text on a page the viewer renders. It is escaped through
  // option(), and this asserts that by payload rather than by reading the code.
  const payload = '<img src=x onerror=alert(1)>';
  const html = renderIndex({
    views: [],
    allViews: [],
    filters: { archetype: payload, framework: payload, state: payload, rule: payload },
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
