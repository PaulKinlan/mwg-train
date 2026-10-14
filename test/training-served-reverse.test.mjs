import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { checkProjectData } from '../scripts/check-pilot-served.mjs';
import { familyArchetype } from '../scripts/scaffold-training-corpus.mjs';
import { FRAMEWORKS } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const FALLBACK = ['GET /roster', 'GET /inbox', 'GET /attendees', 'GET /cart'];
// The training generator still serves these undeclared paths, in addition to the quartet above.
// This is a measured exception list, not permission to silently expand the generated route surface.
const SHARED = ['GET /__requests', 'GET /search', 'GET /intake',
  'GET /intake/confirm', 'GET /record/:ref'];
const RAW_ONLY = ['GET /draft'];
const HONO_ONLY = ['POST /draft', 'POST /intake', 'POST /intake/confirm'];

// Scope the scaffold to the no-list families (six × seven projects), not the full corpus.
// Each generated server is reverse-checked independently, without relying on a prior scaffold
// or another lane's ignored pilot/training-projects directory.
test('every no-list training family is reverse-checked across its seven frameworks', () => {
  const manifest = readFileSync(join(ROOT, 'docs/train/briefs/manifest.jsonl'), 'utf8')
    .trim().split('\n').map(JSON.parse).filter((row) => row.variant_of === null);
  const noListFamilies = manifest.filter((family) =>
    !familyArchetype(family, TRAINING_ARCHETYPES[family.archetype]).routes.some((route) => route.kind === 'list'));
  assert.deepEqual(noListFamilies.map((family) => family.family_id), ['tr-05', 'tr-31', 'tr-33', 'tr-35', 'tr-36', 'tr-37'],
    'new no-list families must be added to this reverse-direction guard');
  const familyIds = noListFamilies.map((family) => family.family_id);
  const out = mkdtempSync(join(tmpdir(), 'mwg-no-list-served-'));
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/scaffold-training-corpus.mjs'),
      '--out', out, '--families', familyIds.join(',')], { cwd: ROOT, timeout: 20_000, stdio: 'pipe' });
    const frameworkNames = Object.keys(FRAMEWORKS);
    assert.equal(frameworkNames.length, 7, 'each family is reverse-checked across seven frameworks');
    const projects = readdirSync(out).filter((name) => familyIds.some((id) => name.startsWith(`${id}-`))).sort();
    assert.deepEqual(projects, familyIds.flatMap((id) => frameworkNames.map((framework) => `${id}-${framework}`)).sort(),
      'all six no-list families must actually be scaffolded, not merely enumerated');
    for (const name of projects) {
      const dir = join(out, name);
      const spec = JSON.parse(readFileSync(join(dir, 'spec.json'), 'utf8'));
      assert.equal(spec.routes.some((route) => route.kind === 'list'), false, `${name} declares no list`);
      const server = readFileSync(join(dir, 'server.mjs'), 'utf8');
      const result = checkProjectData(name, spec.routes, server);
      assert.deepEqual(result.unparsedRoutes, [], `${name}: unparsed route syntax cannot count as coverage`);
      assert.deepEqual(result.declaredNotServed, [], `${name}: declared route must be served`);
      // tr-05 retains the generic GET /record/:ref fallback. The five newer families
      // declare their own read route and instead emit an undeclared POST /edit/:ref.
      const hasEdit = !name.startsWith('tr-05-');
      const expected = [
        ...FALLBACK,
        ...SHARED.filter((route) => !hasEdit || route !== 'GET /record/:ref'),
        ...(name.endsWith('-hono') ? HONO_ONLY : RAW_ONLY),
        ...(hasEdit ? ['POST /edit/:ref'] : []),
      ].sort();
      assert.deepEqual(result.servedNotDeclared.sort(), expected,
        `${name}: any new or removed served-but-undeclared route must be reconciled explicitly`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
