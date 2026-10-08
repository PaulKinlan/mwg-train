/**
 * The disjointness gate: the training corpus and the held-out evaluation must share nothing.
 *
 * The rule this enforces: family_id is the split unit on BOTH sides, and a family_id may never
 * appear in both the training corpus and the sealed held-out briefs (condition 2 of the owner's
 * variant protocol, enforced by `familyOverlap` in src/eval/prereg.mjs). On top of that, no eval
 * target design (image_sha256 in the targets manifest) may be handed to training, and every eval
 * target must be marked excluded_from_training.
 *
 * The gate FAILS CLOSED: a manifest it cannot read, parse, or seal-match is a finding, never a
 * pass. `assertDisjointTrainingCorpus` never throws for any input, so a hostile or truncated
 * manifest cannot turn the check into a crash that a pipeline might mistake for "no data to
 * check". An evaluation that shares a family with training is a contaminated test; this module
 * exists so that cannot happen by accident.
 *
 * Two sides of the same collision are checked against the A6 evaluation target designs:
 * TARGET_FAMILY_IN_TRAINING fires when a training row's family_id is one of the target families
 * (the target design for 'booking' was authored FOR that family, so training on 'booking' leaks
 * the design even though familyOverlap - which compares against the held-out BRIEF families -
 * stays silent), and TARGET_HASH_SHARED / TARGET_HASH_MIRRORED fire when a training row declares
 * the target's image_sha256. A row that collides on both sides gets one finding per side, and
 * each message says it is the same collision seen from the other side.
 *
 * The seal and the canonical form come from src/eval/prereg.mjs (re-exported by
 * scripts/validate-briefs.mjs) so there is exactly one implementation of "what the eval
 * manifest hashes to". The target families come from src/eval/targets.mjs, likewise one list.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { familyOverlap, parseBriefs, sealHash } from '../eval/prereg.mjs';
import { TARGET_FAMILIES } from '../eval/targets.mjs';

/** The sealed held-out brief manifest. Its seal is recorded in the preregistration. */
export const EVAL_MANIFEST = 'docs/eval/briefs/manifest.jsonl';

/** The eval target designs: each row's image_sha256 is a design training must never see. */
export const EVAL_TARGETS_MANIFEST = 'data/A6_evaluation/targets/manifest.jsonl';

/**
 * The sha256 of the committed targets manifest FILE BYTES (not its parsed rows). A training row that
 * declares a real target hash must not be able to hide behind a substituted targets manifest whose
 * booking row carries a different hash: pinning the bytes means the manifest the hashes were read
 * from is provably the committed one.
 */
export const EVAL_TARGETS_SEAL = 'sha256:4ba07d58873525d57a043cb6b9d76664fc9d8c2952d16aea819b28cfa290d7c4';

/**
 * The seal recorded in the preregistration (docs/eval/PREREGISTRATION.md and package.json
 * `check:briefs`). If the recomputed seal differs, the eval side was edited after the split was
 * frozen and nothing downstream may proceed.
 */
export const EVAL_SEAL = 'sha256:89a1f47d638c5eab733074d87bc19d6615401aeb9a77ecbd86cf10b443e272b1';

/**
 * Fields a training row may use to reference a target design's image_sha256. Training rows do not
 * declare one yet (see docs/eval/briefs/corpus.example.jsonl), so these findings can only fire
 * once the corpus starts carrying one of these fields - which is exactly when the checks must
 * already be in place. Adding the field later requires no change here.
 *
 * The field name decides the code, so one hash collision produces exactly ONE finding, never two:
 * target_sha256/design_sha256 declare provenance ("this row was built from that design") and
 * report TARGET_HASH_SHARED; image_sha256 carries the target asset's own hash field (the row
 * mirrors the target's namespace, e.g. was copied from the targets manifest) and reports
 * TARGET_HASH_MIRRORED.
 */
const TARGET_HASH_FIELDS = ['target_sha256', 'design_sha256', 'image_sha256'];

