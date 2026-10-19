import test from 'node:test';
import assert from 'node:assert/strict';
import { decoyValueForControl } from '../src/corpus/search-decoy.mjs';

test('search decoy preserves cross-field numeric/date constraints but replaces the searchable identity', () => {
  const make = (type, original, index) => decoyValueForControl(type, {
    original, token: 'zzz-decoy-pinned', suffix: 'pinned', index,
  });
  assert.equal(make('number', '3', 0), '3');
  assert.equal(Number(make('number', '2', 1)) + Number(make('number', '1', 2)), Number(make('number', '3', 0)));
  assert.equal(make('date', '2026-10-24', 3), '2026-10-24');
  assert.equal(make('email', 'cassiopeia@example.test', 4), 'zzz-decoy-pinned@example.test');
  assert.equal(make('text', 'Cassiopeia Vance', 5), 'zzz-decoy-pinned-5');
  const password = make('password', 'old', 6);
  assert.equal(password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password), true);
});
