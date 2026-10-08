import { buildProjectFor } from './pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from './pilot/training-archetypes.mjs';

const tr01 = TRAINING_ARCHETYPES['booking'];
const archetype = {
  ...tr01,
  capabilities: { detail_page: true },
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/book', kind: 'write', redirect: () => '/bookings/${ref}' },
    { method: 'GET', path: '/bookings/:ref', kind: 'read-by-reference' }
  ],
  journey: {
    startPath: '/',
    formSelector: 'form#booking-form',
    fill: {},
    expectText: 'X',
    update: { field: 'customer', newValue: 'Jane' }
  }
};

const built = buildProjectFor(archetype, { frameworkName: 'raw', defects: [] });
const code = built.files['server.mjs'];
console.log('Includes detailPage(row)?', code.includes('detailPage(row)'));
console.log('Includes doc.replace?', code.includes('doc.replace'));
