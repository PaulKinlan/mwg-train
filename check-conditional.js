import { buildProjectFor } from './pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from './pilot/training-archetypes.mjs';

const base = TRAINING_ARCHETYPES['web-shop'];
const archetypeNoUpdate = {
  ...base,
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/subscriptions/:id/edit', kind: 'write', redirect: () => '/subscriptions/${ref}' },
    { method: 'GET', path: '/subscriptions/:ref', kind: 'read-by-reference' },
  ],
  journey: {
    startPath: '/',
    formSelector: 'form#subscription-form',
    fill: {},
    expectText: 'Nadia Okonjo'
  }
};

const built2 = buildProjectFor(archetypeNoUpdate, { frameworkName: 'raw', defects: [] });
console.log('Without flows, is there an UPDATE records SET? ', built2.files['server.mjs'].includes('UPDATE records SET'));
