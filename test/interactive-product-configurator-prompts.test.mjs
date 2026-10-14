import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';

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
