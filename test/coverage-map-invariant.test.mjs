import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_EDGES_SHA256 = 'f7c832f486e1bc3a5f5d020ba26202a1737404d2eb016942d4107bff70f8f090';

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
