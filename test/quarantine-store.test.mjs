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

test('promote: --arm cannot launder a quarantined source, and ./ prefixes do not dodge the check', (t) => {
  const { publicRepo, store } = fixture(t);
  const material = join(store, 'data/A3_teacher_generated/sites/example');
  mkdirSync(material, { recursive: true });
  writeFileSync(join(material, 'index.html'), 'x');
  const run = (argv) => {
    const script = new URL('../scripts/promote.mjs', import.meta.url).pathname;
    try {
      execFileSync('node', [script, ...argv], { cwd: publicRepo, encoding: 'utf8', env: { ...process.env, MWG_TRAIN_QUARANTINE: store, MWG_TRAIN_REPO: publicRepo } });
      return { code: 0 };
    } catch (error) {
      return { code: error.status, stderr: error.stderr ?? '' };
    }
  };
  // claiming the source is a cleared arm: refused as contradictory
  const laundering = run(['data/A3_teacher_generated/sites/example', 'docs/laundered', '--arm', 'A1_self_generated']);
  assert.equal(laundering.code, 1);
  assert.match(laundering.stderr, /contradicts/);
  assert.equal(existsSync(join(publicRepo, 'docs/laundered')), false);
  // a ./-prefixed path is still derived as A3: refused without the acknowledgement
  const dodged = run(['./data/A3_teacher_generated/sites/example', 'docs/dodged']);
  assert.equal(dodged.code, 1);
  assert.match(dodged.stderr, /PUBLICATION boundary/);
});

test('promote: symlinks cannot escape the store or the public repo', (t) => {
  const { root, publicRepo, store } = fixture(t);
  const outside = join(root, 'secret');
  mkdirSync(outside);
  writeFileSync(join(outside, 's.txt'), 'secret');
  // symlink inside the store pointing outside it
  execFileSync('ln', ['-s', outside, join(store, 'leak')]);
  const script = new URL('../scripts/promote.mjs', import.meta.url).pathname;
  const run = (argv) => {
    try {
      execFileSync('node', [script, ...argv], { cwd: publicRepo, encoding: 'utf8', env: { ...process.env, MWG_TRAIN_QUARANTINE: store, MWG_TRAIN_REPO: publicRepo } });
      return { code: 0 };
    } catch (error) {
      return { code: error.status, stderr: error.stderr ?? '' };
    }
  };
  const leakSource = run(['leak', 'docs/leak', '--acknowledge-boundary']);
  assert.equal(leakSource.code, 1);
  assert.match(leakSource.stderr, /resolves outside the quarantine store/);
  // symlinked target parent pointing outside the public repo
  mkdirSync(join(publicRepo, 'docs'), { recursive: true });
  execFileSync('ln', ['-s', outside, join(publicRepo, 'docs', 'escape')]);
  writeFileSync(join(store, 'ok.txt'), 'ok');
  const leakTarget = run(['ok.txt', 'docs/escape/file.txt', '--arm', 'A1_self_generated', '--acknowledge-boundary']);
  assert.equal(leakTarget.code, 1);
  assert.match(leakTarget.stderr, /resolves outside the public repo/);
  assert.equal(existsSync(join(outside, 'file.txt')), false);
});

test('store verification: a child directory of an unrelated checkout is not a store', (t) => {
  const { root, publicRepo } = fixture(t);
  const unrelated = join(root, 'someone-elses-repo');
  mkdirSync(join(unrelated, 'sub', 'dir'), { recursive: true });
  execFileSync('git', ['init', '-q', unrelated]);
  execFileSync('git', ['-C', unrelated, 'remote', 'add', 'origin', 'https://github.example/other/repo']);
  assert.throws(() => assertQuarantineStore(join(unrelated, 'sub', 'dir'), { repoRoot: publicRepo }), /STORE_NOT_WORKTREE_ROOT/);
});

test('an arm path symlinked into the public tree refuses the write path', (t) => {
  const { publicRepo, store } = fixture(t);
  const publicData = join(publicRepo, 'data', 'A3_teacher_generated');
  mkdirSync(publicData, { recursive: true });
  mkdirSync(join(store, 'data'), { recursive: true });
  execFileSync('ln', ['-s', publicData, join(store, 'data', 'A3_teacher_generated')]);
  assert.throws(() => armStorageRoot('A3_teacher_generated', { repoRoot: publicRepo, quarantineRoot: store }), /SYMLINK_ESCAPE/);
});

