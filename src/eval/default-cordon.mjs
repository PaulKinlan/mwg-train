// Copy inert paid-response bytes into a private, content-checked comparator cordon.
// This never executes generated code or requests a model. Permissions are not remote durability.
import { createHash } from 'node:crypto';
import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`);
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
  if (record.raw_response_sha256 && (!existsSync(rawPath) || digest(readFileSync(rawPath)) !== record.raw_response_sha256))
    throw new Error('CORDON_RAW_MISMATCH: retained response differs from run record');
  const sourceFiles = scan(source);
  if (!sourceFiles.some((file) => file.path === 'run.json')) throw new Error('CORDON_NO_RECORD');
  const root = resolve(archiveRoot);
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
