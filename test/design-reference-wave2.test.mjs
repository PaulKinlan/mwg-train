import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => readFileSync(new URL(path, root));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const STEPS = {
  catalogue: ['step1-grid.jpg', 'step2-cart.jpg', 'step3-empty.jpg'],
  'contact-lead': ['step1-form.jpg', 'step2-success.jpg'],
  'account-recovery': ['step1-request.jpg', 'step2-sent.jpg'],
  'event-registration': ['step1-event.jpg', 'step2-pass.jpg'],
};
const RECORD_PATH = 'docs/provenance/assets/design-reference-wave2.md';

test('nine Wave 2 boards have three-way matching README/record/file hashes and pinned exact prompts', () => {
  const record = text(RECORD_PATH);
  const rows = [...record.matchAll(/\|\s*\[`([a-z-]+)`\]\([^|]+\)\s*\|\s*\[`(step[0-9]+-[a-z0-9-]+\.jpg)`\]\([^|]+\)\s*\|\s*`([0-9a-f]{64})`\s*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`\s*\|/g)];
  const expected = Object.entries(STEPS).flatMap(([family, names]) => names.map((name) => `${family}/${name}`));
  assert.deepEqual(rows.map(([, family, name]) => `${family}/${name}`).sort(), expected.sort(), 'no board may be duplicated or omitted from provenance');
  const classification = text('scripts/check-baseline-label.mjs');
  assert.match(classification, /'docs\/provenance\/assets\/design-reference-wave2\.md': 'provenance'/);
  assert.match(record, /excluded_from_training: true/);
  assert.match(record, /approved_for_training: false/);
  assert.match(record, /gemini-3-pro-image/);
  assert.match(record, /reported.*not model attestations|reported.*not an attested model ID|reported.*tool responses contain paths/s);

  for (const [family, names] of Object.entries(STEPS)) {
    const dir = `docs/design/archetypes/${family}/`;
    const readme = text(`${dir}README.md`);
    assert.deepEqual(readdirSync(new URL(dir, root)).filter((name) => name.endsWith('.jpg')).sort(), names.slice().sort(), `${family}: no unregistered raster files`);
    assert.match(readme, /excluded_from_training: true/);
    assert.match(readme, /approved_for_training: false/);
    assert.match(readme, /gemini-3-pro-image/);
    assert.match(readme, /Google consumer-account terms/);
    assert.match(readme, /design-reference-wave2\.md/);
    assert.ok(classification.includes(`'${dir}README.md': 'provenance'`), `${family}: missing explicit document classification`);
    const readmeRows = [...readme.matchAll(/\|\s*\[`(step[0-9]+-[a-z0-9-]+\.jpg)`\]\([^|]+\)\s*\|[^|]*\|\s*`([0-9a-f]{64})`\s*\|\s*(\d+)\s*\|/g)];
    assert.deepEqual(readmeRows.map(([, name]) => name).sort(), names.slice().sort(), `${family}: README must name each board exactly once`);
    for (const name of names) {
      const [, , readmeDigest, readmeBytes] = readmeRows.find(([, entry]) => entry === name);
      const [, , , recordDigest, recordBytes, promptDigest] = rows.find(([, entryFamily, entryName]) => entryFamily === family && entryName === name);
      const image = bytes(`${dir}${name}`);
      assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff], `${family}/${name}: expected JPEG bytes`);
      assert.equal(sha256(image), readmeDigest, `${family}/${name}: README digest drift`);
      assert.equal(sha256(image), recordDigest, `${family}/${name}: central provenance digest drift`);
      assert.equal(image.length, Number(readmeBytes), `${family}/${name}: README byte count drift`);
      assert.equal(image.length, Number(recordBytes), `${family}/${name}: central provenance byte count drift`);
      const heading = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prompt = readme.match(new RegExp('### `' + heading + '`\\n\\n```text\\n([\\s\\S]*?)\\n```'));
      assert.ok(prompt, `${family}/${name}: exact prompt block absent`);
      assert.equal(sha256(prompt[1]), promptDigest, `${family}/${name}: exact prompt differs from recorded tool-call digest`);
    }
  }
});
