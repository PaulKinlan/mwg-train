/**
 * The build key: which use case, which framework, which model (mwg-train-gzi).
 *
 * Paul, 2026-10-11: "we might need to key each archetype/framework with another key, the llm used to
 * generate." The first two keys already exist (`project_id` is the use case x framework pair in both
 * records); the model is the third and it is the one no record carried.
 *
 * WHY THIS IS A KEY AND NOT A COMMENT. The sealed evaluation compares C1 (bare base), C2 (base +
 * guidance), C3 (base + uplift) and T (the trained student) on the SAME task, and those arms differ BY
 * MODEL and only by model. If the model is not part of the identity of a build, two arms collide on one
 * key, one of them silently wins, and a comparison of models becomes a comparison of whatever happened
 * to be in the directory. That is the same failure as an unmatched asset set, one layer over, which is
 * why an absent model is REFUSED here rather than defaulted.
 *
 * THE FORM OF THE VALUE. The model identity is the same `provider/id` string the lane rotation uses
 * (`deepseek/deepseek-flash`), not a display name and not a version string that drifts: a name cannot be
 * resolved back to a provider and a version string cannot be compared across runs. A build that no model
 * produced - the deterministic pilot and the deterministic uplift, whose own baseline_definition says
 * "no model and no teacher in the loop" - records the explicit sentinel `deterministic/no-model` instead.
 * The sentinel is the point: an explicit absence is a recorded fact that a test can assert, while a
 * missing field is indistinguishable from an oversight. It is deliberately not a valid provider/id, so
 * the two can never be confused for one another, and `assertModelIdentity` tells them apart.
 */

/** The field a build record carries its model identity in. Both records use this name. */
export const MODEL_FIELD = 'model';

/** The field a build record carries its derived key in, so the key is visible in the record itself. */
export const KEY_FIELD = 'build_key';

/**
 * The value recorded by a build no model produced.
 *
 * It cannot be a valid provider/id on purpose: a provider/id needs exactly one `/` with a token either
 * side, and this value has none, so `isProviderModelIdentity` is false for it and a reader (or a test) can
 * tell "this was made without a model" from "this was made by a model" without a second field.
 *
 * The first version of this constant was `deterministic/no-model`, which the gate caught: it parses as
 * provider `deterministic` with model `no-model`, so the deterministic pilot would have been reported as
 * the work of a model that does not exist - the same class of confusion the third key exists to prevent.
 * The `:` makes the two forms disjoint by construction rather than by convention.
 */
export const NO_MODEL = 'deterministic:no-model';

const TOKEN = /^[a-z0-9][a-z0-9-]*$/;
// Provider and model names as the rotation spells them: `deepseek/deepseek-flash`,
// `antigravity/gemini-3.8-flash`, `qwen-token-plan-individual/qwen3.8-max`.
const PROVIDER_MODEL = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Is `value` a provider/id model identity (never true for `NO_MODEL`)? */
export function isProviderModelIdentity(value) {
  return typeof value === 'string' && PROVIDER_MODEL.test(value);
}

/** Is `value` a model identity: a provider/id string, or the explicit no-model sentinel? */
export function isModelIdentity(value) {
  return value === NO_MODEL || isProviderModelIdentity(value);
}

/**
 * Return `value` as a model identity, or refuse.
 *
 * A missing field, an empty string, a display name and a bare version number are all errors, because each
 * of them would let a build be recorded as attributable to a model without saying which one. The message
 * names the sentinel, so the caller that genuinely has no model knows what to record.
 */
export function assertModelIdentity(value, { context = 'build' } = {}) {
  if (value === undefined || value === null) {
    throw new Error(
      `${context}: no ${MODEL_FIELD} recorded - a build whose model is absent cannot be attributed to it, and two arms of the evaluation would collide on one key; a build no model produced records '${NO_MODEL}' explicitly (mwg-train-gzi)`,
    );
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}: ${MODEL_FIELD} is ${JSON.stringify(value)}, which is not a model identity (mwg-train-gzi)`);
  }
  if (!isModelIdentity(value)) {
    throw new Error(
      `${context}: '${value}' is not a model identity - use the provider/id string the lane rotation uses (e.g. deepseek/deepseek-flash), or '${NO_MODEL}' when no model produced the build (mwg-train-gzi)`,
    );
  }
  return value;
}

/**
 * The build key: `<project_id>@<model>`.
 *
 * `project_id` already carries the use case x framework pair (`booking-react`, `tr-01-hono`), so the key
 * is that pair plus the model. It is a string because keys get compared, sorted and printed; `@` cannot
 * appear in either half (a project id is a kebab-case token and a model id is `provider/id`), so the
 * halves cannot be reassembled into one another.
 *
 * The first half is a project id rather than an archetype name for a measured reason: seven of the thirty
 * training families share the `booking` archetype, so `archetype` x `framework` collides 63 times in
 * pilot/TRAINING_CORPUS.json. The key is the unit the corpus keys by - the archetype in the pilot, the
 * family in the training corpus - and `project_id` is exactly that unit, already paired with the
 * framework.
 */
export function buildKey({ projectId, model }) {
  if (typeof projectId !== 'string' || !TOKEN.test(projectId)) {
    throw new Error(`build key: '${projectId}' is not a project id (a kebab-case token)`);
  }
  assertModelIdentity(model, { context: `build key for ${projectId}` });
  return `${projectId}@${model}`;
}

/** The same key, read out of a record row that carries `project_id` and `model`. */
export function buildKeyForRow(row) {
  if (row === null || typeof row !== 'object') throw new Error('build key: a record row is required');
  return buildKey({ projectId: row.project_id, model: row[MODEL_FIELD] });
}

/**
 * Every key carried by more than one row, with the rows that share it.
 *
 * A collision is the thing the third key exists to prevent: two builds that differ only by model must be
 * two keys, and if they are one key then one of the two builds cannot be identified at all.
 */
export function duplicateBuildKeys(rows) {
  const byKey = new Map();
  const collisions = [];
  for (const row of rows) {
    const key = buildKeyForRow(row);
    const seen = byKey.get(key);
    if (seen) {
      if (seen.length === 1) collisions.push({ key, projectIds: [seen[0].project_id] });
      collisions.find((entry) => entry.key === key).projectIds.push(row.project_id);
      seen.push(row);
    } else {
      byKey.set(key, [row]);
    }
  }
  return collisions;
}

/** The declaration both records carry, so a reader of the artifact knows what the field means. */
export function buildKeyDefinition(recordName) {
  return {
    formula: `${KEY_FIELD} = project_id@${MODEL_FIELD} (project_id is the use case x framework pair)`,
    model_field: MODEL_FIELD,
    key_field: KEY_FIELD,
    no_model: NO_MODEL,
    note:
      `Every row of ${recordName} records the model that produced the build, in the provider/id form the lane rotation uses, ` +
      `and the derived key beside it. ${recordName} is deterministic - its own baseline_definition says no model and no teacher are in the loop - ` +
      `so every row records the explicit sentinel '${NO_MODEL}' instead of leaving the field out. The sealed evaluation compares arms that differ ` +
      'by model alone, and a build with no model identity cannot be attributed to the model that produced it (mwg-train-gzi).',
  };
}
