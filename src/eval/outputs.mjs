/**
 * Persistent keyed outputs store for the archetype x framework x model generation matrix.
 *
 * Persists generated code outputs and site previews keyed by their build identity
 * conforming to repository provenance/quarantine rules (e.g. A1/A3 arms).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { assertModelIdentity } from './build-key.mjs';
import { assetStoragePath, armStorageRoot, assertResolvesInside } from '../provenance/store.mjs';

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * Derives the relative storage path for a keyed output project.
 * Structure: outputs/models/<provider>/<model_id>/<projectId>
 */
export function outputRelativePath({ projectId, model }) {
  assertModelIdentity(model, { context: 'output mapping' });
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error(`output mapping: '${projectId}' is not a valid project id`);
  }
  const safeModel = model.replace(/:/g, '/');
  return `outputs/models/${safeModel}/${projectId}`;
}

/**
 * Returns the absolute storage path for the given output key in the given provenance arm.
 */
export function outputPath({ projectId, model }, armId, options = {}) {
  const rel = outputRelativePath({ projectId, model });
  return assetStoragePath(armId, rel, options);
}

/**
 * Persists a generated project tree to the keyed outputs store.
 */
export function storeOutput({ projectId, model }, armId, sourceDir, options = {}) {
  const targetDir = outputPath({ projectId, model }, armId, options);
  if (!existsSync(sourceDir)) {
    throw new Error(`storeOutput: source directory does not exist: ${sourceDir}`);
  }

  // Ensure targetDir resolves inside its ARM root, whatever the arm's publication class.
  //
  // This asserted against the repository root for public arms until mwg-train-vqb7, and a repo-root test cannot
  // contain a destructive write: a symlink anywhere inside the repository - `data/A1_self_generated/outputs` ->
  // `<repo>/docs` is the repro - resolves to a path that IS inside the repo, so the guard passed and the
  // rmSync below followed the link and deleted committed files under docs/, which cpSync then replaced with the
  // generated tree. The escape OUT of the repository was already refused; this is the same class of escape
  // performed within it, and the arm root is the boundary that actually applies, since the arm root is the only
  // directory storeOutput is entitled to delete and rewrite. It is created just above, so it is real for
  // realpathSync, and containment is asserted before any removal.
  const root = armStorageRoot(armId, options);
  mkdirSync(root, { recursive: true });
  assertResolvesInside(root, targetDir, 'target output directory');

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
  return targetDir;
}

/**
 * Returns the path to the persisted output, or null if it does not exist.
 */
export function loadOutput({ projectId, model }, armId, options = {}) {
  const targetDir = outputPath({ projectId, model }, armId, options);
  if (existsSync(targetDir)) {
    return targetDir;
  }
  return null;
}
