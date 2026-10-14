import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SECTIONS, PLAN_SECTIONS } from '../src/design/contract.mjs';

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
  }
  assert.match(readme, /excluded_from_training: true/);
  assert.match(readme, /approved_for_training: false/);
  assert.match(provenance, /No image request/);
});
