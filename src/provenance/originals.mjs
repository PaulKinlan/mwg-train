/**
 * Retained refs for corpus originals.
 *
 * The owner requirement (2026-10-08): "I want to make sure the original is always accessible and we
 * can use that for a number of different tests to transform in the future."
 *
 * A commit named only in a manifest is not retained: it is alive only while some ref happens to
 * point at it, and this fleet deletes remote branches whose patches already exist in the default
 * branch. The original is the stable control of the whole experiment - the thing a later run
 * re-transforms with new MWG rules, a different teacher or a new harness and compares against - so
 * it gets its own ref that no prune touches.
 *
 * Canonical form: an annotated tag `refs/tags/original/<project-id>`.
 *   - tags are immutable on the host and are not branches, so a branch prune cannot reach them;
 *   - they survive `git gc` because a ref points at the object;
 *   - the namespace is greppable (`git for-each-ref refs/tags/original/`), which is what makes the
 *     corpus-wide check in scripts/verify-originals.mjs possible.
 * `refs/mwg-train/originals/<project-id>` is accepted as an alternative for hosts where tags are
 * unwanted, and any other ref namespace is rejected: a branch name can be deleted, which is exactly
 * the failure this module exists to prevent.
 *
 * This module is pure logic over an injected `probe`, so the rules are unit-testable without a git
 * repository. scripts/verify-originals.mjs supplies the real probe.
 */

export const RETAINED_REF_PREFIX = 'refs/tags/original/';
export const ALT_RETAINED_REF_PREFIX = 'refs/mwg-train/originals/';
export const RETAINED_REF_PREFIXES = [RETAINED_REF_PREFIX, ALT_RETAINED_REF_PREFIX];

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
export const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
export const SHORT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

/** Kinds that name a materialised site, and therefore must carry a retained original ref. */
export const KINDS_REQUIRING_ORIGINAL_REF = Object.freeze(['original', 'reproduction', 'evaluation']);

export class OriginalRefError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OriginalRefError';
    this.code = code;
  }
}

/** Canonical retained ref for a project id. */
export function retainedRef(projectId) {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ''))) {
    throw new OriginalRefError('BAD_PROJECT_ID', `project id must match ${PROJECT_ID_PATTERN}, got '${projectId}'`);
  }
  return `${RETAINED_REF_PREFIX}${projectId}`;
}

/** True when a ref lives in a namespace no prune or branch deletion is allowed to touch. */
export function isRetainedRef(ref) {
  return typeof ref === 'string' && RETAINED_REF_PREFIXES.some((prefix) => ref.startsWith(prefix));
}

function finding(code, field, message, id) {
  return { code, severity: 'error', id, field, message };
}

/**
 * Field-level validation of the retention fields on a record. Split from the reachability probe so
 * a manifest can be checked for shape without a repository to hand.
 */
export function validateOriginalFields(record) {
  const findings = [];
  const id = record?.id ?? '(no id)';
  const required = KINDS_REQUIRING_ORIGINAL_REF.includes(record?.kind);
  const hasRef = typeof record?.original_ref === 'string' && record.original_ref.trim() !== '';
  const hasSha = typeof record?.original_sha === 'string' && record.original_sha.trim() !== '';

  if (required && !hasRef) {
    findings.push(
      finding(
        'MISSING_ORIGINAL_REF',
        'original_ref',
        `kind '${record.kind}' must record the retained ref holding the original (e.g. ${RETAINED_REF_PREFIX}<project-id>)`,
        id,
      ),
    );
  }
  if (required && !hasSha) {
    findings.push(finding('MISSING_ORIGINAL_SHA', 'original_sha', `kind '${record.kind}' must record the original commit sha`, id));
  }
  if (hasRef && !isRetainedRef(record.original_ref)) {
    findings.push(
      finding(
        'REF_NOT_RETAINED',
        'original_ref',
        `'${record.original_ref}' is not in a retained namespace (${RETAINED_REF_PREFIXES.join(' or ')}); a branch can be deleted, which is the failure this check exists to prevent`,
        id,
      ),
    );
  }
  if (hasSha && !COMMIT_SHA_PATTERN.test(record.original_sha)) {
    findings.push(
      finding('BAD_ORIGINAL_SHA', 'original_sha', `original_sha must be a full 40-character commit sha, got '${record.original_sha}'`, id),
    );
  }
  if (record.original_ref !== undefined && hasRef && record.original_sha !== undefined && hasSha) {
    // A validator must never throw on invalid input: a bad id is already reported as BAD_ID, so the
    // canonical-name comparison is simply skipped for it rather than letting retainedRef throw.
    if (PROJECT_ID_PATTERN.test(String(record.id ?? '')) && isRetainedRef(record.original_ref)) {
      const expected = retainedRef(record.id);
      if (record.original_ref !== expected && !record.original_ref.startsWith(ALT_RETAINED_REF_PREFIX)) {
        findings.push(
          finding(
            'REF_NOT_CANONICAL',
            'original_ref',
            `expected '${expected}' for asset '${record.id}'; a different name in the retained namespace makes the corpus-wide check unable to pair refs with projects`,
            id,
          ),
        );
      }
    }
  }
  if (record.original_tree !== undefined && !COMMIT_SHA_PATTERN.test(String(record.original_tree))) {
    findings.push(finding('BAD_ORIGINAL_TREE', 'original_tree', 'original_tree must be a full 40-character tree sha', id));
  }
  return findings;
}

