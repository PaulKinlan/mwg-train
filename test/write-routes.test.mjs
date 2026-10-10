import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ARCHETYPES, ARCHETYPE_IDS } from '../pilot/archetypes.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';
import { FRAMEWORKS } from '../pilot/frameworks.mjs';
import { buildProjectFromSpec, specForFamily, SPECS_DIR } from '../src/eval/spec.mjs';
import { extractRoutes } from '../scripts/check-pilot-served.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Bead mwg-train-vre:
 *
 * In `pilot/frameworks.mjs`, write routes are extracted using Array.prototype.find():
 *   const writeRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
 *
 * At lines 145 (formMarkup), 782 (serverSource), and 1114 (honoServerSource), this find()
 * reduces any declared list of write routes to its first element. Any subsequent write route
 * is silently dropped during generation.
 *
 * `account-recovery` is currently the ONLY archetype declaring multiple write routes
 * (POST /signup and POST /reset). Because 35 pilot trees are byte-frozen in pilot/CORPUS.json
 * (checked by check:specs), fixing the generator in-place would alter 7 frozen trees and break
 * byte invariance until a full corpus re-record can be performed.
 *
 * These tests fail closed:
 *   1. Assert that account-recovery is the only multi-write archetype in the repository.
 *   2. Assert that all declared write routes are served across all archetypes and frameworks,
 *      failing closed on any unexcused drop.
 *   3. Enforce staleness on the single known exception (account-recovery POST /reset), so the test
 *      fails as soon as the generator is corrected and the corpus is re-recorded.
 *   4. Verify that synthetic multi-write archetypes bite and fail closed if a second write route is dropped.
 *   5. Pin the exact find() sites in pilot/frameworks.mjs to prevent silent proliferation.
 */

// Known, reasoned exceptions to declared write routes being served.
// Currently, only account-recovery has POST /reset dropped due to mwg-train-vre.
const KNOWN_WRITE_ROUTE_EXCEPTIONS = new Set([
  'account-recovery:POST /reset',
]);

test('spec audit: account-recovery is the only archetype declaring multiple write routes', () => {
  const multiWrite = [];

  // Check specs in docs/eval/specs/
  const specsDir = join(ROOT, SPECS_DIR);
  for (const file of readdirSync(specsDir)) {
    if (!file.endsWith('.json')) continue;
    const spec = JSON.parse(readFileSync(join(specsDir, file), 'utf8'));
    const writes = (spec.routes ?? []).filter((r) => r.method === 'POST' && r.kind?.startsWith('write'));
    if (writes.length > 1) {
      multiWrite.push({ source: `spec ${file}`, id: spec.family_id, writes: writes.map((w) => w.path) });
    }
  }

  // Check pilot archetypes
  for (const [id, arch] of Object.entries(ARCHETYPES)) {
    const writes = (arch.routes ?? []).filter((r) => r.method === 'POST' && r.kind?.startsWith('write'));
    if (writes.length > 1 && !multiWrite.some((m) => m.id === id)) {
      multiWrite.push({ source: 'pilot archetype', id, writes: writes.map((w) => w.path) });
    }
  }

  // Check training archetypes
  for (const [id, arch] of Object.entries(TRAINING_ARCHETYPES)) {
    const writes = (arch.routes ?? []).filter((r) => r.method === 'POST' && r.kind?.startsWith('write'));
    if (writes.length > 1) {
      multiWrite.push({ source: 'training archetype', id, writes: writes.map((w) => w.path) });
    }
  }

  assert.equal(
    multiWrite.length,
    1,
    `expected exactly 1 multi-write archetype across the repository, found ${multiWrite.length}: ${JSON.stringify(multiWrite)}`,
  );
  assert.equal(multiWrite[0].id, 'account-recovery', 'account-recovery must be the sole multi-write archetype');
  assert.deepEqual(multiWrite[0].writes, ['/signup', '/reset'], 'account-recovery declares /signup and /reset');
});

