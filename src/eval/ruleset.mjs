/**
 * The rule vocabulary we evaluate against, and the hashes that pin it.
 *
 * Two different hashes are in play and they must not be confused:
 *
 *   rule_set_hash   sha256 over the sorted `category/guide` ids, joined by newlines. This is OUR
 *                   recipe, produced by scripts/extract-mwg-rules.mjs and recomputed by
 *                   src/eval/prereg.mjs before any brief is trusted. It pins the snapshot we hold.
 *   guideIdsSha256  sha256 over the sorted BARE guide ids (no category prefix), joined by newlines.
 *                   This is web-uplift's recipe for its canonical catalog, so it is the one hash that
 *                   lets us say whether our vocabulary is the published one.
 *
 * The bare-id recipe was identified by measurement, and the strength of that claim is worth stating
 * precisely rather than loosely. Coord pinned guideIdsSha256
 * bc041692e3d9631a997427252ce2e54d8a5a0dd7e28387b4dcae6a4b9d3d5ab2 for web-uplift's catalog (178
 * guides). Recomputing thirteen plausible constructions over the 178 ids in docs/eval/rules.json -
 * bare vs `category/guide`, sorted vs as-found, joined by newline, comma, space or nothing, raw or
 * JSON - produced exactly one match: sorted bare ids joined by newline.
 *
 * What a single match does and does not establish. Because sha256 is preimage-resistant, a match means
 * the byte string hashed here IS the string web-uplift hashed, so the construction is exact for THIS
 * input - an untested algorithm cannot produce the same bytes unless it consumes the same input, in
 * which case it is the same construction on this input. That gives a strong conditional conclusion, not
 * an unconditional one, and the conditions are worth naming: (a) the canonical ids are slugs with no
 * newline in them, so the newline-joined string decomposes into exactly 178 ids in only one way; and
 * (b) our guide count equals the canonical count the pin states. Given those, the input string
 * decomposes into our ids. What is NOT established is how web-uplift canonicalises a DIFFERENT input -
 * we cannot predict the hash of a 200-guide catalog, and this file does not claim to. If the catalog
 * ever appears on this machine the check recomputes both the file hash and the id hash directly, and
 * that measurement would supersede the inference.
 *
 * The catalog itself is not vendored here, so we verify its FILE hash and nothing else. We do not
 * parse guide ids out of it: its shape has never been seen on this VM, and guessing a shape would be
 * exactly the kind of unmeasured assumption this repository keeps paying for. The id set is pinned
 * separately, by guideIdsSha256 above.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The rule vocabulary as installed in a modern-web-guidance skill directory.
 *
 * Shared with scripts/extract-mwg-rules.mjs so the generator and the pin check cannot disagree about
 * what the vocabulary is - the same reason the hash functions below are shared.
 */
export function extractVocabulary(skillDir) {
  const guidesDir = join(realpathSync(resolve(skillDir)), 'guides');
  const categories = {};
  for (const category of readdirSync(guidesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    categories[category] = readdirSync(join(guidesDir, category))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''))
      .sort();
  }
  return categories;
}

/** web-uplift's published canonical ruleset, as pinned by coord on 2026-10-08. */
export const MWG_CANONICAL = Object.freeze({
  source: 'web-uplift',
  file: 'knowledge/mwg-catalog.json',
  sha256: '7931ac35543010450272fadebb5d3904ea041f91cd5a0d2695de5fac41da021f',
  guideIdsSha256: 'bc041692e3d9631a997427252ce2e54d8a5a0dd7e28387b4dcae6a4b9d3d5ab2',
  guides: 178,
  categories: 16,
});

/** The `rule_set_hash` of our committed snapshot, quoted in docs/eval/PREREGISTRATION.md. */
export const MWG_SNAPSHOT_RULE_SET_HASH =
  'sha256:f6301c020f138ed70287b663107033c757e11120fa87d947248ce5e4b4cdca19';

/**
 * The literal label every deterministic floor output must carry.
 *
 * Our floors are a baseline we computed, not a product of the web-uplift tool. Coord's decision
 * (2026-10-08) is to adopt the published ruleset as the ruleset, while labelling every output we
 * generate so nobody can read it as an official uplift result. The string is a constant so the
 * report writers, the schema and the check cannot drift apart.
 */
export const BASELINE_LABEL = 'mwg-train deterministic baseline';

/**
 * The attribution line every floor report carries, so a reader cannot mistake our deterministic
 * baseline for an official web-uplift result. One function, used by each report writer, so the label
 * cannot drift between the markdown, the artifact schema and the viewer.
 */
export function baselineAttributionLine() {
  return `> **${BASELINE_LABEL}** - deterministic output of this repository's own tooling, not an official \`web-uplift\` result.`;
}

/** sha256 (hex, no prefix) over the sorted bare guide ids, newline-joined - web-uplift's recipe. */
export function guideIdsHash(categories) {
  return createHash('sha256').update(sortedGuideIds(categories).join('\n')).digest('hex');
}

/** sha256 over the sorted `category/guide` ids, newline-joined - our snapshot's recipe. */
export function ruleSetHash(categories) {
  const ids = Object.entries(categories ?? {}).flatMap(([category, guides]) =>
    guides.map((guide) => `${category}/${guide}`),
  );
  return `sha256:${createHash('sha256').update([...ids].sort().join('\n')).digest('hex')}`;
}

function sortedGuideIds(categories) {
  return Object.values(categories ?? {}).flat().map((id) => String(id)).sort();
}

