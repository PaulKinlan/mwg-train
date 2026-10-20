/**
 * These are the cases that prove `check:state-controls` can fail, not a restatement of its happy path.
 *
 * The gate exists to stop a brief landing a twin-invariant theme control (mwg-train-zeci), so the
 * fixture here is a small two-step Light/Dark pair: the same rows and prompt clauses the real brief
 * carries, in a tree small enough to break one rule at a time. Each case changes exactly one thing and
 * asserts the code that must appear.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  activeSegmentClause,
  boardsOnDisk,
  parseRows,
  stateControlFindings,
  SUBJECTS,
} from '../scripts/check-state-controls.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const family = SUBJECTS[0];
const familyDir = join(ROOT, 'docs', 'design', 'archetypes', family);

const LIGHT_MODE = 'TACTILE DAYLIGHT ARCADE MODE';
const NIGHT_MODE = 'OLED SYNTH NIGHT MODE';

const BOARDS = [
  'step1-board-initial.jpg',
  'step2-midgame-interaction.jpg',
  'dark/step1-board-initial.jpg',
  'dark/step2-midgame-interaction.jpg',
];

const ROWS = [
  { board: 'step1-board-initial.jpg', theme: 'Light', active: 'DAYLIGHT' },
  { board: 'step2-midgame-interaction.jpg', theme: 'Light', active: 'DAYLIGHT' },
  { board: 'dark/step1-board-initial.jpg', theme: 'Night', active: 'NIGHT' },
  { board: 'dark/step2-midgame-interaction.jpg', theme: 'Night', active: 'NIGHT' },
];

const prompt = (mode, theme) => `Create one illustrative board in ${mode}. In the top bar ${activeSegmentClause(theme)}.`;

const PROMPTS = {
  'step1-board-initial.jpg': prompt(LIGHT_MODE, 'Light'),
  'step2-midgame-interaction.jpg': prompt(LIGHT_MODE, 'Light'),
};

function fixture({ rows = ROWS, prompts = PROMPTS, rule = 'The ACTIVE segment is filled and carries a check glyph; the other segment is flat and unmarked.' } = {}) {
  const table = [
    '| Board | Depicted theme | Active segment |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| \`${row.board}\` | ${row.theme} | \`${row.active}\` |`),
  ].join('\n');
  const blocks = Object.entries(prompts)
    .map(([name, text]) => `### \`${name}\`\n\n\`\`\`text\n${text}\n\`\`\``)
    .join('\n\n');
  return `# Fixture brief\n\n## Theme-control state\n\n${rule}\n\n${table}\n\n## Exact proposed image prompts\n\n${blocks}\n`;
}

const codes = (findings) => findings.map((finding) => finding.code);

test('the fixture itself is a passing brief, so every failure below is caused by its one change', () => {
  assert.deepEqual(stateControlFindings({ readmeText: fixture(), boards: BOARDS }), []);
});

test('the committed Signal Grid brief passes the real tree', () => {
  assert.deepEqual(stateControlFindings({
    readmeText: readFileSync(join(familyDir, 'README.md'), 'utf8'),
    boards: boardsOnDisk(familyDir),
  }), []);
  assert.deepEqual(boardsOnDisk(familyDir), [
    'step1-board-initial.jpg', 'step2-midgame-interaction.jpg',
    'step3-invalid-collision-state.jpg', 'step4-victory-stats-dialog.jpg',
    'dark/step1-board-initial.jpg', 'dark/step2-midgame-interaction.jpg',
    'dark/step3-invalid-collision-state.jpg', 'dark/step4-victory-stats-dialog.jpg',
  ], 'the real brief must list all eight committed boards, including the four Dark twins');
});

test('a night board marking DAYLIGHT active fails, and so does its twin pair', () => {
  // The defect itself: the Dark twin keeps the Light twin's emphasised segment.
  const rows = ROWS.map((row) => (row.board === 'dark/step1-board-initial.jpg' ? { ...row, active: 'DAYLIGHT' } : row));
  const found = codes(stateControlFindings({ readmeText: fixture({ rows }), boards: BOARDS }));
  assert.ok(found.includes('ACTIVE_SEGMENT_DOES_NOT_TRACK_THEME'), found.join(', '));
  assert.ok(found.includes('TWIN_PAIR_INVARIANT'), `the pair must be reported as invariant: ${found.join(', ')}`);
});

test('a fill-only rule fails, because a tint that never changes between twins is not a state', () => {
  const found = codes(stateControlFindings({
    readmeText: fixture({ rule: 'The ACTIVE segment is filled.' }),
    boards: BOARDS,
  }));
  assert.ok(found.includes('MARKER_RULE_MISSING'), found.join(', '));
});

test('a prompt without the control-state clause fails', () => {
  const prompts = {
    ...PROMPTS,
    'step2-midgame-interaction.jpg': `Create one illustrative board in ${LIGHT_MODE} with the same top bar as step 1.`,
  };
  const found = codes(stateControlFindings({ readmeText: fixture({ prompts }), boards: BOARDS }));
  assert.ok(found.includes('PROMPT_MISSING_CONTROL_STATE'), found.join(', '));
});

test('a prompt carrying the other theme\'s clause fails', () => {
  const prompts = {
    ...PROMPTS,
    'step2-midgame-interaction.jpg': prompt(LIGHT_MODE, 'Night'),
  };
  const found = codes(stateControlFindings({ readmeText: fixture({ prompts }), boards: BOARDS }));
  assert.ok(found.includes('PROMPT_CONTRADICTS_CONTROL_STATE'), found.join(', '));
});

test('a twin pair whose rows declare the same theme fails, because the pair cannot show the switch', () => {
  // The second reported defect (mwg-train-zeci review): top-level step 3 and step 4 were declared Night beside
  // their Night dark/ twins, so those pairs marked the same segment while the other pairs still contrasted.
  const rows = [
    { board: 'step1-board-initial.jpg', theme: 'Night', active: 'NIGHT' },
    { board: 'step2-midgame-interaction.jpg', theme: 'Light', active: 'DAYLIGHT' },
    { board: 'dark/step1-board-initial.jpg', theme: 'Night', active: 'NIGHT' },
    { board: 'dark/step2-midgame-interaction.jpg', theme: 'Night', active: 'NIGHT' },
  ];
  const prompts = {
    'step1-board-initial.jpg': prompt(NIGHT_MODE, 'Night'),
    'step2-midgame-interaction.jpg': prompt(LIGHT_MODE, 'Light'),
  };
  const found = codes(stateControlFindings({ readmeText: fixture({ rows, prompts }), boards: BOARDS }));
  assert.deepEqual(found, ['TWIN_PAIR_INVARIANT'],
    'the same-theme pair must be the only finding; a contrasting pair alongside it must not change the verdict');
});

test('a table relabelled to one theme fails instead of passing vacuously', () => {
  // Every row relabelled Light/DAYLIGHT, while the prompts still declare NIGHT MODE.
  const rows = ROWS.map((row) => ({ ...row, theme: 'Light', active: 'DAYLIGHT' }));
  const prompts = { ...PROMPTS, 'dark/step1-board-initial.jpg': prompt(LIGHT_MODE, 'Light') };
  const found = codes(stateControlFindings({ readmeText: fixture({ rows, prompts }), boards: BOARDS }));
  assert.ok(found.includes('DARK_TWIN_NOT_NIGHT'), found.join(', '));
  assert.ok(found.includes('TWIN_PAIR_INVARIANT'), `every pair now marks the same segment: ${found.join(', ')}`);
  assert.ok(found.includes('TWIN_PAIR_WITHOUT_CONTRAST'), found.join(', '));
});

test('a prompt declaring NIGHT MODE under a Light row fails', () => {
  const prompts = { ...PROMPTS, 'step1-board-initial.jpg': prompt(NIGHT_MODE, 'Light') };
  const found = codes(stateControlFindings({ readmeText: fixture({ prompts }), boards: BOARDS }));
  assert.ok(found.includes('PROMPT_THEME_DISAGREES_WITH_ROW'), found.join(', '));
});

test('an unlisted board and a row with no board are both findings', () => {
  const rows = [...ROWS.filter((row) => row.board !== 'step2-midgame-interaction.jpg'),
    { board: 'step3-not-committed.jpg', theme: 'Night', active: 'NIGHT' }];
  const found = codes(stateControlFindings({ readmeText: fixture({ rows }), boards: BOARDS }));
  assert.ok(found.includes('BOARD_UNLISTED'), found.join(', '));
  assert.ok(found.includes('ROW_WITHOUT_BOARD'), found.join(', '));
});

test('a README with no theme-control section fails instead of passing vacuously', () => {
  const found = codes(stateControlFindings({ readmeText: '# Fixture brief\n\nNo controls here.\n', boards: BOARDS }));
  assert.deepEqual(found, ['SECTION_MISSING']);
});

test('the check reads rows and prompts from the table and fenced blocks, not from prose', () => {
  const { rows, unparseable } = parseRows(fixture());
  assert.deepEqual(rows, ROWS);
  assert.deepEqual(unparseable, []);
});

test('the gate runs on the committed tree and exits 0', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-state-controls.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /check-state-controls: PASS/);
});
