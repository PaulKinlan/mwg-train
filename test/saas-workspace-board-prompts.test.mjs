import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const archetype = join(ROOT, 'docs/design/archetypes/saas-workspace-board');
const readme = readFileSync(join(archetype, 'README.md'), 'utf8');
const provenance = readFileSync(join(archetype, 'PROVENANCE.md'), 'utf8');
const names = [
  'step1-board-and-inspector.jpg',
  'step2-command-palette-popover.jpg',
  'step3-filtered-table-view-transition.jpg',
  'step4-empty-filter-and-quick-create.jpg',
];

test('Kestrel contracts describe nonmodal command search, validation and role boundaries without claiming a running workspace', () => {
  for (const [file, sections] of [['plan.md', PLAN_SECTIONS], ['design.md', DESIGN_SECTIONS]]) {
    const content = readFileSync(join(archetype, file), 'utf8');
    let previous = -1;
    for (const heading of sections) {
      const index = content.indexOf(`## ${heading}\n`);
      assert.ok(index > previous, `${file}: ${heading} must occur in contract order`);
      previous = index;
    }
  }
  const plan = readFileSync(join(archetype, 'plan.md'), 'utf8');
  assert.match(plan, /## Site Generation Prompt\n[\s\S]*Kestrel/);
  assert.match(plan, /popover="auto".*non-modal|non-modal.*popover="auto"/);
  assert.match(plan, /:user-invalid/);
  assert.match(plan, /aria-invalid="true"/);
  assert.match(plan, /Planning only/);
});

test('four page-only image briefs exclude each browser frame element and pin exact prompt bytes', () => {
  const blocks = [...readme.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];
  assert.deepEqual(blocks.map(([, name]) => name), names);
  for (const [, name, text] of blocks) {
    assert.match(text, /1376×768 16:9/);
    assert.match(text, /full-bleed, edge-to-edge WEB PAGE canvas/);
    for (const exclusion of ['browser chrome', 'macOS traffic lights', 'window frame', 'tab bar', 'address bar', 'exterior drop shadow']) {
      assert.ok(text.includes(`NO ${exclusion}`), `${name}: must forbid ${exclusion}`);
    }
    assert.match(text, /Kestrel/);
    const digest = createHash('sha256').update(text).digest('hex');
    assert.match(provenance, new RegExp(`${name.replaceAll('.', '\\.')}[^\\n]*${digest}`),
      `${name}: prompt SHA in local provenance must match the captured UTF-8 block`);
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
