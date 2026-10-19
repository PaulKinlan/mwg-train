// Copy inert paid-response bytes into a private, content-checked comparator cordon.
// This never executes generated code or requests a model. Permissions are not remote durability.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, repoIdentity } from '../provenance/store.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`);
function existingAncestor(path) {
  let ancestor = path;
  for (;;) {
    try {
      const stat = lstatSync(ancestor);
      // existsSync follows links and treats a dangling alias as an absent path. Refuse the
      // alias here, before mkdir, rather than relying on a later ENOENT from the copy.
      if (stat.isSymbolicLink() && !existsSync(ancestor)) {
        throw new Error('DANGLING_SYMLINK: cordon archive root crosses an unresolved symlink');
      }
      return ancestor;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const next = dirname(ancestor);
      if (next === ancestor) throw new Error('CORDON_DESTINATION_INVALID: no existing ancestor');
      ancestor = next;
    }
  }
}
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
function gitCheckout(dir) {
  try { return git(dir, 'rev-parse', '--show-toplevel'); }
  catch (error) {
    if (error.code === 'ETIMEDOUT' || error.killed)
      throw new Error('STORE_NOT_PRIVATE: Git destination verification timed out');
    // A plain private directory is safe; a bare or malformed Git repo is unverified.
    try { if (git(dir, 'rev-parse', '--is-bare-repository') === 'true') return dir; }
    catch { /* Look for an unreadable Git checkout before allowing a plain directory. */ }
    for (let ancestor = dir;; ancestor = dirname(ancestor)) {
      try { lstatSync(join(ancestor, '.git')); throw new Error('STORE_NOT_PRIVATE: unreadable Git destination'); }
      catch (markerError) { if (markerError.code !== 'ENOENT') throw markerError; }
      if (dirname(ancestor) === ancestor) break;
    }
    return null;
  }
}
function gitCommonDir(dir) {
  try { return realpathSync(git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir')); }
  catch { return null; }
}
// Never treat a filesystem path as owner/repo: repoIdentity would parse its final two components.
const networkRemote = (url) => /^(?:(?!file:)[a-z][a-z\d+.-]*:\/\/|[^/@:]+@[^/:]+:)/i.test(url);
function remoteEvidence(url, dir, publicRepo, publicIdentity, publicCommonDir, visited = new Set(), depth = 0) {
  if (networkRemote(url)) {
    const identity = repoIdentity(url);
    return !identity || !publicIdentity ? 'unknown' : identity === publicIdentity ? 'public' : 'private';
  }
  if (depth >= 3) return 'unknown';
  let target;
  try { target = realpathSync(url.startsWith('file://') ? fileURLToPath(url) : resolve(dir, url)); }
  catch { return 'unknown'; }
  if (target === publicRepo || (publicCommonDir && gitCommonDir(target) === publicCommonDir)) return 'public';
  if (visited.has(target)) return 'unknown';
  visited.add(target);
  try {
    const remotes = git(target, 'remote').split('\n').filter(Boolean);
    if (!remotes.length) return 'unknown';
    const evidence = remotes.map((name) => remoteEvidence(git(target, 'remote', 'get-url', name),
      target, publicRepo, publicIdentity, publicCommonDir, visited, depth + 1));
    return evidence.includes('public') ? 'public' : evidence.includes('private') ? 'private' : 'unknown';
  } catch { return 'unknown'; }
}
/** Refuse a public checkout (including symlink aliases and sibling worktrees) BEFORE creating anything. */
export function assertPrivateArchiveRoot(archiveRoot, { repoRoot = REPO_ROOT, sourceRoot = null } = {}) {
  const root = resolve(archiveRoot);
  const ancestor = existingAncestor(root);
  const realRoot = resolve(realpathSync(ancestor), relative(ancestor, root));
  const realRepo = realpathSync(repoRoot);
  if (inside(realRepo, realRoot) || (sourceRoot && inside(realpathSync(sourceRoot), realRoot))) {
    throw new Error('STORE_INSIDE_PUBLIC: cordon archive must be outside the public checkout and paid source');
  }
  // Plain private directories are allowed. Git destinations require positive evidence of a
  // non-public origin: a no-remote checkout could just be a public clone with its remote removed.
  const destination = gitCheckout(realpathSync(ancestor));
  if (!destination) return root;
  const publicCommonDir = gitCommonDir(realRepo);
  if (publicCommonDir && gitCommonDir(destination) === publicCommonDir)
    throw new Error('STORE_INSIDE_PUBLIC: cordon archive resolves inside another public checkout');
  let publicIdentity = null;
  try {
    const publicOrigin = git(realRepo, 'remote', 'get-url', 'origin');
    if (networkRemote(publicOrigin)) publicIdentity = repoIdentity(publicOrigin);
  } catch { /* No canonical public origin: Git destinations remain unverified. */ }
  try {
    const remotes = git(destination, 'remote').split('\n').filter(Boolean);
    let privateOrigin = false;
    for (const name of remotes) {
      const evidence = remoteEvidence(git(destination, 'remote', 'get-url', name), destination,
        realRepo, publicIdentity, publicCommonDir);
      if (evidence === 'public')
        throw new Error('STORE_INSIDE_PUBLIC: cordon archive resolves inside another public checkout');
      if (name === 'origin' && evidence === 'private') privateOrigin = true;
    }
    if (privateOrigin) return root;
  } catch (error) {
    if (error.message.startsWith('STORE_INSIDE_PUBLIC:')) throw error;
  }
  throw new Error('STORE_NOT_PRIVATE: Git archive destination has no verified non-public origin');
}
function scan(root, dir = root) {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error(`CORDON_UNSAFE_FILE: ${name}`);
    if (stat.isDirectory()) entries.push(...scan(root, path));
    else entries.push({ path: relative(root, path).split(sep).join('/'), bytes: stat.size, sha256: digest(readFileSync(path)) });
  }
  return entries;
}
function verify(root, files) {
  if (JSON.stringify(scan(root)) !== JSON.stringify(files)) throw new Error('CORDON_HASH_MISMATCH: original or retained file changed');
}
function copyTree(sourceRoot, source, target) {
  for (const name of readdirSync(source).sort()) {
    const path = join(source, name);
    const stat = lstatSync(path);
    if (!inside(sourceRoot, resolve(path)) || stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
      throw new Error(`CORDON_UNSAFE_FILE: ${name}`);
    const destination = join(target, name);
    if (stat.isDirectory()) {
      mkdirSync(destination, { mode: 0o700 });
      copyTree(sourceRoot, path, destination);
    } else copyFileSync(path, destination, constants.COPYFILE_EXCL);
  }
}
function sealTree(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (lstatSync(path).isDirectory()) sealTree(path);
    else chmodSync(path, 0o400);
  }
  chmodSync(dir, 0o500);
}

export function cordonDefaultRun({ runDir, archiveRoot }) {
  if (!runDir || !archiveRoot) throw new Error('runDir and archiveRoot are required');
  const source = resolve(runDir);
  const record = JSON.parse(readFileSync(join(source, 'run.json'), 'utf8'));
  if (record.backend !== 'live' || record.arm !== 'default' || !['SUCCESS', 'FAILED'].includes(record.status) ||
      !/^tr-\d{2}-(hono|raw|react|preact|vue|webcomponents|svelte)$/.test(record.project_id ?? '') ||
      !/^[0-9a-f]{64}$/.test(record.request_id ?? '') || !/^[0-9a-f]{64}$/.test(record.prompt_sha256 ?? ''))
    throw new Error('CORDON_NOT_LIVE_DEFAULT: paid run identity is incomplete or wrong arm');
  const rawPath = join(source, 'model-response.txt');
  const hasRaw = existsSync(rawPath);
  if (hasRaw !== Boolean(record.raw_response_sha256) ||
      (hasRaw && digest(readFileSync(rawPath)) !== record.raw_response_sha256))
    throw new Error('CORDON_RAW_MISMATCH: retained response differs from run record');
  const sourceFiles = scan(source);
  if (!sourceFiles.some((file) => file.path === 'run.json')) throw new Error('CORDON_NO_RECORD');
  const root = assertPrivateArchiveRoot(archiveRoot, { sourceRoot: source });
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const dest = join(root, `${record.project_id}-${record.request_id}`);
  if (existsSync(dest)) {
    const manifest = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
    if (manifest.request_id !== record.request_id || JSON.stringify(manifest.files) !== JSON.stringify(sourceFiles))
      throw new Error('CORDON_CONFLICT: existing identity differs; never overwrite');
    verify(join(dest, 'original'), manifest.files);
    return { destination: dest, manifest, resumed: true };
  }
  const temp = mkdtempSync(join(root, '.staging-'));
  try {
    const original = join(temp, 'original');
    mkdirSync(original, { mode: 0o700 });
    copyTree(source, source, original);
    verify(original, sourceFiles);
    verify(source, sourceFiles); // fail if the source mutated during the copy
    const manifest = { schema_version: 1, kind: 'untouched-default-comparator', excluded_from_training: true,
      approved_for_training: false, status: record.status, project_id: record.project_id, request_id: record.request_id,
      model: record.model, caller_supplied_revision: record.caller_supplied_revision,
      resolved_revision: record.resolved_revision, decode_config_sha256: record.decode_config_sha256,
      interface_contract_sha256: record.interface_contract_sha256, prompt_sha256: record.prompt_sha256,
      finish_reason: record.finish_reason, files: sourceFiles };
    writeFileSync(join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    sealTree(temp);
    // rename is atomic within this filesystem; never replace an existing destination.
    if (existsSync(dest)) throw new Error('CORDON_CONFLICT: concurrent destination');
    renameSync(temp, dest);
    return { destination: dest, manifest, resumed: false };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}
