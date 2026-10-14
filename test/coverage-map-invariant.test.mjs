import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_EDGES_SHA256 = '5af05ec7ac53da985dc282beec115422ae834178d115563418760fe8d046e290';

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

test('documents with content assertions route to their citing suites', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  const required = {
    'docs/quarantine.md': ['test/docs.test.mjs', 'test/quarantine-store.test.mjs'],
    'docs/eval/PREREGISTRATION.md': ['test/briefs.test.mjs'],
    'docs/vocabulary.md': ['test/set-separation.test.mjs'],
    'docs/PIPELINE.md': ['test/pipeline-docs.test.mjs'],
    'docs/design.md': ['test/design-language.test.mjs'],
    'docs/train/briefs/EXPANSION-PLAN.md': ['test/expansion-matrix.test.mjs'],
    'docs/eval/pricing.sheets.md': ['test/pricing.test.mjs'],
    'docs/train/corpus/SERVED.md': ['test/served-routes.test.mjs'],
    'docs/provenance/assets/design-layouts.md': ['test/design-language.test.mjs'],
    'docs/provenance/assets/design-reference-booking.md': ['test/design-reference.test.mjs'],
    'docs/provenance/assets/archetype-asset-sets.md': ['test/archetype-assets.test.mjs'],
  };
  for (const [file, suites] of Object.entries(required)) {
    for (const suite of suites) {
      assert.ok(mapping[file]?.includes(suite), `${file} must run ${suite} when edited`);
    }
  }
  assert.deepEqual(mapping['docs/PIPELINE.md'], ['test/pipeline-docs.test.mjs'],
    'PIPELINE.md must not route to reachability, which does not read it');
});
