/**
 * The per-asset provenance record and the manifest checks built on top of it.
 *
 * One record per corpus asset (an original project, its uplift, a reproduction study artefact or
 * an evaluation artefact). Records are the only thing the training corpus may select from, so a
 * record that fails validation must never reach a training run.
 *
 * Field names follow docs/provenance/README.md and the design brief section 1 item 4. This module
 * deliberately carries only the fields that the rights gate depends on; the pilot adds the
 * evidence fields (commits, screenshots, browser traces, hashes) without changing these.
 */

import {
  ARMS,
  ARM_IDS,
  ProvenanceError,
  assertAssetPath,
  assertKnownArm,
  defaultExcludedFromTraining,
  isTrainable,
} from './arms.mjs';

export const KINDS = Object.freeze(['brief', 'original', 'uplift', 'reproduction', 'evaluation', 'asset']);

/** How the bytes were produced. `hosted-api` means a third-party teacher model touched it. */
export const GENERATOR_TYPES = Object.freeze(['human', 'open-weight', 'hosted-api', 'deterministic', 'none']);

export const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
export const ASSET_RECORD_DIR = 'docs/provenance/assets';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/;

/** Fill in the defaults a record is allowed to omit. Everything else must be stated explicitly. */
export function makeRecord(input) {
  const arm = assertKnownArm(input.arm);
  return {
    excluded_from_training: defaultExcludedFromTraining(arm),
    approved_for_training: false,
    parents: [],
    ...input,
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Validate one record. Returns an array of findings; an empty array means the record passes.
 * A finding is `{ code, severity, id, field, message }` where severity is 'error' or 'warning'.
 */
export function validateRecord(record) {
  const findings = [];
  const add = (code, field, message, severity = 'error') =>
    findings.push({ code, severity, id: isPlainObject(record) ? (record.id ?? '(no id)') : '(not an object)', field, message });

  if (!isPlainObject(record)) {
    add('NOT_AN_OBJECT', '', 'record must be an object');
    return findings;
  }

  if (!nonEmptyString(record.id) || !ID_PATTERN.test(record.id)) {
    add('BAD_ID', 'id', `id must be an immutable slug matching ${ID_PATTERN}`);
  }
  if (!nonEmptyString(record.arm) || !Object.prototype.hasOwnProperty.call(ARMS, record.arm)) {
    add('UNKNOWN_ARM', 'arm', `arm must be one of ${ARM_IDS.join(', ')}`);
  }
  if (!KINDS.includes(record.kind)) {
    add('BAD_KIND', 'kind', `kind must be one of ${KINDS.join(', ')}`);
  }
  if (!nonEmptyString(record.rights_ref)) {
    add('MISSING_RIGHTS_REF', 'rights_ref', `every asset needs a rights record, e.g. ${ASSET_RECORD_DIR}/<slug>.md`);
  }
  if (record.created_at !== undefined && !ISO_DATE.test(String(record.created_at))) {
    add('BAD_CREATED_AT', 'created_at', 'created_at must be an ISO-8601 date or timestamp');
  }

  // Generator provenance. A hosted teacher model may only ever produce quarantined material.
  const generator = record.generator;
  if (!isPlainObject(generator)) {
    add('MISSING_GENERATOR', 'generator', 'generator must state how the bytes were produced');
  } else {
    if (!GENERATOR_TYPES.includes(generator.type)) {
      add('BAD_GENERATOR_TYPE', 'generator.type', `generator.type must be one of ${GENERATOR_TYPES.join(', ')}`);
    }
    if (generator.type === 'hosted-api') {
      for (const field of ['provider', 'model', 'account_ref', 'terms_ref']) {
        if (!nonEmptyString(generator[field])) {
          add('INCOMPLETE_HOSTED_GENERATOR', `generator.${field}`, `a hosted-api generator must record ${field}`);
        }
      }
      if (record.arm !== 'A3_teacher_generated') {
        add(
          'HOSTED_GENERATOR_OUTSIDE_QUARANTINE',
          'arm',
          'material produced by a hosted teacher model belongs in A3_teacher_generated; a teacher-generated asset cannot be relabelled into an approved arm',
        );
      }
    }
  }

  // Storage location must sit inside the asset's own arm.
  if (nonEmptyString(record.storage_path)) {
    try {
      assertAssetPath(record);
    } catch (error) {
      if (error instanceof ProvenanceError && error.code === 'UNKNOWN_ARM') {
        // already reported above
      } else {
        add(error.code ?? 'BAD_STORAGE_PATH', 'storage_path', error.message);
      }
    }
  } else {
    add('MISSING_STORAGE_PATH', 'storage_path', 'storage_path is required');
  }

  // Quarantine must be on for prohibited arms.
  if (nonEmptyString(record.arm) && Object.prototype.hasOwnProperty.call(ARMS, record.arm)) {
    if (typeof record.excluded_from_training !== 'boolean') {
      add('BAD_EXCLUDED_FLAG', 'excluded_from_training', 'excluded_from_training must be a boolean');
    } else if (ARMS[record.arm].quarantined && record.excluded_from_training === false) {
      add(
        'QUARANTINE_NOT_ENFORCED',
        'excluded_from_training',
        `arm ${record.arm} is quarantined; excluded_from_training cannot be false until the arm is signed off`,
      );
    }
  }

  // Approval is only meaningful with evidence attached.
  if (record.approved_for_training !== undefined && typeof record.approved_for_training !== 'boolean') {
    add('BAD_APPROVAL_FLAG', 'approved_for_training', 'approved_for_training must be a boolean');
  }
  if (record.approved_for_training === true) {
    if (nonEmptyString(record.arm) && Object.prototype.hasOwnProperty.call(ARMS, record.arm) && !ARMS[record.arm].trainable) {
      add('APPROVAL_ON_QUARANTINED_ARM', 'approved_for_training', `arm ${record.arm} cannot be approved for training`);
    } else if (isTrainable(record) === false && record.excluded_from_training !== false) {
      add('APPROVAL_WHILE_EXCLUDED', 'approved_for_training', 'a record excluded_from_training cannot be approved for training');
    }
    for (const field of ['approved_by', 'approved_at']) {
      if (!nonEmptyString(record[field])) {
        add('INCOMPLETE_APPROVAL', `approved_${field === 'approved_by' ? 'by' : 'at'}`, `approved_for_training requires ${field}`);
      }
    }
  }

  if (record.parents !== undefined) {
    if (!Array.isArray(record.parents) || record.parents.some((parent) => !nonEmptyString(parent))) {
      add('BAD_PARENTS', 'parents', 'parents must be an array of asset ids');
    } else if (record.parents.includes(record.id)) {
      add('SELF_PARENT', 'parents', 'an asset cannot be its own parent');
    }
  }

  return findings;
}

/** Parse a JSONL manifest. Blank lines and `#` comments are ignored. */
export function parseManifest(text) {
  const rows = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (error) {
      throw new ProvenanceError('BAD_MANIFEST_LINE', `manifest line ${index + 1} is not valid JSON: ${error.message}`);
    }
  });
  return rows;
}

