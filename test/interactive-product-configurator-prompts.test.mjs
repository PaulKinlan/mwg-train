import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';
import { ARCHETYPE_CONFIGS } from '../scripts/generate-archetype-light-dark.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const archetype = join(ROOT, 'docs/design/archetypes/interactive-product-configurator');
const readme = readFileSync(join(archetype, 'README.md'), 'utf8');
const provenance = readFileSync(join(archetype, 'PROVENANCE.md'), 'utf8');
const names = [
  'step1-frame-and-geometry.jpg',
  'step2-drivetrain-and-wheelset-swap.jpg',
  'step3-compatibility-conflict.jpg',
  'step4-saved-build-comparison-sheet.jpg',
];

/**
 * The step names are pinned once, here, because the boards drifted: the same step rendered as "03. COCKPIT",
 * "03. COCKPIT & ACCESSORIES", "3. Cockpit & Upgrades" and "3. Tyres, Mudguards & Dynamo Lighting" across one
 * four-step journey (mwg-train-601b). A nav band and an accordion heading are persistent navigation controls, so
 * the label for a step has to be the same string in every prompt that draws it. Only the zero padding differs
 * between the two surfaces.
 */
const STEP_NAMES = ['Frame & Geometry', 'Drivetrain', 'Cockpit & Upgrades', 'Compare & Share'];
const NAV_LABELS = STEP_NAMES.map((name, index) => `${String(index + 1).padStart(2, '0')}. ${name}`);
const NAV_BAND = NAV_LABELS.join(' | ');
const PANEL_HEADINGS = STEP_NAMES.map((name, index) => `${index + 1}. ${name}`);
// The active step repeats its nav label on its own, so both the band and the single zero-padded label are pinned.
const PINNED_LABELS = new Set([NAV_BAND, ...NAV_LABELS, ...PANEL_HEADINGS]);

/** The authored prompt block for one board, read the way the generator reads it. */
const promptBlocks = (readmeText) =>
  [...readmeText.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];

/**
 * Every quoted string that starts like a numbered step label, in the typographic quotes the README uses and the
 * straight quotes the generator prose uses. `"650b x 2.1\""` and `"?size=56&..."` are option values, not labels,
 * and do not start with `<digits>. `.
 */
