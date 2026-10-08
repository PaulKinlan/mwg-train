/**
 * Preregistration invariants for the held-out evaluation briefs.
 *
 * The rules that matter here are the ones a reviewer cannot check by reading one file: that a whole
 * prompt family lands in one split, that every variant of a family asserts the same property set,
 * and that every rule a brief names exists in the pinned guidance snapshot. Code, not prose, so
 * "the variants are equivalent" is a fact about the manifest rather than a claim in a document.
 *
 * See docs/eval/briefs/SCHEMA.md for the authoring contract and docs/eval/PREREGISTRATION.md for
 * what the briefs are used for.
 */

export const BRIEF_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const SPLITS = Object.freeze(['dev', 'test']);
export const STRATA = Object.freeze(['A_familiar', 'B_heldout_combination', 'C_out_of_family', 'R_repair']);
export const TASKS = Object.freeze(['generate', 'repair']);
export const FRAMEWORKS = Object.freeze(['none', 'react', 'svelte', 'vue', 'lit', 'vanilla-ts']);
export const IN_FAMILY_ARCHETYPES = Object.freeze([
  'booking',
  'web-shop',
  'blog-cms',
  'dashboard',
  'onboarding-auth',
  'directory-listing',
  'event-registration',
  'support-helpdesk',
  'course-enrolment',
  'survey-form',
  'restaurant-ordering',
  'job-board',
  'docs-site',
  'community-forum',
  'expense-tracker',
  'library-catalogue',
]);

/**
 * Fields that must be identical across every variant of a family. This list IS the definition of
 * "variants that should produce the same output": content and aesthetics may differ, the property
 * set may not. Only prompt/brief_id/variant_of are free to vary.
 */
export const INVARIANT_FIELDS = Object.freeze([
  'archetype',
  'topic',
  'locale',
  'framework',
  'task',
  'stratum',
  'routes',
  'journeys',
  'server_persistence',
  'assertions',
  'applicable_rules',
  'required_rules',
  'non_goals',
  'seeded_defects',
]);

/** Strata whose families may legitimately contain a single brief. */
export const SINGLE_VARIANT_STRATA = Object.freeze(['C_out_of_family', 'R_repair']);

const FIELD_SPEC = {
  brief_id: { kind: 'string', pattern: BRIEF_ID_PATTERN },
  family_id: { kind: 'string', pattern: BRIEF_ID_PATTERN },
  variant_of: { kind: 'string-or-null', pattern: BRIEF_ID_PATTERN },
  split: { kind: 'enum', values: SPLITS },
  stratum: { kind: 'enum', values: STRATA },
  task: { kind: 'enum', values: TASKS },
  archetype: { kind: 'string' },
  topic: { kind: 'string' },
  locale: { kind: 'string' },
  framework: { kind: 'enum', values: FRAMEWORKS },
  prompt: { kind: 'string', minLength: 80 },
  routes: { kind: 'string-array', minItems: 1 },
  journeys: { kind: 'string-array', minItems: 2 },
  server_persistence: { kind: 'string-array', minItems: 1 },
  assertions: { kind: 'string-array', minItems: 2 },
  applicable_rules: { kind: 'string-array', minItems: 1 },
  required_rules: { kind: 'string-array', minItems: 2, maxItems: 4 },
  non_goals: { kind: 'string-array', minItems: 0 },
  seeded_defects: { kind: 'string-array', minItems: 0 },
};

export const BRIEF_FIELDS = Object.freeze(Object.keys(FIELD_SPEC));

/** The sentinel `non_goals` entry that marks a challenge brief whose site is already modern. */
export const ALREADY_MODERN_MARKER = 'already-modern: no uplift required';

export class BriefError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BriefError';
    this.code = code;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finding(code, message, id, field) {
  return { code, severity: 'error', id: id ?? '(unknown)', field, message };
}

/** The rule vocabulary produced by scripts/extract-mwg-rules.mjs. */
export function ruleIndex(rules) {
  if (!isPlainObject(rules?.categories)) {
    throw new BriefError('BAD_RULE_INDEX', 'rules.json must contain a categories object');
  }
  const ids = new Set();
  for (const [category, guides] of Object.entries(rules.categories)) {
    for (const guide of guides) ids.add(`${category}/${guide}`);
  }
  return { ids, hash: rules.rule_set_hash ?? '', skillVersion: rules.skill_version ?? '' };
}