/**
 * Validate a whole manifest: per-record findings, id uniqueness, parent existence and - the rule
 * that matters most - that no row approved for training has a quarantined ancestor. A teacher model
 * writing the original and a different, approved process applying the uplift does not cleanse the
 * lineage; the walk over `parents` is what catches that.
 */
export function validateManifest(rows) {
  const findings = [];
  const byId = new Map();

  rows.forEach((row, index) => {
    const recordFindings = validateRecord(row).map((finding) => ({ ...finding, index }));
    findings.push(...recordFindings);
    if (isPlainObject(row) && nonEmptyString(row.id)) {
      if (byId.has(row.id)) {
        findings.push({
          code: 'DUPLICATE_ID',
          severity: 'error',
          id: row.id,
          index,
          field: 'id',
          message: `id '${row.id}' appears more than once; asset ids are immutable and unique`,
        });
      } else {
        byId.set(row.id, { row, index });
      }
    }
  });

  for (const [id, { row, index }] of byId) {
    for (const parent of Array.isArray(row.parents) ? row.parents : []) {
      if (!byId.has(parent)) {
        findings.push({
          code: 'UNKNOWN_PARENT',
          severity: 'error',
          id,
          index,
          field: 'parents',
          message: `parent '${parent}' is not in the manifest`,
        });
      }
    }
  }

  for (const [id, { row, index }] of byId) {
    if (row.approved_for_training !== true) continue;
    const quarantinedAncestor = findQuarantinedAncestor(id, byId);
    if (quarantinedAncestor) {
      findings.push({
        code: 'QUARANTINED_ANCESTOR',
        severity: 'error',
        id,
        index,
        field: 'parents',
        message: `asset '${id}' is approved for training but descends from quarantined asset '${quarantinedAncestor.id}' (arm ${quarantinedAncestor.arm})`,
      });
    }
  }

  const trainable = [...byId.values()].filter(({ row }) => isTrainable(row)).length;
  const quarantined = [...byId.values()].filter(({ row }) => nonEmptyString(row.arm) && ARMS[row.arm]?.quarantined).length;

  return {
    ok: findings.every((finding) => finding.severity !== 'error'),
    findings,
    counts: { total: rows.length, uniqueIds: byId.size, trainable, quarantined },
  };
}

/** Depth-first search for the nearest quarantined ancestor, cycle-safe. */
function findQuarantinedAncestor(id, byId) {
  const seen = new Set();
  const stack = [...(byId.get(id)?.row.parents ?? [])];
  while (stack.length > 0) {
    const parentId = stack.pop();
    if (seen.has(parentId)) continue;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) continue;
    if (ARMS[parent.row.arm]?.quarantined) return { id: parentId, arm: parent.row.arm };
    stack.push(...(Array.isArray(parent.row.parents) ? parent.row.parents : []));
  }
  return null;
}
