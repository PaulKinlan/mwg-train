import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectFor } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';

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