/** The evaluation target families: the names the A6 target designs were authored for. */
const TARGET_FAMILY_IDS = new Set(TARGET_FAMILIES.map((target) => target.family_id));

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read and parse a JSONL manifest. Returns { rows } or { error }; never throws. */
function readManifest(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { error: `cannot read ${path}: ${error.message}` };
  }
  try {
    return { rows: parseBriefs(text) };
  } catch (error) {
    return { error: `cannot parse ${path}: ${error.message}` };
  }
}

/** Read a file's raw text. Returns { text } or { error }; never throws. */
function readTextFile(path) {
  try {
    return { text: readFileSync(path, 'utf8') };
  } catch (error) {
    return { error: `cannot read ${path}: ${error.message}` };
  }
}

/** Hash a file's raw bytes (never its parsed rows) so a substituted manifest cannot change the seal. */
function sealOfFileBytes(path) {
  try {
    return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
  } catch {
    return null;
  }
}

/**
 * Parse a training manifest line by line, refusing (not silently dropping) any non-empty line that
 * is not a JSON object. Returns { rows, malformed } where rows are the parsed objects and malformed
 * names each refused line. Never throws.
 */
function parseTrainingManifest(text) {
  const rows = [];
  const malformed = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      malformed.push({ code: 'TRAINING_ROW_UNPARSEABLE', line: index + 1, message: `training manifest line ${index + 1} is not valid JSON: ${error.message}` });
      return;
    }
    if (!isPlainObject(value)) {
      const kind = value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;
      malformed.push({ code: 'TRAINING_ROW_NOT_OBJECT', line: index + 1, message: `training manifest line ${index + 1} parses to ${kind}, not a JSON object` });
      return;
    }
    rows.push(value);
  });
  return { rows, malformed };
}

/**
 * Assert the training corpus is disjoint from the sealed evaluation. Never throws: every
 * unreadable, missing, malformed, or empty input is reported as a finding and `ok` is false.
 *
 * @param {object} paths
 * @param {string} paths.trainManifestPath training corpus manifest (JSONL, one brief per line)
 * @param {string} [paths.evalManifestPath] held-out brief manifest (default EVAL_MANIFEST)
 * @param {string} [paths.targetsManifestPath] eval target designs (default EVAL_TARGETS_MANIFEST)
 * @param {string} [paths.expectedSeal] the preregistered seal (default EVAL_SEAL)
 * @returns {{ ok: boolean, findings: Array<object>, evalSeal: string|null, trainRows: number }}
 *   findings carry { code, message, ... } naming the families and hashes involved; evalSeal is
 *   the recomputed seal of the eval manifest (null when the manifest could not be read).
 */
export function assertDisjointTrainingCorpus({ trainManifestPath, evalManifestPath = EVAL_MANIFEST, targetsManifestPath = EVAL_TARGETS_MANIFEST, expectedSeal = EVAL_SEAL } = {}) {
  // A validator whose contract is "never throws" wraps everything: a getter, a Proxy trap, or a
  // bug below must degrade to a finding, not an exception the caller might not catch.
  try {
    return check({ trainManifestPath, evalManifestPath, targetsManifestPath, expectedSeal });
  } catch (error) {
    return {
      ok: false,
      findings: [{ code: 'DISJOINTNESS_CHECK_ERROR', message: `the disjointness check itself failed: ${error.message}` }],
      evalSeal: null,
      trainRows: 0,
    };
  }
}

