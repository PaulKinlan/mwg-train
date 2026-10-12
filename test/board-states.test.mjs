/**
 * The authored board-to-state mapping must stay in step with the boards on disk.
 *
 * `check:board-states` is the gate; these are the cases that prove the gate can fail. A check that only ever
 * runs against a correct file proves nothing about the file being wrong, so each finding below is produced from
 * a deliberately broken mapping rather than from the real one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { boardStateFindings, boardsOnDisk, loadMapping } from '../scripts/check-board-states.mjs';

const codes = (findings) => findings.map((f) => f.code).sort();

test('the real mapping classifies every board on disk, and the gate passes', () => {
  const findings = boardStateFindings({ boards: boardsOnDisk(), mapping: loadMapping() });
  assert.deepEqual(findings, [], `the committed mapping has findings: ${JSON.stringify(findings, null, 2)}`);
});

test('a board with no mapping entry is a finding', () => {
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-grid.jpg', 'step9-brand-new.jpg'] },
    mapping: { catalogue: { 'step1-grid.jpg': { path: '/index.html', kind: 'page', source: 'demo index' } } },
  });
  assert.deepEqual(codes(findings), ['BOARD_UNMAPPED']);
  assert.match(findings[0].message, /step9-brand-new\.jpg/);
});

test('a mapped path that is not root-relative is a finding, including protocol-relative', () => {
  for (const bad of ['index.html', '', '//evil.test/', 'http://example.test/']) {
    const findings = boardStateFindings({
      boards: { catalogue: ['step1-grid.jpg'] },
      mapping: { catalogue: { 'step1-grid.jpg': { path: bad, kind: 'page', source: 'x' } } },
    });
    assert.deepEqual(codes(findings), ['PATH_NOT_ROOT_RELATIVE'], `path ${JSON.stringify(bad)} was accepted`);
  }
});

test('a null entry with no source is a finding, because an unexplained gap reads as an oversight', () => {
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-grid.jpg'] },
    mapping: { catalogue: { 'step1-grid.jpg': { path: null, kind: 'absent', source: '   ' } } },
  });
  assert.deepEqual(codes(findings), ['NULL_UNEXPLAINED']);
});

test('a mapping entry with no board behind it is a finding', () => {
  // The mapping must not describe boards that do not exist: a deleted or renamed board would otherwise leave a
  // claim about a file nothing can check.
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-grid.jpg'] },
    mapping: { catalogue: { 'step1-grid.jpg': { path: '/index.html', kind: 'page', source: 'x' }, 'step2-gone.jpg': { path: '/x.html', kind: 'page', source: 'x' } } },
  });
  assert.deepEqual(codes(findings), ['MAPPING_WITHOUT_BOARD']);
});

test('a null with a real reason passes, so the nulls in the committed file are not being punished', () => {
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-grid.jpg'] },
    mapping: { catalogue: { 'step1-grid.jpg': { path: null, kind: 'absent', source: 'this archetype has no demo directory' } } },
  });
  assert.deepEqual(findings, []);
});

test('boardsOnDisk reads the tree and finds at least the boards the mapping covers', () => {
  // Guards against boardStateFindings passing vacuously because boardsOnDisk returned nothing.
  const boards = boardsOnDisk();
  const total = Object.values(boards).reduce((n, files) => n + files.length, 0);
  assert.ok(total > 0, 'no boards were found on disk, so the mapping check above proves nothing');
  const mapping = loadMapping();
  for (const archetype of Object.keys(mapping)) {
    if (archetype.startsWith('_')) continue;
    assert.ok(boards[archetype], `the mapping names ${archetype} but no boards were found for it`);
  }
});
