/**
 * The quarantine store: where quarantined-arm material physically lives.
 *
 * The rule (bead mwg-train-291, Paul's conditions 2026-10-08):
 *   - corpus tooling writes quarantined-arm material to the quarantine tree BY DEFAULT; the
 *     public tree receives it only through the explicit promote step (scripts/promote.mjs);
 *   - the store is a separate PRIVATE companion repo (the journal/journal-data pattern), checked
 *     out as a SIBLING of this repo - deliberately not a submodule, so no public build, deploy or
 *     CI path can fetch it recursively;
 *   - the store is a PUBLICATION boundary, not a training-permission boundary: rights sign-off is
 *     the provenance layer's job (src/provenance/arms.mjs), this layer's job is that unpublished
 *     material is simply not in the public tree.
 *
 * Fail-closed: a write to a quarantined arm without a verified quarantine checkout refuses.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARMS, assertKnownArm, normaliseRelativePath } from './arms.mjs';

export class QuarantineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QuarantineError';
    this.code = code;
  }
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The default quarantine checkout: a SIBLING of the public repo, never inside it. */
export function quarantineRoot({ repoRoot = REPO_ROOT, env = process.env } = {}) {
  const override = env.MWG_TRAIN_QUARANTINE;
  if (override) {
    if (!isAbsolute(override)) {
      throw new QuarantineError('RELATIVE_OVERRIDE', `RELATIVE_OVERRIDE: MWG_TRAIN_QUARANTINE must be absolute, got '${override}'`);
    }
    return override;
  }
  return join(repoRoot, '..', 'mwg-quarantine');
}

function originOf(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Verify a quarantine checkout is real and is NOT the public repo: it must exist, be a git
 * checkout, and have an origin that differs from the public repo's. A store that is the public
 * repo (or a subdir of it) is not a store.
 */
export function assertQuarantineStore(root, { repoRoot = REPO_ROOT } = {}) {
  if (!existsSync(root)) {
    throw new QuarantineError('STORE_MISSING', `STORE_MISSING: quarantine store not checked out at ${root} - clone the private companion repo there (see docs/quarantine.md)`);
  }
  const realRoot = realpathSync(root);
  const realRepo = realpathSync(repoRoot);
  if (realRoot === realRepo || realRoot.startsWith(`${realRepo}${sep}`)) {
    throw new QuarantineError('STORE_INSIDE_PUBLIC', `STORE_INSIDE_PUBLIC: the quarantine store must not be inside the public checkout (${realRoot})`);
  }
  const storeOrigin = originOf(realRoot);
  if (!storeOrigin) {
    throw new QuarantineError('STORE_NOT_GIT', `STORE_NOT_GIT: ${realRoot} is not a git checkout with an origin - the store must be the private companion repo so material is backed up off this machine`);
  }
  const publicOrigin = originOf(realRepo);
  if (publicOrigin && storeOrigin === publicOrigin) {
    throw new QuarantineError('STORE_IS_PUBLIC_REPO', `STORE_IS_PUBLIC_REPO: the quarantine store's origin IS the public repo (${publicOrigin}) - that is not a boundary`);
  }
  return realRoot;
}

/**
 * The absolute storage root for one arm. Quarantined arms live in the quarantine store; cleared
 * arms live in the public repo's data/. This is the default-write routing: tooling asks for the
 * arm root and the rights class decides where the bytes land.
 */
export function armStorageRoot(armId, { repoRoot = REPO_ROOT, quarantineRoot: qRoot = null } = {}) {
  assertKnownArm(armId);
  if (ARMS[armId].quarantined) {
    const root = qRoot ?? quarantineRoot({ repoRoot });
    return join(assertQuarantineStore(root, { repoRoot }), ARMS[armId].storageRoot);
  }
  return join(repoRoot, ARMS[armId].storageRoot);
}

/** Absolute storage path for one asset, routed by its arm's rights class. */
export function assetStoragePath(armId, relativePath, options = {}) {
  return join(armStorageRoot(armId, options), normaliseRelativePath(relativePath));
}
