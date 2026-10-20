import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
// 2026-10-20 (mwg-train-601b): scripts/generate-archetype-light-dark.mjs also routes to
// test/interactive-product-configurator-prompts.test.mjs, which now asserts the pinned step-name labels on the
// interactive-product-configurator override prose that regenerates the served Light set and its Dark twins.
const EXPECTED_EDGES_SHA256 = '9e3c451f6e7b53c1dff6042284e6913393b6a7b25003252c7e33589ade373c01';

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

test('multi-step reload and opt-in non-form state paths route to their focused regressions', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  assert.ok(mapping['src/corpus/cdp.mjs']?.includes('test/cdp-reload.test.mjs'));
  assert.ok(mapping['src/corpus/harness.mjs']?.includes('test/step-persistence.test.mjs'));
  assert.ok(mapping['src/corpus/accept.mjs']?.includes('test/step-persistence.test.mjs'));
  assert.ok(mapping['src/corpus/state-persistence.mjs']?.includes('test/state-persistence.test.mjs'));
  assert.ok(mapping['src/eval/spec.mjs']?.includes('test/state-persistence.test.mjs'));
  assert.ok(mapping['scripts/rebuild-from-spec.mjs']?.includes('test/step-persistence.test.mjs'));
});

test('runtime quality diagnostics route to their real-browser regression', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  assert.deepEqual(mapping['src/corpus/eval.mjs'], ['test/runtime-quality.test.mjs']);
});

test('changes to optional browser diagnostics rerun their real-browser regression', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  assert.ok(mapping['src/corpus/harness.mjs'].includes('test/modern-rules.test.mjs'));
  assert.ok(mapping['src/corpus/modern-rules.mjs'].includes('test/modern-rules.test.mjs'));
  assert.ok(mapping['src/corpus/modern-rules.mjs'].includes('test/view-transition-callback.test.mjs'));
});

test('ratified interface source, preview CLI and contract block route to the no-spend regression', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  for (const file of ['src/eval/interface-contract.mjs', 'src/eval/interface-candidate.mjs',
    'src/eval/generator.mjs', 'scripts/generate-candidate.mjs', 'docs/eval/decode-config.deepseek-flash.json',
    'docs/eval/interface-contract.tr-01.candidate.md', 'docs/eval/PREREGISTRATION.md']) {
    assert.ok(mapping[file]?.includes('test/interface-candidate.test.mjs'),
      `${file} must rerun the arm-parity and contract checks`);
  }
});

test('pilot corpus metadata serializer and manifest both route to lineage checks', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  for (const file of ['scripts/pilot-corpus.mjs', 'pilot/CORPUS.json']) {
    assert.ok(mapping[file]?.includes('test/pilot-corpus-run-metadata.test.mjs'),
      `${file} must rerun the run-versus-hash-derivation lineage checks`);
  }
  assert.ok(mapping['src/viewer/corpus.mjs']?.includes('test/viewer-corpus.test.mjs'),
    'the current-vs-historical acceptance projection must rerun when its viewer model changes');
});

test('the puzzle generator and its provenance both route to the no-network attestation regression', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  for (const file of ['scripts/generate-archetype-light-dark.mjs',
    'docs/design/archetypes/browser-puzzle-game/PROVENANCE.md']) {
    assert.ok(mapping[file]?.includes('test/browser-puzzle-board-provenance.test.mjs'),
      `${file} must run the scratch-import and unverified-provenance assertions`);
  }
});

test('dark-mode board changes and provenance records route to their byte-identity regression', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  for (const file of ['docs/design/archetypes/*/dark/*',
    'docs/provenance/assets/archetype-dark-boards.json', 'docs/provenance/assets/archetype-dark-boards.md']) {
    assert.ok(mapping[file]?.includes('test/archetype-dark-provenance.test.mjs'),
      `${file} must rerun the complete 106-board inventory`);
  }
  for (const file of ['docs/provenance/assets/archetype-dark-boards.json',
    'docs/provenance/assets/archetype-dark-boards.md']) {
    assert.ok(mapping[file]?.includes('test/baseline-label.test.mjs'),
      `${file} must rerun the floor-report classification guard`);
  }
});

test('docs that quote token measurements route to their assertion suite', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  for (const file of ['docs/train/corpus/README.md', 'docs/train/READINESS-EPIC.md']) {
    assert.ok(mapping[file]?.includes('test/tokens-record.test.mjs'), `${file} must run its quoted-token assertions`);
  }
  assert.ok(mapping['docs/train/READINESS-EPIC.md'].includes('test/reachability.test.mjs'),
    'the readiness document must retain its reachability coverage');
});

test('the tr-01 live verifier routes to both transport decision and CLI regressions', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  assert.deepEqual(mapping['scripts/verify-tr01-live-slice.mjs'], [
    'test/live-slice-verdict.test.mjs', 'test/tr01-live-slice-cli.test.mjs',
  ]);
});

test('documents with content assertions route to their citing suites', () => {
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  const required = {
    'docs/quarantine.md': ['test/docs.test.mjs', 'test/quarantine-store.test.mjs'],
    'docs/eval/PREREGISTRATION.md': ['test/briefs.test.mjs'],
    'docs/eval/default-set-hono-tranche-2026-10-19.json': ['test/default-set-tranche.test.mjs'],
    'docs/eval/default-set-step4-hono-2026-10-19.json': ['test/default-step4-report.test.mjs'],
    'docs/eval/default-set-step4-2026-10-19.md': ['test/default-step4-report.test.mjs'],
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
