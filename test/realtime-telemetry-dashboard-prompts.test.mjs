import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const archetype = join(ROOT, 'docs/design/archetypes/realtime-telemetry-dashboard');
const readme = readFileSync(join(archetype, 'README.md'), 'utf8');
const provenance = readFileSync(join(archetype, 'PROVENANCE.md'), 'utf8');
const names = [
  'step1-live-overview.jpg',
  'step2-brush-zoom-and-drilldown.jpg',
  'step3-scenario-simulator.jpg',
  'step4-alert-rule-validation.jpg',
];

const prompts = (text) => [...text.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];

/** The authored prompt block for one board. */
const promptNamed = (name) => {
  const block = prompts(readme).find(([, board]) => board === name);
  assert.ok(block, `README must author a prompt for ${name}`);
  return block[2];
};

/**
 * The digest of the block each committed board was generated from, before the `mwg-train-zb74` amendment.
 * These are receipts for the bytes in the tree, so they are preserved rather than recomputed from newer text.
 */
const GENERATION_INPUT_PROMPT_SHA = new Map([
  ['step1-live-overview.jpg', '1fc0941e7f63a25a56064997870949a21f8c29778bbde44c7347e1a5842feca7'],
  ['step2-brush-zoom-and-drilldown.jpg', 'adccf29965afa5fb1c8c29b9728ca268d782d7a9e13bf15c3cf0bc16900f715a'],
  ['step3-scenario-simulator.jpg', '582e79f79241a96b6b78022345e46a46ab0c2007167cbd2651e305fa6d74726f'],
  ['step4-alert-rule-validation.jpg', '61eb4b2b6934c9eb6193c81071632b0ae2426dc44e19fd649bbc380e50d3e3d1'],
]);

