import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectFor } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATOR_DEFECT_TOKENS } from '../src/eval/defects.mjs';

const GENERATOR_SOURCE = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pilot', 'frameworks.mjs'),
  'utf8'
);

test('buildProjectFor validates defect names', () => {
  const archetype = { ...TRAINING_ARCHETYPES['booking'], id: 'test-arch' };
  
  // empty list is accepted
  assert.doesNotThrow(() => {
    buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });
  });

  // legitimate defect lists generate trees containing the seeded marker
  let result = null;
  assert.doesNotThrow(() => {
    result = buildProjectFor(archetype, { frameworkName: 'raw', defects: ['no-required', 'xss-innerhtml'] });
  });
  // xss-innerhtml adds innerHTML
  assert.match(result.files['app/enhance.js'], /innerHTML/);

  // unknown name throws
  assert.throws(() => {
    buildProjectFor(archetype, { frameworkName: 'raw', defects: ['made-up-defect'] });
  }, /unknown defect tokens \[made-up-defect\]/);

  // misspelled name throws
  assert.throws(() => {
    buildProjectFor(archetype, { frameworkName: 'raw', defects: ['xss-innerhtmlx'] });
  }, /unknown defect tokens \[xss-innerhtmlx\]/);
});

// The canonical set and the generator can drift apart: someone adds a
// defects.includes('new-thing') branch and forgets the map, and buildProjectFor then REJECTS a name the
// generator implements. Sourcing the set from the map and asserting it equals the tokens the generator
// actually tests for closes that in both directions - a token implemented but missing from the set fails
// here, and so does a set entry nothing tests for. Byte-invariance checks cannot catch this: an
// unexercised token such as enter-submits can vanish from the set with check:specs still green.
test('the canonical defect set is exactly the set the generator tests for', () => {
  const tested = new Set(
    [...GENERATOR_SOURCE.matchAll(/defects\.includes\(\s*['\"`]([A-Za-z0-9_-]+)['\"`]\s*\)/g)].map((m) => m[1])
  );
  assert.ok(
    tested.size >= 10,
    `derived only ${tested.size} defect token(s) from the generator, so the scan is probably broken rather than the set`
  );
  assert.deepEqual(
    [...tested].sort(),
    [...GENERATOR_DEFECT_TOKENS].sort(),
    'GENERATOR_DEFECT_TOKENS and the tokens pilot/frameworks.mjs actually tests for have diverged'
  );
});

test('every canonical defect token is accepted by buildProjectFor', () => {
  const archetype = { ...TRAINING_ARCHETYPES['booking'], id: 'test-arch-accept' };
  for (const token of GENERATOR_DEFECT_TOKENS) {
    assert.doesNotThrow(
      () => buildProjectFor(archetype, { frameworkName: 'raw', defects: [token] }),
      `canonical defect token '${token}' was accepted by the set but rejected by the generator`
    );
  }
});