test('fail-closed write route parity check across all archetypes and frameworks', () => {
  const frameworks = Object.keys(FRAMEWORKS);
  const failures = [];
  const usedExceptions = new Set();

  for (const familyId of ARCHETYPE_IDS) {
    const spec = specForFamily(familyId, ROOT);
    const declaredWrites = (spec.routes ?? []).filter((r) => r.method === 'POST' && r.kind?.startsWith('write'));

    for (const frameworkName of frameworks) {
      const built = buildProjectFromSpec({ spec, frameworkName, defects: [] });
      const extracted = extractRoutes(built.files['server.mjs']);
      const servedWrites = new Set([...extracted.served].filter((r) => r.startsWith('POST')));

      for (const dw of declaredWrites) {
        const routeKey = `${dw.method} ${dw.path}`;
        const excKey = `${familyId}:${routeKey}`;
        const isServed = servedWrites.has(routeKey);
        const isExcused = KNOWN_WRITE_ROUTE_EXCEPTIONS.has(excKey);

        if (!isServed) {
          if (isExcused) {
            usedExceptions.add(excKey);
          } else {
            failures.push(`${familyId}/${frameworkName}: declared write route ${routeKey} is NOT served`);
          }
        } else if (isExcused) {
          failures.push(`STALE EXCEPTION: ${familyId}/${frameworkName} now serves ${routeKey}; remove from KNOWN_WRITE_ROUTE_EXCEPTIONS`);
        }
      }
    }
  }

  // Staleness enforcement: every entry in KNOWN_WRITE_ROUTE_EXCEPTIONS must have been exercised
  for (const exc of KNOWN_WRITE_ROUTE_EXCEPTIONS) {
    assert.ok(
      usedExceptions.has(exc),
      `KNOWN_WRITE_ROUTE_EXCEPTIONS has unused/stale entry: ${exc}`,
    );
  }

  assert.deepEqual(failures, [], `write route parity check failed:\n${failures.join('\n')}`);
});

test('synthetic multi-write archetype: check fails closed when second write route is dropped', () => {
  // Take a base single-write spec and add a second declared write route
  const baseSpec = specForFamily('booking', ROOT);
  const syntheticSpec = {
    ...baseSpec,
    family_id: 'synthetic-multi-write',
    routes: [
      ...baseSpec.routes,
      {
        method: 'POST',
        path: '/booking/cancel',
        kind: 'write-cancel',
        redirect: '/booking',
        effect: 'cancel booking and redirect',
      },
    ],
  };

  const declaredWrites = syntheticSpec.routes.filter((r) => r.method === 'POST' && r.kind?.startsWith('write'));
  assert.equal(declaredWrites.length, 2, 'synthetic spec must declare 2 write routes');

  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    const built = buildProjectFromSpec({ spec: syntheticSpec, frameworkName, defects: [] });
    const extracted = extractRoutes(built.files['server.mjs']);
    const servedWrites = new Set([...extracted.served].filter((r) => r.startsWith('POST')));

    // Confirm that the generator currently drops POST /booking/cancel
    assert.ok(servedWrites.has('POST /book'), `${frameworkName} should serve the first write route`);
    assert.ok(
      !servedWrites.has('POST /booking/cancel'),
      `${frameworkName} should have dropped the second write route (generator find() defect)`,
    );

    // Assert that comparing declared vs served catches the drop
    const missing = declaredWrites.filter((w) => !servedWrites.has(`${w.method} ${w.path}`));
    assert.equal(missing.length, 1, 'exactly 1 write route must be detected as missing');
    assert.equal(missing[0].path, '/booking/cancel', 'the dropped write route must be /booking/cancel');
  }
});

test('static generator audit: pin find() drop sites in pilot/frameworks.mjs', () => {
  const frameworksSource = readFileSync(join(ROOT, 'pilot', 'frameworks.mjs'), 'utf8');

  // Verify the exact pattern that causes the drop: Array.prototype.find on write routes
  const findMatches = [...frameworksSource.matchAll(/routes\.find\(\s*\([^)]+\)\s*=>\s*[^;]*method\s*===\s*['"]POST['"][^;]*write[^;]*\)/g)];

  // Expected sites:
  // 1. formMarkup (around line 145)
  // 2. serverSource (around line 782)
  // 3. honoServerSource (around line 1114)
  assert.equal(
    findMatches.length,
    3,
    `expected exactly 3 find() reductions of write routes in pilot/frameworks.mjs, found ${findMatches.length}`,
  );
});