test('NorthSea Grid contracts keep synthetic readings and simulator separate from operational grid control', () => {
  for (const [file, headings] of [['plan.md', PLAN_SECTIONS], ['design.md', DESIGN_SECTIONS]]) {
    const text = readFileSync(join(archetype, file), 'utf8');
    let previous = -1;
    for (const heading of headings) {
      const index = text.indexOf(`## ${heading}\n`);
      assert.ok(index > previous, `${file}: ${heading} required in order`);
      previous = index;
    }
  }
  const plan = readFileSync(join(archetype, 'plan.md'), 'utf8');
  assert.match(plan, /## Site Generation Prompt\n[\s\S]*NorthSea Grid/);
  assert.match(plan, /Planning only/);
  assert.match(plan, /Simulation — not live/);
  assert.match(plan, /no real actuator action|no.*physical action/i);
  assert.match(plan, /warning < critical/);
  assert.match(plan, /14:00–15:30 UTC/);
});

test('four unframed page-only prompts pin actual text hashes and label synthetic values in every state', () => {
  const blocks = [...readme.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];
  assert.deepEqual(blocks.map(([, name]) => name), names);
  for (const [, name, text] of blocks) {
    assert.match(text, /1376×768 16:9/);
    assert.match(text, /full-bleed, edge-to-edge WEB PAGE canvas/);
    assert.match(text, /Simulation — not live/);
    for (const exclusion of ['browser chrome', 'macOS traffic lights', 'window frame', 'tab bar', 'address bar', 'exterior drop shadow']) {
      assert.ok(text.includes(`NO ${exclusion}`), `${name}: must forbid ${exclusion}`);
    }
    const digest = createHash('sha256').update(text).digest('hex');
    assert.match(provenance, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*${digest}`),
      `${name}: provenance must match the exact prompt UTF-8 bytes`);
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

test('every chart brief requires a monotonic UTC axis, a brush drawn under its own label, and single-value UTC columns', () => {
  // mwg-train-zb74: step 1 read 08:00 - 18:00 - 10:00 and packed two times into one UTC cell; step 2 shaded
  // from the 14:00 tick that follows 18:00 across the 12:00 tick, not the 14:00-to-15:30 span its label prints.
  // A quantitative axis that contradicts itself is not illustrative content, so the brief has to state the two
  // arithmetic invariants, not just ask for a chart.
  assert.match(readme, /Time-axis rule for every board/, 'the shared rule must precede the step briefs');
  for (const name of ['step1-live-overview.jpg', 'step2-brush-zoom-and-drilldown.jpg', 'step3-scenario-simulator.jpg']) {
    const text = promptNamed(name);
    assert.match(text, /monotonic UTC clock time in ascending order/,
      `${name}: the brief must require an ascending, monotonic time axis`);
    assert.match(text, /exactly one time value per row/,
      `${name}: the brief must require a single-value UTC column`);
  }
  const step2 = promptNamed('step2-brush-zoom-and-drilldown.jpg');
  assert.match(step2, /brush window with bounds “14:00–15:30 UTC”, drawn directly over the times printed on its own label/,
    'the brushed window must be pinned to the times its own label prints');
  assert.match(step2, /the 14:00-to-15:30 span of an x-axis/, 'the label-to-span mapping must be named explicitly');
  assert.match(promptNamed('step1-live-overview.jpg'), /every tick later than the one to its left/,
    'monotonicity must be stated as ordering, not as the presence of times');
});

test('the pending-verification list holds a returned board to the axis, brush and table rules', () => {
  const section = readme.split('### Pending verification\n')[1];
  assert.ok(section, 'the brief must enumerate what a returned board is inspected for');
  assert.match(section, /Monotonic time axis:[\s\S]*monotonic UTC clock time in ascending order from left to right/);
  assert.match(section, /03:00, 06:00, 08:00, 10:00, 12:00, 14:00 progress and no 18:00 sits between 08:00 and 10:00/,
    'the observed 18:00 misplacement must be named as the failure to look for');
  assert.match(section, /Brush under its own label:[\s\S]*sits directly over the times printed on its label/);
  assert.match(section, /its axis reads 03:00, 06:00, 08:00, 18:00, 14:00, 12:00, 14:00, and the shading starts at the fifth tick \(14:00\), crosses the sixth \(12:00\) and stops about half-way to the seventh \(14:00\), leaving the 06:00 and 08:00 ticks unshaded/,
    'the observed step 2 brush placement must be named as it was measured');
  assert.match(section, /Single-value UTC columns:[\s\S]*exactly one time value per row/);
  assert.match(section, /known deviation recorded in \[PROVENANCE\.md\]\(PROVENANCE\.md\)/,
    'a board that fails the list is a recorded deviation, not a pass');
});

test('the register keeps each generation-input digest and records the axis deviation as known non-conforming', () => {
  // A brief amendment must not rewrite the receipt: the digest that was actually sent is history, and the
  // current authored block gets its own column. Overwriting it would claim the amended brief produced bytes
  // generated from the older text (the same rule the browser-puzzle register follows).
  assert.match(provenance, /Original generation-input prompt SHA-256 \| Authored README prompt block SHA-256/,
    'the register must keep the generation input and the authored brief in separate columns');
  for (const [name, original] of GENERATION_INPUT_PROMPT_SHA) {
    const row = provenance.split('\n').find((line) => line.startsWith(`| \`${name}\``));
    assert.ok(row, `missing the ${name} provenance row`);
    assert.ok(row.includes(`\`${original}\``),
      `${name}: the digest the committed bytes were generated from must stay recorded`);
    const authored = createHash('sha256').update(promptNamed(name)).digest('hex');
    assert.ok(row.includes(`\`${authored}\``),
      `${name}: the current authored brief block must be recorded beside it`);
    if (name === 'step4-alert-rule-validation.jpg') {
      assert.equal(authored, original,
        'step 4 draws no time axis, so the amendment leaves its brief and digest alone');
    } else {
      assert.notEqual(authored, original,
        `${name}: the amendment changed the brief, so the authored digest cannot still equal the sent one`);
    }
  }

  const deviation = provenance.split('\n').find((line) => line.startsWith('- **Time-axis and brush deviation'));
  assert.ok(deviation, 'the register must record the committed boards as a known deviation');
  assert.match(deviation, /`mwg-train-zb74`/);
  for (const name of ['step1-live-overview.jpg', 'step2-brush-zoom-and-drilldown.jpg']) {
    assert.ok(deviation.includes(name), `${name}: the non-conforming board must be named`);
  }
  assert.match(deviation, /known non-conforming/, 'the boards must be marked non-conforming, not passed');
  assert.match(deviation, /18:00 sits between 08:00 and 10:00/, 'the observed axis order must be recorded');
  assert.match(deviation, /packs two values into the UTC cell \(`14:32:05 02:00`\)/,
    'the packed UTC cell must be recorded');
  assert.match(deviation, /03:00 – 06:00 – 08:00 – 18:00 – 14:00 – 12:00 – 14:00/,
    'the observed step 2 axis order must be recorded');
  assert.match(deviation, /starts at that fifth tick \(14:00\), runs across the sixth tick \(12:00\) and stops about half-way to the seventh tick \(14:00\), leaving the 06:00 and 08:00 ticks unshaded/,
    'the brush-to-label mismatch must be recorded where the shading actually sits');
  assert.match(deviation, /shaded band occupies columns 432–568/,
    'the brush placement must be pinned to a measurement, not an impression');
  assert.match(deviation, /telemetry-axis-drift\.png/);
  assert.match(deviation, /telemetry-brush-window\.png/);
  assert.match(deviation, /bytes stay in the tree unchanged/,
    'the record must say the JPEGs were not edited, so nobody reads it as a re-pin');
  for (const name of ['step1-live-overview.jpg', 'step2-brush-zoom-and-drilldown.jpg']) {
    const row = provenance.split('\n').find((line) => line.startsWith(`| \`${name}\``));
    assert.match(row, /known non-conforming/, `${name}: the row cannot claim an unqualified PASS`);
  }
});