test('promote: a subtree spanning quarantined arms still requires acknowledgement', (t) => {
  const { root, publicRepo, store } = fixture(t);
  mkdirSync(join(store, 'data/A3_teacher_generated/x'), { recursive: true });
  writeFileSync(join(store, 'data/A3_teacher_generated/x/f.txt'), 'x');
  const script = new URL('../scripts/promote.mjs', import.meta.url).pathname;
  const run = (argv) => {
    try {
      execFileSync('node', [script, ...argv], { cwd: publicRepo, encoding: 'utf8', env: { ...process.env, MWG_TRAIN_QUARANTINE: store, MWG_TRAIN_REPO: publicRepo } });
      return { code: 0 };
    } catch (error) {
      return { code: error.status, stderr: error.stderr ?? '' };
    }
  };
  // promoting the whole data/ tree covers A3: refused without acknowledgement
  const subtree = run(['data', 'docs/data-copy']);
  assert.equal(subtree.code, 1);
  assert.match(subtree.stderr, /quarantined arm\(s\) A3_teacher_generated/);
  // and a path that is in no arm must name one explicitly
  writeFileSync(join(store, 'loose.txt'), 'loose');
  const loose = run(['loose.txt', 'docs/loose.txt']);
  assert.equal(loose.code, 1);
  assert.match(loose.stderr, /cannot determine the arm/);
  // the store ROOT is never a promotion source (it contains every quarantined arm)
  const rootPromotion = run(['.', 'docs/everything', '--arm', 'A1_self_generated', '--acknowledge-boundary']);
  assert.equal(rootPromotion.code, 1);
  assert.match(rootPromotion.stderr, /store root/);
});

test('the store must be the expected companion repo, not merely a different URL string', (t) => {
  const { root, publicRepo } = fixture(t);
  // SSH-vs-HTTPS forms of the PUBLIC repo: string-unequal, but the same repository - refused.
  const sshTwin = gitRepo(join(root, 'ssh-twin'), 'git@github.example:PaulKinlan/mwg-train.git');
  assert.throws(() => assertQuarantineStore(sshTwin, { repoRoot: publicRepo }), /STORE_IS_PUBLIC_REPO/);
  // A genuinely different repo that is NOT the companion: refused.
  const wrong = gitRepo(join(root, 'wrong'), 'https://github.example/PaulKinlan/some-other-repo');
  assert.throws(() => assertQuarantineStore(wrong, { repoRoot: publicRepo }), /STORE_WRONG_REPO/);
});

test('a dangling symlink as the asset file is refused (existsSync follows links)', (t) => {
  const { root, publicRepo, store } = fixture(t);
  mkdirSync(join(store, 'data', 'A3_teacher_generated'), { recursive: true });
  // A symlink whose target does NOT exist yet: existsSync says 'absent', but writeFileSync would
  // follow it and create the file OUTSIDE the store.
  execFileSync('ln', ['-s', join(root, 'outside-target.txt'), join(store, 'data', 'A3_teacher_generated', 'evil.txt')]);
  assert.throws(
    () => assetStoragePath('A3_teacher_generated', 'evil.txt', { repoRoot: publicRepo, quarantineRoot: store }),
    /DANGLING_SYMLINK/,
  );
});

test('asset paths check every intermediate component for symlink escapes', (t) => {
  const { publicRepo, store } = fixture(t);
  mkdirSync(join(publicRepo, 'data', 'leaked'), { recursive: true });
  mkdirSync(join(store, 'data', 'A3_teacher_generated'), { recursive: true });
  execFileSync('ln', ['-s', join(publicRepo, 'data', 'leaked'), join(store, 'data', 'A3_teacher_generated', 'sites')]);
  assert.throws(
    () => assetStoragePath('A3_teacher_generated', 'sites/evil.html', { repoRoot: publicRepo, quarantineRoot: store }),
    /SYMLINK_ESCAPE/,
  );
  // and a clean path works
  assert.ok(assetStoragePath('A3_teacher_generated', 'real/file.html', { repoRoot: publicRepo, quarantineRoot: store }).startsWith(store));
});

test('A6 (eval material) is never trainable but publishes publicly', (t) => {
  const { publicRepo, store } = fixture(t);
  assert.equal(armStorageRoot('A6_evaluation', { repoRoot: publicRepo, quarantineRoot: store }), join(publicRepo, 'data/A6_evaluation'));
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
