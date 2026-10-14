import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_EDGES_SHA256 = '76d1e6df6576ae764dce1884e075c613431d9c362ea712ccf934c449c0818aea';

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

test('deleting the mapping self-entry cannot bypass the edge hash', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-map-self-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const mapping = JSON.parse(readFileSync(resolve(ROOT, '.fleet/coverage-mapping.json'), 'utf8'));
  delete mapping['.fleet/coverage-mapping.json'];
  const fixture = join(dir, 'mapping.json');
  writeFileSync(fixture, JSON.stringify(mapping));
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/fast-gate.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      FAST_GATE_COVERAGE_MAP: fixture,
      FAST_GATE_LIST: '1',
      GIT_CHANGED: '.fleet/coverage-mapping.json',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /suites=\[[^\]]*test\/coverage-map-invariant\.test\.mjs/,
    'the gate must select this test independently of the editable mapping');
});
