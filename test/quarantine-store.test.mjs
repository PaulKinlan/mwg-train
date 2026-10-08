/**
 * Quarantine store tests: the default-write routing, the fail-closed store verification, and the
 * explicit promote step. Real (tiny, local) git repos stand in for the public repo and the store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { quarantineRoot, assertQuarantineStore, armStorageRoot, assetStoragePath, QuarantineError } from '../src/provenance/store.mjs';

function gitRepo(dir, origin) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', dir]);
  if (origin) execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', origin]);
  return dir;
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'quarantine-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const publicRepo = gitRepo(join(root, 'mwg-train'), 'https://github.example/PaulKinlan/mwg-train');
  const store = gitRepo(join(root, 'mwg-quarantine'), 'https://github.example/PaulKinlan/mwg-quarantine');
  return { root, publicRepo, store };
}

test('the default store is a sibling checkout; overrides must be absolute', () => {
  assert.equal(quarantineRoot({ repoRoot: '/srv/mwg-train', env: {} }), '/srv/mwg-quarantine');
  assert.equal(quarantineRoot({ repoRoot: '/srv/mwg-train', env: { MWG_TRAIN_QUARANTINE: '/elsewhere/store' } }), '/elsewhere/store');
  assert.throws(() => quarantineRoot({ repoRoot: '/srv/mwg-train', env: { MWG_TRAIN_QUARANTINE: 'relative/path' } }), QuarantineError);
});

test('store verification is fail-closed', (t) => {
  const { root, publicRepo, store } = fixture(t);
  // missing checkout
  assert.throws(() => assertQuarantineStore(join(root, 'nope'), { repoRoot: publicRepo }), /STORE_MISSING/);
  // inside the public repo
  const inside = gitRepo(join(publicRepo, 'quarantine'), 'https://github.example/PaulKinlan/mwg-quarantine');
  assert.throws(() => assertQuarantineStore(inside, { repoRoot: publicRepo }), /STORE_INSIDE_PUBLIC/);
  // not a git checkout
  const plain = join(root, 'plain');
  mkdirSync(plain);
  assert.throws(() => assertQuarantineStore(plain, { repoRoot: publicRepo }), /STORE_NOT_GIT/);
  // the store IS the public repo's origin
  const same = gitRepo(join(root, 'twin'), 'https://github.example/PaulKinlan/mwg-train');
  assert.throws(() => assertQuarantineStore(same, { repoRoot: publicRepo }), /STORE_IS_PUBLIC_REPO/);
  // the real thing passes
  assert.equal(assertQuarantineStore(store, { repoRoot: publicRepo }), store);
});

test('default-write routing: quarantined arms go to the store, cleared arms to the public tree', (t) => {
  const { publicRepo, store } = fixture(t);
  assert.equal(
    armStorageRoot('A3_teacher_generated', { repoRoot: publicRepo, quarantineRoot: store }),
    join(store, 'data/A3_teacher_generated'),
  );
  assert.equal(armStorageRoot('A1_self_generated', { repoRoot: publicRepo, quarantineRoot: store }), join(publicRepo, 'data/A1_self_generated'));
  // path traversal is refused even before routing
  assert.throws(() => assetStoragePath('A1_self_generated', '../escape', { repoRoot: publicRepo, quarantineRoot: store }), /must not contain empty/);
});

test('promote: explicit, ledgered, and refuses quarantined arms without acknowledgement', (t) => {
  const { root, publicRepo, store } = fixture(t);
  const material = join(store, 'data/A3_teacher_generated/sites/example');
  mkdirSync(material, { recursive: true });
  writeFileSync(join(material, 'index.html'), '<h1>teacher material</h1>');
  execFileSync('git', ['-C', store, 'add', '.']);
  execFileSync('git', ['-C', store, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'material']);

  const run = (argv) => {
    const script = new URL('../scripts/promote.mjs', import.meta.url).pathname;
    try {
      const stdout = execFileSync('node', [script, ...argv], {
        cwd: publicRepo,
        encoding: 'utf8',
        env: { ...process.env, MWG_TRAIN_QUARANTINE: store, MWG_TRAIN_REPO: publicRepo },
      });
      return { code: 0, stdout };
    } catch (error) {
      return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
  };

  // quarantined arm without acknowledgement: refused
  const refused = run(['data/A3_teacher_generated/sites/example', 'docs/promoted-example']);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /PUBLICATION boundary/);
  assert.equal(existsSync(join(publicRepo, 'docs/promoted-example')), false);

  // with acknowledgement: copied and ledgered
  const ok = run(['data/A3_teacher_generated/sites/example', 'docs/promoted-example', '--acknowledge-boundary']);
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(readFileSync(join(publicRepo, 'docs/promoted-example/index.html'), 'utf8'), '<h1>teacher material</h1>');
  const ledger = readFileSync(join(publicRepo, 'docs/provenance/promotions.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].arm, 'A3_teacher_generated');
  assert.equal(ledger[0].from, 'data/A3_teacher_generated/sites/example');
  assert.match(ledger[0].quarantine_head, /^[0-9a-f]{40}$/);
  assert.equal(ledger[0].note.includes('excluded_from_training unchanged'), true);

  // the same target again: refused (promotions are additive)
  const again = run(['data/A3_teacher_generated/sites/example', 'docs/promoted-example', '--acknowledge-boundary']);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /already exists/);

  // escape attempts: refused
  assert.equal(run(['../outside', 'docs/x', '--acknowledge-boundary']).code, 1);
  assert.equal(run(['data/A3_teacher_generated/sites/example', '../outside', '--acknowledge-boundary']).code, 1);
});
