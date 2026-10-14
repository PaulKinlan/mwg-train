import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'scroll-storytelling-launch';
const archetype = join(ROOT, 'docs/design/archetypes', slug);
const register = readFileSync(join(archetype, 'PROVENANCE.md'), 'utf8');
const promptText = readFileSync(join(archetype, 'README.md'), 'utf8');
const names = [
  'step1-hero-overview.jpg',
  'step2-scroll-exploded-anatomy.jpg',
  'step3-finish-material-switcher.jpg',
  'step4-spec-comparison-drawer.jpg',
];

test('the new design and behaviour contracts cover every required section without claiming a running implementation', () => {
  for (const [file, sections] of [['plan.md', PLAN_SECTIONS], ['design.md', DESIGN_SECTIONS]]) {
    const contents = readFileSync(join(archetype, file), 'utf8');
    let previous = -1;
    for (const section of sections) {
      const index = contents.indexOf(`## ${section}\n`);
      assert.ok(index > previous, `${file}: ${section} must be present in contract order`);
      previous = index;
    }
  }
  assert.match(readFileSync(join(archetype, 'plan.md'), 'utf8'), /## Site Generation Prompt\n[\s\S]*Precision you can see through/);
});

test('each of four exact image prompts requests only an unframed full-bleed 1376 × 768 page', () => {
  const blocks = [...promptText.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];
  assert.deepEqual(blocks.map(([, name]) => name), names);
  for (const [, name, prompt] of blocks) {
    assert.match(prompt, /1376×768 16:9/);
    assert.match(prompt, /full-bleed, edge-to-edge WEB PAGE canvas/);
    for (const forbidden of ['browser chrome', 'macOS traffic lights', 'window frame', 'tab bar', 'address bar', 'exterior drop shadow']) {
      assert.ok(prompt.includes(`NO ${forbidden}`), `${name}: must explicitly exclude ${forbidden}`);
    }
    assert.match(prompt, /Aether Audio/);
    assert.match(prompt, /Aether One/);
    const digest = createHash('sha256').update(prompt).digest('hex');
    assert.match(register, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*${digest}`), `${name}: register must carry its actual prompt SHA`);
    const bytes = readFileSync(join(archetype, name));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: must be a valid JPEG`);
    assert.deepEqual(readImageDimensions(bytes), { width: 1376, height: 768 },
      `${name}: committed JPEG pixels must match the 1376×768 provenance and page-size contract`);
    const jpegSha = createHash('sha256').update(bytes).digest('hex');
    assert.match(register, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*\`${jpegSha}\` · ${bytes.length} bytes · 1376×768`),
      `${name}: register must pin the committed JPEG SHA-256, byte length, and 1376×768 dimensions`);
  }
  assert.match(promptText, /excluded_from_training: true/);
  assert.match(promptText, /approved_for_training: false/);
});
