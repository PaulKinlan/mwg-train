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

// The exact prompts sent to gemini-3.1-flash-image for the committed JPEGs. They are the
// pre-amendment revision of README.md, preserved verbatim at commit 80290293, and they must stay
// pinned so an amended brief cannot quietly stand in for the text that produced the committed bytes.
const generationInputDigests = {
  'step1-board-and-inspector.jpg': '1fd13a60bb4b06ee09fa03fe35422dd7d8070d9699910325697e945cdbaa64c7',
  'step2-command-palette-popover.jpg': 'a5e9a52e5590e13d3d20f987e5021fd07979a29beb0e6838ae23fd581792b538',
  'step3-filtered-table-view-transition.jpg': 'e884c1a9992910d21e86a77f7a114a8cd96aaec7ed0dd467f09d941cdd381786',
  'step4-empty-filter-and-quick-create.jpg': 'bb2eb1bf0e8be4e77c74000ca7cf1f7ad78ba80f46bd000898f81cf0324381e6',
};

// Every brief now carries the same rendered-copy clause: the inspector is product UI, so its
// headings are clean titles and its code identifiers are unbackticked monospace strings.
const renderedCopyClauses = [
  'RENDERED product copy, never Markdown source',
  'clean titles (“Description”, “Impact”) with NO leading Markdown hashes',
  'monospace face with NO backticks',
];

const promptBlocks = [...readme.matchAll(/###\s*`(step\d+[a-z0-9-]*\.jpg)`\s*\n+```text\n([\s\S]*?)\n```/g)];

function promptBlocksWithNames() {
  return promptBlocks.map(([, name, text]) => [name, text]);
}

function provenanceCells(name) {
  const row = provenance.split('\n').find((line) => line.startsWith(`| \`${name}\``));
  assert.ok(row, `${name}: local provenance must carry a row for this board`);
  return row.split('|').slice(1, -1).map((cell) => cell.trim());
}

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
  assert.deepEqual(promptBlocks.map(([, name]) => name), names);
  for (const [name, text] of promptBlocksWithNames()) {
    assert.match(text, /1376×768 16:9/);
    assert.match(text, /full-bleed, edge-to-edge WEB PAGE canvas/);
    for (const exclusion of ['browser chrome', 'macOS traffic lights', 'window frame', 'tab bar', 'address bar', 'exterior drop shadow']) {
      assert.ok(text.includes(`NO ${exclusion}`), `${name}: must forbid ${exclusion}`);
    }
    assert.match(text, /Kestrel/);
    const digest = createHash('sha256').update(text).digest('hex');
    const cells = provenanceCells(name);
    assert.equal(cells[2], `\`${generationInputDigests[name]}\``,
      `${name}: the generation-input prompt SHA-256 must stay pinned to the text that produced the committed JPEG`);
    assert.equal(cells[3], `\`${digest}\``,
      `${name}: amended-authored prompt SHA must match the current README block, not the generation-input column`);
    const bytes = readFileSync(join(archetype, name));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: must be a valid JPEG`);
    assert.deepEqual(readImageDimensions(bytes), { width: 1376, height: 768 },
      `${name}: committed JPEG pixels must match the 1376×768 provenance and page-size contract`);
    const jpegSha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(cells[5], `\`${jpegSha}\` · ${bytes.length} bytes · 1376×768`,
      `${name}: provenance must pin the committed JPEG SHA-256, byte length, and 1376×768 dimensions`);
  }
  assert.match(readme, /excluded_from_training: true/);
  assert.match(readme, /approved_for_training: false/);
});

test('every step prompt renders inspector copy and forbids raw Markdown source in depicted UI', () => {
  assert.deepEqual(promptBlocks.map(([, name]) => name), names);
  for (const [name, text] of promptBlocksWithNames()) {
    for (const clause of renderedCopyClauses) {
      assert.ok(text.includes(clause), `${name}: brief must carry the rendered-copy clause "${clause}"`);
    }
    assert.doesNotMatch(text, /Markdown-spec text/,
      `${name}: the brief must not ask for Markdown source as depicted body copy`);
    assert.doesNotMatch(text, /#{2,}/,
      `${name}: the brief must not depict literal heading hashes, only named rendered titles`);
  }
  const step1 = promptBlocksWithNames().find(([name]) => name === names[0])[1];
  assert.match(step1, /rendered Description section above a rendered Impact section/,
    'step 1 must name the inspector sections it expects rendered rather than raw');
  // The rule is stated in the README prose too, not only inside the fenced requests.
  const prose = readme.replace(/```text\n[\s\S]*?\n```/g, '');
  assert.match(prose, /\*\*Depicted copy is rendered product copy, not Markdown source\.\*\*/);
  assert.match(prose, /clean titles \(“Description”, “Impact”\)/);
  assert.match(prose, /monospace face with the backticks stripped/);
  assert.match(prose, /known deviation in \[PROVENANCE\.md\]\(PROVENANCE\.md\)/);
});

test('provenance records the raw-Markdown inspector boards as known deviations', () => {
  assert.match(provenance, /^## Known deviation: the committed inspector renders Markdown source$/m);
  assert.match(provenance, /mwg-train-e3ne/);
  assert.match(provenance, /`### Description`/);
  assert.match(provenance, /`### Impact`/);
  assert.match(provenance, /`spi_driver\.c`/);
  assert.match(provenance, /not regenerated|retained unchanged/);
  assert.match(provenance, /\| Board \| Intended state \| Generation-input prompt SHA-256 \| Amended authored prompt SHA-256 \|/,
    'the table separates generation-input digests from amended authored digests');
  const rawDigest = /^`[0-9a-f]{64}`$/;
  for (const name of names) {
    const cells = provenanceCells(name);
    assert.match(cells[2], rawDigest, `${name}: generation-input digest column must hold a bare digest`);
    assert.match(cells[3], rawDigest, `${name}: amended authored digest column must hold a bare digest`);
    assert.notEqual(cells[2], cells[3], `${name}: the amended brief changed, so its digest must differ from the generation input`);
    assert.match(cells[7], /raw Markdown/, `${name}: the row must record the inspector Markdown deviation`);
  }
});