/**
 * Validate a rules index against the pinned canonical ruleset.
 *
 * Findings carry `code` and `message` so a caller can count them; the check script turns them into
 * exit codes. Every failure mode is a finding rather than a thrown error, because a check that
 * crashes on malformed input has not checked anything.
 */
export function checkRulesetPin(rules, options = {}) {
  const findings = [];
  const push = (code, message) => findings.push({ code, message });

  const categories = rules?.categories;
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    push('BAD_RULES_JSON', 'rules.json has no categories object, so there is no vocabulary to pin');
    return findings;
  }

  const guideIds = sortedGuideIds(categories);
  const categoryNames = Object.keys(categories);

  // Validate the SHAPE before hashing anything. Hashing coerces: `String([id])` is `id` and
  // `${category}/${[id]}` is the same as `${category}/${id}`, so a category holding a one-element
  // array in place of a guide id produced the same count and both of the same hashes, and the pin
  // passed with a vocabulary that is not a list of id strings. Found by review on bead mwg-train-6ek.
  // Returning here rather than carrying on is deliberate: a hash over a malformed vocabulary is not
  // evidence about anything.
  const shape = [];
  for (const [category, guides] of Object.entries(categories)) {
    if (!Array.isArray(guides)) {
      shape.push(`category '${category}' must be an array of guide ids, not ${guides === null ? 'null' : typeof guides}`);
      continue;
    }
    for (const guide of guides) {
      if (typeof guide !== 'string') {
        shape.push(`category '${category}' contains a non-string guide id: ${JSON.stringify(guide)}`);
      } else if (guide === '') {
        shape.push(`category '${category}' contains an empty guide id`);
      } else if (guide.includes('/')) {
        // A slash would make `category/guide` ambiguous, and the two recipes disagree about what the id
        // is, which is exactly the confusion the two-hash design exists to prevent.
        shape.push(`guide id '${guide}' in category '${category}' contains '/'; ids are unprefixed slugs`);
      }
    }
  }
  if (shape.length) {
    push('BAD_VOCABULARY_SHAPE', shape.join('; '));
    return findings;
  }

  if (guideIds.length === 0) {
    // Fail closed. An empty vocabulary would otherwise hash to sha256('') and "agree" with nothing,
    // and a check that passes on an empty input is the failure this whole file exists to prevent.
    push('EMPTY_VOCABULARY', 'rules.json declares no guide ids; an empty vocabulary cannot be pinned');
    return findings;
  }

  const duplicates = guideIds.filter((id, i) => guideIds[i - 1] === id);
  if (duplicates.length) {
    push('DUPLICATE_GUIDE_ID', `guide id(s) ${[...new Set(duplicates)].join(', ')} appear more than once, so the id set is ambiguous`);
  }

  const counts = rules?.counts ?? {};
  if (counts.guides !== guideIds.length) {
    push('COUNT_MISMATCH', `rules.json says counts.guides=${counts.guides} but lists ${guideIds.length} guide ids`);
  }
  if (counts.categories !== categoryNames.length) {
    push('COUNT_MISMATCH', `rules.json says counts.categories=${counts.categories} but lists ${categoryNames.length} categories`);
  }

  // THE PIN. Our bare-id hash must equal the published catalog's.
  const idsHash = guideIdsHash(categories);
  if (idsHash !== MWG_CANONICAL.guideIdsSha256) {
    push(
      'GUIDE_IDS_MISMATCH',
      `our guide ids hash to ${idsHash}, but ${MWG_CANONICAL.source} publishes ${MWG_CANONICAL.guideIdsSha256} for ${MWG_CANONICAL.file}; the vocabulary is not the pinned catalog's (a skill update, a renamed guide, or an added or removed guide)`,
    );
  }
  if (guideIds.length !== MWG_CANONICAL.guides) {
    push('GUIDE_COUNT_MISMATCH', `the canonical ruleset has ${MWG_CANONICAL.guides} guides, we hold ${guideIds.length}`);
  }

  // Internal consistency, and the snapshot seal the pre-registration quotes. Recomputed rather than
  // read, because a file can advertise a pinned rule_set_hash while holding a different vocabulary.
  const computed = ruleSetHash(categories);
  if (rules?.rule_set_hash !== computed) {
    push('RULE_SET_HASH_MISMATCH', `rules.json advertises rule_set_hash ${rules?.rule_set_hash ?? '(absent)'} but its vocabulary hashes to ${computed}`);
  }
  if (computed !== MWG_SNAPSHOT_RULE_SET_HASH) {
    push('SNAPSHOT_SEAL_MISMATCH', `the snapshot hashes to ${computed}, not the pinned ${MWG_SNAPSHOT_RULE_SET_HASH} quoted in the pre-registration`);
  }

  // The catalog file, when someone has it. Absent is reported, never silently passed.
  if (options.catalogBytes) {
    const actual = createHash('sha256').update(options.catalogBytes).digest('hex');
    if (actual !== MWG_CANONICAL.sha256) {
      push('CATALOG_FILE_MISMATCH', `${options.catalogPath ?? MWG_CANONICAL.file} hashes to ${actual}, not the pinned ${MWG_CANONICAL.sha256}`);
    }
  } else {
    findings.push({
      code: 'CATALOG_NOT_VERIFIED',
      fatal: Boolean(options.requireCatalog),
      message: `${MWG_CANONICAL.file} is not present on this machine, so its ${MWG_CANONICAL.sha256} pin was not verified; the guide id set was, from our own vocabulary, against guideIdsSha256`,
    });
  }

  return findings;
}

/** Read the pinned catalog if it happens to be on this machine. Never throws. */
export function readCatalog(path) {
  try {
    return { bytes: readFileSync(path), path };
  } catch {
    return null;
  }
}