const quotedStepLabels = (text) => [
  ...[...text.matchAll(/“([^”]+)”/g)].map((match) => match[1]),
  ...[...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
].filter((label) => /^\d{1,2}\. /.test(label));

/** Step number -> the single name every prompt gives it. The nav band itself is a list of labels, not a label. */
const labelIndex = (labels) => {
  const byStep = new Map();
  for (const label of labels) {
    if (label.includes(' | ')) continue;
    const match = /^(\d{1,2})\. (.+)$/.exec(label);
    if (!match) continue;
    const step = Number(match[1]);
    const seen = byStep.get(step) ?? new Set();
    seen.add(match[2]);
    byStep.set(step, seen);
  }
  return byStep;
};

test('Atelier Velo contracts preserve mechanical fit, fixture arithmetic and unconfirmed booking boundaries', () => {
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
  assert.match(plan, /## Site Generation Prompt\n[\s\S]*Solstice Ti/);
  assert.match(plan, /Planning only/);
  assert.match(plan, /£3,480 \+ £620 \+ £450 = \*\*£4,550\*\*/);
  assert.match(plan, /illustrative.*0 g|0 g.*illustrative/i);
  assert.match(plan, /fit unverified; reservation disabled/);
  assert.match(plan, /draft C.*not.*A|draft C.*do.*not.*A/i);
});

test('four page-only prompts pin SHA text, framing exclusion and no false booking promise', () => {
  const blocks = [...readme.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];
  assert.deepEqual(blocks.map(([, name]) => name), names);
  for (const [, name, text] of blocks) {
    assert.match(text, /1376×768 16:9/);
    assert.match(text, /full-bleed, edge-to-edge WEB PAGE canvas/);
    for (const exclusion of ['browser chrome', 'macOS traffic lights', 'window frame', 'tab bar', 'address bar', 'exterior drop shadow']) {
      assert.ok(text.includes(`NO ${exclusion}`), `${name}: must forbid ${exclusion}`);
    }
    const digest = createHash('sha256').update(text).digest('hex');
    assert.match(provenance, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*${digest}`),
      `${name}: provenance must match exact UTF-8 prompt bytes`);
    const bytes = readFileSync(join(archetype, name));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: must be a valid JPEG`);
    assert.deepEqual(readImageDimensions(bytes), { width: 1376, height: 768 },
      `${name}: committed JPEG pixels must match the 1376×768 provenance and page-size contract`);
    const jpegSha = createHash('sha256').update(bytes).digest('hex');
    assert.match(provenance, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*\`${jpegSha}\` · ${bytes.length} bytes · 1376×768`),
      `${name}: provenance must pin the committed JPEG SHA-256, byte length, and 1376×768 dimensions`);
  }
  assert.match(blocks[3][2], /Saved locally · Workshop slot not yet reserved/);
  assert.match(blocks[3][2], /DRAFT C|DRAFT C/i);
  assert.match(readme, /excluded_from_training: true/);
  assert.match(readme, /approved_for_training: false/);
});

test('one step name per step, in the nav band and in the panel heading, across all four authored prompts', () => {
  const blocks = promptBlocks(readme);
  assert.deepEqual(blocks.map(([, name]) => name), names, 'the README must author exactly the four committed boards');
  for (const [, name, text] of blocks) {
    assert.ok(text.includes(NAV_BAND),
      `${name}: the whole step-nav band must be pinned verbatim, including 04. Compare & Share when it is not the active step`);
    const labels = quotedStepLabels(text);
    assert.ok(labels.length > 0, `${name}: no quoted step labels found; the check would pass on nothing`);
    for (const label of labels) {
      assert.ok(PINNED_LABELS.has(label), `${name}: step label "${label}" is not one of the pinned names`);
    }
  }

  // The invariance itself: no step is given two different names by two prompts, and the names are the pinned ones.
  const byStep = new Map();
  for (const [, name, text] of blocks) {
    for (const [step, seen] of labelIndex(quotedStepLabels(text))) {
      const merged = byStep.get(step) ?? new Set();
      for (const label of seen) merged.add(label);
      byStep.set(step, merged);
    }
  }
  for (const [step, seen] of byStep) {
    assert.deepEqual([...seen], [STEP_NAMES[step - 1]],
      `step ${step} must carry exactly one name across every prompt, not ${[...seen].join(' / ')}`);
  }
  assert.deepEqual([...byStep.keys()].sort(), [1, 2, 3, 4], 'all four steps must be named by the prompts');
  for (const step of [1, 2, 3]) {
    assert.ok(byStep.has(step), `step ${step} is drawn by the builder panel and must be named`);
  }

  // The pin is stated once in the README, so a later brief has one place to read the names from.
  assert.match(readme, /## Step names — pinned verbatim \(`mwg-train-601b`\)/);
  for (const label of [...NAV_LABELS, ...PANEL_HEADINGS]) {
    assert.ok(readme.includes(`\`${label}\``), `the pin must state \`${label}\``);
  }
  assert.match(readme, /carries the whole nav band verbatim/,
    'the pin must say the prompts carry the whole band, not only the active step');
});

test('the Light/Dark generator override prose carries the same pinned step names', () => {
  // Steps 2-4 of the served Light set and every Dark twin are generated from these overrides, not from the README
  // block, so a pin that stops at the README would still let the next regeneration draw the old labels.
  const config = ARCHETYPE_CONFIGS['interactive-product-configurator'];
  assert.deepEqual(Object.keys(config.lightStepOverrides).sort(), ['step2-drivetrain-and-wheelset-swap.jpg',
    'step3-compatibility-conflict.jpg', 'step4-saved-build-comparison-sheet.jpg']);
  for (const [board, prompt] of Object.entries(config.lightStepOverrides)) {
    assert.ok(prompt.includes(NAV_BAND), `${board}: the generator override must pin the whole step-nav band`);
    for (const label of quotedStepLabels(prompt)) {
      assert.ok(PINNED_LABELS.has(label), `${board}: generator override step label "${label}" is not pinned`);
    }
  }
});

test('provenance records the pinned names, the amended brief digests and every committed board that deviates', () => {
  assert.match(provenance, /\| Board \| Illustrated state \| Generation-input prompt SHA-256 \| Authored README prompt SHA-256 \|/,
    'the amended brief needs its own digest column beside the generation receipt, not in place of it');
  for (const [, name, text] of promptBlocks(readme)) {
    const row = provenance.split('\n').find((line) => line.startsWith(`| \`${name}\``));
    assert.ok(row, `${name}: missing provenance row`);
    const digests = [...row.matchAll(/`([0-9a-f]{64})`/g)].map((match) => match[1]);
    assert.ok(digests.includes(createHash('sha256').update(text).digest('hex')),
      `${name}: the authored README digest of the current block must be on the row`);
    assert.equal(new Set(digests).size >= 2, true,
      `${name}: the row must keep the generation-input digest and the authored digest`);
  }

  assert.match(provenance, /## Step-name pin and committed-board deviation \(`mwg-train-601b`\)/);
  for (const name of names) {
    const row = provenance.split('\n').find((line) => line.startsWith(`| \`${name}\``) && line.includes('·'));
    assert.ok(row, `${name}: the deviation table must name this committed board`);
  }
  // The labels actually drawn on the committed JPEGs, read from the boards; a record that omits them is not a record.
  for (const drawn of ['03. Cockpit', '03. Cockpit & Accessories', '1. Frame Size & Titanium Finish',
    '2. Drivetrain & Components', '2. Drivetrain & Wheelset', '3. Tyres, Mudguards & Dynamo Lighting',
    '4. Saved Build Comparison']) {
    assert.ok(provenance.includes(drawn), `the deviation record must state the label actually drawn: ${drawn}`);
  }
  assert.match(provenance, /Dark twin repeats its Light board's labels/,
    'the record must say the Dark twins carry the same deviations');
});
