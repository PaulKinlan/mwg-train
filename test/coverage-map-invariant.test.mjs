import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_EDGES_SHA256 = '0643149478240a5b5591415f2db3ff97110f75502241eb18608546b247e16b0d';

test('the fast-gate coverage contract cannot silently lose any declared suite edge', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  const edges = Object.entries(mapping)
    .flatMap(([file, suites]) => suites.map((suite) => `${file}\t${suite}`))
    .sort();
  const actual = createHash('sha256').update(edges.join('\n')).digest('hex');
  // The mapping file routes changes to this test. An intentional addition or removal must update
  // this digest in a reviewed test diff; formatting and key order do not change the contract.
  assert.equal(actual, EXPECTED_EDGES_SHA256,
    `coverage edges changed (${edges.length} now); review the mapping diff before updating this digest`);
});

test('docs that quote token measurements route to their assertion suite', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  for (const file of ['docs/train/corpus/README.md', 'docs/train/READINESS-EPIC.md']) {
    assert.ok(mapping[file]?.includes('test/tokens-record.test.mjs'), `${file} must run its quoted-token assertions`);
  }
  assert.ok(mapping['docs/train/READINESS-EPIC.md'].includes('test/reachability.test.mjs'),
    'the readiness document must retain its reachability coverage');
});
