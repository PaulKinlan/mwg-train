import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, lstatSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateSlice, preflight } from '../scripts/default-set-preflight.mjs';
import manifest from '../docs/eval/default-set-hono-slice.json' with { type: 'json' };
import familyPins from '../docs/eval/family-interface-v1.hashes.json' with { type: 'json' };
import { RATIFIED_TR01_INTERFACE_SHA256 } from '../src/eval/interface-contract.mjs';
import { assertPrivateArchiveRoot, cordonDefaultRun } from '../src/eval/default-cordon.mjs';
import { main as cordonMain } from '../scripts/default-set-cordon.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
function removePrivateTree(root) {
  const openDirectories = (path) => {
    if (!lstatSync(path).isDirectory()) return;
    chmodSync(path, 0o700);
    for (const entry of readdirSync(path)) openDirectories(join(path, entry));
  };
  openDirectories(root);
  rmSync(root, { recursive: true, force: true });
}

test('cordon CLI refuses absent private paths without touching provider or archive', () => {
  assert.throws(() => cordonMain([]), /usage: default-set-cordon\.mjs/);
});

test('initial tranche is 30 disjoint unguided Hono identities and extension stays reserved', async () => {
  assert.equal(validateSlice(manifest).length, 30);
  assert.throws(() => validateSlice({ ...manifest, excluded_from_training: false }), /DEFAULT_SLICE_INVALID/);
  assert.throws(() => validateSlice({ ...manifest, initial_families: ['tr-01'] }), /DEFAULT_SLICE_INVALID/);
  const seen = [];
  const rows = await preflight({ manifest, revision: 'a'.repeat(40), generate: async (params) => {
    seen.push(params);
    return { status: 'DRY_RUN', prompt_sha256: sha(params.family), decode_config_sha256: sha('decode'),
      interface_contract_sha256: params.family === 'tr-01' ? RATIFIED_TR01_INTERFACE_SHA256 : familyPins.sha256[params.family] };
  } });
  assert.equal(rows.length, 30);
  assert.deepEqual(seen.map(({ family }) => family), manifest.initial_families);
  assert.ok(seen.every((row) => row.dryRun && row.backend === 'stub' && row.guidance === '' && row.arm === 'default'));
});

test('public checkout and symlinked archive aliases refuse before writing paid bytes', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'cordon-public-guard-'));
  t.after(() => removePrivateTree(temp));
  const publicRepo = join(temp, 'repo');
  mkdirSync(publicRepo);
  mkdirSync(join(temp, 'run'));
  const alias = join(temp, 'repo-alias');
  symlinkSync(publicRepo, alias, 'dir');
  assert.throws(() => assertPrivateArchiveRoot(join(publicRepo, 'docs', 'raw'), { repoRoot: publicRepo }), /STORE_INSIDE_PUBLIC/);
  assert.throws(() => assertPrivateArchiveRoot(join(alias, 'docs', 'raw'), { repoRoot: publicRepo }), /STORE_INSIDE_PUBLIC/);
  assert.throws(() => assertPrivateArchiveRoot(join(temp, 'run', 'archive'), { repoRoot: publicRepo, sourceRoot: join(temp, 'run') }), /STORE_INSIDE_PUBLIC/);
  assert.equal(assertPrivateArchiveRoot(join(temp, 'private', 'archive'), { repoRoot: publicRepo }), join(temp, 'private', 'archive'));
  const siblingPublicCheckout = join(temp, 'another-public-checkout');
  mkdirSync(siblingPublicCheckout);
  const publicOrigin = 'https://example.invalid/example/public-checkout.git';
  for (const checkout of [publicRepo, siblingPublicCheckout]) {
    execFileSync('git', ['init', '--quiet', checkout]);
    execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', publicOrigin]);
  }
  assert.throws(() => assertPrivateArchiveRoot(join(siblingPublicCheckout, 'paid-output'), { repoRoot: publicRepo }),
    /STORE_INSIDE_PUBLIC.*another public checkout/);
  // The real call must also refuse a public checkout path without creating the archive directory.
  const runDir = join(temp, 'run');
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ status: 'FAILED', backend: 'live', arm: 'default',
    project_id: 'tr-04-hono', request_id: 'a'.repeat(64), prompt_sha256: 'b'.repeat(64) }));
  const publicDestination = join(new URL('..', import.meta.url).pathname, 'docs', `.cordon-test-${process.pid}`);
  assert.throws(() => cordonDefaultRun({ runDir, archiveRoot: publicDestination }), /STORE_INSIDE_PUBLIC/);
  assert.equal(existsSync(publicDestination), false);
});

