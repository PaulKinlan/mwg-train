import { buildProjectFor } from './pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from './pilot/training-archetypes.mjs';

const tr01 = TRAINING_ARCHETYPES['booking'];
const archetype = {
  ...tr01,
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/book', kind: 'write', redirect: () => '/bookings/${ref}' },
    { method: 'GET', path: '/bookings/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/services', kind: 'list' },
  ],
  journey: {
    startPath: '/',
    formSelector: 'form#booking-form',
    fill: {},
    expectText: 'X'
  }
};

const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });
const lines = built.files['server.mjs'].split('\n');
lines.forEach((line, i) => {
  if (line.includes('title: \'Your submission\'')) {
    console.log(`Line ${i}: "${line}"`);
  }
});