function checkField(row, field, spec, findings) {
  const value = row[field];
  const where = (message) => findings.push(finding('BAD_FIELD', `${field}: ${message}`, row.brief_id, field));
  switch (spec.kind) {
    case 'string':
      if (typeof value !== 'string' || value.trim() === '') return where('must be a non-empty string');
      if (spec.minLength && value.length < spec.minLength) return where(`must be at least ${spec.minLength} characters`);
      if (spec.pattern && !spec.pattern.test(value)) return where(`must match ${spec.pattern}`);
      return undefined;
    case 'string-or-null':
      if (value === null) return undefined;
      if (typeof value !== 'string' || (spec.pattern && !spec.pattern.test(value))) return where('must be null or a valid id');
      return undefined;
    case 'enum':
      if (!spec.values.includes(value)) return where(`must be one of ${spec.values.join(', ')}`);
      return undefined;
    case 'string-array': {
      if (!Array.isArray(value)) return where('must be an array');
      if (value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) return where('must contain only non-empty strings');
      if (value.length < spec.minItems) return where(`must have at least ${spec.minItems} item(s)`);
      if (spec.maxItems && value.length > spec.maxItems) return where(`must have at most ${spec.maxItems} item(s)`);
      if (new Set(value).size !== value.length) return where('must not repeat an item');
      return undefined;
    }
    default:
      return where('has an unknown spec');
  }
}

/**
 * Validate a brief manifest against the contract. Pure: a rule index is supplied rather than read.
 */
export function validateBriefs(rows, index) {
  const findings = [];
  if (!Array.isArray(rows)) {
    return { ok: false, findings: [finding('NOT_AN_ARRAY', 'a brief manifest must be an array of rows')], counts: null };
  }

  const byBriefId = new Map();
  const byFamily = new Map();
  const prompts = new Map();

  for (const row of rows) {
    if (!isPlainObject(row)) {
      findings.push(finding('NOT_AN_OBJECT', 'every manifest row must be a JSON object'));
      continue;
    }
    const id = typeof row.brief_id === 'string' ? row.brief_id : '(unknown)';
    for (const key of Object.keys(row)) {
      if (!(key in FIELD_SPEC)) findings.push(finding('UNKNOWN_FIELD', `unknown field '${key}'`, id, key));
    }
    for (const [field, spec] of Object.entries(FIELD_SPEC)) {
      if (!(field in row)) {
        findings.push(finding('MISSING_FIELD', `missing required field '${field}'`, id, field));
        continue;
      }
      checkField(row, field, spec, findings);
    }
    if (typeof row.brief_id === 'string') {
      if (byBriefId.has(row.brief_id)) findings.push(finding('DUPLICATE_BRIEF_ID', `brief_id '${row.brief_id}' appears more than once`, id, 'brief_id'));
      byBriefId.set(row.brief_id, row);
    }
    if (typeof row.prompt === 'string' && row.prompt.trim() !== '') {
      const previous = prompts.get(row.prompt);
      if (previous !== undefined && previous !== row.family_id) {
        findings.push(finding('DUPLICATE_PROMPT', `the same prompt is used in families '${previous}' and '${row.family_id}'`, id, 'prompt'));
      }
      if (previous === undefined) prompts.set(row.prompt, row.family_id);
      if (previous !== undefined && previous === row.family_id && row.variant_of !== null) {
        findings.push(finding('DUPLICATE_PROMPT', 'variants of a family must not repeat the same prompt text', id, 'prompt'));
      }
    }
    if (typeof row.family_id === 'string') {
      if (!byFamily.has(row.family_id)) byFamily.set(row.family_id, []);
      byFamily.get(row.family_id).push(row);
    }
  }

  for (const [familyId, familyRows] of byFamily) {
    const splits = new Set(familyRows.map((row) => row.split));
    if (splits.size > 1) {
      findings.push(
        finding(
          'FAMILY_SPLIT_MIXED',
          `family '${familyId}' spans splits ${[...splits].join(', ')}; a family that trains and tests measures recall of its own phrasing`,
          familyId,
          'split',
        ),
      );
    }
    const strata = new Set(familyRows.map((row) => row.stratum));
    if (strata.size > 1) findings.push(finding('FAMILY_STRATUM_MIXED', `family '${familyId}' spans strata ${[...strata].join(', ')}`, familyId, 'stratum'));

    const stratum = familyRows[0].stratum;
    if (!SINGLE_VARIANT_STRATA.includes(stratum) && familyRows.length < 2) {
      findings.push(
        finding(
          'FAMILY_TOO_SMALL',
          `family '${familyId}' has ${familyRows.length} brief(s); an in-family family needs at least two variants for the invariance test to mean anything`,
          familyId,
          'family_id',
        ),
      );
    }

    const canonical = `${familyId}-v1`;
    const ids = new Set(familyRows.map((row) => row.brief_id));
    for (const row of familyRows) {
      if (row.variant_of !== null) {
        if (!ids.has(row.variant_of)) findings.push(finding('BAD_VARIANT_OF', `variant_of '${row.variant_of}' is not in family '${familyId}'`, row.brief_id, 'variant_of'));
        if (row.variant_of === row.brief_id) findings.push(finding('BAD_VARIANT_OF', 'a brief cannot be its own variant', row.brief_id, 'variant_of'));
      } else if (row.brief_id !== canonical && familyRows.length > 1) {
        findings.push(finding('BAD_VARIANT_OF', `the canonical brief of '${familyId}' must be '${canonical}' or declare variant_of`, row.brief_id, 'variant_of'));
      }
      if (row.task === 'repair' && (!Array.isArray(row.seeded_defects) || row.seeded_defects.length === 0)) {
        findings.push(finding('REPAIR_WITHOUT_DEFECT', 'a repair brief must name at least one seeded defect', row.brief_id, 'seeded_defects'));
      }
      if (row.task === 'generate' && Array.isArray(row.seeded_defects) && row.seeded_defects.length > 0) {
        findings.push(finding('GENERATE_WITH_DEFECT', 'a generation brief must not carry seeded defects', row.brief_id, 'seeded_defects'));
      }
      if (Array.isArray(row.required_rules) && Array.isArray(row.applicable_rules)) {
        const missing = row.required_rules.filter((rule) => !row.applicable_rules.includes(rule));
        if (missing.length > 0) findings.push(finding('RULE_NOT_SUBSET', `required_rules not in applicable_rules: ${missing.join(', ')}`, row.brief_id, 'required_rules'));
      }
      for (const field of ['applicable_rules', 'required_rules']) {
        for (const rule of Array.isArray(row[field]) ? row[field] : []) {
          if (index && !index.ids.has(rule)) findings.push(finding('UNKNOWN_RULE', `'${rule}' is not in the pinned rule set (${index.hash})`, row.brief_id, field));
        }
      }
    }

    // Property-set invariance: compare every variant against the canonical row.
    const base = familyRows.find((row) => row.brief_id === canonical) ?? familyRows[0];
    for (const row of familyRows) {
      if (row === base) continue;
      for (const field of INVARIANT_FIELDS) {
        const a = JSON.stringify(base[field]);
        const b = JSON.stringify(row[field]);
        if (a !== b) {
          findings.push(
            finding(
              'INVARIANCE_VIOLATION',
              `'${field}' differs between '${base.brief_id}' and '${row.brief_id}': variants must share the property set, only the prompt may differ`,
              row.brief_id,
              field,
            ),
          );
        }
      }
    }
  }

  const outOfFamily = rows.filter((row) => isPlainObject(row) && row.stratum === 'C_out_of_family');
  const alreadyModern = outOfFamily.filter((row) => Array.isArray(row.non_goals) && row.non_goals.includes(ALREADY_MODERN_MARKER));
  if (outOfFamily.length > 0 && alreadyModern.length < 5) {
    findings.push(
      finding(
        'TOO_FEW_ALREADY_MODERN',
        `only ${alreadyModern.length} out-of-family brief(s) are marked '${ALREADY_MODERN_MARKER}'; at least 5 are required to measure over-application`,
        'manifest',
        'non_goals',
      ),
    );
  }

  const counts = summarizeBriefs(rows);
  return { ok: findings.length === 0, findings, counts };
}

