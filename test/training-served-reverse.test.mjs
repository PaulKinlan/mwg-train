import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { checkProjectData } from '../scripts/check-pilot-served.mjs';
import { familyArchetype } from '../scripts/scaffold-training-corpus.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const FALLBACK = ['GET /roster', 'GET /inbox', 'GET /attendees', 'GET /cart'];
// The training generator still serves these undeclared paths, in addition to the quartet above.
// This is a measured exception list, not permission to silently expand the generated route surface.
const SHARED = ['GET /__requests', 'GET /search', 'GET /intake',
  'GET /intake/confirm', 'GET /record/:ref'];
const RAW_ONLY = ['GET /draft'];
const HONO_ONLY = ['POST /draft', 'POST /intake', 'POST /intake/confirm'];

// Scope the scaffold to the one no-list family: a full 210-project rebuild would slow every landing.
// The generator's emitted source is checked in both directions, with no dependency on a prior scaffold
// or on another lane's ignored pilot/training-projects directory.
test('every no-list training family is reverse-checked across its seven frameworks', () => {
  const manifest = readFileSync(join(ROOT, 'docs/train/briefs/manifest.jsonl'), 'utf8')
    .trim().split('\n').map(JSON.parse).filter((row) => row.variant_of === null);
  const noListFamilies = manifest.filter((family) =>
    !familyArchetype(family, TRAINING_ARCHETYPES[family.archetype]).routes.some((route) => route.kind === 'list'));
  assert.deepEqual(noListFamilies.map((family) => family.family_id), ['tr-05', 'tr-31', 'tr-33', 'tr-35', 'tr-36', 'tr-37'],
    'new no-list families must be added to this reverse-direction guard');
  const out = mkdtempSync(join(tmpdir(), 'mwg-tr05-served-'));
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/scaffold-training-corpus.mjs'),
      '--out', out, '--families', 'tr-05'], { cwd: ROOT, timeout: 20_000, stdio: 'pipe' });
    const projects = readdirSync(out).filter((name) => name.startsWith('tr-05-')).sort();
    assert.deepEqual(projects, ['tr-05-hono', 'tr-05-preact', 'tr-05-raw', 'tr-05-react',
      'tr-05-svelte', 'tr-05-vue', 'tr-05-webcomponents']);
    for (const name of projects) {
      const dir = join(out, name);
      const spec = JSON.parse(readFileSync(join(dir, 'spec.json'), 'utf8'));
      assert.equal(spec.routes.some((route) => route.kind === 'list'), false, `${name} declares no list`);
      const server = readFileSync(join(dir, 'server.mjs'), 'utf8');
      const result = checkProjectData(name, spec.routes, server);
      assert.deepEqual(result.unparsedRoutes, [], `${name}: unparsed route syntax cannot count as coverage`);
      assert.deepEqual(result.declaredNotServed, [], `${name}: declared route must be served`);
      const expected = [...FALLBACK, ...SHARED, ...(name === 'tr-05-hono' ? HONO_ONLY : RAW_ONLY)].sort();
      assert.deepEqual(result.servedNotDeclared.sort(), expected,
        `${name}: any new or removed served-but-undeclared route must be reconciled explicitly`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