test('private cordon retains paid success bytes and hashes; repeat verifies, corruption and symlink refuse', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'default-cordon-'));
  t.after(() => removePrivateTree(temp));
  const runDir = join(temp, 'run');
  mkdirSync(join(runDir, 'project'), { recursive: true });
  const raw = '{"files":[]}';
  const record = { status: 'SUCCESS', backend: 'live', arm: 'default', project_id: 'tr-01-hono',
    request_id: 'a'.repeat(64), prompt_sha256: 'b'.repeat(64), raw_response_sha256: sha(raw),
    model: 'deepseek/deepseek-flash', caller_supplied_revision: 'c'.repeat(40),
    resolved_revision: 'UNVERIFIED', decode_config_sha256: 'd'.repeat(64),
    interface_contract_sha256: 'e'.repeat(64), finish_reason: 'stop' };
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(record));
  writeFileSync(join(runDir, 'model-response.txt'), raw);
  assert.throws(() => {
    writeFileSync(join(runDir, 'run.json'), JSON.stringify({ ...record, raw_response_sha256: null }));
    try { cordonDefaultRun({ runDir, archiveRoot: join(temp, 'archive') }); }
    finally { writeFileSync(join(runDir, 'run.json'), JSON.stringify(record)); }
  }, /CORDON_RAW_MISMATCH/);
  writeFileSync(join(runDir, 'project', 'server.mjs'), 'inert data');
  const archiveRoot = join(temp, 'archive');
  const first = cordonDefaultRun({ runDir, archiveRoot });
  assert.equal(first.resumed, false);
  assert.equal(first.manifest.excluded_from_training, true);
  assert.equal(first.manifest.files.length, 3);
  assert.equal(cordonDefaultRun({ runDir, archiveRoot }).resumed, true);
  // chmod is not immutability: prove the digest check catches operator-side mutation.
  chmodSync(first.destination, 0o700);
  chmodSync(join(first.destination, 'original'), 0o700);
  chmodSync(join(first.destination, 'original', 'project'), 0o700);
  chmodSync(join(first.destination, 'original', 'project', 'server.mjs'), 0o600);
  writeFileSync(join(first.destination, 'original', 'project', 'server.mjs'), 'changed');
  assert.throws(() => cordonDefaultRun({ runDir, archiveRoot }), /CORDON_HASH_MISMATCH/);
  rmSync(first.destination, { recursive: true, force: true });
  symlinkSync(join(runDir, 'run.json'), join(runDir, 'project', 'alias'));
  assert.throws(() => cordonDefaultRun({ runDir, archiveRoot }), /CORDON_UNSAFE_FILE/);
});

test('failed paid generation with no project is retained, not silently dropped', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'default-failure-cordon-'));
  t.after(() => removePrivateTree(temp));
  const runDir = join(temp, 'run');
  mkdirSync(runDir);
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ status: 'FAILED', backend: 'live', arm: 'default',
    project_id: 'tr-02-hono', request_id: 'f'.repeat(64), prompt_sha256: 'a'.repeat(64), finish_reason: 'length' }));
  const result = cordonDefaultRun({ runDir, archiveRoot: join(temp, 'archive') });
  assert.equal(result.manifest.status, 'FAILED');
  assert.equal(result.manifest.finish_reason, 'length');
  assert.equal(result.manifest.files.length, 1);
});