/** Counts used by the preregistration's sample-size section. */
export function summarizeBriefs(rows) {
  const tally = (key) => {
    const out = {};
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      const value = row[key];
      if (typeof value !== 'string') continue;
      out[value] = (out[value] ?? 0) + 1;
    }
    return out;
  };
  const families = new Set(rows.filter(isPlainObject).map((row) => row.family_id));
  const familiesBySplit = {};
  for (const family of families) {
    const split = rows.find((row) => isPlainObject(row) && row.family_id === family)?.split;
    familiesBySplit[split] = (familiesBySplit[split] ?? 0) + 1;
  }
  return {
    briefs: rows.filter(isPlainObject).length,
    families: families.size,
    familiesBySplit,
    bySplit: tally('split'),
    byStratum: tally('stratum'),
    byTask: tally('task'),
    byFramework: tally('framework'),
    alreadyModern: rows.filter((row) => isPlainObject(row) && Array.isArray(row.non_goals) && row.non_goals.includes(ALREADY_MODERN_MARKER)).length,
  };
}

/** Parse a JSONL brief manifest, keeping the source line for findings. */
export function parseBriefs(text) {
  const rows = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (error) {
      throw new BriefError('BAD_JSONL_LINE', `brief manifest line ${index + 1} is not valid JSON: ${error.message}`);
    }
  });
  return rows;
}

/**
 * Cross-manifest leakage check: a family_id may not appear in both the held-out briefs and the
 * training corpus. This is condition 2 of the owner's variant protocol, enforced.
 */
export function familyOverlap(heldOut, corpus) {
  const trainingFamilies = new Set();
  for (const row of corpus) {
    if (isPlainObject(row) && typeof row.family_id === 'string') trainingFamilies.add(row.family_id);
  }
  const shared = [...new Set(heldOut.filter(isPlainObject).map((row) => row.family_id))].filter((family) => trainingFamilies.has(family));
  return shared.sort();
}