/**
 * Reachability and identity check for one record, against an injected probe:
 *
 *   probe.resolveRef(ref)        -> full commit sha the ref peels to, or null if it does not resolve
 *   probe.objectExists(sha)      -> true when the named commit object is present in the repository
 *   probe.treeOf(sha)            -> tree sha of that commit, or null
 *   probe.remoteRef(ref)         -> sha the remote reports for the ref, null if absent (optional)
 *
 * The check is fail-closed: any unresolved ref, missing object or sha mismatch is an error, because
 * a silent pass here is a corpus that cannot be re-transformed later.
 */
export function checkOriginal(record, probe) {
  const findings = validateOriginalFields(record);
  const id = record?.id ?? '(no id)';
  const ref = record?.original_ref;
  const sha = record?.original_sha;
  if (!isRetainedRef(ref) || !COMMIT_SHA_PATTERN.test(String(sha ?? ''))) {
    return findings;
  }

  const resolved = probe.resolveRef(ref);
  if (resolved === null || resolved === undefined) {
    findings.push(finding('REF_UNRESOLVED', 'original_ref', `'${ref}' does not resolve in this repository`, id));
    return findings;
  }
  if (resolved !== sha) {
    findings.push(
      finding('REF_SHA_MISMATCH', 'original_sha', `'${ref}' resolves to ${resolved} but the record says ${sha}`, id),
    );
  }
  if (!probe.objectExists(sha)) {
    findings.push(finding('OBJECT_MISSING', 'original_sha', `commit ${sha} is not present in this repository`, id));
  }
  if (record.original_tree !== undefined) {
    const tree = probe.treeOf(sha);
    if (tree !== null && tree !== undefined && tree !== record.original_tree) {
      findings.push(
        finding('TREE_MISMATCH', 'original_tree', `commit ${sha} has tree ${tree} but the record says ${record.original_tree}`, id),
      );
    }
  }
  if (typeof probe.remoteRef === 'function') {
    const remote = probe.remoteRef(ref);
    if (remote === null || remote === undefined) {
      findings.push(
        finding(
          'REF_NOT_ON_REMOTE',
          'original_ref',
          `'${ref}' exists locally but not on the remote; a ref that was never pushed dies with the machine that made it`,
          id,
        ),
      );
    } else if (remote !== resolved) {
      findings.push(
        finding('REF_MOVED_ON_REMOTE', 'original_ref', `'${ref}' resolves to ${resolved} locally but ${remote} on the remote`, id),
      );
    }
  }
  return findings;
}

/** Build the fields a record needs for a project's original, given a resolved commit and tree. */
export function originalFields(projectId, commitSha, treeSha, retention) {
  const fields = {
    original_ref: retainedRef(projectId),
    original_sha: commitSha,
  };
  if (treeSha) fields.original_tree = treeSha;
  if (retention) fields.retention = retention;
  return fields;
}
