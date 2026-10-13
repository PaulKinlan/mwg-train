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

test('a drive block that names no action is a finding, because it would capture the plain page', () => {
  // mwg-train-mr6t. The drive is how a state with no path is captured. A drive with neither fill nor submit is
  // not a drive at all: the comparator would screenshot the page as it loaded and compare that against a board
  // of the refusal, which reports a design difference where the real fault is a missing instruction.
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-refusal.jpg'] },
    mapping: { catalogue: { 'step1-refusal.jpg': { path: null, kind: 'interaction', source: 'x', drive: { startPath: '/', expectText: 'anything' } } } },
  });
  assert.deepEqual(codes(findings), ['DRIVE_WITH_NO_ACTION']);
});

test('a driven board that also claims a path is a finding, because the two describe different things', () => {
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-refusal.jpg'] },
    mapping: { catalogue: { 'step1-refusal.jpg': { path: '/index.html', kind: 'interaction', source: 'x', drive: { submit: 'form#f', expectText: 'anything' } } } },
  });
  assert.deepEqual(codes(findings), ['DRIVE_WITH_PATH']);
});

test('a malformed drive names the finding rather than failing as a capture', () => {
  // Each of these would otherwise surface as a browser error during a sweep, where the cause is invisible: a
  // selector that is not a selector, a start path the capture refuses, and an expectText that is not text.
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-refusal.jpg'] },
    mapping: {
      catalogue: {
        'step1-refusal.jpg': { path: null, kind: 'interaction', source: 'x', drive: { fill: { 'input[name=a]': { deep: true } }, submit: '', expectText: 7, startPath: 'shortlist' } },
      },
    },
  });
  assert.deepEqual(codes(findings), ['DRIVE_EXPECT_TEXT_NOT_A_STRING', 'DRIVE_FILL_BAD_VALUE', 'DRIVE_START_PATH_NOT_ROOT_RELATIVE', 'DRIVE_SUBMIT_NOT_A_SELECTOR']);
});

test('a well-formed drive passes, so the contract above is not punishing the feature itself', () => {
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-refusal.jpg'] },
    mapping: {
      catalogue: {
        'step1-refusal.jpg': { path: null, kind: 'interaction', source: 'x', drive: { startPath: '/', fill: { 'input[name=researcher]': '' }, submit: 'form#reserve', expectText: 'could not be submitted' } },
      },
    },
  });
  assert.deepEqual(findings, []);
});

test('a drive without expectText is refused, because a successful submission cannot be told from the refusal', () => {
  // mwg-train-pv44 (rev-1). The drive exists so a state no URL selects can be captured; expectText is how the
  // capture knows the drive REACHED that state rather than silently succeeding. An entry without it would
  // compare whatever the submission produced against the refusal board with full confidence - the exact wrong
  // answer the instrument must never produce - so the contract refuses the entry instead of trusting the author.
  const findings = boardStateFindings({
    boards: { catalogue: ['step1-refusal.jpg'] },
    mapping: { catalogue: { 'step1-refusal.jpg': { path: null, kind: 'interaction', source: 'x', drive: { submit: 'form#reserve' } } } },
  });
  assert.deepEqual(codes(findings), ['DRIVE_EXPECT_TEXT_NOT_A_STRING']);
});
