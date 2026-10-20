import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const archetype = join(ROOT, 'docs/design/archetypes/browser-puzzle-game');
const readme = readFileSync(join(archetype, 'README.md'), 'utf8');
const provenance = readFileSync(join(archetype, 'PROVENANCE.md'), 'utf8');
const names = [
  'step1-board-initial.jpg',
  'step2-midgame-interaction.jpg',
  'step3-invalid-collision-state.jpg',
  'step4-victory-stats-dialog.jpg',
];

test('browser puzzle plan and design use the archetype contracts and distinguish a picture from a playable game', () => {
  for (const [file, sections] of [['plan.md', PLAN_SECTIONS], ['design.md', DESIGN_SECTIONS]]) {
    const text = readFileSync(join(archetype, file), 'utf8');
    let previous = -1;
    for (const heading of sections) {
      const index = text.indexOf(`## ${heading}\n`);
      assert.ok(index > previous, `${file}: ${heading} must exist in contract order`);
      previous = index;
    }
  }
  const plan = readFileSync(join(archetype, 'plan.md'), 'utf8');
  assert.match(plan, /## Site Generation Prompt\n[\s\S]*Signal Grid/);
  assert.match(plan, /36 labelled interactive cells/);
  assert.match(plan, /pointer capture/);
  assert.match(plan, /visibilitychange/);
  assert.match(plan, /14 accepted moves/);
  assert.match(plan, /Planning only/);
});

const prompts = (readmeText) => [...readmeText.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];

/** The authored prompt block for one board. */
const promptsNamed = (readmeText, name) => {
  const block = prompts(readmeText).find(([, board]) => board === name);
  assert.ok(block, `README must author a prompt for ${name}`);
  return block[2];
};

test('the Step 4 brief names OS window controls, the one piece of chrome the board actually drew', () => {
  // mwg-train-m5ws: "NO window frame" did not stop a generated panel being drawn with a monochrome
  // "- [] X" set, and the gate could not see it. The brief now names the glyphs and the dialog repeats it.
  const step4 = promptsNamed(readme, 'step4-victory-stats-dialog.jpg');
  assert.match(step4, /NO OS window controls on the dialog or on any panel/);
  for (const glyph of ['minimise', 'maximise', 'close']) {
    assert.ok(step4.includes(glyph), `the exclusion must name ${glyph}, not just "window controls"`);
  }
  assert.match(step4, /no “- \[\] X” triad/);
  assert.match(step4, /monochrome or coloured/);
  assert.match(step4, /no title bar and no window controls of any kind/,
    'the dialog description repeats the rule where the defect appeared');
  assert.match(provenance, /Window-control deviation \(mwg-train-m5ws\)/,
    'the committed boards that still draw one are recorded as a reviewed deviation');
  assert.match(provenance, /reviewedFindings[\s\S]*mwg-train-m5ws/,
    'the deviation names where it is recorded and which bead accepts it');
});

test('four exact prompts are separately digest-pinned and expressly exclude browser framing', () => {
  const blocks = [...readme.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];
  assert.deepEqual(blocks.map(([, name]) => name), names);
  for (const [, name, text] of blocks) {
    assert.match(text, /1376×768 16:9/);
    assert.match(text, /full-bleed, edge-to-edge WEB PAGE canvas/);
    for (const exclusion of ['browser chrome', 'macOS traffic lights', 'window frame', 'tab bar', 'address bar', 'exterior drop shadow']) {
      assert.ok(text.includes(`NO ${exclusion}`), `${name}: missing the explicit NO ${exclusion} instruction`);
    }
    assert.match(text, /Signal Grid/);
    assert.match(text, /6×6/);
    const digest = createHash('sha256').update(text).digest('hex');
    assert.match(provenance, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*${digest}`),
      `${name}: the current authored brief digest must appear on its row, beside any preserved generation-input receipt`);
    const bytes = readFileSync(join(archetype, name));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: must be a valid JPEG`);
    assert.deepEqual(readImageDimensions(bytes), { width: 1376, height: 768 },
      `${name}: committed JPEG pixels must match the 1376×768 provenance and page-size contract`);
    const jpegSha = createHash('sha256').update(bytes).digest('hex');
    assert.match(provenance, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*\`${jpegSha}\` · ${bytes.length} bytes · 1376×768`),
      `${name}: provenance must pin the committed JPEG SHA-256, byte length, and 1376×768 dimensions`);
  }
  assert.match(readme, /excluded_from_training: true/);
  assert.match(readme, /approved_for_training: false/);
});