function check({ trainManifestPath, evalManifestPath, targetsManifestPath, expectedSeal }) {
  const findings = [];

  // 1. The eval side first: if the seal does not match, the split being checked may not be the
  //    split that was preregistered, so every other result is provisional.
  const evalRead = readManifest(evalManifestPath);
  let evalRows = [];
  let evalSeal = null;
  if (evalRead.error) {
    findings.push({ code: 'EVAL_MANIFEST_EMPTY_OR_UNREADABLE', message: `held-out eval manifest: ${evalRead.error}`, path: evalManifestPath });
  } else {
    evalRows = evalRead.rows.filter(isPlainObject);
    if (evalRows.length === 0) {
      findings.push({ code: 'EVAL_MANIFEST_EMPTY_OR_UNREADABLE', message: `held-out eval manifest ${evalManifestPath} has no usable rows`, path: evalManifestPath });
    } else {
      evalSeal = sealHash(evalRows);
      if (evalSeal !== expectedSeal) {
        findings.push({
          code: 'SEAL_MISMATCH',
          message: `held-out eval manifest ${evalManifestPath} seals as ${evalSeal}, expected ${expectedSeal} - the eval side changed after the split was frozen`,
          path: evalManifestPath,
          expected: expectedSeal,
          actual: evalSeal,
        });
      }
    }
  }

  // 2. The training side: nothing usable to check is a finding, because "no corpus" is not the
  //    same statement as "a disjoint corpus". Every non-empty line must parse to a JSON OBJECT; a
  //    line that is null, a number, a string, an array, or invalid JSON is a finding, never a row
  //    that is silently discarded (which would read a malformed corpus as a clean one).
  const trainRead = readTextFile(trainManifestPath);
  let trainRows = [];
  if (trainRead.error) {
    findings.push({ code: 'TRAINING_MANIFEST_EMPTY_OR_UNREADABLE', message: `training manifest: ${trainRead.error}`, path: trainManifestPath });
  } else {
    const parsed = parseTrainingManifest(trainRead.text);
    trainRows = parsed.rows;
    for (const malformed of parsed.malformed) {
      findings.push({ code: malformed.code, message: malformed.message, path: trainManifestPath, line: malformed.line });
    }
    if (trainRows.length === 0) {
      findings.push({ code: 'TRAINING_MANIFEST_EMPTY_OR_UNREADABLE', message: `training manifest ${trainManifestPath} has no usable rows`, path: trainManifestPath });
    }
  }

  // 3. Row-level refusals: a row that is not declared train-split, or that names no family, is a
  //    row whose provenance the family check cannot vouch for.
  trainRows.forEach((row, index) => {
    const name = typeof row.brief_id === 'string' ? row.brief_id : `row ${index + 1}`;
    if (row.split !== 'train') {
      findings.push({ code: 'TRAINING_ROW_NOT_TRAIN_SPLIT', message: `training row '${name}' has split ${JSON.stringify(row.split)}, expected 'train'`, brief_id: name, split: row.split ?? null });
    }
    if (typeof row.family_id !== 'string' || row.family_id.trim() === '') {
      findings.push({ code: 'TRAINING_ROW_MISSING_FAMILY', message: `training row '${name}' has no family_id, so it cannot be checked against the held-out families`, brief_id: name });
    }
  });

  // 4. The family rule itself, via the one shared implementation.
  if (evalRows.length > 0 && trainRows.length > 0) {
    for (const family of familyOverlap(evalRows, trainRows)) {
      findings.push({ code: 'FAMILY_IN_BOTH_MANIFESTS', message: `family_id '${family}' appears in both the training manifest ${trainManifestPath} and the held-out eval manifest ${evalManifestPath}`, family_id: family });
    }
  }

  // 5. The eval target designs: none may be trainable, and none may be named by a training row -
  //    by hash (TARGET_HASH_SHARED / TARGET_HASH_MIRRORED) or by family (TARGET_FAMILY_IN_TRAINING).
  //    The target designs were authored FOR their family names, so a training row in the 'booking'
  //    family shares its design with the 'booking' target even though familyOverlap - which
  //    compares against the held-out brief families - says nothing.
  const targetsRead = readManifest(targetsManifestPath);
  // The targets manifest is pinned by its file bytes: a substituted path or an edited manifest would
  // otherwise let a caller rewrite which hashes training must never see, laundering a real collision.
  const targetsSeal = sealOfFileBytes(targetsManifestPath);
  if (targetsSeal !== EVAL_TARGETS_SEAL) {
    findings.push({
      code: 'TARGETS_MANIFEST_UNPINNED',
      message: `eval targets manifest ${targetsManifestPath} ${targetsSeal === null ? 'could not be read' : `hashes to ${targetsSeal}`}, not the pinned ${EVAL_TARGETS_SEAL}; a substituted or edited targets manifest can conceal a target-hash collision`,
      path: targetsManifestPath,
      expected: EVAL_TARGETS_SEAL,
      actual: targetsSeal,
    });
  }
  const targetByHash = new Map();
  const targetByFamily = new Map();
  if (targetsRead.error) {
    findings.push({ code: 'EVAL_TARGETS_MANIFEST_EMPTY_OR_UNREADABLE', message: `eval targets manifest: ${targetsRead.error}`, path: targetsManifestPath });
  } else {
    const targetRows = targetsRead.rows.filter(isPlainObject);
    if (targetRows.length === 0) {
      findings.push({ code: 'EVAL_TARGETS_MANIFEST_EMPTY_OR_UNREADABLE', message: `eval targets manifest ${targetsManifestPath} has no usable rows`, path: targetsManifestPath });
    }
    for (const target of targetRows) {
      if (target.excluded_from_training !== true) {
        findings.push({ code: 'EVAL_TARGET_NOT_EXCLUDED', message: `eval target '${target.id ?? 'unknown'}' has excluded_from_training ${JSON.stringify(target.excluded_from_training ?? null)}, expected true`, target_id: target.id ?? null });
      }
      if (typeof target.image_sha256 === 'string' && target.image_sha256 !== '') targetByHash.set(target.image_sha256, target);
      if (typeof target.family_id === 'string' && target.family_id !== '') targetByFamily.set(target.family_id, target);
    }
  }

  const describeTarget = (target) =>
    target
      ? `target '${target.id ?? 'unknown'}' (image_sha256 ${target.image_sha256 ?? 'unknown'})`
      : `the target row could not be named because ${targetsManifestPath} was unreadable`;

  trainRows.forEach((row, index) => {
    const name = typeof row.brief_id === 'string' ? row.brief_id : `row ${index + 1}`;
    const family = typeof row.family_id === 'string' ? row.family_id : null;

    // The family side: the family_id IS a target family. This fires even when the targets
    // manifest is unreadable (TARGET_FAMILY_IDS comes from src/eval/targets.mjs), so an
    // unreadable manifest cannot launder a target family into the corpus.
    if (family !== null && TARGET_FAMILY_IDS.has(family)) {
      const target = targetByFamily.get(family);
      const hashSide =
        target && TARGET_HASH_FIELDS.some((field) => row[field] === target.image_sha256)
          ? '; the same collision is also seen from the hash side: this row declares the target image_sha256'
          : '';
      findings.push({
        code: 'TARGET_FAMILY_IN_TRAINING',
        message: `training row '${name}' has family_id '${family}', one of the A6 evaluation target families (${describeTarget(target)}); the target design for '${family}' was authored for that family, so training on it shares designs with the evaluation${hashSide}`,
        brief_id: name,
        family_id: family,
        target_id: target?.id ?? null,
        sha256: target?.image_sha256 ?? null,
      });
    }

    // The hash side: the row declares a target design's image_sha256. The field name picks the
    // code (see TARGET_HASH_FIELDS), so one collision is one finding.
    for (const field of TARGET_HASH_FIELDS) {
      const hash = row[field];
      if (typeof hash !== 'string' || !targetByHash.has(hash)) continue;
      const target = targetByHash.get(hash);
      const code = field === 'image_sha256' ? 'TARGET_HASH_MIRRORED' : 'TARGET_HASH_SHARED';
      const familySide =
        family !== null && family === target.family_id && TARGET_FAMILY_IDS.has(family)
          ? `; the same collision is also seen from the family side: family_id '${family}' is a target family (TARGET_FAMILY_IN_TRAINING)`
          : '';
      findings.push({
        code,
        message: `training row '${name}' declares ${field} ${hash}, which is the image_sha256 of eval target '${target.id ?? 'unknown'}' (family '${target.family_id ?? 'unknown'}') in ${targetsManifestPath}${familySide}`,
        brief_id: name,
        field,
        sha256: hash,
        target_id: target.id ?? null,
      });
    }
  });

  return { ok: findings.length === 0, findings, evalSeal, trainRows: trainRows.length };
}
